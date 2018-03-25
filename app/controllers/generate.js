'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');

exports.generate = function (req, res) {
    Log.log(TAG, 'Used parameters: ' + JSON.stringify(req.query));
    const sport = req.query.sport || 'cycling';
    const distance = req.query.distance * 1000 || '5000';
    const radius = distance / 2.0;
    const difficulty = req.query.difficulty || 'advanced';
    const start = {
        lat: req.query.lat,
        lng: req.query.lng
    };

    let criteria = {
        distance: { $lt: distance },
        isRoute: true
    };

    // get all routes that are shorther than the route should-distance
    Route.list({ criteria }, function (err, routes) {
        Log.debug(TAG, routes.length + ' possible routes after distance filter: ', routes.map(r => r.title));

        // get all segments that are shorter than the route should-distance
        criteria.isRoute = false;
        Route.list({ criteria }, function (err, segments) {
            Log.debug(TAG, segments.length + ' possible segments after distance filter: ', segments.map(s => s.title));

            // get all geos that are within the given radius of the start position
            Geo.findWithinRadius({
                latitude: start.lat,
                longitude: start.lng,
                distance: radius,
                select: { _id: 1, distance: 2, routes: 3 }
            }, function (err, radiusGeos) {
                radiusGeos = radiusGeos.filter(function (geo) {
                    return geo.routes.length > 0;
                });

                // filter such that only the routes that are completely within the radius remain
                routes = routes.filter(function (route) {
                    // if there is no geo that is not in the radius, return true
                    return !(route.geo.some(function (routeGeo) {

                        // if the element is not in the radius geos, then return true
                        return !(radiusGeos.some(function (radiusGeo) {

                            return (radiusGeo._id.toString().trim() === routeGeo._id.toString().trim());
                        }));
                    }));
                });
                Log.debug(TAG, routes.length + ' possible segments after radius filter: ', routes.map(s => s.title));


                // filter such that only the segments that are completely not outside remain
                segments = segments.filter(function (segment) {
                    // if there is no geo that is not in the radius, return true
                    return !(segment.geo.some(function (segmentGeo) {

                        // if the element is not in the radius geos, then return true
                        return !(radiusGeos.some(function (radiusGeo) {

                            return (radiusGeo._id.toString().trim() === segmentGeo._id.toString().trim());
                        }));
                    }));
                });
                // now our routes and segments arrays only contain routes where no geo is outside of the radius
                Log.debug(TAG, segments.length + ' possible segments after radius filter: ', segments.map(s => s.title));
            });


            // TODO filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance

            // TODO generate route using the waypoints of the remaining routes and regments starting with the longest

            // TODO combine segments and gereate routes that have multiple segments

        });
    });
    res.redirect("/");
};