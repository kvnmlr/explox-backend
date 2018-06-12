'use strict';

/**
 * Module dependencies.
 */
const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');
const User = mongoose.model('User');

const users = require('./users');
const routes = require('./routes');
const osrm = require('./osrm');

let preference, distance, radius, difficulty, start;
let goodRoutes = [], goodSegments = [], combos = [], finalRoutes = [], candidates = [], resultRoutes = [];
let request, response;

/**
 * Generates a new route by doing the following calculations in sequence:
 *      1. Distance filter
 *      2. Lower Bound filer
 *      3. Combine routes and segments and sort by LB distance
 *      4. Let OSRM generate candidates
 *      5. Rank and filter candidates by familiarity
 *      6. Create and save the routes in the DB, deliver results to the user
 */
exports.generate = async function (req, res) {
    Log.log(TAG, 'Generate');
    preference = req.query.preference || 'discover';
    distance = req.query.distance * 1000 || '5000';
    radius = distance / 2.0;
    difficulty = req.query.difficulty || 'advanced';
    start = {
        lat: req.query.lat,
        lng: req.query.lng
    };
    request = req;
    response = res;

    await initSearch();
    await distanceFilter();
    await lowerBoundsFilter();
    /*
    await combine();
    await sortAndReduce();
    await generateCandidates();
    await familiarityFilter();
    await createRoutes();
    respond();
    */
};

const initSearch = function () {
    Log.debug(TAG, 'Init search');
    goodRoutes = [];
    goodSegments = [];
    combos = [];
    finalRoutes = [];
    candidates = [];
    resultRoutes = [];
};

