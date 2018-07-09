'use strict';

const mongoose = require('mongoose');
const gpxParse = require('gpx-parse');
const fs = require('fs');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const User = mongoose.model('User');
const Log = require('../utils/logger');
const TAG = 'controllers/importexport';

exports.exportGPX = async function (req, res) {
    Log.debug(TAG, 'Export GPX for route ' + req.article.title);
    const id = req.article._id;

    let file = './gpx/test.gpx';
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=' + file,
    });

    res.end();
};

exports.importGPX = async function (req, res) {
    Log.debug(TAG, 'Import GPX for route');

    if (req.files.length === 0) {
        Log.error(TAG, 'Import form was submitted without files');
        return;
    }

    let headersSent = false;
    let routes = [];
    let activities = [];
    for (let file of req.files) {
        if (file.fieldname === 'route') {
            routes.push(fs.readFileSync(file.path, 'utf8'));
        }
        if (file.fieldname === 'activity') {
            activities.push(fs.readFileSync(file.path, 'utf8'));
        }
    }
    for (let routeData of routes) {
        gpxParse.parseGpx(routeData, async function (error, data) {
            let routeGPX = data.tracks[0];
            if (routeGPX) {
                let route = await Route.load_options({criteria: {title: routeGPX.name}});
                // If this segment does not exist, create a new one
                if (!route) {
                    Log.log(TAG, 'Creating new Route');

                    let tags = '';
                    route = new Route({
                        stravaId: routeGPX.name.length,
                        title: routeGPX.name,
                        body: data.metadata.description || 'Imported Route',
                        location: '',
                        user: req.user ? req.user : null,
                        comments: [],
                        tags: tags,
                        geo: [],
                        distance: 0,
                        isRoute: true
                    });

                    await route.save();
                    route.geo = await extractGeosFromGPX(data, route, null);
                    await route.save();
                    Log.log(TAG, 'New Route with ' + route.geo.length + ' geos successfully imported');
                    if (!headersSent) {
                        res.writeHead(302, {
                            'Location': 'http://localhost:3000/routes/' + route._id
                        });
                        res.end();
                        headersSent = true;
                    }
                }
            }
        });
    }


    for (let activityData of activities) {
        if (!req.user) {
            Log.error(TAG, 'No user logged in, cannot save activity');
            return;
        }
        gpxParse.parseGpx(activityData, async function (error, data) {
            let activityGPX = data.tracks[0];
            if (activityGPX) {
                let activity = await Activity.load_options({criteria: {title: activityGPX.name}});
                // If this segment does not exist, create a new one
                if (!activity) {
                    Log.log(TAG, 'Creating new Activity');

                    activity = new Activity({
                        activityId: 0,      // the activity id from Strava
                        geo: []             // array of database geo references, to be filled
                    });

                    await activity.save();
                    activity.geo = await extractGeosFromGPX(data, null, activity);
                    await activity.save();

                    let user = await User.load(req.user._id);
                    if (user) {
                        user.activities = user.activities.concat([activity]);
                        await user.save();
                        Log.log(TAG, 'New Activity with ' + activity.geo.length + ' geos successfully imported');
                        if (!headersSent) {
                            res.writeHead(302, {
                                'Location': 'http://localhost:3000/users/' + req.user._id
                            });
                            res.end();
                            headersSent = true;
                        }
                    }
                }
            }
        });
    }
};

exports.import = async function (req, res) {
    res.render('import', {
        title: 'Import'
    });
};

const extractGeosFromGPX = async function (gpx, route, activity) {
    return new Promise(async function (resolve) {

        const pl = gpx.tracks[0].segments[0];

        let data = [];
        for (let i = 0; i < pl.length; ++i) {
            data.push([pl[i].lat, pl[i].lon]);
        }
        if (data.length === 0) {
            Log.error(TAG, 'Could not read waypoints from GPX');
            resolve([]);
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
                    name: '',
                    location: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                });

                // let the geo know that it belongs to this activity
                if (activity != null) {
                    if (activity._id != null) {
                        geo.activities = geo.activities.concat([activity]);
                    } else {
                        Log.error(TAG, 'Activity of the stream was not null but had no _id');
                        resolve([]);
                    }
                }

                // let the geo know that it belongs to this route
                else if (route != null) {
                    if (route._id != null) {
                        geo.routes = geo.routes.concat([route]);
                    } else {
                        Log.error(TAG, 'Route of the stream was not null but had no _id');
                        resolve([]);
                    }
                }

                // if for some reason something went wrong and we did have
                // neither an activity nor a route, cancel and don't save the geo
                else {
                    Log.error(TAG, 'Stream had neither activity nor route fields');
                    resolve([]);
                }

                geos = geos.concat([geo]);

                // save the new geo
                await geo.save();
                geosSaved++;

                // if this was the last one, call the callback
                if (geosSaved === remaining) {
                    resolve(geos);
                }
            }
        }
        resolve([]);
    });
};