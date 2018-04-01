'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');
const users = require('./users');
const routes = require('./routes');
const osrm = require('./osrm');

let sport, distance, radius, difficulty, start;
let goodRoutes = [], goodSegments = [], combos = [], finalRoutes = [], candidates = [], resultRoutes = [];
let request, response;

/**
 * Generates a new route by doing the following calculations in sequence:
 *      1. Distance filter:
 *      2. Lower Bound filer:
 *      3. Radius filter:
 */
exports.generate = function (req, res) {
    Log.log(TAG, 'Used parameters: ' + JSON.stringify(req.query));
    sport = req.query.sport || 'cycling';
    distance = req.query.distance * 1000 || '5000';
    radius = distance / 2.0;
    difficulty = req.query.difficulty || 'advanced';
    start = {
        lat: req.query.lat,
        lng: req.query.lng
    };
    request = req;
    response = res;

    apply([initSearch, distanceFilter, radiusFilter, lowerBoundsFilter, find]);
};

/**
 * Generates routes based on the existing and suitable routes and segments
 */
const find = function () {
    Log.log(TAG, goodRoutes.length + ' possible routes after all filters: ', goodRoutes.map(r => r.title));
    Log.log(TAG, goodSegments.length + ' possible segments after all filters: ', goodSegments.map(s => s.title));

    apply([combine, sort, generateCandidates, createRoutes, respond]);

    //res.redirect("/");
};

const initSearch = function (callbacks) {
    Log.debug(TAG, 'Init search');
    goodRoutes = [];
    goodSegments = [];
    combos = [];
    finalRoutes = [];
    candidates = [];
    resultRoutes = [];

    checkAndCallback(callbacks);
};

// Utility functions
const apply = function (callbacks) {
    checkAndCallback(callbacks);
};
const checkAndCallback = function (callbacks) {
    Log.debug(TAG, 'Check and Callback ');
    if (callbacks) {
        if (callbacks.length > 0) {
            const cb = callbacks[0];
            callbacks.shift();
            return cb(callbacks);
        }
    }
};
const logAll = function (callbacks) {
    if (resultRoutes.length > 0) {
        Log.debug(TAG, 'Created these routes: ', resultRoutes);
    }
    else if (candidates.length > 0) {
        Log.debug(TAG, 'Found these candidate routes: ', candidates.map(r => r.distance));
    }
    else if (combos.length === 0) {
        let tempRoutes = goodRoutes;
        let tempSegments = goodSegments;

        tempRoutes.forEach(function (route) {
            route.geo = [];
        });
        tempSegments.forEach(function (segment) {
            segment.geo = [];
        });

        Log.log(TAG, goodRoutes.length + ' routes: ', tempRoutes);
        Log.log(TAG, goodSegments.length + ' segments: ', tempSegments);
    } else {
        let tempCombos = combos;
        tempCombos.forEach(function (combo) {
            combo.parts.forEach(function (part) {
                part.geo = [];
            });
        });
        Log.log(TAG, tempCombos.length + ' combos: ', tempCombos);

        if (finalRoutes.length > 0) {
            let tempRoutes = finalRoutes;

            tempRoutes.forEach(function (route) {
                route.geo = [];
            });

            Log.log(TAG, tempRoutes.length + ' final routes: ', tempRoutes);
        }
    }
    checkAndCallback(callbacks);
};
const respond = function (callbacks) {
    Log.debug(TAG, 'Respond ', resultRoutes);

    request.generatedRoutes = resultRoutes;//.map(r => {return {title: r.title, distance: r.distance, _id: r._id.toString()}});
    request.hasGeneratedRoutes = true;
    users.show(request, response);
    checkAndCallback(callbacks);
};

/**
 * Keep routes and segments that are shorter than the route distance.
 * @param callbacks array of callback functions
 */
const distanceFilter = function (callbacks) {
    Log.debug(TAG, 'Distance Filter');
    let criteria = {
        distance: { $lt: distance },
        isRoute: true,
        isGenerated: false
    };
    // get all routes that are shorter than the route should-distance
    Route.list({ criteria }, function (err, routes) {
        goodRoutes = routes;

        // get all segments that are shorter than the route should-distance
        criteria.isRoute = false;
        Route.list({ criteria }, function (err, segments) {
            goodSegments = segments;

            Log.debug(TAG, routes.length + ' possible routes after distance filter: ', routes.map(r => r.title));
            Log.debug(TAG, segments.length + ' possible segments after distance filter: ', segments.map(s => s.title));
            checkAndCallback(callbacks);
        });
    });
};

