'use strict';

const log4js = require('log4js');
const app = require('express')();

const logConfiguration = {
    appenders: {
        out: {type: 'stdout'},
        app: {type: 'file', filename: 'logs/application.log'}
    },
    categories: {
        default: {appenders: ['out', 'app'], level: 'debug'}
    }
};

const errorConfiguration = {
    appenders: {
        out: {type: 'stdout'},
        app: {type: 'file', filename: 'logs/errors.log'}
    },
    categories: {
        default: {appenders: ['out', 'app'], level: 'debug'}
    }
};

log4js.configure(logConfiguration);

module.exports.log = function (tag, message, data) {
    if (app.get('env') === 'test') return;

    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = 'data was too long';
        }

    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.getLogger(tag).info(message + sep + info);
};

module.exports.error = function (tag, message, data) {
    if (app.get('env') === 'test') return;

    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = 'data was too long';
        }
    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.configure(errorConfiguration);
    log4js.getLogger(tag).error(message + sep + info);
    log4js.configure(logConfiguration);
};

module.exports.debug = function (tag, message, data) {
    if (app.get('env') === 'test') return;
    if (app.get('env') !== 'development') return;

    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = 'data was too long';
        }
    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.getLogger(tag).debug(message + sep + info);
};