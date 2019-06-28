'use strict';

const Log = require('../utils/logger');
const TAG = 'strava';
const mongoose = require('mongoose');
const strava = require('strava-v3');
const request = require('request-promise');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const Settings = mongoose.model('Settings');
const ImportExport = require('./importexport');
const geolib = require('geolib');

const getUploadStatus = async function (req, res) {
    let user = await User.load(req.user._id);
    const token = user.authToken;
    let uploadId = req.activityId;

    let requestString = 'https://www.strava.com/api/v3/uploads/' + uploadId + '?access_token=' + token;

    await request(requestString)
        .then((data) => {
            data = JSON.parse(data);
            if (data.error) {
                console.log(data);
                if (data.error.includes('duplicate')) {
                    Log.debug(TAG, 'Activity upload is a duplicate');
                    let split = data.error.split(' ');
                    let dupId = split[split.length - 1];
                    let dupType = split[split.length - 2] === 'activity';

                    console.log(dupId);
                    console.log(split[split.length - 2]);
                    console.log(dupType);

                    return res.json({
                        status: data.error,
                        activityId: dupId,
                        isActivity: dupType,
                    });
                }
                return res.status(400).json({
                    flash: {
                        type: 'error',
                        text: 'This route could not be uploaded'
                    }
                });
            }
            if (data.status === 'Your activity is ready.') {
                Log.debug(TAG, 'Activity upload is ready', data);
                return res.json({
                    status: data.status,
                    isActivity: true,
                    activityId: data.activity_id,
                });
            } else {
                Log.debug(TAG, 'Activity upload is pending', data);
                setTimeout(() => {
                    getUploadStatus(req, res);
                }, 2000);
            }
        });
};

exports.uploadActivity = async function (req, res) {
    let user = await User.load(req.user._id);
    const token = user.authToken;
    const routeId = req.query.id;

    const headers = {
        'User-Agent': 'Super Agent/0.0.1',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Bearer ' + token,
    };

    const options = {
        url: 'https://www.strava.com/api/v3/uploads?access_token=' + token,
        method: 'POST',
        headers: headers,
        formData: {
            activity_type: 'ride',
            file: 'gpx/routes/generated/route_' + routeId + '.gpx',
            name: '[ExploX] Please delete this activity',
            description: 'This activity has been created automatically by explox, please delete it.',
            private: 1,
            data_type: 'gpx',
            external_id: 'id',
            id: routeId,
            access_token: token
        },
    };

    strava.uploads.post(options.formData, async function (err, payload) {
        if (err) {
            Log.error(TAG, 'Error while uploading activity', err);
            res.status(400).json({
                flash: {
                    type: 'error',
                    text: 'This route could not be uploaded'
                }
            });
        } else {
            Log.debug(TAG, 'Activity successfully uploaded');
            setTimeout(() => {
                req.activityId = payload.id;
                getUploadStatus(req, res);
            }, 2000);
        }
    });
};

