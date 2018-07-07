'use strict';

const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const Settings = mongoose.model('Settings');

const Log = require('../utils/logger');

const TAG = 'strava';

exports.getLimits = async function () {
    let setting = await Settings.loadValue('api');
    let apiLimits = {'shortTermUsage': 0, 'shortTermLimit': 600, 'longTermUsage': 0, 'longTermLimit': 30000};
    if (setting) {
        apiLimits.shortTermUsage = setting.value.shortTerm;
        apiLimits.longTermUsage = setting.value.longTerm;
    }
    return new Promise((resolve) => {
        resolve(apiLimits);
    });
};

const updateLimits = function (limit) {
    if (limit) {
        const apiUsage = {
            shortTerm: limit.shortTermUsage,
            longTerm: limit.longTermUsage
        };
        Settings.updateValue({key: 'api', value: apiUsage});
    }
};

/**
 * Query all relevant user data
 */

exports.updateUser = async function (req, res) {
    const id = req.user._id;
    let user = await User.load(id);
    if (user) {
        const token = user.authToken;
        const id = user.stravaId;
        exports.getAthlete(id, token);
        exports.getFriends(id, token);
        exports.getStats(id, token);
        exports.getRoutes(id, token);
        exports.getActivities(id, token);

        res.writeHead(302, {
            'Location': 'http://localhost:3000/users/' + user._id
        });
        res.end();
    }
};

/**
 * Get the user's friends, updates db.user to include the new friends
 */
exports.getFriends = function (id, token) {
    strava.athletes.listFriends({
        id: id,
        access_token: token,
        page: 1,
        per_page: 100
    }, function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        }
    });
};

/**
 * Get the users profile data, updates db.user in case something has changes (e.g. e-mail address)
 */
exports.getAthlete = function (id, token) {
    return new Promise(function (resolve, reject) {
        strava.athletes.get({id: id, access_token: token}, function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                reject(Error(err));
                Log.error(TAG, 'Error while retrieving user data', err);
            }
            resolve(payload);
        });
    });
};

/**
 * Get the users strava statistics, updates the db.user with the new stats
 */
exports.getStats = function (id, token) {
    strava.athletes.stats({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        }
        // Log.debug(TAG, '\nAthlete Stats: \n' + JSON.stringify(payload, null, 2));
    });
};

/**
 * Retrieves all routes created by the given user id, retrieves detailed route information, retrieves the route stream.
 * Updates db.user to include all routes, updates db.geo to include the coordinates of all routes, updates db.route to hold all route and references to db.geo
 */
exports.getRoutes = function (id, token) {
    strava.athlete.listRoutes({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        }
        if (payload) {
            let max = 10;
            if (payload.length < max) max = payload.length;

            for (let i = 0; i < max; ++i) {
                setTimeout(function () {
                    getRoute(payload[i].id, token, id);
                }, 500 * i);
            }
        }
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function (id, token) {
    // query a list of all activities of this user
    strava.athlete.listActivities({
        id: id,
        access_token: token,
        page: 1,
        per_page: 100
    }, function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
            return;
        }
        if (payload) {
            // Log.debug(TAG, '\nActivities: \n' + JSON.stringify(payload, null, 2));

            const max = 10;
            let numActivities = payload.length;

            if (numActivities > max) numActivities = max;

            // for each activity, get detailed activity information
            for (let i = 0; i < numActivities; ++i) {
                // TODO Optimization: only get the activities that are new
                setTimeout(function () {
                    getActivity(payload[i].id, token, id);
                }, 500 * i);
            }
        }
    });
};

exports.segmentsExplorer = function (token, options, next) {
    if (!options) {
        options = {
            bounds: '49.25, 7.04, 49.60, 7.1',
            activity_type: 'riding',
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
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        } else {
            if (payload.segments) {
                for (let i = 0; i < payload.segments.length; ++i) {
                    getSegment(payload.segments[i].id, token, payload.segments[i]);
                }
            }
        }
        next(null, payload);
    });
};

const getSegment = async function (id, token, segment, next) {
    let route = await Route.load_options({criteria: {stravaId: id}});
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

        await route.save();
        getSegmentStream(id, token, route, async function (err, geos) {
            if (err) {
                return;
            }
            Log.log(TAG, geos.length + ' geos extracted for segment ' + id);

            route.geo = geos;
            await route.save();
            if (next) {
                next(null, route);
            }
        });
    }
};


const getActivity = async function (id, token, userID) {
    strava.activities.get({id: id, access_token: token}, async function (err, payload, limits) {
        if (err) {
            Log.error(TAG, err);
        }
        updateLimits(limits);

        let user = await User.load_options({criteria: {stravaId: userID}});
        if (user) {
            let activity = await Activity.load_options({criteria: {activityId: id}});

            // If this activity does not yet exist, create it and associate all geos with it
            if (!activity) {
                Log.log(TAG, 'Creating new activity with id ' + id);

                let activity = new Activity({
                    activityId: id,         // the activity id from Strava
                    geo: [],                // array of database geo references, to be filled
                    user: user,             // user who owns this activity
                    title: payload.name,    // title corresponding to the name in strava
                    distance: payload.distance  // distance in meters
                });

                await activity.save();

                // Query the gps points of this activity
                getActivityStream(id, token, activity, async function (err, geos) {
                    if (err) {
                        return;
                    }
                    Log.log(TAG, geos.length + ' geos extracted for activity ' + id);

                    // Add all the geos to the activity and save it
                    activity.geo = activity.geo.concat(geos);
                    await activity.save();

                    // Link activity to user
                    // Load user new to avoid version error
                    let user = await User.load_options({criteria: {stravaId: userID}});
                    user.activities = user.activities.concat([activity]);
                    await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));
                });
            } else {
                Log.debug(TAG, 'Activity ' + id + ' already exist.');
            }
        }
    });
};

