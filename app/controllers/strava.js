'use strict';

const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const Log = require('../utils/logger');

const TAG = 'strava';

let apiLimits = { 'shortTermUsage': 0, 'shortTermLimit': 600, 'longTermUsage': 0, 'longTermLimit': 30000 };

// TODO this must come from the DB, otherwise every worker will have different data
exports.getLimits = function () {
    return apiLimits;
};

/**
 * Query all relevant user data
 */

exports.updateUser = function (req, res, next) {
    const id = req.user._id;
    User.load(id, function (err, user) {
        if (err) return;
        if (user) {
            const token = user.authToken;
            const id = user.stravaId;
            exports.getAthlete(id, token);
            exports.getFriends(id, token);
            exports.getStats(id, token);
            exports.getRoutes(id, token);
            //exports.getActivities(id, token);
            next(null, user);
        }
    });
};

/**
 * Get the user's friends, updates db.user to include the new friends
 */
exports.getFriends = function (id, token, next) {
    strava.athletes.listFriends({
        id: id,
        access_token: token,
        page: 1,
        per_page: 100
    }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        //Log.debug(TAG, 'Friends: \n' + JSON.stringify(payload, null, 2));
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
    strava.athletes.get({ id: id, access_token: token }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        //Log.debug(TAG, '\nAthlete Profile: \n' + JSON.stringify(payload, null, 2));
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
    strava.athletes.stats({ id: id, access_token: token, page: 1, per_page: 100 }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        //Log.debug(TAG, '\nAthlete Stats: \n' + JSON.stringify(payload, null, 2));
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
exports.getRoutes = function (id, token, next) {
    strava.athlete.listRoutes({ id: id, access_token: token, page: 1, per_page: 100 }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        //Log.debug(TAG, '\nRoutes: \n' + JSON.stringify(payload, null, 2));

        // for each route, get detailed route information
        let max = 4;
        if (payload.length < max) max = payload.length;
        for (let i = 0; i < max; ++i) {        // TODO for testing only gets 3 routes
            // TODO Optimization: only get the routes that are new
            getRoute(payload[i].id, token, id, next);
        }
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function (id, token, next) {
    // query a list of all activities of this user
    strava.athlete.listActivities({
        id: id,
        access_token: token,
        page: 1,
        per_page: 100
    }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
            return;
        }
        //Log.debug(TAG, '\nActivities: \n' + JSON.stringify(payload, null, 2));

        // for each activity, get detailed activity information
        for (let i = 0; i < 4 /*payload.length*/; ++i) {            // TODO for testing gets only 3 activities
            // TODO Optimization: only get the routes that are new
            getActivity(payload[i].id, token, id, next);
        }
    });
};

exports.segmentsExplorer = function (token, options, next) {
    if (!options) {
        options = {
            bounds: '49.25, 7.04, 49.60, 7.1',
            activity_type: 'running',
            min_cat: 0,
            max_cat: 100,
        };
    }

    strava.segments.explore({
        access_token: token,
        bounds: options.bounds,
        activity_type: options.activity_type,
        min_cat: options.min_cat,
        max_cat: options.max_cat
    }, function (err, payload, limits) {
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

const getSegment = function (id, token, segment, next) {
    Route.load_options({ criteria: { stravaId: id } }, function (err, route) {
        // If this segment does not exist, create a new one
        if (!route) {
            Log.log(TAG, 'Creating new segment with id ' + id);

            let tags = '';
            route = new Route({
                stravaId: segment.id,
                title: segment.name,
                body: segment.description || 'A Strava segment',
                location: '',
                user: null,
                comments: [],
                tags: tags,
                geo: [],
                distance: segment.distance,
                isRoute: false
            });

            route.save(function (err) {
                if (err) {
                    Log.error(TAG, err);
                    return;
                }
                getSegmentStream(id, token, route, function (err, geos) {
                    if (err) {
                        Log.error(TAG, err);
                        return;
                    }
                    Log.log(TAG, geos.length + ' geos extracted for segment ' + id);

                    route.geo = geos;
                    route.save(function (err) {
                        if (err) {
                            Log.error(TAG, err);
                        }
                    });
                });
            });
        }
    });
};


const getActivity = function (id, token, userID, next) {
    Activity.load_options({ criteria: { activityId: id } }, function (err, activity) {
        if (err) {
            Log.error(TAG, err);
            return;
        }

        // If this activity does not yet exist, create it and associate all geos with it
        if (!activity) {
            Log.log(TAG, 'Creating new activity with id ' + id);

            const activity = new Activity({
                activityId: id,     // the activity id from Strava
                geo: []             // array of database geo references, to be filled
            });

            activity.save(function (err) {
                if (err) {
                    Log.error(TAG, err);
                    return;
                }

                // Query the gps points of this activity
                getActivityStream(id, token, activity, function (err, geos) {
                    if (err) {
                        Log.error(TAG, err);
                        return;
                    }
                    Log.log(TAG, geos.length + ' geos extracted for activity ' + id);

                    activity.geo = geos;
                    activity.save(function (err) {
                        if (err) {
                            Log.error(TAG, err);
                        }
                    });
                });

                // Link activity to user
                User.load_options({ criteria: { stravaId: userID } }, function (err, user) {
                    if (err) {
                        Log.error(TAG, err);
                        return;
                    }
                    if (user) {
                        user.activities.push(activity);
                        user.save(function (err) {
                            if (err) {
                                Log.error(TAG, err);
                                return;
                            }
                            if (next) next(null, activity);
                        });
                    }
                });
            });
        } else {
            Log.debug(TAG, 'Activity ' + id + ' already exist.');
        }
    });
};

/**
 * Retrieves detailed route information given a route id. Updates db.route with the route information (e.g. distance).
 */
const getRoute = function (id, token, userID, next) {
    strava.routes.get({ id: id, access_token: token }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }

        User.load_options({ criteria: { stravaId: userID } }, function (err, user) {
            if (err) {
                Log.error(TAG, err);
                return;
            }
            if (user) {
                // If this route does not exist in the db create an entry in db.route, link to db.user using userID
                Route.load_options({ criteria: { stravaId: id } }, function (err, route) {
                    // If this route does not exist, create a new one
                    if (!route) {
                        Log.log(TAG, 'Creating new route with id ' + id);
                        let tags = '';
                        if (payload.type === 1) tags += 'ride, cycling';
                        if (payload.type === 2) tags += 'run, running';
                        switch (payload.sub_type) {
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
                            geo: [],
                            distance: payload.distance
                        });
                        route.save(function (err) {
                            if (err) {
                                Log.error(TAG, err);
                            }
                            getRouteStream(id, token, route, function (err, geos) {
                                if (err) {
                                    Log.error(TAG, err);
                                    return;
                                }
                                Log.log(TAG, geos.length + ' geos extracted for route ' + id);

                                route.geo = geos;
                                route.save(function (err) {
                                    if (err) {
                                        Log.error(TAG, err);
                                        if (next) next(null, route);
                                    }
                                });
                            });
                        });
                    } else {
                        Log.debug(TAG, 'Route ' + id + ' already exist.');
                    }
                });
            }
        });
    });
};

/**
 * Retrieves the GeoJSON data for a given route. Updates db.geo and db.route
 */
const getRouteStream = function (id, token, route, next) {
    strava.streams.route({ id: id, types: '', access_token: token }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
            return;
        }
        extractGeosFromPayload(id, { payload: payload, route: route }, next);
    });
};

const getActivityStream = function (id, token, activity, next) {
    strava.streams.activity({ id: id, types: 'latlng', access_token: token }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        extractGeosFromPayload(id, { payload: payload, activity: activity }, next);
    });
};


const getSegmentStream = function (id, token, segment, next) {
    strava.streams.segment({ id: id, types: '', access_token: token }, function (err, payload, limits) {
        apiLimits = limits;
        if (err) {
            Log.error(TAG, err);
        }
        extractGeosFromPayload(id, {payload: payload, route: segment}, next);
    });
};

const extractGeosFromPayload = function (id, payload, next) {
    const pl = payload.payload;
    let data = null;
    for (let i = 0; i < pl.length; ++i) {
        if (pl[i].type === 'latlng') {
            data = pl[i].data;
        }
    }
    if (data == null) {
        return next('Could not read payload data from stream ' + id, null);
    }

    let lat, lng;
    let geos = [];
    for (let i = 0; i < data.length; ++i) {
        lat = data[i][0];
        lng = data[i][1];
        const geo = new Geo({
            name: id,
            location: {
                type: 'Point',
                coordinates: [lng, lat]
            },
        });

        const activity = payload.activity;
        const route = payload.route;

        // let the geo know that it belongs to this activity
        if (activity != null) {
            if (activity._id != null) {
                geo.activities.push(activity);
            } else {
                Log.error(TAG, "Activity of the stream was not null but had no _id");
                return;
            }
        }

        // let the geo know that it belongs to this route
        else if (route != null) {
            if (route._id != null) {
                geo.routes.push(route);
            } else {
                Log.error(TAG, "Route of the stream was not null but had no _id");
                return;
            }
        }

        // if for some reason something went wrong and we did have
        // neither an activity nor a route, cancel and don't save the geo
        else {
            Log.error(TAG, "Stream had neither activity nor route fields");
            return;
        }

        geos.push(geo);

        // save the new geo
        geo.save(function (err) {
            if (err) {
                return;
            }

            // if this was the last one, call the callback
            if (i === data.length - 1) {
                Log.debug(TAG, i);
                if (next) {
                    next(null, geos);
                }
            }
        });
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

exports.activitiesToGeos = function (activities) {
    // TODO transform activities to array of geos
    let res = [];
    for (let i = 0; i < activities.length; ++i) {
        const activity = activities[i];
        const geos = activity.geo;
        for (let j = 0; j < geos.length; ++j) {
            if (geos[j].location) {
                const coords = [geos[j].location.coordinates[1], geos[j].location.coordinates[0]];
                res.push(coords);
            }
        }
    }
    return res;
};