/**
 * Keep routes and segments where each geo is within the radius of half the
 * route distance around the starting point (i.e. it must not leave the radius).
 * @param callbacks array of callback functions
 */
const radiusFilter = function (callbacks) {
    Log.debug(TAG, 'Radius Filter');
    const options = {
        latitude: start.lat,
        longitude: start.lng,
        distance: radius,
        select: { _id: 1, distance: 2, routes: 3 }
    };

    Geo.findWithinRadius(options, function (err, radiusGeos) {
        radiusGeos = radiusGeos.filter(function (geo) {
            return geo.routes.length > 0;
        });

        // filter such that only the routes that are completely within the radius remain
        goodRoutes = goodRoutes.filter(function (route) {
            const takeEvery = route.geo.length * 0.1;    // parameter for performance, only take every xth route point, 1 = every
            let count = 0;

            // return whether there is no geo that is not in the radius
            return (!(route.geo.some(function (routeGeo) {
                count++;
                if (count % takeEvery !== 0) {
                    return false;
                }
                // return whether the element is not in the radius geos
                return !(radiusGeos.some(function (radiusGeo) {
                    return (radiusGeo._id.toString().trim() === routeGeo._id.toString().trim());
                }));
            })));
        });

        // filter such that only the segments that are completely not outside remain
        goodSegments = goodSegments.filter(function (segment) {
            const takeEvery = segment.geo.length * 0.1;    // parameter for performance, only take every xth route point, 1 = every
            let count = 0;

            // if there is no geo that is not in the radius, return true
            return (!(segment.geo.some(function (segmentGeo) {
                count++;
                if (count % takeEvery !== 0) {
                    return false;
                }
                // if the element is not in the radius geos, then return true
                return !(radiusGeos.some(function (radiusGeo) {

                    return (radiusGeo._id.toString().trim() === segmentGeo._id.toString().trim());
                }));
            })));
        });
        // now our routes and segments arrays only contain routes where no geo is outside of the radius

        Log.debug(TAG, goodRoutes.length + ' possible segments after radius filter: ', goodRoutes.map(s => s.title));
        Log.debug(TAG, goodSegments.length + ' possible segments after radius filter: ', goodSegments.map(s => s.title));
        checkAndCallback(callbacks);
    });
};

/**
 * Keep routes and segments where, when incorporating them into the route,
 * the lower bound on the total distance would still be less than the route distance.
 * @param callbacks array of callback functions
 */
