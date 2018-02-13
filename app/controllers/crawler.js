'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/crawler';

/**
 * Module dependencies.
 */
const mongoose = require('mongoose');
const Route = mongoose.model('Route');
const Strava = require('./strava');

exports.crawlSegments = function (req, res) {
    Log.log(TAG, 'Crawling segments at ' + new Date().toUTCString());

    req.params.start = [49.25329, 7.04142];
    req.params.iterations = 15;

    const horizontal = 0.009009;    // one horizontal kilometer
    const vertical = 0.013808;    // one vertical kilometer
    const start = req.params.start;
    const segments = new Set();

    for (let i = 1; i <= req.params.iterations; ++i) {
        const bounds = '' + (start[0] - i * horizontal / 2) + ',' + (start[1] - i * vertical / 2) + ',' + (start[0] + i * horizontal / 2) + ',' + (start[1] + i * vertical / 2);
        Log.debug(TAG, 'Query segments for bounds: ' + bounds);
        const options = {
            bounds: bounds,
            activity_type: 'cycling',
            min_cat: 0,
            max_cat: 100000,
        };
        Strava.segmentsExplorer('b835d0c6c520f39d22eeb8d60dc65ecb17559542', options, function (err, segment) {
            if (!segments.has(segment.id)) {
                segments.add(segment.id);
            }
        });
    }
};