exports.getLimits = async function () {
    let setting = await Settings.loadValue('api');
    let apiLimits = {'shortTermUsage': 0, 'shortTermLimit': 2700, 'longTermUsage': 0, 'longTermLimit': 135000};
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

exports.queryLimits = async function (req, res) {
    const options = {
        bounds: '',
        activity_type: 'cycling',
        min_cat: 0,
        max_cat: 0,
    };
    await this.segmentsExplorer('b835d0c6c520f39d22eeb8d60dc65ecb17559542', options);

    if (res) {
        res.json({});
    }
};


/**
 * Query all relevant user data
 */

exports.updateUser = async function (req, res) {
    Log.debug(TAG, 'Update User');
    const id = req.profile._id;
    const max = req.max;
    return new Promise(async function (resolve) {
        let user = await User.load(id);

        // check if limits still okay
        let error = false;
        if (user) {
            let activities = [];
            const token = user.authToken;
            const id = user.stravaId;
            try {
                await exports.getAthlete(user, token);
                await exports.getStats(user, token);
                activities = await exports.getActivities(id, token, max, user);
                await exports.getRoutes(id, token, max, user);
            } catch (e) {
                Log.error(TAG, 'User could not be fully synchronized');
                error = true;
            }

            user.lastUpdated = Date.now();
            await user.save();

            // find activities that have been created by ExploX:
            let generatedActivities = [];
            activities.forEach((activity) => {
                if (activity.name.includes('[ExploX]')) {
                    generatedActivities.push(activity);
                }
            });

            if (res) {
                if (!error) {
                    res.json({
                        flash: {
                            text: 'Your profile, routes and activities have been syncronized',
                            type: 'success'
                        },
                        generatedActivities: generatedActivities,
                    });
                }
                else {
                    res.status(400).json({
                        error: 'User could not be fully synchronized',
                        flash: {
                            text: 'There was a problem. Please try again in one minute.',
                            type: 'error'
                        }
                    });
                }
            }
        }
        resolve(user);
    });
};

/**
 * Get the users profile data, updates db.user in case something has changes (e.g. e-mail address)
 */
exports.getAthlete = function (user, token) {
    const id = user.stravaId;
    return new Promise(function (resolve, reject) {
        strava.athletes.get({id: id, access_token: token}, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while retrieving user data', err);
                reject(new Error(err));
                return;
            }
            user.strava = payload;
            await user.save();
            resolve(payload);
        });
    });
};

/**
 * Get the users strava statistics, updates the db.user with the new stats
 */
exports.getStats = function (user, token) {
    const id = user.stravaId;
    return new Promise(function (resolve, reject) {
        strava.athletes.stats({
            id: id,
            access_token: token,
            page: 1,
            per_page: 100
        }, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while getting user statistics', err);
                reject(new Error(err));
                return;
            }
            user.stravaStats = payload;
            await user.save();
            resolve(payload);
        });
    });
};

/**
 * Retrieves all routes created by the given user id, retrieves detailed route information, retrieves the route stream.
 * Updates db.user to include all routes, updates db.geo to include the coordinates of all routes, updates db.route to hold all route and references to db.geo
 */
exports.getRoutes = function (id, token, max, user) {
    return new Promise(async function (resolve, reject) {
        let routes = user.routes.length;
        const perPage = Math.min(max * 10, 200);
        let n = 1 + Math.floor(routes / perPage);

        let f = async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, 'Error while retrieving user routes', err);
                reject(new Error(err));
                return;
            }
            if (payload) {
                if (!max) {
                    max = 200;
                }
                let done = 0;
                let allFound = false;
                if (payload.length < max) {
                    max = payload.length;
                }
                if (payload.length < perPage) {
                    allFound = true;
                }

                /* this will iterate through all routes and take at most max which are not yet in the database.
                * Maybe multiple synchronizations are necessary but eventually all routes will be in the database
                * and we will not kill the API*/
                let user = await User.load_options({criteria: {stravaId: id}});

                Log.debug(TAG, 'Found ' + max + ' new routes');
                for (let i = 0; i < payload.length; ++i) {
                    if (done >= max) {
                        break;
                    }
                    if (payload[i].type !== 1) {
                        // only rides
                        continue;
                    }
                    if (payload[i].sub_type !== 1) {
                        // only road cycling
                        continue;
                    }
                    const route = await Route.load_options({criteria: {stravaId: payload[i].id}});
                    if (route) {
                        Log.debug(TAG, 'Route ' + payload[i].id + ' already exist.');
                        route.user = user;

                        let found = false;
                        for (let j = 0; j < user.routes.length; j++) {
                            if (user.routes[j].id === route.id) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            await route.save();
                            route.user.routes.push(route);
                            await route.user.save();
                        }
                    } else {
                        await getRoute(payload[i].id, token, id).catch();
                    }
                    done++;

                }

                ++n;
                if (!allFound && n < 6) {
                    await strava.athlete.listRoutes({
                        id: id,
                        access_token: token,
                        page: n,
                        per_page: perPage
                    }, f);
                } else {
                    resolve(payload);
                }
            }
        };

        await strava.athlete.listRoutes({
            id: id,
            access_token: token,
            page: n,
            per_page: perPage
        }, f);
    });
};

/**
 * Get all activities for the given user
 */
