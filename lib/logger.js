'use strict';
const flatten = require('flat')

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
    formatters: {
        log(obj) {
            return flatten(obj, {maxDepth: 5});
        }
    },
    // hooks: {
    //     logMethod(inputArgs, method) {
    //         const newInputArg = inputArgs.map(item => {
    //             if (typeof item === 'object') {
    //                 try {
    //                     const flattenObject = flatten(item, {maxDepth: 10})
    //                     const reqs = typeof flattenObject.req
    //                     const filteredKeys = Object.keys(flattenObject).filter(key => (typeof flattenObject[key]) !== 'object');
    //                     const res = {};
    //                     console.log('filteredKeys', filteredKeys.filter(key => key === 'req.id'), reqs);
    //                     filteredKeys.forEach(key => res[key] = flattenObject[key])
    //                     return item;
    //                 } catch (e) {
    //                     return item;
    //                 }
    //             }
    //             return item;
    //         })
    //         return method.apply(this, newInputArg)
    //     },
    // },
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
