'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const StravaStrategy = require('passport-strava').Strategy;
const config = require('../');
const User = mongoose.model('User');

/**
 * Expose
 */

module.exports = new StravaStrategy({
        clientID: config.strava.clientID,
        clientSecret: config.strava.clientSecret,
        callbackURL: config.strava.callbackURL
    },
    function (accessToken, refreshToken, profile, done) {
        console.log("access token: " + accessToken);
        console.log("refresh token: " + refreshToken);

        const options = {
            criteria: { 'strava.id': parseInt(profile.id) }
        };
        User.load(options, function (err, user) {
            if (err) return done(err);
            if (!user) {
                console.log('okay');
                user = new User({
                    name: profile.displayName,
                    email: profile._json.email,
                    username: profile.name.first,
                    provider: 'strava',
                    strava: profile._json,
                    authToken: accessToken
                });
                user.save(function (err) {
                    if (err) console.log(err);
                    return done(err, user);
                });
            } else {
                return done(err, user);
            }
        });
    }
);