exports.getActivities = function (id, token, max, user) {
    // query a list of all activities of this user
    return new Promise(async function (resolve, reject) {
        let acts = user.activities.length;
        const perPage = Math.min(max * 10, 200);
        let n = 1 + Math.floor(acts / perPage);

        let f = async function (err, payload, limits) {
            updateLimits(limits);
            if (err || (payload && payload.errors)) {
                Log.error(TAG, 'Error while retrieving activities', err);
                reject(new Error(err));
                return;
            }
            if (payload) {
                let done = 0;
                if (!max) {
                    max = 200;
                }
                let allFound = false;
                if (payload.length < max) {
                    max = payload.length;
                }
                if (payload.length < perPage) {
                    allFound = true;
                }

                /* This will iterate through all activities and take at most max which are not yet in the database.
                * Maybe multiple synchronizations are necessary but eventually all activities will be in the database
                * and we will not kill the API */
                Log.debug(TAG, 'Found ' + max + ' new activities');
                let user = await User.load_options({criteria: {stravaId: id}});

                for (let i = 0; i < payload.length; ++i) {
                    if (done >= max) {
                        break;
                    }

                    if (payload[i].type !== 'Ride') {
                        Log.debug(TAG, 'Wrong type ' + payload[i].type + ' for activity ' + payload[i].name,);
                        continue;
                    }

                    const activity = await Activity.load_options({criteria: {activityId: payload[i].id}});
                    if (activity) {
                        Log.debug(TAG, 'Activity ' + payload[i].id + ' already exist.');
                        activity.user = user;
                        let found = false;
                        for (let i = 0; i < user.activities.length; i++) {
                            if (user.activities[i].id === activity.id) {
                                found = true;
                                break;
                            }
                        }

                        if (!found) {
                            await activity.save();
                            activity.user.activities.push(activity);
                            await activity.user.save();
                        }
                    } else {
                        if (payload[i].name.includes('[ExploX]')) {
                            Log.error(TAG, 'Found a created Activity!');
                        } else {
                            await getActivity(payload[i].id, token, id).catch((err) => {
                            });
                        }
                    }
                    done++;
                }
                ++n;
                if (!allFound && n < 6) {
                    await strava.athlete.listActivities({
                        id: id,
                        access_token: token,
                        page: n,
                        per_page: perPage
                    }, f);
                } else {
                    resolve(payload);
                }
            }
        };

        await strava.athlete.listActivities({
            id: id,
            access_token: token,
            page: n,
            per_page: perPage
        }, f);
    });
};

exports.segmentsExplorer = function (token, options) {
    if (!options) {
        options = {
            bounds: '49.25, 7.04, 49.60, 7.1',
            activity_type: 'riding',
            min_cat: 0,
            max_cat: 100,
        };
    }

    return new Promise(function (resolve) {
        try {
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
                        Log.debug(TAG, 'Found ' + payload.segments.length + ' new segments');

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
                resolve(payload);
            });
        } catch (e) {
            Log.debug(TAG, 'An error occurred in segment explorer', e);
        }
    });
};