const lowerBoundsFilter = function (callbacks) {
    Log.debug(TAG, 'LB Filter');

    let newGoodRoutes = [];
    let newGoodSegments = [];

    const printAndCallback = function () {
        goodRoutes = newGoodRoutes;
        goodSegments = newGoodSegments;
        Log.debug(TAG, goodRoutes.length + ' possible routes after lower bound filter: ', goodRoutes.map(r => r.title));
        Log.debug(TAG, goodSegments.length + ' possible segments after lower bound filter: ', goodSegments.map(s => s.title));
        checkAndCallback(callbacks);
    };

    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
    let lists = [];
    if (goodRoutes.length > 0) {
        lists.push({ isRoute: true, routes: goodRoutes });
    }
    if (goodSegments.length > 0) {
        lists.push({ isRoute: false, routes: goodSegments });
    }

    if (lists.length === 0) {
        checkAndCallback(callbacks);
    }

    //let listsProcessed = 0;
    //let routeLengths = [lists[0].routes.length, lists[1].routes.length];
    //let routesProcessed = [0, 0];

    let totalLength = lists[0].routes.length + lists[1].routes.length;
    let processed = 0;

    lists.forEach(function (routes) {
        routes.routes.forEach(function (route) {
            if (route.geo.length < 2) {
                routesProcessed[listsProcessed]++;
                return;
            }
            const startPoint = route.geo[0];
            const endPoint = route.geo[route.geo.length - 1];

            const options = {
                criteria: {
                    _id: startPoint._id,
                },
                latitude: start.lat,
                longitude: start.lng,
                distance: radius,
                limit: 1,
                select: { _id: 1, distance: 2 }
            };
            Geo.findDistance(options, function (err, distanceToStart) {
                // if this one failed
                if (distanceToStart.length === 0) {
                    routesProcessed[listsProcessed]++;

                    // ... and it was the last one of this list
                    if (routesProcessed[listsProcessed] >= routeLengths[listsProcessed] - 1) {
                        listsProcessed++;
                        // ... and it was the last list
                        if (listsProcessed >= (lists.length)) {
                            return printAndCallback();
                        }
                    }
                    // otherwise just skip this route and continue with the next one
                    return;
                }

                distanceToStart = distanceToStart[0].distance;
                options.criteria._id = endPoint._id;
                Geo.findDistance(options, function (err, distanceToEnd) {
                    // this route is fully processed, all callbacks returned, increment counter
                    routesProcessed[listsProcessed]++;
                    // if this one failed
                    if (distanceToEnd.length === 0) {

                        // ... and it was the last one of the last list, call the callback
                        if (routesProcessed[listsProcessed] >= routeLengths[listsProcessed]) {
                            listsProcessed++;
                            if (listsProcessed >= (lists.length)) {
                                return printAndCallback();
                            }
                        }
                        // otherwise just skip this route and continue with the next one
                        return;
                    }

                    // calculate lower bound on the total route distance when incorporating this route
                    distanceToEnd = distanceToEnd[0].distance;
                    const totalDistance = route.distance + distanceToStart + distanceToEnd;

                    // add the distance attribute to the object for later sorting
                    route.lowerBoundDistance = totalDistance;

                    if (totalDistance - distance * 0.1 > distance) {
                        Log.debug(TAG, 'route with this route/segment is too long: ' + totalDistance);

                    } else {
                        if (routes.isRoute) {
                            newGoodRoutes.push(route);
                        } else {
                            newGoodSegments.push(route);
                        }
                    }
                    Log.debug(TAG, routesProcessed[listsProcessed] + "/" + routeLengths[listsProcessed]  + "  " + " " + listsProcessed);
                    if (routesProcessed[listsProcessed] >= routeLengths[listsProcessed]) {
                        listsProcessed++;
                        if (listsProcessed >= (lists.length)) {
                            return printAndCallback();
                        }
                    }
                });
            });
        });
    });
};

/**
 * Sort combos on the lower bound total distance in descending order
 * @param callbacks array of callback functions
 */
const sort = function (callbacks) {
    Log.debug(TAG, 'Sort');

    combos.sort(function (a, b) {
        return b.lowerBoundDistance - a.lowerBoundDistance;
    });
    checkAndCallback(callbacks);
};

/**
 * Combine routes and segments into combos (combinations that are, when combined
 * in a route, still shorter in the lower bound than the max distance
 * @param callbacks array of callback functions
 */
const combine = function (callbacks) {
    Log.debug(TAG, 'Combine');

    // TODO combine segments and gereate routes that have multiple segments
    goodRoutes.forEach(function (route) {
        const comboObject = {
            lowerBoundDistance: route.lowerBoundDistance,
            singleRoute: true,
            mixed: false,
            parts: [route]
        };
        combos.push(comboObject);
    });
    goodSegments.forEach(function (segment) {
        const comboObject = {
            lowerBoundDistance: segment.lowerBoundDistance,
            singleRoute: false,
            mixed: false,
            parts: [segment]
        };
        combos.push(comboObject);
    });
    checkAndCallback(callbacks);
};

/**
 * Generate candidates from a 3rd party routing service using combos
 * @param callbacks array of callback functions
 */
