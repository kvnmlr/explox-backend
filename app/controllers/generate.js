'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/generate';

/**
 * Module dependencies.
 */
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');

exports.generate = function (req, res) {
    res.render('loading', {text: "Routen werden gesucht"});
    Log.log(TAG, "Used parameters: " + JSON.stringify(req.query));
    var sport = req.query.sport || "cycling";
    var distance = req.query.distance || "5.0";
    var difficulty = req.query.difficulty || "advanced";
    var start = {
        lat: req.query.lat,
        lng: req.query.lng
    }
};