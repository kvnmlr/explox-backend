'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/optimization';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');

exports.prune = async function () {
    let geos = await Geo.list({});
    Log.debug(TAG, geos.length);

    for (let i = 0; i < geos.length; ++i) {
        const geo = geos[i];
        if (geo.routes.length > 0) {
            for (let j = 0; j < geo.routes.length; ++j) {
                let route = await Route.load(geo.routes[j].toString());
                if (!route || route === null) {
                    geos[i].remove();
                }
            }
        }

        if (geo.activities.length > 0) {
            for (let j = 0; j < geo.activities.length; ++j) {
                let activity = await Activity.load(geo.activities[j].toString());
                if (!activity || activity === null) {
                    geos[i].remove();
                }

            }
        }
    }
};
