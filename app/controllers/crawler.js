'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/crawler';
const Strava = require('./strava');
const mailer = require('../mailer/index');
const mongoose = require('mongoose');
const Settings = mongoose.model('Settings');


/**
 * Shuffles array in place.
 * @param {Array} array An array containing the items.
 */
function shuffle (array) {
    let j, x, i;
    for (i = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = array[i];
        array[i] = array[j];
        array[j] = x;
    }
    return array;
}

exports.init = async function () {
    Log.log(TAG, 'Initialize Crawler');
    const horizontalKilometer = 0.009009;    // one horizontal kilometer
    const verticalKilometer = 0.013808;      // one vertical kilometer

    // Large Saarland
    const ma = [49.964771, 8.242493];   // Mainz
    const st = [48.759795, 9.136916];   // Stuttgart
    const ny = [48.663657, 6.135648];   // Nancy

    // Full Saarland
    const lx = [49.696608, 6.137890];   // north of Luxemburg
    const kl = [49.679770, 7.808433];   // north of Kaiserslautern
    const mz = [48.984984, 6.169800];   // south of Metz
    const kr = [48.944127, 7.749429];   // west of Karlsruhe

    // Saarbrücken
    const sl = [49.307921, 6.721432];   // Saarlouis
    const fb = [49.194574, 6.894502];   // Forbach
    const nk = [49.340050, 7.167313];   // Neunkirchen
    const gh = [49.141470, 7.214846];   // Gersheim

    // North Saarland
    const tr = [49.786126, 6.563979];   // Trier
    const io = [49.763711, 7.363736];   // Idar Oberstein
    const sw = [49.448196, 7.217076];   // St. Wendel
    const mzg = [49.401713, 6.580591];  // Merzig

    // South Saarland
    const sa = [49.119889, 6.739864];   // St. Avold
    const pi = [49.189448, 7.609637];   // Pirmasens


    const ul = mzg;
    const ur = sw;
    const ll = sa;
    const lr = pi;

    const ul2 = sl;
    const ur2 = nk;
    const ll2 = fb;
    const lr2 = gh;

    const ul3 = lx;
    const ur3 = ma;
    const ll3 = ny;
    const lr3 = st;

    let queue = [];

    for (let vertical = Math.min(ll[0], lr[0]); vertical <= Math.max(ul[0], ur[0]); vertical += verticalKilometer * 1.1) {
        // vertical holds all vertical locations with 1km distance

        for (let horizontal = Math.min(ll[1], ul[1]); horizontal <= Math.max(lr[1], ur[1]); horizontal += horizontalKilometer * 1.1) {
            // horizontal holds all horizontal locations with 1km distance
            const loc = [vertical, horizontal];
            queue.push(loc);
        }
    }

    for (let vertical = Math.min(ll2[0], lr2[0]); vertical <= Math.max(ul2[0], ur2[0]); vertical += verticalKilometer * 0.7) {
        // vertical holds all vertical locations with 1km distance

        for (let horizontal = Math.min(ll2[1], ul2[1]); horizontal <= Math.max(lr2[1], ur2[1]); horizontal += horizontalKilometer * 0.7) {
            // horizontal holds all horizontal locations with 1km distance
            const loc = [vertical, horizontal];
            queue.push(loc);
        }
    }

    for (let vertical = Math.min(ll3[0], lr3[0]); vertical <= Math.max(ul3[0], ur3[0]); vertical += verticalKilometer * 4) {
        // vertical holds all vertical locations with 1km distance

        for (let horizontal = Math.min(ll3[1], ul3[1]); horizontal <= Math.max(lr3[1], ur3[1]); horizontal += horizontalKilometer * 4) {
            // horizontal holds all horizontal locations with 1km distance
            const loc = [vertical, horizontal];
            queue.push(loc);
        }
    }


    // shuffle the queue such that the crawler selects random elements and there is no bias
    // as to which area is crawler first
    Log.debug(TAG, queue.length + ' locations added to crawler queue');
    queue = shuffle(queue);

    let setting = await Settings.loadValue('queue');
    if (setting) {
        if (setting.value.length === 0) {
            // only init the queue when it is empty
            setting.value = queue;
            await setting.save();
        }
    }
};

exports.crawlSegments = async function (req, res) {
    let self = this;
    let setting = await Settings.loadValue('queue');
    let queue = setting.value;
    return new Promise(async function (resolve) {

        Log.debug(TAG, 'Crawling ' + (req.detailed ? 'fine' : 'coarse') + ' segments at ' + new Date().toUTCString());

        if (queue.length === 0) {
            // Send an email to the admin that the crawler has finished
            mailer.crawlerFinished();
            await self.init();
            if (res) {
                // if this was a request through the frontend
                res.json({});
            }
            resolve([]);
            return;
        }

        let start = queue.pop();
        setting.value = queue;

        if (!req.detailed) {
            // Only update after coarse crawls, otherwise keep location in
            await Settings.updateValue({key: 'queue', value: queue});
        }

        Log.log(TAG, queue.length + ' locations left in crawler queue');

        const horizontal = 0.009009;    // one horizontal kilometer
        const vertical = 0.013808;      // one vertical kilometer
        let increaseRadiusBy = 0.5;
        let iterations = 5;

        if (!req.detailed) {
            iterations = 20;
            increaseRadiusBy = 3;
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
        resolve(segments);
    });
};

