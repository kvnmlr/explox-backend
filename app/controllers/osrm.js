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

const protocol = "https";
const domain = "api.mapbox.com";
const version = "v5/mapbox";
const maxAllowedWaypoints = 25;


exports.findRoute = function (options, cb) {
    let waypoints = options.waypoints;


    let coordinates = toOsrmFormat(waypoints);

    const service = "directions";
    const profile = "cycling";
    const query = "overview=false&steps=true&geometries=geojson&access_token=pk.eyJ1Ijoia3ZubWxyIiwiYSI6ImNqZmlobmwzcjAwazMycnJ6ejNoNmpmMDMifQ.5MzS02vStOXn_KoMOZ-wMw";

    let requestString = protocol + "://" + domain + "/" + service + "/" + version + "/" + profile +"/";
    requestString += coordinates;
    requestString += "?" + query;

    Log.debug(TAG, "request: " + requestString);

    request(requestString, function (error, response, body) {
        if (error) {
            Log.error(TAG, "OSRM request could not be satisfied", error);
            return;
        }
        try {
            let bodyString = JSON.stringify(body).replace(/\\/g, "");
            bodyString = bodyString.substring(1, bodyString.length-1);
            body = JSON.parse(bodyString);
        } catch (e) {
            Log.error(TAG, "OSRM request could not be satisfied", response);
            return false;
        }

        let result = {
            distance: 0,
            waypoints: []
        };

        if (!resultOk(body)) {
            return cb(result);
        }

        const route = body.routes[0];
        const legs = route.legs;
        result.distance = route.distance;

        legs.forEach(function(leg) {
            const steps = leg.steps;
            steps.forEach(function (step) {
                if (step.maneuver) {
                    const location = step.maneuver.location;
                    result.waypoints.push(location);
                }
            });
        });
        return cb(result);
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
    return true;
};