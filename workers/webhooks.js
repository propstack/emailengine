'use strict';

const { parentPort } = require('worker_threads');
const config = require('wild-config');
const fetch = require('node-fetch');
const { redis, queueConf } = require('../lib/db');
const { Worker } = require('bullmq');
const settings = require('../lib/settings');
const logger = require('../lib/logger');
const packageData = require('../package.json');
// const { REDIS_PREFIX } = require('../lib/consts');
const he = require('he');

config.queues = config.queues || {
    notify: 1
};

const NOTIFY_QC = (process.env.EENGINE_NOTIFY_QC && Number(process.env.EENGINE_NOTIFY_QC)) || config.queues.notify || 1;

function getAccountKey(account) {
    return `iad:${account}`;
}

async function metrics(logger, key, method, ...args) {
    try {
        parentPort.postMessage({
            cmd: 'metrics',
            key,
            method,
            args
        });
    } catch (err) {
        logger.error({ msg: 'Failed to post metrics to parent', err });
    }
}

const notifyWorker = new Worker(
    'notify',
    async job => {
        // do not process active jobs, use it for debugging only
        //return new Promise((resolve, reject) => {});

        let accountKey = getAccountKey(job.data.account);

        // validate if we should even process this webhook
        let accountExists = await redis.exists(accountKey);
        if (!accountExists) {
            logger.debug({ msg: 'Account is not enabled', action: 'webhook', event: job.name, account: job.data.account });
            return;
        }

        let webhooksEnabled = await settings.get('webhooksEnabled');
        if (!webhooksEnabled) {
            return;
        }

        let accountWebhooks = await redis.hget(accountKey, 'webhooks');

        let webhooks = accountWebhooks || (await settings.get('webhooks'));
        if (!webhooks) {
            // logger.debug({ msg: 'Webhook URL is not set', action: 'webhook', event: job.name, account: job.data.account });
            return;
        }

        let webhookEvents = await settings.get('webhookEvents');
        if (webhookEvents && !webhookEvents.includes('*') && !webhookEvents.includes(job.name)) {
            logger.trace({
                msg: 'Webhook event not in whitelist',
                action: 'webhook',
                event: job.name,
                account: job.data.account,
                webhookEvents,
                data: job.data
            });
            return;
        }

        switch (job.data.event) {
            case 'messageNew': {
                // check if we need to send this event or not
                let isInbox = false;
                if (
                    (job.data.account && job.data.path === 'INBOX') ||
                    job.data.specialUse === '\\Inbox' ||
                    (job.data.data && job.data.data.labels && job.data.data.labels.includes('\\Inbox'))
                ) {
                    isInbox = true;
                }

                const inboxNewOnly = (await settings.get('inboxNewOnly')) || false;
                if (inboxNewOnly && !isInbox) {
                    // ignore this message
                    return;
                }

                break;
            }
        }

        logger.trace({
            msg: 'Processing webhook',
            webhooks,
            accountWebhooks: !!accountWebhooks,
            event: job.name,
            data: job.data
        });

        let headers = {
            'Content-Type': 'application/json',
            'User-Agent': `${packageData.name}/${packageData.version} (+${packageData.homepage})`
        };

        let parsed = new URL(webhooks);
        let username, password;

        if (parsed.username) {
            username = he.decode(parsed.username);
            parsed.username = '';
        }

        if (parsed.password) {
            password = he.decode(parsed.password);
            parsed.password = '';
        }

        if (username || password) {
            headers.Authorization = `Basic ${Buffer.from(he.encode(username || '') + ':' + he.encode(password || '')).toString('base64')}`;
        }

        let start = Date.now();
        let duration;
        try {
            let res;

            try {
                res = await fetch(parsed.toString(), {
                    method: 'post',
                    body: JSON.stringify(job.data),
                    headers
                });
                duration = Date.now() - start;
            } catch (err) {
                duration = Date.now() - start;
                throw err;
            }

            if (!res.ok) {
                let err = new Error(`Invalid response: ${res.status} ${res.statusText}`);
                err.status = res.status;
                throw err;
            }

            logger.trace({
                msg: 'Webhook posted',
                webhooks,
                accountWebhooks: !!accountWebhooks,
                event: job.name,
                status: res.status
            });

            try {
                if (accountWebhooks) {
                    await redis.hset(accountKey, 'webhookErrorFlag', JSON.stringify({}));
                } else {
                    await settings.clear('webhookErrorFlag', {});
                }
            } catch (err) {
                // ignore
            }

            metrics(logger, 'webhooks', 'inc', {
                event: job.name,
                status: 'success'
            });
        } catch (err) {
            if (err.status === 410) {
                // disable webhook
                logger.error({
                    msg: 'Webhooks were disabled by server',
                    webhooks,
                    accountWebhooks: !!accountWebhooks,
                    event: job.name,
                    status: err.status,
                    err
                });
                await settings.set('webhooksEnabled', false);
                return;
            }

            logger.error({
                msg: 'Failed posting webhook',
                webhooks,
                accountWebhooks: !!accountWebhooks,
                event: job.name,
                err
            });

            try {
                if (accountWebhooks) {
                    await redis.hset(
                        accountKey,
                        'webhookErrorFlag',
                        JSON.stringify({
                            event: job.name,
                            message: err.message,
                            time: Date.now(),
                            url: webhooks
                        })
                    );
                } else {
                    await settings.set('webhookErrorFlag', {
                        event: job.name,
                        message: err.message,
                        time: Date.now(),
                        url: webhooks
                    });
                }
            } catch (err) {
                // ignore
            }

            metrics(logger, 'webhooks', 'inc', {
                event: job.name,
                status: 'fail'
            });

            throw err;
        } finally {
            if (duration) {
                metrics(logger, 'webhookReq', 'observe', duration);
            }
        }
    },
    Object.assign(
        {
            concurrency: NOTIFY_QC,
            limiter: {
                max: 10,
                duration: 1000,
                groupKey: 'account'
            }
        },
        queueConf
    )
);

notifyWorker.on('completed', async job => {
    metrics(logger, 'queuesProcessed', 'inc', {
        queue: 'notify',
        status: 'completed'
    });

    logger.info({ msg: 'Notification queue entry completed', result: 'completed', job: job.id });
});

notifyWorker.on('failed', async job => {
    metrics(logger, 'queuesProcessed', 'inc', {
        queue: 'notify',
        status: 'failed'
    });

    logger.info({ msg: 'Notification queue entry failed', result: 'failed', job: job.id });
});

logger.info({ msg: 'Started Webhooks worker thread', version: packageData.version });
