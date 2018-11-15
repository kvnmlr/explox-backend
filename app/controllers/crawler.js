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

    // Full Saarland
    const lx = [49.696608, 6.137890];   // north of Luxemburg
    const kl = [49.679770, 7.808433];   // north of Kaiserslautern
    const mz = [48.984984, 6.169800];   // south of Metz
    const kr = [48.944127, 7.749429];   // west of Karlsruhe

    // Saarbrücken
    const sb = [49.245665, 6.997569];   // Saarbrücken
    const igb = [49.287085, 7.12887];   // Ingbert
    const eh = [49.234207, 7.112391];   // Ensheim
    const qs = [49.319769, 7.058146];   // Quierschied

    // North Saarland
    const tr = [49.786126, 6.563979];   // Trier
    const io = [49.763711, 7.363736];   // Idar Oberstein
    const sw = [49.448196, 7.217076];   // St. Wendel
    const mzg = [49.401713, 6.580591];  // Merzig


    const ul = tr;
    const ur = io;
    const ll = mzg;
    const lr = sw;

    let queue = [];

    for (let vertical = Math.min(ll[0], lr[0]); vertical <= Math.max(ul[0], ur[0]); vertical += verticalKilometer * 1.5) {
        // vertical holds all vertical locations with 1km distance

        for (let horizontal = Math.min(ll[1], ul[1]); horizontal <= Math.max(lr[1], ur[1]); horizontal += horizontalKilometer * 1.5) {
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

        await Settings.updateValue({key: 'queue', value: queue});

        Log.log(TAG, queue.length + ' locations left in crawler queue');

        const horizontal = 0.009009;    // one horizontal kilometer
        const vertical = 0.013808;      // one vertical kilometer
        let increaseRadiusBy = 0.5;
        let iterations = 3;

        if (!req.detailed) {
            iterations = 20;
            increaseRadiusBy = 5;
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

