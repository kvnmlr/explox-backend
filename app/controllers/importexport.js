'use strict';

const mongoose = require('mongoose');
const gpxParse = require('gpx-parse');
const archiver = require('archiver');
const gpxWrite = require('gps-to-gpx').default;
const fs = require('fs');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const User = mongoose.model('User');
const Log = require('../utils/logger');
const TAG = 'controllers/importexport';

exports.exportUser = async function (req, res) {
    Log.debug(TAG, 'Export GPX for user ' + req.profile.name);
    const all = req.query.all || false;
    if (all) {
        await exportUserAll(req, res);
    } else {
        await exportUserSingle(req, res);
    }
};

exports.exportRoute = async function (req, res) {
    Log.debug(TAG, 'Export GPX for route ' + req.routeData.title);
    const route = req.routeData;
    const format = req.query.format || 'gpx';

    if (format !== 'gpx') {
        return res.status(400).json({
            error: 'Only can only export routes as GPX',
            flash: {
                type: 'error',
                text: 'Only GPX export available'
            }
        });
    }

    let data = {
        activityType: route.title,
        waypoints: []
    };

    for (let geo of route.geo) {
        let geoObject = {
            'latitude': geo.location.coordinates[1],
            'longitude': geo.location.coordinates[0],
            'elevation': 0,
        };
        data.waypoints.push(geoObject);
    }

    if (data.waypoints.length === 0) {
        return res.status(401).json({
            error: "Route doesn't have waypoints"
        });
    }
    const gpx = gpxWrite(data.waypoints, {
        activityName: data.activityType,
    });

    let dir = __dirname + '../../../gpx/';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    let file;
    if (route.isRoute) {
        let dir = __dirname + '../../../gpx/routes/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        if (route.isGenerated) {
            let dir = __dirname + '../../../gpx/routes/generated/';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            file = dir + 'route_' + route._id + '.gpx';
        } else {
            let dir = __dirname + '../../../gpx/routes/strava/';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            file = dir + 'route_' + route._id + '.gpx';
        }
    } else {
        if (route.activityId) {
            let dir = __dirname + '../../../gpx/activities/';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            file = dir + 'activity_' + route._id + '.gpx';
        }
         else {

            let dir = __dirname + '../../../gpx/segments/';
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            file = dir + 'segment_' + route._id + '.gpx';
        }
    }

    await fs.writeFile(file, gpx, function (err) {
        if (err) {
            return console.log(err);
        }

        Log.debug(TAG, 'File written');

        if (res) {
            res.download(file);
        }
    });
};

exports.import = async function (req, res) {
    Log.debug(TAG, 'Import GPX for route');
    const format = req.body.format | 'gpx';
    const type = req.body.type | 'route';

    if (format !== 'gpx') {
        res.status(401).json({
            flash: 'Only GPX file format supported',
            error: 'Unsupported file format: ' + format,
        });
    }

    if (req.files.length === 0) {
        Log.error(TAG, 'Import form was submitted without files');
        res.status(400).json({
            flash: 'No files have been selected for upload',
            error: 'No files in request body'
        });
        return;
    }

    let headersSent = false;
    let routes = [];
    let activities = [];
    for (let file of req.files) {
        if (type === 'route') {
            routes.push(fs.readFileSync(file.path, 'utf8'));
        }
        if (type === 'activity') {
            activities.push(fs.readFileSync(file.path, 'utf8'));
        }
    }

    let routesSaved = 0;
    for (let routeData of routes) {
        try {
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
                            user: req.profile ? req.profile : null,
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
                        routesSaved++;
                        if (!headersSent) {
                            if (routesSaved === routes.length) {
                                res.json({
                                    type: 'route',
                                    ids: [123, 456]
                                });
                                headersSent = true;
                            }
                        }
                    }
                }
            });
        } catch (e) {
            Log.error(TAG, 'Error while parsing imported route file', e);
            res.status(402).json({
                error: 'Error while parsing data file',
            });
        }
    }

    let activitiesSaved;
    for (let activityData of activities) {
        if (!req.profile) {
            Log.error(TAG, 'No user logged in, cannot save activity');
            return;
        }
        try {
            gpxParse.parseGpx(activityData, async function (error, data) {
                Log.debug(TAG, 'Here');
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

                        let user = await User.load(req.profile._id);
                        if (user) {
                            user.activities = user.activities.concat([activity]);
                            await user.save().catch((e) => Log.error(TAG, 'Error while saving user', e));
                            Log.log(TAG, 'New Activity with ' + activity.geo.length + ' geos successfully imported');
                            activitiesSaved++;
                            if (!headersSent && activitiesSaved === activities.length) {
                                res.json({
                                    type: 'activity',
                                    ids: [123, 456]
                                });
                                headersSent = true;
                            }
                        }
                    }
                }
            });
        } catch (e) {
            Log.error(TAG, 'Error while parsing imported activity file', e);
            res.status(402).json({
                error: 'Error while parsing data file',
            });
        }
    }
};

async function extractGeosFromGPX (gpx, route, activity) {
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
}

async function exportUserSingle (req, res) {
    const user = req.profile;
    const format = req.query.format || 'gpx';
    const id = req.query.activityId || '0';

    if (format !== 'gpx') {
        return res.status(400).json({
            error: 'Only can only export users as GPX',
            flash: {
                type: 'error',
                text: 'Only GPX export available'
            }
        });
    }

    res.json({
        ok: 'Not implemented'
    });
}

async function exportUserAll (req, res) {
    const user = req.profile;
    const format = req.query.format || 'gpx';
    const id = req.query.activityId || '0';

    if (format !== 'gpx') {
        return res.status(400).json({
            error: 'Only can only export users as GPX',
            flash: {
                type: 'error',
                text: 'Only GPX export available'
            }
        });
    }

    // create a file to stream archive data to.
    const zipFile = __dirname + '../../../gpx/activity_export_' + (user.username).toLowerCase() + '.zip';
    let output = fs.createWriteStream(zipFile);
    let archive = archiver('zip', {
        zlib: {level: 9} // Sets the compression level.
    });
    archive.pipe(output);

    archive.on('error', function (err) {
        Log.error(TAG, 'Error while zipping gpx activities', err);
        res.status(500).json({
            error: 'Error while zipping files'
        });
    });

    // the zip file was written, respond it to the user
    output.on('close', function () {
        res.download(zipFile);
    });

    let activities;
    activities = user.activities;
    for (let i = 0; i < activities.length; ++i) {
        let activity = activities[i];
        let queriedActivity = await Activity.load(activity._id);

        let data = {
            activityType: activity._id,
            waypoints: []
        };

        for (let geo of queriedActivity.geo) {
            let geoObject = {
                'latitude': geo.location.coordinates[1],
                'longitude': geo.location.coordinates[0],
                'elevation': 0,
            };
            data.waypoints.push(geoObject);
        }

        const gpx = gpxWrite(data.waypoints, {
            activityName: data.activityType,
        });

        // append the current activity gpx to the archive
        const file = 'activities/activity_' + activity._id + '.gpx';
        archive.append(gpx, {name: file});
        Log.debug(TAG, 'Appended activity ' + activity._id + ' to archiever');

        // if this was the last activity, finalize the archiver (i.e. write the zip file)
        if (i === activities.length - 1) {
            archive.finalize();
            Log.debug(TAG, 'Archiver finalized');
        }
    }
}