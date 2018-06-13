'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/crawler';

/**
 * Module dependencies.
 */
const Strava = require('./strava');

exports.crawlSegments = async(function (req, res) {
    Log.log(TAG, 'Crawling segments at ' + new Date().toUTCString());

    const sb = [49.245665, 6.997569]; // Saarbrücken
    const igb = [49.287085, 7.12887]; // Ingbert
    const eh = [49.234207, 7.112391]; // Ensheim
    const qs = [49.319769, 7.058146]; // Quierschied

    req.params.start = qs;
    req.params.increaseRadiusBy = 0.2;  // km
    req.params.iterations = 1;          // increase radius x times

    let goNorth = 5;   // km
    let goEast = 5;    // km

    const numRequests = (goNorth + 1) * (goEast + 1) * req.params.iterations * 2;
    Log.debug(TAG, 'Doing total ' + numRequests + ' requests (or less)');

    const horizontal = 0.009009;    // one horizontal kilometer
    const vertical = 0.013808;      // one vertical kilometer
    const increaseRadiusBy = req.params.increaseRadiusBy;

    const requestEachMilliseconds = 200;    // wait until next api request

    for (let north = 0; north <= goNorth; ++north) {
        for (let east = 0; east <= goEast; ++east) {

            const start = [(req.params.start[0] + (north * vertical)), (req.params.start[1] + (east * horizontal))];
            Log.debug(TAG, 'Start: (' + start[0] + ', ' + start[1] + ')');
            const segments = new Set();

            for (let i = 1; i <= req.params.iterations; ++i) {
                // set timeout ensures that not all requests are
                // done at one which could lead to api limit bugs
                setTimeout(function (i) {

                    const bounds =
                        '' + (start[0] - i * (vertical * increaseRadiusBy) / 2) +
                        ',' + (start[1] - i * (horizontal * increaseRadiusBy) / 2) +
                        ',' + (start[0] + i * (vertical * increaseRadiusBy) / 2) +
                        ',' + (start[1] + i * (horizontal * increaseRadiusBy) / 2);

                    const options = {
                        bounds: bounds,
                        activity_type: 'cycling',
                        min_cat: 0,
                        max_cat: 100000,
                    };
                    Strava.segmentsExplorer('b835d0c6c520f39d22eeb8d60dc65ecb17559542', options, function (err, segment) {
                        if (err) {
                            Log.error(TAG, 'Error while getting segments', err);
                            return;
                        }
                        if (segment.segments) {
                            segment.segments.forEach(function (seg) {
                                if (!segments.has(seg.id)) {
                                    segments.add(seg.id);
                                }
                            });
                        }
                    });
                }, requestEachMilliseconds * ((i - 1) + (10 * east) + (100 * north)), i);
            }
        }
    }
    res.writeHead(302, {
        'Location': 'http://localhost:3000/routes'
    });
    res.end();
});