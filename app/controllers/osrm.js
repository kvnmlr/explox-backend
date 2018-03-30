'use strict';

const mongoose = require('mongoose');
const request = require('request');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Geo = mongoose.model('Geo');
const Settings = mongoose.model('Settings');

const Log = require('../utils/logger');

const TAG = 'osrm';

const protocol = "http";
const domain = "router.project-osrm.org";
const version = "v1";
const maxAllowedWaypoints = 250;


exports.findRoute = function (options, cb) {
    let waypoints = options.locations;
    const numLocations = waypoints.length;
    Log.debug(TAG, "num before " + waypoints.length);
    let keepEvery = numLocations / maxAllowedWaypoints;
    if (keepEvery > 1) {
        // we have to many waypoints, downsample to something smaller
        keepEvery = keepEvery.ceil();
        const waypointsTemp = waypoints;
        waypoints = [];
        let counter = 0;
        Log.debug(TAG, "here1 " + waypoints.length);

        waypointsTemp.forEach(function(wp) {
            if (counter % keepEvery === 0) {
                waypoints.push(wp);
            }
            ++counter;
        });
    }
    Log.debug(TAG, "num after " + waypoints.length);

    let coordinates = toOsrmFormat(waypoints);

    const service = "route";
    const profile = "bike";
    const query = "overview=false&steps=true";

    let requestString = protocol + "://" + domain + "/" + service + "/" + version + "/" + profile +"/";
    requestString += coordinates;
    requestString += "?" + query;

    Log.debug(TAG, "request: " + requestString);


    request(requestString, function (error, response, body) {
        try {
            let bodyString = JSON.stringify(body).replace(/\\/g, "");
            bodyString = bodyString.substring(1, bodyString.length-1);
            body = JSON.parse(bodyString);
        } catch (e) {
            Log.error(TAG, "OSRM request could not be satisfied", body);
            return false;
        }

        if (!resultOk(body)) {
            //return cb();
        }

        const route = body.routes[0];
        const legs = route.legs;

        let result = {
            distance: route.distance,
            waypoints: []
        };

        legs.forEach(function(leg) {
            const steps = leg.steps;
            steps.forEach(function (step) {
                if (step.maneuver) {
                    const location = step.maneuver.location;
                    result.waypoints.push(location);
                }
            });
        });

        Log.debug(TAG, "Result: ", result);
    });
};

const toOsrmFormat = function(locations) {
    let coords = '';
    locations.forEach(function(location) {
        coords += location.coordinates[0];
        coords += ",";
        coords += location.coordinates[1];
        coords += ";";
    });
    if (coords.length > 0) {
        coords = coords.substring(0, coords.length-1);
    }
    return coords;
};

const resultOk = function(body) {
    if (!body) {
        Log.error(TAG, "OSRM request did not return a body object");
        return false;
    }
    if (body.code !== "Ok") {
        Log.error(TAG, "OSRM response code was not Ok: " + body.code);
        return false;
    }
    if (!body.routes) {
        Log.error(TAG, "OSRM request did not return any routes");
        return false;
    }
    if (body.routes.length === 0) {
        Log.error(TAG, "OSRM request did not return any routes");
        return false;
    }
    if (!body.routes[0].legs) {
        Log.error(TAG, "OSRM request did not return any route legs");
        return false;
    }
    if (body.routes[0].legs.length === 0) {
        Log.error(TAG, "OSRM request did not return any route legs");
        return false;
    }
};