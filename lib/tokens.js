'use strict';

const { redis } = require('./db');
const crypto = require('crypto');
const msgpack = require('msgpack5')();
const logger = require('./logger');

module.exports = {
    async provision(opts) {
        opts = opts || {};
        const { account, ip, remoteAddress, description, metadata } = opts;

        const token = crypto.randomBytes(32);
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        let now = new Date();

        let tokenData = {
            created: now.getTime()
        };

        if (account) {
            tokenData.account = account;
        }

        if (ip) {
            tokenData.ip = ip;
        }

        if (remoteAddress) {
            tokenData.remoteAddress = remoteAddress;
        }

        if (description) {
            tokenData.description = description;
        }

        if (metadata) {
            tokenData.metadata = metadata;
        }

        let req = redis.multi().hsetBuffer('tokens', hashedToken, msgpack.encode(tokenData)).hsetBuffer('tokens:access', hashedToken, msgpack.encode({}));

        if (account) {
            req = req.sadd(`iat:${account}`, hashedToken);
        } else {
            // root token
            req = req.sadd(`iat`, hashedToken);
        }

        let res = await req.exec();

        for (let entry of res) {
            if (entry[0]) {
                throw entry[0];
            }
        }

        logger.info(Object.assign({}, tokenData, { hash: hashedToken, msg: 'Provisioned new access token' }));

        return token.toString('hex');
    },

    async get(token, hashed, opts) {
        opts = opts || {};

        if (!/^[0-9a-f]{64}$/i.test(token)) {
            let err = new Error('Invalid token format');
            err.code = 'InvalidToken';
            throw err;
        }

        const hashedToken = hashed ? token : crypto.createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

        let tokenDataEncoded = await redis.hgetBuffer('tokens', hashedToken);
        if (!tokenDataEncoded) {
            let err = new Error('Unknown token');
            err.code = 'UnknownToken';
            throw err;
        }

        let tokenData = msgpack.decode(tokenDataEncoded);

        if (opts.log) {
            // log access time
            let accessData = { time: Date.now(), ip: opts.remoteAddress || null };
            await redis.hsetBuffer('tokens:access', hashedToken, msgpack.encode(accessData));
        }

        tokenData.created = new Date(tokenData.created);

        return Object.assign({ id: hashedToken }, tokenData);
    },

    async delete(token, opts) {
        if (!/^[0-9a-f]{64}$/i.test(token)) {
            let err = new Error('Invalid token format');
            err.code = 'InvalidToken';
            throw err;
        }

        opts = opts || {};

        let tokenData;
        try {
            tokenData = await module.exports.get(token, true);
        } catch (err) {
            try {
                tokenData = await module.exports.get(token);
            } catch (err) {
                return false;
            }
        }

        let req = redis.multi().hdel('tokens', tokenData.id).hdel('tokens:access', tokenData.id);
        if (tokenData.account) {
            req = req.srem(`iat:${tokenData.account}`, tokenData.id);
        } else {
            // root token
            req = req.srem(`iat`, tokenData.id);
        }

        let res = await req.exec();

        for (let entry of res) {
            if (entry[0]) {
                throw entry[0];
            }
        }

        logger.info(Object.assign({}, tokenData, { msg: 'Deleted an access token', remoteAddress: opts.remoteAddress }));

        return true;
    },

    async list(account) {
        let list;
        if (account) {
            list = await redis.smembers(`iat:${account}`);
        } else {
            list = await redis.smembers(`iat`);
        }
        if (!list || !list.length) {
            return [];
        }
        let req = redis.multi();

        for (let tokenHash of list) {
            req = req.hgetBuffer('tokens', tokenHash);
            req = req.hgetBuffer('tokens:access', tokenHash);
        }

        let detailList = await req.exec();

        let response = [];

        let lastEntry = false;
        for (let i = 0; i < detailList.length; i++) {
            let entry = detailList[i];
            if (i % 2 === 0) {
                lastEntry = false;
                if (entry[1]) {
                    try {
                        let tokenData = msgpack.decode(entry[1]);
                        tokenData.created = new Date(tokenData.created);
                        lastEntry = Object.assign({ id: list[response.length] }, tokenData);
                        response.push(lastEntry);
                    } catch (err) {
                        logger.error({ msg: 'Failed to process token data', hash: list[response.length], err });
                    }
                }
            } else if (lastEntry && entry[1]) {
                try {
                    let accessData = msgpack.decode(entry[1]);
                    accessData.time = accessData.time ? new Date(accessData.time) : null;
                    lastEntry.access = accessData;
                } catch (err) {
                    logger.error({ msg: 'Failed to process token data', hash: list[i], err });
                }
            }
        }

        return response.sort((a, b) => a.created - b.created);
    }
};