'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/optimization';

/**
 * Module dependencies.
 */
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');

exports.prune = function (req, res) {


    Geo.prune({}, (err, geos) => {
        Log.debug(TAG, 'ok');
    });
};