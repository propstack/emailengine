'use strict';

if (!process.env.EE_ENV_LOADED) {
    require('dotenv').config(); // eslint-disable-line global-require
    process.env.EE_ENV_LOADED = 'true';
}

const config = require('wild-config');
const pino = require('pino');

config.log = config.log || {
    level: 'trace'
};

config.log.level = config.log.level || 'trace';

let logger = pino({
    messageKey: 'message',
    customLevels: {
        log: 10
    }
});
logger.level = process.env.EENGINE_LOG_LEVEL || config.log.level;

const { threadId } = require('worker_threads');

if (threadId) {
    logger = logger.child({ tid: threadId });
}

process.on('uncaughtException', err => {
    logger.fatal({
        msg: 'uncaughtException',
        err
    });
    setTimeout(() => process.exit(1), 10);
});

process.on('unhandledRejection', err => {
    logger.fatal({
        msg: 'unhandledRejection',
        err
    });
    setTimeout(() => process.exit(2), 10);
});

module.exports = logger;
