'use strict';

const mongoose = require('mongoose');
const test = require('tape');
const {cleanup} = require('./helper');
const Route = mongoose.model('Route');
const strava = require('../app/controllers/strava');

test('Clean up', cleanup);

test('Invalid Request - no access token given', t => {
    strava.getAthlete({stravaId: '123456789'}, null)
        .catch((err) => {
        })
        .then(function (payload) {
            t.same(payload, undefined, 'strava should not return a payload when access token is missing');
            t.end();
        });
});

test('Get athlete - should return the correct athlete profile', t => {
    // TODO implement
    t.end();
});

test('Get route - should return the correct route', t => {
    // TODO implement
    t.end();
});

test('Get activity - should return the correct activity', t => {
    // TODO implement
    t.end();
});

test.onFinish(() => process.exit(0));

