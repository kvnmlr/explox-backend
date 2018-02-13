'use strict';

const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const Init = require('../../init');

const Log = require('../utils/logger')

const TAG = "strava";

var apiLimits = {"shortTermUsage":0,"shortTermLimit":600,"longTermUsage":0,"longTermLimit":30000};

// TODO this must come from the DB, otherwise every worker will have different data
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
            // TODO Optimization: only get the routes that are new
            getRoute(payload[i].id, token, id, next);
        }
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function(id, token, next) {
    strava.athlete.listActivities({id: id, access_token: token, page: 1, per_page: 100 /*TODO set up again, just 10 for testing*/}, function (err, payload, limits) {
        apiLimits = limits;
        Log.debug(TAG, "limits", limits);
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nActivities: \n' + JSON.stringify(payload, null, 2));

        // for each activity, get detailed activity information
        for (let i = 0; i < payload.length; ++i) {
            getActivity(payload[i].id, token, id, next);
        }
    });
};


const getSegment = function(id, token, segment, next) {
    Route.load_options({criteria: {stravaId: id}}, function(err, route) {
        // If this segment does not exist, create a new one
        if (!route) {
            getSegmentStream(id, token, function(err, geos) {
                if (err) {
                    Log.error(TAG, err); return;
                }
                let tags = '';
                route = new Route({
                    stravaId: segment.id,
                    title: segment.name,
                    body: segment.description || 'A Strava segment',
                    location: '',
                    user: null,
                    comments: [],
                    tags: tags,
                    geo: geos,
                    distance: segment.distance,
                    isRoute: false
                });
                route.save(function (err) {
                    if (!err) {
                        Log.debug(TAG, "Found a new segment: " + segment.name + " with id " + segment.id + " and " + geos.length + " coordinates");
                    }
                });
            });
        }
    });
    next(null, segment);
};
/**
 * TODO implement
 */
exports.segmentsExplorer = function(token, options, next) {
    if (!options) {
        options = {
            bounds: '49.25, 7.04, 49.60, 7.1',
            activity_type: 'running',
            min_cat: 0,
            max_cat: 100,
        }
    }

    strava.segments.explore({access_token: token, bounds: options.bounds, activity_type: options.activity_type, min_cat: options.min_cat, max_cat: options.max_cat }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        } else {
            for (let i = 0; i < payload.segments.length; ++i) {
                getSegment(payload.segments[i].id, token, payload.segments[i], next);
            }
        }
    });
};

const getSegmentStream = function(id, token, next) {
    strava.streams.segment({id: id, types: '', access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        extractGeosFromPayload(id, payload, next);
    });
};


const getActivity = function(id, token, userID, next) {
    Activity.load_options({criteria: {activityId: id}}, function(err, activity) {
        if (err) {
            Log.error(TAG, err); return;
        }
        if (!activity) {
            Log.debug(TAG, "Activity " + id + " does not exist, creating it ...");
            getActivityStream(id, token, function(err, geos) {
                if (err) {
                    Log.error(TAG, err); return;
                }
                Log.log(TAG, geos.length + " geos extracted for activity " + id);

                // Create the activity
                var activity = new Activity({
                    activityId: id,
                    geo: geos
                });
                activity.save(function (err) {
                    if (err) {
                        Log.error(TAG, err);
                    }
                });

                // Link activity to user
                User.load_options({criteria: {stravaId: userID}}, function (err, user) {
                    if (err) {
                        Log.error(TAG, err);
                    }
                    if (user) {
                        user.activities.push(activity);
                        user.save(function (err) {
                            Log.log(TAG, "USER SAVED");
                            if (err) {
                                Log.error(TAG, err);
                            }
                        });
                    }
                });
            });
        } else {
            Log.debug(TAG, "Activity " + id + " already exist.");
        }
    });
    return;

};

/**
 * Retrieves detailed route information given a route id. Updates db.route with the route information (e.g. distance).
 */
const getRoute = function(id, token, userID, next) {
    // TODO reorder: Frist check if already exists, then do API call

    strava.routes.get({id: id, access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nRoute ' + id + ': \n' + JSON.stringify(payload, null, 2));

        User.load_options({criteria: {stravaId: userID}}, function (err, user) {
            if (err) {
                Log.error(TAG, err);
                return done(err);
            }
            if (user) {
                // If this route does not exist in the db create an entry in db.route, link to db.user using userID
                Route.load_options({criteria: {stravaId : id}}, function(err, route) {
                    // If this route does not exist, create a new one
                    if (!route) {
                        // TODO fill with actual data from payload
                        getRouteStream(id, token, function(err, geos) {
                            if (err) {
                                Log.error(TAG, err); return;
                            }
                            let tags = '';
                            if (payload.type === 1) tags += 'ride, cycling';
                            if (payload.type === 2) tags += 'run, running';
                            switch (payload.sub_type){
                                case 1:
                                    tags += ', road';
                                    break;
                                case 2:
                                    tags += ', mountainbike';
                                    break;
                                case 3:
                                    tags += ', cx';
                                    break;
                                case 4:
                                    tags += ', trail';
                                    break;
                                case 5:
                                    tags += ', mixed';
                                    break;
                            }

                            route = new Route({
                                stravaId: id,
                                title: payload.name,
                                body: payload.description || 'A Strava route created by ' + user.username,    // TODO generate
                                location: '',                                     // TODO find out based on GPS
                                user: user,
                                comments: [],
                                tags: tags,
                                geo: geos,
                                distance: payload.distance
                            });
                            route.save(function (err) {
                                if (err) {
                                    Log.error(TAG, err);
                                }
                            });
                        });
                    }
                });
            }
        });
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
        Log.debug(TAG,'\nRoute Stream '+id+': \n' + JSON.stringify(payload, null, 2));
        extractGeosFromPayload(id, payload, next);
    });
};

const getActivityStream = function(id, token, next) {
    strava.streams.activity({id: id, types: 'latlng', access_token: token}, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        Log.debug(TAG,'\nActivity Stream '+id+': \n' + JSON.stringify(payload, null, 2));
        extractGeosFromPayload(id, payload, next);
    });
};

const extractGeosFromPayload = function(id, payload, next) {
    var data = null;
    for (let i = 0; i < payload.length; ++i) {
        if (payload[i].type === 'latlng') {
            data = payload[i].data;
        }
    }
    if (data == null) {
        return next("could not read data from payload", null);
    }

    var lat, lng;
    var geos = [];
    for (let i = 0; i < data.length; ++i) {
        lat = data[i][0];
        lng = data[i][1];
        const geo = new Geo({
            name: id,
            location: {
                type: 'Point',
                coordinates: [lng, lat]
            }
        });

        geo.save(function (err) {
            if (err) Log.error(TAG, err);
        });
        geos.push(geo);
    }
    if (next) {
        next(null, geos);
    }
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

exports.activitiesToGeos = function(activities) {
    // TODO transform activities to array of geos
    let res = [];
    for(let i = 0; i < activities.length; ++i) {
        const activity = activities[i];
        const geos = activity.geo;
        for (let j = 0; j < geos.length; ++j) {
            if (geos[j].location) {
                const coords = [geos[j].location.coordinates[1],geos[j].location.coordinates[0]];
                res.push(coords);
            }
        }
    }
    return res;
};