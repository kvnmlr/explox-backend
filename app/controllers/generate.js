'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');
const CreatorResult = mongoose.model('CreatorResult');
const User = mongoose.model('User');
const users = require('./users');
const routes = require('./routes');
const osrm = require('./osrm');
const importExport = require('./importexport');
const geolib = require('geolib');

function getDistanceFromLatLonInKm (lat1,lon1,lat2,lon2) {
    const R = 6371; // Radius of the earth in km
    let dLat = deg2rad(lat2 - lat1);  // deg2rad below
    let dLon = deg2rad(lon2 - lon1);
    let a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c; // Distance in km
    return d;
}

function deg2rad (deg) {
    return deg * (Math.PI / 180);
}

function roughSizeOfObject (object) {
    const objectList = [];
    const stack = [object];
    let bytes = 0;

    while (stack.length) {
        const value = stack.pop();

        if (typeof value === 'boolean') {
            bytes += 4;
        }
        else if (typeof value === 'string') {
            bytes += value.length * 2;
        }
        else if (typeof value === 'number') {
            bytes += 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf(value) === -1
        ) {
            objectList.push(value);

            for (let i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
}

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
    let user = await User.load_full(req.user._id, {});

    let distance = parseFloat(req.body.distance) * 1000 || 5000;

    let query = {
        preference: req.body.preference || 'discover',
        duration: req.body.duration || 0,
        distance: distance,
        radius: distance / 2.0,
        difficulty: req.body.difficulty || 'advanced',
        start: req.body.start,
        end: req.body.end,
        request: req,
        response: res,
        user: user,
    };

    let result = {};

    result = await initSearch(query, result);
    result = await distanceFilter(query, result);
    result = await lowerBoundsFilter(query, result);
    result = await combine(query, result);
    result = await sortAndReduce(query, result);
    result = await generateCandidates(query, result);
    result = await familiarityFilter(query, result);
    result = await createRoutes(query, result);
    logAll(query, result);
    respond(query, result);
};

const initSearch = function (query, result) {
    Log.debug(TAG, 'Init search');
    result = {
        goodRoutes: [],
        goodSegments: [],
        combos: [],
        finalRoutes: [],
        candidates: [],
        resultRoutes: [],
        familiarityScores: [],
    };
    return result;
};

const logAll = function (query, result) {
    if (result.resultRoutes.length > 0) {
        Log.debug(TAG, 'Created these routes: ', result.resultRoutes.map(r => r.title + '\t (' + r.distance + ')'));
    }
    else if (result.candidates.length > 0) {
        Log.debug(TAG, 'Found these candidate routes: ', result.candidates.map(r => r.title + '\t (' + r.distance + ')'));
    }
    else if (result.combos.length === 0) {
        let tempRoutes = result.goodRoutes;
        let tempSegments = result.goodSegments;

        for (let route of tempRoutes) {
            route.geo = [];
        }

        for (let segment of tempSegments) {
            segment.geo = [];
        }

        Log.log(TAG, result.goodRoutes.length + ' routes: ', tempRoutes);
        Log.log(TAG, result.goodSegments.length + ' segments: ', tempSegments);
    } else {
        let tempCombos = result.combos;

        for (let combo of tempCombos) {
            for (let part of combo.parts) {
                part.geo = [];
            }
        }
        Log.log(TAG, tempCombos.length + ' combos: ', tempCombos);

        if (result.finalRoutes.length > 0) {
            let tempRoutes = result.finalRoutes;

            for (let route of tempRoutes) {
                route.geo = [];
            }
            Log.log(TAG, tempRoutes.length + ' final routes: ', tempRoutes);
        }
    }
};

const respond = async function (query, result) {
    Log.debug(TAG, 'Respond ');

    let resultRoutes = result.resultRoutes;

    if (query.preference === 'discover') {
        resultRoutes.sort(function (a, b) {
            return b.familiarityScore - a.familiarityScore;
        });
    }
    if (query.preference === 'distance') {
        resultRoutes.sort(function (a, b) {
            return b.distance - a.distance;
        });
    } else {
        resultRoutes.sort(function (a, b) {
            return b.distance + ((1 - b.familiarityScore) * a.distance) - a.distance + ((1 - a.familiarityScore) * b.distance);
        });
    }

    Log.debug(TAG, 'FAM', result.familiarityScores);

    let creatorResult = new CreatorResult(
        {
            user: query.user._id,
            query: {
                distance: query.distance,
            },
            generatedRoutes: resultRoutes,
            familiarityScores: result.familiarityScores,
            acceptedRoutes: [],
        });
    await creatorResult.save();

    query.response.json(creatorResult);
    return result;
};

/**
 * Keep routes and segments that are shorter than the route distance.
 */
const distanceFilter = async function (query, result) {
    Log.log(TAG, 'Distance Filter');
    let criteria = {
        distance: {
            $lt: query.distance,
            $gt: query.distance / 5   // this segment should be at least 20% of the final route (to avoid too small/insignificant segments
        },
        isRoute: true,
        isGenerated: false
    };
    // get all routes that are shorter than the route should-distance
    const routes = await Route.list({criteria: criteria, detailed: true, limit: 100000});
    result.goodRoutes = routes;

    // get all segments that are shorter than the route should-distance
    criteria.isRoute = false;
    const segments = await Route.list({criteria: criteria, detailed: true, limit: 100000});
    result.goodSegments = segments;

    Log.log(TAG, routes.length + ' possible routes after distance filter: ', routes.map(r => r.distance + ' (' + r.title + ')'));
    Log.log(TAG, segments.length + ' possible segments after distance filter: ', segments.map(s => s.distance + ' (' + s.title + ')'));

    return result;
};

/**
 * Keep routes and segments where each geo is within the radius of half the
 * route distance around the starting point (i.e. it must not leave the radius).
 */
const radiusFilter = async function (query, result) {
    Log.debug(TAG, 'Radius Filter');
    const options = {
        latitude: query.start.lat,
        longitude: query.start.lng,
        distance: query.radius,
        select: {_id: 1, distance: 2, routes: 3}
    };

    let radiusGeos = await Geo.findWithinRadius(options);
    radiusGeos = radiusGeos.filter(function (geo) {
        return geo.routes.length > 0;
    });

    // filter such that only the routes that are completely within the radius remain
    result.goodRoutes = result.goodRoutes.filter(function (route) {
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
    result.goodSegments = result.goodSegments.filter(function (segment) {
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

    Log.debug(TAG, result.goodRoutes.length + ' possible segments after radius filter: ', result.goodRoutes.map(s => s.distance + ' (' + s.title + ')'));
    Log.debug(TAG, result.goodSegments.length + ' possible segments after radius filter: ', result.goodSegments.map(s => s.distance + ' (' + s.title + ')'));

    return result;
};
/**
 * Keep routes and segments where, when incorporating them into the route,
 * the lower bound on the total distance would still be less than the route distance.
 */
const lowerBoundsFilter = async function (query, result) {
    Log.debug(TAG, 'Lower Bound Filter');

    let newGoodRoutes = [];
    let newGoodSegments = [];

    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
    let lists = [
        {isRoute: true, routes: result.goodRoutes},
        {isRoute: false, routes: result.goodSegments}
    ];

    for (let routes of lists) {
        for (let route of routes.routes) {
            if (route.geo.length < 2) {
                continue;
            }
            const startPoint = route.geo[0];
            const endPoint = route.geo[route.geo.length - 1];

            let distanceToStart = geolib.getDistance(
                {latitude: query.start.lat, longitude: query.start.lng},
                {latitude: startPoint.location.coordinates[1], longitude: startPoint.location.coordinates[0]}
            );

            let distanceToEnd = geolib.getDistance(
                {latitude: query.start.lat, longitude: query.start.lng},
                {latitude: endPoint.location.coordinates[1], longitude: endPoint.location.coordinates[0]}
            );

            const totalDistance = route.distance + distanceToStart + distanceToEnd;

            // add the distance attribute to the object for later sorting
            route.lowerBoundDistance = totalDistance;

            if (totalDistance - query.distance * 0.1 > query.distance) {
                Log.debug(TAG, 'Lower bound on route with route/segment is too long: ' + totalDistance);

            } else {
                if (routes.isRoute) {
                    newGoodRoutes.push(route);
                } else {
                    newGoodSegments.push(route);
                }
            }
        }
    }
    result.goodRoutes = newGoodRoutes;
    result.goodSegments = newGoodSegments;
    Log.log(TAG, result.goodRoutes.length + ' possible routes after lower bound filter: ', result.goodRoutes.map(r => r.lowerBoundDistance + ' (' + r.title + ')'));
    Log.log(TAG, result.goodSegments.length + ' possible segments after lower bound filter: ', result.goodSegments.map(s => s.lowerBoundDistance + ' (' + s.title + ')'));

    return result;
};

/**
 * Sort combos on the lower bound total distance in descending order
 */
const sortAndReduce = async function (query, result) {
    Log.debug(TAG, 'Sort and Reduce');

    result.combos.sort(function (a, b) {
        return b.lowerBoundDistance - a.lowerBoundDistance;
    });

    // reduce the list of combos to a fixed number
    const keepBest = 5;
    while (result.combos.length > keepBest) {
        let indexFromStart = result.combos[0];
        let indexFromEnd = result.combos[result.combos.length - 1];
        if (indexFromStart.lowerBoundDistance - query.distance > query.distance - indexFromEnd.lowerBoundDistance) {
            result.combos = result.combos.slice(1, result.combos.length);    // remove item form the beginning
        } else {
            result.combos = result.combos.slice(0, result.combos.length - 1);    // remove item from the end
        }
    }

    Log.log(TAG, result.combos.length + ' combos remaining after sort and reduce');

    return result;
};

/**
 * Combine routes and segments into combos (combinations that are, when combined
 * in a route, still shorter in the lower bound than the max distance
 */
const combine = async function (query, result) {
    Log.debug(TAG, 'Combine');

    // TODO split routes and gereate routes that have partial routes
    for (let route of result.goodRoutes) {
        const comboObject = {
            lowerBoundDistance: route.lowerBoundDistance,
            singleRoute: true,
            mixed: false,
            parts: [route]
        };
        result.combos.push(comboObject);
    }

    // TODO combine segments and gereate routes that have multiple segments
    for (let segment of result.goodSegments) {
        const comboObject = {
            lowerBoundDistance: segment.lowerBoundDistance,
            singleRoute: false,
            mixed: false,
            parts: [segment]
        };
        result.combos.push(comboObject);
    }

    Log.log(TAG, result.combos.length + ' combos generated');

    return result;
};

/**
 * Generate candidates from a 3rd party routing service using combos
 */
const generateCandidates = async function (query, result) {
    Log.debug(TAG, 'Generate Candidates');
    if (result.combos.length === 0) {
        return result;
    }

    let routes = [];

    // for every combo, generate a route
    for (let combo of result.combos) {
        // start with the starting point
        let coordinates = [{
            'coordinates': [
                query.start.lng,
                query.start.lat
            ],
            'type': 'Point'
        }];

        // add all waypoints of the segment/route
        for (let part of combo.parts) {
            coordinates = coordinates.concat(part.geo.map(g => g.location));
        }

        // add the end point last
        coordinates.push({
            'coordinates': [
                query.start.lng,
                query.start.lat
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

            for (let wp of waypointsTemp) {
                if (counter % keepEvery === 0) {
                    coordinates.push(wp);
                }
                ++counter;
            }
            coordinates.push(waypointsTemp[waypointsTemp.length - 1]);   // end point must also definitely be a waypoint
        }

        let route = await osrm.findRoute({waypoints: coordinates});
        if (route.distance > 0) {
            // save what parts are included in this route
            route.parts = combo.parts;

            // add this route to the list of all generated routes
            routes.push(route);
        }
    }

    // sort the resulting routes by distance
    routes.sort(function (a, b) {
        return b.distance - a.distance;
    });

    Log.log(TAG, routes.length + ' routes generated by OSRM: ', routes.map(r => r.distance));

    // only keep the best n routes by removing items form the front and end of the array
    const keepBest = 10;

    while (routes.length > keepBest) {
        let indexFromStart = routes[0];
        let indexFromEnd = routes[routes.length - 1];
        if (indexFromStart.distance - query.distance > query.distance - indexFromEnd.distance) {
            routes = routes.slice(1, routes.length);    // remove item form the beginning
        } else {
            routes = routes.slice(0, routes.length - 1);    // remove item from the end
        }
    }

    result.candidates = routes;

    return result;
};


/**
 * Create Route objects from the generated candidates
 */
const createRoutes = async function (query, result) {
    Log.debug(TAG, 'Create Routes');

    if (result.candidates.length === 0) {
        return result;
    }

    let generatedRoutes = [];
    let familiarityScores = [];

    for (let candidate of result.candidates) {
        // get the user
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
            location: '',
            comments: [],
            tags: '',
            geo: [],
            user: query.user._id,
            distance: candidate.distance,
            isRoute: true,
            isGenerated: true,
            queryDistance: query.distance,
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
            familiarityScores.push(candidate.familiarityScore);

            continue;
        }

        // if the route does not already exist, save it
        await route.save();

        // create a geo object in the db for each waypoint
        let geos = [];

        for (let waypoint of candidate.waypoints) {
            const geo = new Geo({
                name: 'Generated',
                location: {
                    type: 'Point',
                    coordinates: [waypoint[0], waypoint[1]]
                },
            });

            if (route != null) {
                if (route._id != null) {
                    // add the route reference to the geo
                    geo.routes.push(route);
                } else {
                    Log.error(TAG, 'Route of the stream was not null but had no _id');
                    continue;
                }
            }
            geos.push(geo);
            await geo.save();
        }

        // add the created geos to the route and save it again
        route.geo = geos;
        await route.save();

        importExport.exportRoute({
            routeData: route,
            query: {},
        });

        Log.log(TAG, 'Created new route (' + route.title + ', with ' + route.geo.length + ' waypoints)');

        generatedRoutes.push(route);
        familiarityScores.push(candidate.familiarityScore);
    }

    result.resultRoutes = generatedRoutes;
    result.familiarityScores = familiarityScores;

    return result;
};

/**
 * Filters the generated routes to only leave ones that are mostly familiar
 */
const familiarityFilter = async function (query, result) {
    Log.debug(TAG, 'Familiarity Filter');

    if (result.candidates.length === 0) {
        return result;
    }

    for (let route of result.candidates) {
        let leave = 25;
        if (route.waypoints.length < leave) {
            leave = route.waypoints.length;
        }
        const takeEvery = Math.ceil(route.waypoints.length / leave);    // parameter for performance, only take every xth route point, 1 = every

        let matches = 0;
        let exploredGeos = [];

        for (let activity of query.user.activities) {
            for (let g of activity.geo) {
                exploredGeos.push(g._id.toString());
            }
        }

        let waypointIndex = -1;
        for (let waypoint of route.waypoints) {
            waypointIndex++;
            if (waypointIndex % takeEvery === 0) {
                const options = {
                    distance: 280,
                    latitude: waypoint[1],
                    longitude: waypoint[0]
                };

                let matching = false;
                let geos = await Geo.findWithinRadius(options);
                if (!geos) {
                    continue;
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
            }
        }
        route.familiarityScore = matches / leave;
    }

    // TODO needs to be sorted first?
    const keepBest = 5;
    result.candidates = result.candidates.slice(0, keepBest);

    return result;
};
