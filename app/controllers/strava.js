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
    const id = req.profile._id;
    let user = await User.load(id);
    if (user) {
        const token = user.authToken;
        const id = user.stravaId;
        // await exports.getAthlete(id, token);
        // await exports.getFriends(id, token);
        // await exports.getStats(id, token);
        await exports.getRoutes(id, token);
        await exports.getActivities(id, token);

        res.json({
            flash: {
                text: 'Your profile, routes and activities have been syncronized',
                type: 'success'
            }
        });
    }
};

/**
 * Get the user's friends, updates db.user to include the new friends
 */
exports.getFriends = function (id, token) {
    return new Promise(function (resolve, reject) {
        strava.athletes.listFriends({
            id: id,
            access_token: token,
            page: 1,
            per_page: 100
        }, function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while retrieving user friend list', err);
                reject(new Error(err));
                return;
            }
            resolve(payload);
        });
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
                Log.error(TAG, 'Error while retrieving user data', err);
                reject(new Error(err));
                return;
            }
            resolve(payload);
        });
    });
};

/**
 * Get the users strava statistics, updates the db.user with the new stats
 */
exports.getStats = function (id, token) {
    return new Promise(function (resolve, reject) {
        strava.athletes.stats({id: id, access_token: token, page: 1, per_page: 100}, function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while getting user statistics', err);
                reject(new Error(err));
                return;
            }
            resolve(payload);
        });
    });
};

/**
 * Retrieves all routes created by the given user id, retrieves detailed route information, retrieves the route stream.
 * Updates db.user to include all routes, updates db.geo to include the coordinates of all routes, updates db.route to hold all route and references to db.geo
 */
exports.getRoutes = function (id, token) {
    return new Promise(function (resolve, reject) {
        strava.athlete.listRoutes({
            id: id,
            access_token: token,
            page: 1,
            per_page: 100
        }, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while retrieving user routes', err);
                reject(new Error(err));
                return;
            }
            if (payload) {
                let max = 2;
                if (payload.length < max) max = payload.length;

                for (let i = 0; i < max; ++i) {

                    const route = await Route.load_options({criteria: {stravaId: payload[i].id}});
                    if (route) {
                        Log.debug(TAG, 'Route ' + payload[i].id + ' already exist.');
                    } else {
                        await getRoute(payload[i].id, token, id).catch();
                    }
                }
            }
            resolve(payload);
        });
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function (id, token) {
    // query a list of all activities of this user
    return new Promise(function (resolve, reject) {

        strava.athlete.listActivities({
            id: id,
            access_token: token,
            page: 1,
            per_page: 100
        }, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while retrieving activities', err);
                reject(new Error(err));
                return;
            }
            if (payload) {
                const max = 5;
                let numActivities = payload.length;

                if (numActivities > max) numActivities = max;

                // for each activity, get detailed activity information
                for (let i = 0; i < numActivities; ++i) {
                    const activity = await Activity.load_options({criteria: {activityId: payload[i].id}});
                    if (activity) {
                        Log.debug(TAG, 'Activity ' +  payload[i].id + ' already exist.');
                    } else {
                        await getActivity(payload[i].id, token, id).catch((err) => {});
                    }
                }
                resolve(payload);
            }
        });
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
    }, async function (err, payload, limits) {
        updateLimits(limits);
        if (err) {
            Log.error(TAG, 'Error in segment explore request', err);
        } else {
            if (payload.segments) {
                for (let i = 0; i < payload.segments.length; ++i) {
                    const segment = await Route.load_options({
                        criteria: {
                            isRoute: false,
                            stravaId: payload.segments[i].id
                        }
                    });
                    if (segment) {
                        Log.debug(TAG, 'Segment ' + payload.segments[i].id + ' already exist.');
                    } else {
                        await getSegment(payload.segments[i].id, token, payload.segments[i]);
                    }
                }
            }
        }
        next(null, payload);
    });
};

const getSegment = async function (id, token, segment, next) {
    Log.log(TAG, 'Creating new segment with id ' + id);

    let tags = '';
    let route = new Route({
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
    await getSegmentStream(id, token, route, async function (err, geos) {
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
};


const getActivity = async function (id, token, userID) {
    return new Promise(function (resolve, reject) {
        strava.activities.get({id: id, access_token: token}, async function (err, payload, limits) {
            if (err) {
                Log.error(TAG, 'Error trying to get activity details', err);
                reject(new Error(err));
                return;
            }
            updateLimits(limits);

            let user = await User.load_options({criteria: {stravaId: userID}});
            if (user) {

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
                await getActivityStream(id, token, activity, async function (err, geos) {
                    if (err || geos === undefined) {
                        Log.error(TAG, 'Error retrieving activity stream', err);
                        reject(new Error(err));
                        return;
                    }
                    Log.log(TAG, geos.length + ' geos extracted for activity ' + id);

                    // Add all the geos to the activity and save it
                    activity.geo = activity.geo.concat(geos);
                    await activity.save();

                    // Link activity to user
                    user.activities = user.activities.concat([activity]);
                    await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));

                    resolve(geos);
                });
            }
        });
    });
};

/**
 * Retrieves detailed route information given a route id. Updates db.route with the route information (e.g. distance).
 */
const getRoute = async function (id, token, userID) {
    return new Promise(function (resolve, reject) {
        strava.routes.get({id: id, access_token: token}, async function (err, payload, limits) {
            if (err) {
                Log.error(TAG, 'Error trying to get route details', err);
                reject(new Error(err));
                return;
            }
            updateLimits(limits);

            let user = await User.load_options({criteria: {stravaId: userID}});

            if (user) {
                // If this route does not exist in the db create an entry in db.route, link to db.user using userID
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
                let route = new Route({
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
                await getRouteStream(id, token, route, async function (err, geos) {
                    if (err) {
                        Log.error(TAG, 'Error getting a route stream', err);
                        reject(new Error(err));
                        return;
                    }
                    Log.log(TAG, geos.length + ' geos extracted for route ' + id);

                    route.geo = geos;
                    await route.save();

                    // Link activity to user
                    user.routes = user.routes.concat([route]);
                    await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));
                    resolve(geos);
                });
            }
        });
    });
};

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
        let geos = await extractGeosFromPayload(id, {payload: payload, route: route}).catch((err) => next(err.message));
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
        let geos = await extractGeosFromPayload(id, {payload: payload, activity: activity}).catch((err) => next(err.message));
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
        let geos = await extractGeosFromPayload(id, {payload: payload, route: segment}).catch((err) => next(err.message));
        if (geos !== null) {
            next(null, geos);
        }
    });
};

const extractGeosFromPayload = async function (id, payload) {
    return new Promise(async function (resolve, reject) {

        const pl = payload.payload;
        let data = null;
        for (let i = 0; i < pl.length; ++i) {
            if (pl[i].type === 'latlng') {
                data = pl[i].data;
            }
        }
        if (data == null || data === undefined) {
            Log.error(TAG, 'Could not read payload data from stream ' + id, pl);
            reject(new Error());
            return;
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
                    resolve(geos);
                    return;
                }
            }
        }
    });
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
        req.oauth = true;
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