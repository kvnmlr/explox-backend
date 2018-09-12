'use strict';

const mongoose = require('mongoose');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const User = mongoose.model('User');
const Role = mongoose.model('Role');
const GeoJSON = mongoose.model('Geo');
const co = require('co');

/**
 * Clear database
 */
exports.cleanup = async function (t) {
    await User.remove();
    await Route.remove();
    await Role.remove();
    await GeoJSON.remove();
    await Activity.remove();

    t.end();
};
