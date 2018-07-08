'use strict';

/**
 * Module dependencies.
 */

const formidable = require('formidable');
const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/importexport';

exports.exportGPX = async function (req, res) {
    Log.debug(TAG, 'Export GPX for route ' + req.article.title);
    const id = req.article._id;
    let file = './gpx/test.gpx';
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=' + file,
    });

    res.end();
};

exports.importGPX = async function (req, res) {
    Log.debug(TAG, 'Import GPX for route ' + req.gpx);
};

exports.import = async function (req, res) {
    res.render('import', {
        title: 'Import'
    });
};