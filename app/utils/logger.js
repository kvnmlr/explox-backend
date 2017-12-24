'use strict';

const log4js = require('log4js');
log4js.configure({
    appenders: {
        out: { type: 'stdout' },
        app: { type: 'file', filename: 'application.log' }},
    categories: {
        default: { appenders: [ 'out', 'app' ], level: 'debug' }
    }});

module.exports.log = function(tag, message, data) {
    var info = '';
    if (data !== undefined && data != null)
        info = '\n' + JSON.stringify(data);
    log4js.getLogger(tag).info(message + info);
};

module.exports.error = function(tag, message, data) {
    var info = '';
    if (data !== undefined && data != null)
        info = '\n' + JSON.stringify(data);
    log4js.getLogger(tag).error(JSON.stringify(message) + info);
};

module.exports.debug = function(tag, message, data) {
    var info = '';
    if (data !== undefined && data != null)
        info = '\n' + JSON.stringify(data);
    log4js.getLogger(tag).debug(message + info);
};