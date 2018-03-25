'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');


/**
 * Generates a new route by doing the following calculations in sequence:
 *      1. Distance filter:
 *              Keep routes and segments that are shorter than the route distance.
 *      2. Radius filter:
 *              Keep routes and segments where each geo is within the radius of half the
 *              route distance around the starting point (i.e. it must not leave the radius).
 *      3. Lower Bound filer:
 *              Keep routes and segments where, when incorporating them into the route,
 *              the lower bound on the total distance would still be less than the route distance.
 *      4. Familiarity filter:
 *              Keep routes and segments where a certain percentage of it is at most a certain distance
 *              from the closest familiar point.
 * @param req
 * @param res
 */
exports.generate = function (req, res) {
    Log.log(TAG, 'Used parameters: ' + JSON.stringify(req.query));
    res.render('loading', {text: "Routen werden gesucht"});
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
                    // return whether there is no geo that is not in the radius
                    return !(route.geo.some(function (routeGeo) {

                        // return whether the element is not in the radius geos
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

                const filterRoutesDistanceLowerBound = function (next, next2) {
                    if (routes.length === 0) {
                        return next(next2);
                    }
                    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
                    routes.forEach(function (route, index, object) {
                        const startPoint = route.geo[0];
                        const endPoint = route.geo[route.geo.length - 1];

                        const options = {
                            criteria: {
                                _id: startPoint._id,
                            },
                            latitude: start.lat,
                            longitude: start.lng,
                            distance: radius,
                            select: { _id: 1, distance: 2 }
                        };
                        Geo.findDistance(options, function (err, distanceToStart) {
                            if (distanceToStart.length === 0) {
                                next(next2);
                            }
                            distanceToStart = distanceToStart[0].distance;
                            Log.debug(TAG, 'start point: ' + JSON.stringify(startPoint));
                            Log.debug(TAG, 'distance to start: ' + JSON.stringify(distanceToStart));

                            options.criteria._id = endPoint._id;
                            Geo.findDistance(options, function (err, distanceToEnd) {
                                if (distanceToEnd.length === 0) {
                                    return next(next2);
                                }
                                distanceToEnd = distanceToEnd[0].distance;
                                Log.debug(TAG, 'end point: ' + JSON.stringify(endPoint));
                                Log.debug(TAG, 'distance to end: ' + JSON.stringify(distanceToEnd));

                                // calculate lower bound on the total route distance when incorporating this route
                                const totalDistance = route.distance + distanceToStart + distanceToEnd;
                                Log.debug(TAG, 'distance total: ' + totalDistance);

                                if (totalDistance - distance * 0.1 > distance) {
                                    Log.debug(TAG, 'route with this route is too long: ' + totalDistance);
                                    object.splice(index, 1);
                                }
                                if (index === routes.length-1) {
                                    return next(next2);
                                }
                            });
                        });
                    });
                };

                const filterSegmentsDistanceLowerBound = function (next) {
                    if (segments.length === 0) {
                        return next();
                    }
                    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
                    segments.forEach(function (segment, index, object) {
                        const startPoint = segment.geo[0];
                        const endPoint = segment.geo[segment.geo.length - 1];

                        const options = {
                            criteria: {
                                _id: startPoint._id,
                            },
                            latitude: start.lat,
                            longitude: start.lng,
                            distance: radius,
                            select: { _id: 1, distance: 2 }
                        };
                        Geo.findDistance(options, function (err, distanceToStart) {
                            if (distanceToStart.length === 0) {
                                return next();
                            }
                            distanceToStart = distanceToStart[0].distance;
                            Log.debug(TAG, 'start point: ' + JSON.stringify(startPoint));
                            Log.debug(TAG, 'distance to start: ' + JSON.stringify(distanceToStart));

                            options.criteria._id = endPoint._id;
                            Geo.findDistance(options, function (err, distanceToEnd) {
                                if (distanceToEnd.length === 0) {
                                    return;
                                }
                                distanceToEnd = distanceToEnd[0].distance;
                                Log.debug(TAG, 'end point: ' + JSON.stringify(endPoint));
                                Log.debug(TAG, 'distance to end: ' + JSON.stringify(distanceToEnd));

                                // calculate lower bound on the total route distance when incorporating this route
                                const totalDistance = segment.distance + distanceToStart + distanceToEnd;
                                Log.debug(TAG, 'distance total: ' + totalDistance);

                                if (totalDistance - distance * 0.1 > distance) {
                                    Log.debug(TAG, 'route with this segment is too long: ' + totalDistance);
                                    object.splice(index, 1);
                                } else if (totalDistance + distance * 0.1 < distance) {
                                    Log.debug(TAG, 'route with this segment is too short: ' + totalDistance);
                                    object.splice(index, 1);
                                }

                                if (index === routes.length-1) {
                                    return next();
                                }
                            });
                        });
                    });
                };

                const done = function() {
                    Log.debug(TAG, routes.length + ' possible routes after lower bound filter: ', routes.map(r => r.title));
                    Log.debug(TAG, segments.length + ' possible segments after lower bound filter: ', segments.map(s => s.title));

                };

                filterRoutesDistanceLowerBound(filterSegmentsDistanceLowerBound, done);



                // TODO generate route using the waypoints of the remaining routes and regments starting with the longest

                // TODO combine segments and gereate routes that have multiple segments
            });




        });
    });
    //res.redirect("/");
};

