'use strict';

const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');
const Log = require('../utils/logger')

const TAG = "strava";

var apiLimits = {"shortTermUsage":0,"shortTermLimit":600,"longTermUsage":0,"longTermLimit":30000};

exports.getLimits = function() {
    return apiLimits;
};

/**
 * Query all relevant user data
 */

exports.updateUser = function(req, res, next) {
    var id = req.user._id;
    User.load(id, function (err, user) {
        if (err) return done(err);
        if (user) {
            const token = user.authToken;
            const id = user.stravaId;
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
 * Get the user's friends, updates db.user to include the new friends
 */
exports.getFriends = function (id, token, next) {
    strava.athletes.listFriends({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG, 'Friends: \n' + JSON.stringify(payload, null, 2));
        // todo update database to include all friends
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Get the users profile data, updates db.user in case something has changes (e.g. e-mail address)
 */
exports.getAthlete = function (id, token, next) {
    strava.athletes.get({id: id, access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG, '\nAthlete Profile: \n' + JSON.stringify(payload, null, 2));
        // todo update database with new user profile data
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Get the users strava statistics, updates the db.user with the new stats
 */
exports.getStats = function (id, token, next) {
    strava.athletes.stats({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG, '\nAthlete Stats: \n' + JSON.stringify(payload, null, 2));
        // todo update database with new user statistics
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Retrieves all routes created by the given user id, retrieves detailed route information, retrieves the route stream.
 * Updates db.user to include all routes, updates db.geo to include the coordinates of all routes, updates db.route to hold all route and references to db.geo
 */
exports.getRoutes = function(id, token, next) {
    strava.athlete.listRoutes({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nRoutes: \n' + JSON.stringify(payload, null, 2));

        // for each route, get detailed route information
        for (let i = 0; i < payload.length; ++i) {
            getRoute(payload[i].id, token, id, next);
        }
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function(id, token, next) {
    strava.athlete.listActivities({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        apiLimits = limits;
        Log.debug(TAG, "limits", limits);
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nActivities: \n' + JSON.stringify(payload, null, 2));

        // for each activity, get detailed activity information
        for (let i = 0; i < payload.length; ++i) {
            //exports.getActivity(payload[i].id, token, next);  // TODO implement and uncomment
        }
    });
};

/**
 * TODO implement
 */
exports.segmentsExplorer = function(token, next) {
    strava.segments.explore({access_token: token, bounds: [37.821362,-122.505373,37.842038,-122.465977], activity_type: 'running', min_cat: 0, max_cat: 100 }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nExplore Segments: \n' + JSON.stringify(payload, null, 2));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

/**
 * Retrieves detailed route information given a route id. Updates db.route with the route information (e.g. distance).
 */
const getRoute = function(id, token, userID, next) {
    strava.routes.get({id: id, access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nRoute '+id+': \n' + JSON.stringify(payload, null, 2));
        // TODO create or update an entry in db.route, link to db.user using userID

        if (payload) {
            getRouteStream(id, token, next);
            // exports.getSegmentStream(15981886, token, next);     // TODO uncomment once this becomes relevant
        }
    });
};

/**
 * Retrieves the GeoJSON data for a given route. Updates db.geo and db.route
 */
const getRouteStream = function(id, token, next) {
    strava.streams.route({id: id, types: '', access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nRoute '+id+' Stream: \n' + JSON.stringify(payload, null, 2));
        // TODO create entries in db.geo, link to db.route using id
        if (next) {
            next(null, payload);
        }
    });
};

const getSegmentStream = function(id, token, next) {
    strava.streams.segment({id: id, types:['latlng'], access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nSegment '+id+' Stream: \n' + JSON.stringify(payload, null, 2));
        // todo update database
        if (next) {
            next(null, payload);
        }
    });
};

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