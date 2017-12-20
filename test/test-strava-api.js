'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const test = require('tape');
const {cleanup} = require('./helper');
const Route = mongoose.model('Route');
const strava = require('../app/controllers/strava');


test('Clean up', cleanup);

test('Invalid Request - no access token given', t => {
    strava.getAthlete(null, null, async (err, payload) => {
        t.same(err, null /*{msg: 'you must include an access_token'}*/, 'strava did not return error when access token is missing');
        t.same(payload, undefined, 'strava did return a payload when access token is missing');
        t.end();

    })
});

test('Invalid Request - no id given', t => {
    strava.getAthlete(null, '123456', async (err, payload) => {
        t.same(err, null, 'strava should not return an error when access token is given');
        t.same(payload, {
            message: 'Authorization Error',
            errors: [{resource: 'Application', field: '', code: 'invalid'}]
        }, 'strava did return a payload when id is missing');
        t.end();

    })
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

test('Clean up', cleanup);