const generateCandidates = function (callbacks) {
    Log.debug(TAG, 'Generate Candidates');
    if (combos.length === 0) {
        return checkAndCallback(callbacks);
    }

    let routes = [];

    // for every combo, generate a route
    let count = 0;
    combos.forEach(function (combo) {
        // start with the starting point
        let coordinates = [{
            'coordinates': [
                start.lng,
                start.lat
            ],
            'type': 'Point'
        }];

        // add all waypoints of the segment/route
        combo.parts.forEach(function (part) {
            coordinates = coordinates.concat(part.geo.map(g => g.location));
        });

        // add the end point last
        coordinates.push({
            'coordinates': [
                start.lng,
                start.lat
            ],
            'type': 'Point'
        });

        osrm.findRoute({ waypoints: coordinates }, function (route) {
            ++count;
            if (route.distance > 0) {
                // save what parts are included in this route
                route.parts = combo.parts;

                // add this route to the list of all generated routes
                routes.push(route);
            }

            // if this was the last osrm request, go on and sort and filter the list of generated routes
            if (count === combos.length) {
                // sort the resulting routes by distance
                routes.sort(function (a, b) {
                    return b.distance - a.distance;
                });

                // only keep the best n routes by removing items form the front and end of the array
                const keepBest = 5;

                //Log.debug(TAG, 'Before take best: ', routes.map(r => r.distance));

                while (routes.length > keepBest) {
                    let indexFromStart = routes[0];
                    let indexFromEnd = routes[routes.length - 1];
                    if (indexFromStart.distance - distance > distance - indexFromEnd.distance) {
                        routes.splice(0, 1);    // remove item form the beginning
                    } else {
                        routes.splice(routes.length - 1, 1);    // remove item from the end
                    }
                }
                //Log.debug(TAG, 'After take best: ', routes.map(r => r.distance));

                candidates = routes;
                checkAndCallback(callbacks);
            }
        });
    });
};

/**
 * Create Route objects from the generated candidates
 * @param callbacks array of callback functions
 */
const createRoutes = function (callbacks) {
    Log.debug(TAG, 'Create route objects');
    Log.debug(TAG, 'Candidates: ' + candidates.length);

    if (candidates.length === 0) {
        checkAndCallback(callbacks);
    }

    let generatedRoutes = [];
    candidates.forEach(function (candidate, index) {
        const title = 'Generated Route';
        const description = 'This route has been generated.';
        let id = routes.makeid({
            title: title,
            distance: candidate.distance,
            start: candidate.waypoints[0],
            end: candidate.waypoints[candidate.waypoints.length - 1]
        });
        let route = new Route({
            stravaId: id,
            title: title,
            body: description,
            location: '',       // TODO find out based on GPS
            comments: [],
            tags: '',
            geo: [],
            distance: candidate.distance,
            isRoute: true,
            isGenerated: true,
            queryDistance: distance
        });

        // TODO check if already exists in DB
        Log.debug(TAG, "ID: " + id);
        const options = {
            criteria : {
                stravaId: id,
                isRoute: true,
                isGenerated: true
            }
        };
        Route.load_options(options, function(err, existingRoute) {
            if (existingRoute) {
                Log.debug(TAG, "Route exists! " + existingRoute.title + " " + existingRoute.stravaId + " " + existingRoute.geo.length);
                generatedRoutes.push(existingRoute);
                if (generatedRoutes.length === candidates.length) {
                    Log.debug(TAG, 'All candidates have been saved 1 ' + generatedRoutes.length + " " + candidates.length);
                    resultRoutes = generatedRoutes;
                    return checkAndCallback(callbacks);
                }
                return;
            }
            Log.debug(TAG, "Route does not!");
            route.save(function (err) {
                if (err) {
                    Log.error(TAG, "Error saving route", err);
                }
                // create a geo object in the db for each waypoint
                let waypointsSaved = 0;
                let geos = [];
                candidate.waypoints.forEach(function (waypoint) {
                    const geo = new Geo({
                        name: 'Generated',
                        location: {
                            type: 'Point',
                            coordinates: [waypoint[0], waypoint[1]]
                        },
                    });

                    if (route != null) {
                        if (route._id != null) {
                            geo.routes.push(route);
                        } else {
                            Log.error(TAG, 'Route of the stream was not null but had no _id');
                            return;
                        }
                    }
                    geos.push(geo);
                    geo.save(function (err) {
                        waypointsSaved++;
                        if (err) {
                            Log.error(TAG, "Error saving geo: ", err);
                            return;
                        }
                        if (waypointsSaved === candidate.waypoints.length) {
                            Log.debug(TAG, 'All waypoints have been saved 2 ' + waypointsSaved + " " + candidate.waypoints.length);

                            route.geo = geos;
                            route.save(function (err) {
                                if (err) {
                                    Log.error(TAG, "Error saving route" + err);
                                    return;
                                }
                                generatedRoutes.push(route);

                                if (generatedRoutes.length === candidates.length) {
                                    Log.debug(TAG, 'All candidates have been saved 2 ' + generatedRoutes.length + " " + candidates.length);
                                    resultRoutes = generatedRoutes;
                                    checkAndCallback(callbacks);
                                }
                            });
                        }
                    });
                });
            });
        });
    });
};
