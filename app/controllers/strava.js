'use strict';

const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');

/**
 * Query all relevant user data
 */

exports.updateUser = function(req, res, next) {
    var id = req.user._id;
    console.log("update:" + id);
    User.load(id, function (err, user) {
        if (err) return done(err);
        if (user) {
            var token = user.authToken;
            var id = user.stravaId;
            exports.getAthlete(id, token);
            exports.getFriends(id, token);
            exports.getStats(id, token);
            exports.getRoutes(id, token);
            exports.getActivities(id, token);
            exports.segmentsExplorer(token);
            next();
        }
    });
};

/**
 * Get the user's friends
 */
exports.getFriends = function (id, token, next) {
    strava.athletes.listFriends({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nFriends: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Get the users profile data
 */
exports.getAthlete = function (id, token, next) {
    strava.athletes.get({id: id, access_token: token}, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nAthlete Profile: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Get the users strava statistics
 */
exports.getStats = function (id, token, next) {
    strava.athletes.stats({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nAthlete Stats: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * List all routes for the given user id
 */
exports.getRoutes = function(id, token, next) {
    strava.athlete.listRoutes({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nRoutes: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function(id, token, next) {
    strava.athlete.listActivities({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nActivities: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

exports.segmentsExplorer = function(token, next) {
    strava.segments.explore({access_token: token, bounds: [37.821362,-122.505373,37.842038,-122.465977], activity_type: 'running', min_cat: 0, max_cat: 100 }, function (err, payload, limits) {
        if (err) {
            console.log('Error ' + JSON.stringify(err));
        }
        console.log('\nExplore Segments: \n' + JSON.stringify(payload));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
}

exports.authCallback = function (req, res, next) {
    const myJSONObject = {
        'client_id': config.strava.clientID,
        'client_secret': config.strava.clientSecret,
        'code': req.query.code
    };
    request({
        url: 'https://www.strava.com/oauth/token',
        method: 'POST',
        json: true,
        body: myJSONObject
    }, function (error, response) {
        const id = response.body.athlete.id;
        const token = response.body.access_token;
        exports.getAthlete(id, token);
        exports.getRoutes(id, token);
        exports.getActivities(id, token);
        exports.segmentsExplorer(token);
        next(null, response);
    });
};