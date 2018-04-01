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

    const sb = [49.245665, 6.997569]; // Saarbrücken
    const igb = [49.287085, 7.12887]; // Ingbert
    const eh = [49.234207, 7.112391]; // Ensheim
    const qs = [49.319769, 7.058146]; // Qierschied

    req.params.start = sb;
    req.params.increaseRadiusBy = 0.2;  // km
    req.params.iterations = 1;          // increase radius x times

    let goNorth = 10;   // km
    let goEast = 9;     // km

    const horizontal = 0.009009;    // one horizontal kilometer
    const vertical = 0.013808;    // one vertical kilometer

    const increaseRadiusBy = req.params.increaseRadiusBy;

    for(let north = 0; north <= goNorth; ++north) {
        for (let east = 0; east <= goEast; ++east) {
            const start = [(req.params.start[0] + (north * vertical)), (req.params.start[1] + (east * horizontal))];
            Log.debug(TAG, "Start: ", start);
            const segments = new Set();

            for (let i = 1; i <= req.params.iterations; ++i) {
                const bounds =
                    '' + (start[0] - i * (horizontal * increaseRadiusBy)  / 2) +
                    ',' + (start[1] - i * (vertical * increaseRadiusBy) / 2) +
                    ',' + (start[0] + i * (horizontal * increaseRadiusBy) / 2) +
                    ',' + (start[1] + i * (vertical * increaseRadiusBy) / 2);

                Log.debug(TAG, 'Query segments for bounds: ' + bounds);
                const options = {
                    bounds: bounds,
                    activity_type: 'riding',
                    min_cat: 0,
                    max_cat: 100000,
                };
                Strava.segmentsExplorer('b835d0c6c520f39d22eeb8d60dc65ecb17559542', options, function (err, segment) {
                    if (!segments.has(segment.id)) {
                        segments.add(segment.id);
                    }
                });
            }
        }
    }
};