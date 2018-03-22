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
};