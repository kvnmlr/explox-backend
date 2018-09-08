'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/crawler';

/**
 * Module dependencies.
 */
const Strava = require('./strava');

let queue = [];
let increaseRadiusBy = 0.5;
let iterations = 3;

exports.init = function () {
    Log.log(TAG, 'Initialize Crawler');
    const horizontalKilometer = 0.009009;    // one horizontal kilometer
    const verticalKilometer = 0.013808;      // one vertical kilometer

    const ul = [49.696608, 6.137890];   // north of Luxemburg
    const ur = [49.679770, 7.808433];   // north of Kaiserslautern
    const ll = [48.984984, 6.169800];   // south of Metz
    const lr = [48.944127, 7.749429];   // west of Karlsruhe

    const sb = [49.245665, 6.997569]; // Saarbrücken
    const igb = [49.287085, 7.12887]; // Ingbert
    const eh = [49.234207, 7.112391]; // Ensheim
    const qs = [49.319769, 7.058146]; // Quierschied

    for (let vertical = Math.min(ll[0], lr[0]); vertical <= Math.max(ul[0], ur[0]); vertical += verticalKilometer * 2) {
        // vertical holds all vertical locations with 1km distance

        for (let horizontal = Math.min(ll[1], ul[1]); horizontal <= Math.max(lr[1], ur[1]); horizontal += horizontalKilometer * 2) {
            // horizontal holds all horizontal locations with 1km distance
            const loc = [vertical, horizontal];
            queue.push(loc);
        }
    }
    Log.debug(TAG, queue.length + ' locations added to crawler queue');
};

exports.crawlSegments = async function (req, res) {
    Log.log(TAG, 'Crawling ' + (req.detailed ? 'fine' : 'coarse') + ' segments at ' + new Date().toUTCString());

    if (queue.length === 0) {
        this.init();
    }

    let start = queue.pop();
    const horizontal = 0.009009;    // one horizontal kilometer
    const vertical = 0.013808;      // one vertical kilometer

    if (!req.detailed) {
        iterations = 10;
        increaseRadiusBy = 10;
        start = queue[Math.floor(Math.random() * queue.length)];
    }

    Log.debug(TAG, 'Start: (' + start[0] + ', ' + start[1] + ')');
    const segments = new Set();

    for (let i = 1; i <= iterations; ++i) {
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
        await Strava.segmentsExplorer('b835d0c6c520f39d22eeb8d60dc65ecb17559542', options, function (err, segment) {
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
    }
    if (res) {
        // if this was a request through the frontend
        res.json({});
    }
};

