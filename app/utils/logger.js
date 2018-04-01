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
    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = "data was too long";
        }

    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.getLogger(tag).info(message + sep + info);
};

module.exports.error = function(tag, message, data) {
    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = "data was too long";
        }
    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.getLogger(tag).error(message + sep + info);
};

module.exports.debug = function(tag, message, data) {
    let info = '';
    if (data !== undefined && data != null)
        try {
            info = JSON.stringify(data, null, 2);
        } catch (e) {
            info = "data was too long";
        }
    let sep = '';
    if (message !== undefined && message != null && message !== '' && info !== '')
        sep = ': ';

    log4js.getLogger(tag).debug(message + sep + info);
};