const getSegment = async function (id, token, segment, next) {
    Log.debug(TAG, 'Creating new segment with id ' + id);

    return new Promise(function (resolve, reject) {
        strava.segments.get({id: id, access_token: token}, async function (err, payload, limits) {
            if (err) {
                Log.error(TAG, 'Error trying to get segment details', err);
                reject(new Error(err));
                return;
            }
            updateLimits(limits);

            if (payload.activity_type !== 'Ride') {
                Log.debug(TAG, 'Wrong activity type');
                reject('Wrong activity type for segment');
            }
            // Log.debug(TAG, 'Correct activity type');


            let tags = '';
            let title = payload.name;
            if (!title || title.replace(/\s/g, '') === '') {
                title = 'Untitled Strava Segment';
            }
            let segment = new Route({
                stravaId: payload.id,
                title: title,
                body: payload.description || 'A Strava segment',
                location: '',
                user: null,
                comments: [],
                tags: tags,
                geo: [],
                distance: payload.distance,
                isRoute: false,
                strava: payload,
            });

            await segment.save();

            await getSegmentStream(id, token, segment, async function (err, geos) {
                if (err || (geos && geos.length === 0)) {
                    Log.debug(TAG, 'Error retrieveing segment stream ', err);
                    await segment.remove();
                    resolve(payload);
                    return;
                }

                const dist = geolib.getDistance({
                    latitude: 49.377236, longitude: 7.019996
                }, {
                    latitude: geos[0].location.coordinates[1], longitude: geos[0].location.coordinates[0]
                });

                if (dist > 150000) {
                    Log.debug(TAG, 'Segment ' + id + ' is too far away');
                    await segment.remove();
                    resolve(payload);
                    return;
                }

                Log.debug(TAG, geos.length + ' geos extracted for segment ' + id);

                segment.geo = geos;
                await segment.save();

                ImportExport.exportRoute({
                    routeData: segment,
                    query: {},
                });

                if (next) {
                    next(null, segment);
                }
                resolve(payload);
            });
        });
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

            // Get the segments that are part of this activity
            payload.segment_efforts.forEach(async (effort) => {
                const seg = effort.segment;
                const segment = await Route.load_options({
                    criteria: {
                        isRoute: false,
                        stravaId: seg.id
                    }
                });
                if (!segment) {
                    await getSegment(seg.id, token, seg);
                }
            });


            let user = await User.load_options({criteria: {stravaId: userID}});
            if (user) {

                Log.debug(TAG, 'Creating new activity with id ' + id);

                let activity = new Activity({
                    activityId: id,         // the activity id from Strava
                    geo: [],                // array of database geo references, to be filled
                    user: user,             // user who owns this activity
                    title: payload.name,    // title corresponding to the name in strava
                    distance: payload.distance,     // distance in meters
                    strava: payload,
                });

                await activity.save();

                // Query the gps points of this activity
                await getActivityStream(id, token, activity, async function (err, geos) {
                    if (err || geos === undefined) {
                        Log.error(TAG, 'Error retrieving activity stream', err);
                        activity.remove();
                        resolve(payload);
                        return;
                    }

                    const dist = geolib.getDistance({
                        latitude: 49.377236, longitude: 7.019996
                    }, {
                        latitude: geos[0].location.coordinates[1], longitude: geos[0].location.coordinates[0]
                    });

                    if (dist > 150000) {
                        Log.debug(TAG, 'Activity ' + id + ' is too far away');
                        await activity.remove();
                        resolve(payload);
                        return;
                    }

                    Log.log(TAG, geos.length + ' geos extracted for activity ' + id);

                    // Add all the geos to the activity and save it
                    activity.geo = activity.geo.concat(geos);
                    await activity.save();

                    // Link activity to user
                    user.activities = user.activities.concat([activity]);
                    await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));
                    ImportExport.exportRoute({
                        routeData: activity,
                        query: {},
                    });

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
                Log.debug(TAG, 'Creating new route with id ' + id);
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
                let title = payload.name;
                if (!title || title.replace(/\s/g, '') === '') {
                    title = 'Untitled Strava Route';
                }
                let route = new Route({
                    stravaId: id,
                    title: title,
                    body: payload.description || 'A Strava route created by ' + user.username,
                    location: '',
                    user: user,         // keep the creator
                    comments: [],
                    tags: tags,
                    geo: [],
                    distance: payload.distance,
                    strava: payload,
                });
                await route.save();


                await getRouteStream(id, token, route, async function (err, geos) {
                    if (err || (geos && geos.length === 0)) {
                        Log.error(TAG, 'Error getting a route stream', err);
                        await route.remove();
                        resolve(payload);
                        return;
                    }

                    const dist = geolib.getDistance({
                        latitude: 49.377236, longitude: 7.019996
                    }, {
                        latitude: geos[0].location.coordinates[1], longitude: geos[0].location.coordinates[0]
                    });

                    if (dist > 150000) {
                        Log.debug(TAG, 'Route ' + id + ' is too far away');
                        await route.remove();
                        resolve(payload);
                        return;
                    }

                    Log.log(TAG, geos.length + ' geos extracted for route ' + id);

                    route.geo = geos;
                    await route.save();

                    // Link activity to user
                    user.routes = user.routes.concat([route]);
                    await user.save().catch((err) => Log.error(TAG, 'Error while saving', err));

                    // Get the segments that are part of this route
                    payload.segments.forEach((seg) => {
                        const segment = Route.load_options({
                            criteria: {
                                isRoute: false,
                                stravaId: seg.id
                            }
                        });
                        if (!segment) {
                            getSegment(seg.id, token, seg);
                        }
                    });

                    ImportExport.exportRoute({
                        routeData: route,
                        query: {},
                    });

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
    try {
        strava.streams.route({id: id, types: '', access_token: token}, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, '', err);
                return;
            }
            let geos = await extractGeosFromPayload(id, {
                payload: payload,
                route: route
            }).catch((err) => next(err.message));
            if (geos !== null) {
                next(null, geos);
            }
        });
    } catch (e) {
        Log.debug(TAG, 'Error during route stream', e);
        next(e, []);
    }
};

const getActivityStream = async function (id, token, activity, next) {
    try {
        strava.streams.activity({
            id: id,
            types: ['latlng', 'altitude'],
            access_token: token
        }, async function (err, payload) {
            // updateLimits(limits);
            if (err) {
                Log.error(TAG, '', err);
            }
            let geos = await extractGeosFromPayload(id, {
                payload: payload,
                activity: activity
            }).catch((err) => next(err.message));
            if (geos !== null) {
                next(null, geos);
            }
        });
    } catch (e) {
        Log.debug(TAG, 'Error during activity stream');
        next(e, []);
    }
};


const getSegmentStream = function (id, token, segment, next) {
    try {
        strava.streams.segment({
            id: id,
            types: ['latlng', 'altitude'],
            access_token: token
        }, async function (err, payload, limits) {
            updateLimits(limits);
            if (err) {
                Log.error(TAG, '', err);
            }
            let geos = await extractGeosFromPayload(id, {
                payload: payload,
                route: segment
            }).catch((err) => next(err.message));
            if (geos !== null) {
                next(null, geos);
            }
        });
    } catch (e) {
        Log.debug(TAG, 'Error during segment stream', e);
        next(e, []);
    }
};

const extractGeosFromPayload = async function (id, payload) {
    return new Promise(async function (resolve, reject) {

        const pl = payload.payload;
        let data = {
            latlng: [],
            altitude: [],
        };
        if (!pl) {
            return;
        }

        for (let i = 0; i < pl.length; ++i) {
            if (pl[i].type === 'latlng') {
                data.latlng = pl[i].data;
            }
            if (pl[i].type === 'altitude') {
                data.altitude = pl[i].data;
            }
        }
        if (!data || data === undefined) {
            Log.error(TAG, 'Could not read payload data from stream ' + id, pl);
            reject(new Error());
            return;
        }

        let lat, lng;

        // Only store a certain number of waypoints for efficiency (routes, segmetns, and activities).
        let leave = 300; // sample waypoints to max 100
        if (data.latlng.length < leave) {
            leave = data.latlng.length;
        }
        const takeEvery = Math.ceil(data.latlng.length / leave);
        const remaining = Math.floor(data.latlng.length / takeEvery);

        let geos = [];
        let geosSaved = 0;

        for (let i = 0; i < data.latlng.length; ++i) {
            // always keep the first and last element. Only take some in between
            if (i === 0 || i % takeEvery === 0 || i === data.latlng.length - 1) {
                lat = data.latlng[i][0];
                lng = data.latlng[i][1];
                let geo = new Geo({
                    name: id,
                    location: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    altitude: data.altitude[i],
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
    const myJSONObject = {
        client_id: config.strava.clientID,
        client_secret: config.strava.clientSecret,
        code: req.query.code,
    };
    request({
        url: 'https://www.strava.com/oauth/token',
        method: 'POST',
        json: true,
        body: myJSONObject
    }, async function (error, response) {
        if (error) {
            Log.error('Error during OAuth', error);
            return;
        }
        req.oauth = true;
        next(null, response);
    }).catch((error) => {
        Log.error('Error during OAuth', error);
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
