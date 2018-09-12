'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/optimization';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');

exports.prune = async(function* (req, res) {
    let geos = yield Geo.prune({});
    res.json({});
});