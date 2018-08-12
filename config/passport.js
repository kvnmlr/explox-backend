'use strict';

const mongoose = require('mongoose');
const User = mongoose.model('User');
const local = require('./passport/local');
const strava = require('./passport/strava');

module.exports = function (passport) {

    // serialize sessions
    passport.serializeUser((user, cb) => cb(null, user.id));
    passport.deserializeUser((id, cb) => User.load_options({criteria: {_id: id}}, cb));

    // use these strategies
    passport.use(local);
    passport.use(strava);
};