const logAll = function () {
    if (resultRoutes.length > 0) {
        Log.debug(TAG, 'Created these routes: ', resultRoutes.map(r => r.title + '\t (' + r.distance + ')'));
    }
    else if (candidates.length > 0) {
        Log.debug(TAG, 'Found these candidate routes: ', candidates.map(r => r.title + '\t (' + r.distance + ')'));
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
};

const respond = function () {
    Log.debug(TAG, 'Respond ');

    if (preference === 'discover') {
        resultRoutes.sort(function (a, b) {
            return b.familiarityScore - a.familiarityScore;
        });
    }
    if (preference === 'distance') {
        resultRoutes.sort(function (a, b) {
            return b.distance - a.distance;
        });
    } else {
        resultRoutes.sort(function (a, b) {
            return b.distance + ((1 - b.familiarityScore) * a.distance) - a.distance + ((1 - a.familiarityScore) * b.distance);
        });
    }

    request.generatedRoutes = resultRoutes;//
    request.hasGeneratedRoutes = true;
    users.show(request, response);
};

/**
 * Keep routes and segments that are shorter than the route distance.
 */
const distanceFilter = async function () {
    Log.debug(TAG, 'Distance Filter');
    let criteria = {
        distance: {
            $lt: distance,
            $gt: distance / 5   // this segment should be at least 10% of the final route (to avoid too small/insignificant segments
        },
        isRoute: true,
        isGenerated: false
    };
    // get all routes that are shorter than the route should-distance
    const routes = await Route.list({criteria});
    goodRoutes = routes;

    // get all segments that are shorter than the route should-distance
    criteria.isRoute = false;
    const segments = await Route.list({criteria});
    goodSegments = segments;

    Log.debug(TAG, routes.length + ' possible routes after distance filter: ', routes.map(r => r.distance + ' (' + r.title + ')'));
    Log.debug(TAG, segments.length + ' possible segments after distance filter: ', segments.map(s => s.distance + ' (' + s.title + ')'));
};

/**
 * Keep routes and segments where each geo is within the radius of half the
 * route distance around the starting point (i.e. it must not leave the radius).
 */
const radiusFilter = async function () {
    Log.debug(TAG, 'Radius Filter');
    const options = {
        latitude: start.lat,
        longitude: start.lng,
        distance: radius,
        select: {_id: 1, distance: 2, routes: 3}
    };

    let radiusGeos = await Geo.findWithinRadius(options);
    radiusGeos = radiusGeos.filter(function (geo) {
        return geo.routes.length > 0;
    });

    // filter such that only the routes that are completely within the radius remain
    goodRoutes = goodRoutes.filter(function (route) {
        const takeEvery = Math.ceil(route.geo.length * 0.1);    // parameter for performance, only take every xth route point, 1 = every
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
        const takeEvery = Math.ceil(segment.geo.length * 0.1);    // parameter for performance, only take every xth route point, 1 = every
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

    Log.debug(TAG, goodRoutes.length + ' possible segments after radius filter: ', goodRoutes.map(s => s.distance + ' (' + s.title + ')'));
    Log.debug(TAG, goodSegments.length + ' possible segments after radius filter: ', goodSegments.map(s => s.distance + ' (' + s.title + ')'));
};

/**
 * Keep routes and segments where, when incorporating them into the route,
 * the lower bound on the total distance would still be less than the route distance.
 */
const lowerBoundsFilter = function () {
    Log.debug(TAG, 'LB Filter');

    let newGoodRoutes = [];
    let newGoodSegments = [];

    const printAndCallback = function () {
        goodRoutes = newGoodRoutes;
        goodSegments = newGoodSegments;
        Log.debug(TAG, goodRoutes.length + ' possible routes after lower bound filter: ', goodRoutes.map(r => r.lowerBoundDistance + ' (' + r.title + ')'));
        Log.debug(TAG, goodSegments.length + ' possible segments after lower bound filter: ', goodSegments.map(s => s.lowerBoundDistance + ' (' + s.title + ')'));
        // checkAndCallback(callbacks);
    };

    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
    let lists = [];
    lists.push({isRoute: true, routes: goodRoutes});
    lists.push({isRoute: false, routes: goodSegments});

    if (lists.length === 0) {
        // checkAndCallback(callbacks);
    }

    let totalLength = lists[0].routes.length + lists[1].routes.length;
    let processed = 0;

    lists.forEach(function (routes) {
        routes.routes.forEach(async function (route) {
            if (route.geo.length < 2) {
                processed++;
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
                select: {_id: 1, distance: 2}
            };
            let distanceToStart = await Geo.findDistance(options);
            // if this one failed
            if (distanceToStart.length === 0) {
                processed++;

                // ... and it was the last one of this list
                if (processed >= totalLength) {
                    return printAndCallback();
                }
                // otherwise just skip this route and continue with the next one
                return;
            }

            distanceToStart = distanceToStart[0].distance;
            options.criteria._id = endPoint._id;
            let distanceToEnd = Geo.findDistance(options);
            // this route is fully processed, all callbacks returned, increment counter
            processed++;
            // if this one failed
            if (distanceToEnd.length === 0) {
                // ... and it was the last one of the last list, call the callback
                if (processed >= totalLength) {
                    return printAndCallback();
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
                Log.debug(TAG, 'Lower bound on route with route/segment is too long: ' + totalDistance);

            } else {
                if (routes.isRoute) {
                    newGoodRoutes.push(route);
                } else {
                    newGoodSegments.push(route);
                }
            }
            if (processed >= totalLength) {
                return printAndCallback();
            }
        });
    });
};

/**
 * Sort combos on the lower bound total distance in descending order
 */
const sortAndReduce = function () {
    Log.debug(TAG, 'Sort');

    combos.sort(function (a, b) {
        return b.lowerBoundDistance - a.lowerBoundDistance;
    });
    const keepBest = 15;
    while (combos.length > keepBest) {
        let indexFromStart = combos[0];
        let indexFromEnd = combos[combos.length - 1];
        if (indexFromStart.lowerBoundDistance - distance > distance - indexFromEnd.lowerBoundDistance) {
            combos = combos.slice(1, combos.length);    // remove item form the beginning
        } else {
            combos = combos.slice(0, combos.length - 1);    // remove item from the end
        }
    }
};

/**
 * Combine routes and segments into combos (combinations that are, when combined
 * in a route, still shorter in the lower bound than the max distance
 */
const combine = function () {
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
};

/**
 * Generate candidates from a 3rd party routing service using combos
 */
const generateCandidates = async function () {
    Log.debug(TAG, 'Generate Candidates');
    if (combos.length === 0) {
        return; // checkAndCallback(callbacks);
    }

    let routes = [];

    // for every combo, generate a route
    let count = 0;
    combos.forEach(async function (combo) {
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

        const maxAllowedWaypoints = 25;
        let keepEvery = coordinates.length / (maxAllowedWaypoints - 2);
        if (keepEvery > 1) {
            // we have too many waypoints, downsample to something smaller
            keepEvery = Math.ceil(keepEvery);
            const waypointsTemp = Object.assign([], coordinates);
            coordinates = [waypointsTemp[0]];     // start point must not be deleted
            let counter = 0;
            waypointsTemp.forEach(function (wp) {
                if (counter % keepEvery === 0) {
                    coordinates.push(wp);
                }
                ++counter;
            });
            coordinates.push(waypointsTemp[waypointsTemp.length - 1]);   // end point must also definitely be a waypoint
        }

        let route = await osrm.findRoute({waypoints: coordinates});
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

            Log.debug(TAG, routes.length + ' routes generated by OSRM: ', routes.map(r => r.distance));

            // only keep the best n routes by removing items form the front and end of the array
            const keepBest = 10;

            while (routes.length > keepBest) {
                let indexFromStart = routes[0];
                let indexFromEnd = routes[routes.length - 1];
                if (indexFromStart.distance - distance > distance - indexFromEnd.distance) {
                    routes = routes.slice(1, routes.length);    // remove item form the beginning
                } else {
                    routes = routes.slice(0, routes.length - 1);    // remove item from the end
                }
            }

            candidates = routes;
            // checkAndCallback(callbacks);
        }
    });
};


/**
 * Create Route objects from the generated candidates
 */
const createRoutes = async function () {
    Log.debug(TAG, 'Create Routes');

    if (candidates.length === 0) {
        // checkAndCallback(callbacks);
    }

    let generatedRoutes = [];
    candidates.forEach(async function (candidate) {
        // get the user
        let user = await User.load(request.user);
        const title = 'New Route (' + Math.floor(candidate.distance / 1000) + ' km)';
        const description = 'This route has been generated. Select this route and change the title and description.';
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
            user: user,
            distance: candidate.distance,
            isRoute: true,
            isGenerated: true,
            queryDistance: distance,
            parts: candidate.parts
        });

        const options = {
            criteria: {
                stravaId: id,
                isRoute: true,
                isGenerated: true
            }
        };
        let existingRoute = await Route.load_options(options);
        if (existingRoute) {
            Log.debug(TAG, 'Route already exists (' + existingRoute.title + ')');
            existingRoute.familiarityScore = candidate.familiarityScore;
            generatedRoutes.push(existingRoute);
            if (generatedRoutes.length === candidates.length) {
                resultRoutes = generatedRoutes;
                return; // checkAndCallback(callbacks);
            }
            return;
        }
        await route.save();

        // create a geo object in the db for each waypoint
        let waypointsSaved = 0;
        let geos = [];
        candidate.waypoints.forEach(async function (waypoint) {
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
            await geo.save();
            waypointsSaved++;

            if (waypointsSaved === candidate.waypoints.length) {
                route.geo = geos;
                await route.save();

                Log.debug(TAG, 'Created new route (' + route.title + ', with ' + route.geo.length + ' waypoints)');
                route.familiarityScore = candidate.familiarityScore;
                generatedRoutes.push(route);

                if (generatedRoutes.length === candidates.length) {
                    resultRoutes = generatedRoutes;
                    // checkAndCallback(callbacks);
                }
            }
        });
    });
};

/**
 * Filters the generated routes to only leave ones that are mostly familiar
 */
const familiarityFilter = async function () {
    Log.debug(TAG, 'Familiarity Filter');

    if (candidates.length === 0) {
        // checkAndCallback(callbacks);
    }

    let candidatesProcessed = 0;

    candidates.forEach(async function (route) {
        let leave = 25;
        if (route.waypoints.length < leave) {
            leave = route.waypoints.length;
        }
        const takeEvery = Math.ceil(route.waypoints.length / leave);    // parameter for performance, only take every xth route point, 1 = every
        const remaining = Math.floor(route.waypoints.length / takeEvery);

        let waypointsProcessed = 0;
        let matches = 0;
        let exploredGeos = [];
        let user = await User.load_full(request.user._id, {});
        user.activities.forEach(function (activity) {
            activity.geo.forEach(function (g) {
                exploredGeos.push(g._id.toString());
            });
        });

        route.waypoints.forEach(async function (waypoint, waypointIndex) {
            if (waypointIndex % takeEvery === 0) {

                const options = {
                    distance: 280,
                    latitude: waypoint[1],
                    longitude: waypoint[0]
                };

                let matching = false;
                let geos = await Geo.findWithinRadius(options);
                if (!geos) {
                    return;
                }
                geos.some(function (geo) {
                    if (exploredGeos.includes(geo._id.toString())) {
                        matching = true;
                    }
                    return matching;
                });

                if (matching) {
                    matches++;
                }

                waypointsProcessed++;
                if (waypointsProcessed === remaining) {
                    candidatesProcessed++;
                    route.familiarityScore = matches / leave;
                    if (candidatesProcessed === candidates.length) {
                        const keepBest = 5;
                        candidates = candidates.slice(0, keepBest);
                        // checkAndCallback(callbacks);
                    }
                }
            }
        });
    });
};