/**
 * Retrieves detailed route information given a route id. Updates db.route with the route information (e.g. distance).
 */
const getRoute = async function (id, token, userID) {
        strava.routes.get({id: id, access_token: token}, async function (err, payload, limits) {
            if (err) {
                Log.error(TAG, err);
            }
            updateLimits(limits);

            let user = await User.load_options({criteria: {stravaId: userID}});

            if (user) {
                // If this route does not exist in the db create an entry in db.route, link to db.user using userID
                let route = await Route.load_options({criteria: {stravaId: id}});
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
                        body: payload.description || 'A Strava route created by ' + user.username,
                        location: '',
                        user: user,
                        comments: [],
                        tags: tags,
                        geo: [],
                        distance: payload.distance
                    });
                    await route.save();
                    getRouteStream(id, token, route, async function (err, geos) {
                        if (err) {
                            return;
                        }
                        Log.log(TAG, geos.length + ' geos extracted for route ' + id);

                        route.geo = geos;
                        route.save();

                        // Link activity to user
                        // Load user new to avoid version error
                        let user = await User.load_options({criteria: {stravaId: userID}});
                        user.routes = user.routes.concat([route]);
                        await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));
                    });
                } else {
                    Log.debug(TAG, 'Route ' + id + ' already exist.');
                }
            }
        })
        ;
    }
;

/**
 * Retrieves the GeoJSON data for a given route. Updates db.geo and db.route
 */
const getRouteStream = function (id, token, route, next) {
    strava.streams.route({id: id, types: '', access_token: token}, async function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
            return;
        }
        let geos = await extractGeosFromPayload(id, {payload: payload, route: route});
        if (geos !== null) {
            next(null, geos);
        }
    });
};

const getActivityStream = async function (id, token, activity, next) {
    strava.streams.activity({id: id, types: 'latlng', access_token: token}, async function (err, payload) {
        // updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        }
        let geos = await extractGeosFromPayload(id, {payload: payload, activity: activity});
        if (geos !== null) {
            next(null, geos);
        }
    });
};


const getSegmentStream = function (id, token, segment, next) {
    strava.streams.segment({id: id, types: '', access_token: token}, async function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, err);
        }
        let geos = await extractGeosFromPayload(id, {payload: payload, route: segment});
        if (geos !== null) {
            next(null, geos);
        }
    });
};

const extractGeosFromPayload = async function (id, payload) {
    const pl = payload.payload;
    let data = null;
    for (let i = 0; i < pl.length; ++i) {
        if (pl[i].type === 'latlng') {
            data = pl[i].data;
        }
    }
    if (data == null) {
        Log.error(TAG, 'Could not read payload data from stream ' + id, pl);
        return new Promise((resolve) => {
            resolve(null);
        });
    }

    let lat, lng;

    // Only store a certain number of waypoints for efficiency (routes, segmetns, and activities).
    let leave = 300; // sample waypoints to max 100
    if (data.length < leave) {
        leave = data.length;
    }
    const takeEvery = Math.ceil(data.length / leave);
    const remaining = Math.floor(data.length / takeEvery);

    let geos = [];
    let geosSaved = 0;

    for (let i = 0; i < data.length; ++i) {
        // always keep the first and last element. Only take some in between
        if (i === 0 || i % takeEvery === 0 || i === data.length - 1) {
            lat = data[i][0];
            lng = data[i][1];
            let geo = new Geo({
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
                    geo.activities = geo.activities.concat([activity]);
                } else {
                    Log.error(TAG, 'Activity of the stream was not null but had no _id');
                    return;
                }
            }

            // let the geo know that it belongs to this route
            else if (route != null) {
                if (route._id != null) {
                    geo.routes = geo.routes.concat([route]);
                } else {
                    Log.error(TAG, 'Route of the stream was not null but had no _id');
                    return;
                }
            }

            // if for some reason something went wrong and we did have
            // neither an activity nor a route, cancel and don't save the geo
            else {
                Log.error(TAG, 'Stream had neither activity nor route fields');
                return;
            }

            geos = geos.concat([geo]);

            // save the new geo
            await geo.save();
            geosSaved++;

            // if this was the last one, call the callback
            if (geosSaved === remaining) {
                return new Promise((resolve) => {
                    resolve(geos);
                });
            }
        }
    }
};

exports.authCallback = function (req, res, next) {
    Log.debug(TAG, 'here');
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
    }, async function (error, response) {
        const id = response.body.athlete.id;
        const token = response.body.access_token;
        Log.debug(TAG, 'Start');
        await exports.getAthlete(id, token);
        Log.debug(TAG, 'getAthlete done');

        await exports.getRoutes(id, token);
        Log.debug(TAG, 'getRoutes done');

        await exports.getActivities(id, token);
        Log.debug(TAG, 'getActivities done');

        // await exports.segmentsExplorer(token);
        next(null, response);
    });
};

exports.activitiesToGeos = function (activities) {
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