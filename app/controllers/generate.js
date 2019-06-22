'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/generate';
const mongoose = require('mongoose');
const Geo = mongoose.model('Geo');
const Route = mongoose.model('Route');
const CreatorResult = mongoose.model('CreatorResult');
const User = mongoose.model('User');
const routes = require('./routes');
const osrm = require('./osrm');
const importExport = require('./importexport');
const geolib = require('geolib');

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
        roadType: req.body.tags,
        difficulty: req.body.difficulty || 'advanced',
        start: req.body.start,
        end: req.body.end,
        request: req,
        response: res,
        user: user,
    };

    let metadata = {
        distanceFilter: [],
        lowerBoundsFilter: [],
        combine: [],
        sortAndReduce: [],
        populate: [],
        generateCandidates: [],
        familiarityFilter: [],
    };

    let result = {
        metadata: metadata
    };

    result = await initSearch(query, result);
    result = await distanceFilter(query, result);
    result = await lowerBoundsFilter(query, result);
    result = await combine(query, result);
    result = await sortAndReduce(query, result);
    result = await populate(query, result);
    if (result.explorativeCombos.length === 0 || result.familiarCombos.length === 0) {
        return respond(query, result);
    }
    result = await generateCandidates(query, result);
    result = await familiarityFilter(query, result);
    result = await createRoutes(query, result);
    await respond(query, result);
};

const initSearch = function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Init search ==');
    result = {
        metadata: result.metadata,
        goodRoutes: [],
        goodSegments: [],
        explorativeCombos: [],
        familiarCombos: [],
        finalRoutes: [],
        candidates: [],
        familiarCandidates: [],
        resultRoutes: [],
        familiarityScores: [],
    };
    return result;
};

/**
 * Keep routes and segments that are shorter than the route distance.
 */
const distanceFilter = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Distance Filter ==');
    let criteria = {
        'strava.sub_type': 1,
        isRoute: true,
        isGenerated: false,
        distance: {
            $lt: query.distance * 1.1,
            $gt: query.distance / 15   // this segment should be at least 7% of the final route (to avoid too small/insignificant segments
        },
        geo: {$exists: true, $not: {$size: 0}},
    };
    if (query.roadType !== 'Road') {
        Log.debug(TAG, 'Road type is ' + query.roadType);
        delete criteria['strava.sub_type'];
    }

    // get all routes that are shorter than the route should-distance
    let routes = await Route.list({criteria: criteria, detailed: true, limit: 50000, sort: {distance: 1}});

    // remove the round courses
    routes = routes.filter(roundCourseFilter);

    // get all segments that are shorter than the route should-distance
    criteria.isRoute = false;
    delete criteria['strava.sub_type'];
    let segments = await Route.list({criteria: criteria, detailed: false, limit: 50000, sort: {distance: 1}});
    segments = segments.filter(roundCourseFilter);

    result.goodSegments = segments;

    result.goodActivities = query.user.activities.filter((act) => {
        return (act.distance < query.distance * 1.1)
            && (act.distance > query.distance / 10)
            && act.strava.type === 'Ride';
    });

    Log.debug(TAG, routes.length + ' possible routes after distance filter: ', /* routes.map(r => r.distance + ' (' + r.title + ')') */);

    // Remove routes that are too similar to activities
    routes = routes.filter((r) => {
        return !result.goodActivities.some((a) => {
            return !routeActivitySimilarityFilter(r, a);
        });
    });
    result.goodRoutes = routes;
    result.metadata.distanceFilter.push(result.goodRoutes.length, result.goodSegments.length, result.goodActivities.length);

    Log.debug(TAG, routes.length + ' possible routes after distance filter: ', /* routes.map(r => r.distance + ' (' + r.title + ')') */);
    Log.debug(TAG, segments.length + ' possible segments after distance filter: ', /* segments.map(s => s.distance + ' (' + s.title + ')') */);
    Log.debug(TAG, result.goodActivities.length + ' possible own activities after distance filter: ', /* segments.map(s => s.distance + ' (' + s.title + ')') */);

    return result;
};

/**
 * Keep routes and segments where, when incorporating them into the route,
 * the lower bound on the total distance would still be less than the route distance.
 */
const lowerBoundsFilter = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Lower Bound Filter ==');

    let newGoodRoutes = [];
    let newGoodSegments = [];
    let newGoodActivities = [];

    // filter routes such that direct connections to start and end point + route distance is roughly the same as the given distance
    let lists = [
        {isRoute: true, isActivity: false, routes: result.goodRoutes},
        {isRoute: false, isActivity: false, routes: result.goodSegments},
        {isRoute: false, isActivity: true, routes: result.goodActivities}
    ];

    for (let routes of lists) {
        for (let route of routes.routes) {

            let startPoint = [];
            let endPoint = [];
            if (!route.isRoute && !route.isActivity) {
                startPoint = route.strava.start_latlng;
                endPoint = route.strava.end_latlng;
            } else {
                if (route.geo) {
                    startPoint = [route.geo[0].location.coordinates[1], route.geo[0].location.coordinates[0]];
                    endPoint = [route.geo[route.geo.length - 1].location.coordinates[1], route.geo[route.geo.length - 1].location.coordinates[0]];
                }
                else {
                    continue;
                }
            }

            if (startPoint === [] || endPoint === []) {
                Log.error(TAG, 'Route does not have start and end latlng strava properties', route);
            }

            let distanceToStart = geolib.getDistance(
                {latitude: query.start.lat, longitude: query.start.lng},
                {latitude: startPoint[0], longitude: startPoint[1]}
            );

            let distanceToEnd = geolib.getDistance(
                {latitude: query.start.lat, longitude: query.start.lng},
                {latitude: endPoint[0], longitude: endPoint[1]}
            );

            const totalDistance = route.distance + distanceToStart + distanceToEnd;

            // add the distance attribute to the object for later sorting
            route.lowerBoundDistance = totalDistance;

            if (routes.isRoute) {
                if (totalDistance - query.distance * 0.1 < query.distance) {
                    newGoodRoutes.push(route);
                }
            } else {
                if (routes.isActivity) {
                    if (totalDistance - query.distance * 0.3 < query.distance) {
                        newGoodActivities.push(route);
                    }
                } else {
                    if (totalDistance < query.distance) {
                        newGoodSegments.push(route);
                    }
                }
            }
        }
    }

    result.goodRoutes = newGoodRoutes;
    result.goodSegments = newGoodSegments;
    result.goodActivities = newGoodActivities;

    if (newGoodActivities.length === 0) {
        Log.debug(TAG, 'No activities remaining after lower bound filter');
    }

    result.metadata.lowerBoundsFilter.push(result.goodRoutes.length, result.goodSegments.length, result.goodActivities.length);

    Log.debug(TAG, result.goodRoutes.length + ' possible routes after lower bound filter: ', /* result.goodRoutes.map(r => r.lowerBoundDistance + ' (' + r.title + ')')*/);
    Log.debug(TAG, result.goodSegments.length + ' possible segments after lower bound filter: ', /* result.goodSegments.map(s => s.lowerBoundDistance + ' (' + s.title + ')')*/);
    Log.debug(TAG, result.goodActivities.length + ' possible own activities after lower bound filter: ', /* result.goodSegments.map(s => s.lowerBoundDistance + ' (' + s.title + ')')*/);

    return result;
};

/**
 * Combine routes and segments into combos (combinations that are, when combined
 * in a route, still shorter in the lower bound than the max distance
 */
const combine = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Combine ==');

    let start = {
        name: 'start',
        start: [query.start.lat, query.start.lng],
        end: [query.start.lat, query.start.lng],
        distance: 0,
        successors: [],
        lowerBoundDistance: 0,
        inv: '',
        isActivity: false,
        isInv: false,
        firstGeo: 0,
        lastGeo: 0,
        id: 0,
        route: null,
    };
    let end = {
        name: 'end',
        start: [query.end.lat, query.end.lng],
        end: [query.end.lat, query.end.lng],
        disatnce: 0,
        successors: [],
        lowerBoundDistance: 0,
        inv: '',
        isActivity: false,
        isInv: false,
        firstGeo: 0,
        lastGeo: 0,
        id: 0,
        route: null,
    };

    let routeNodes = generateNodes(result.goodRoutes, false, query);
    let segmentNodes = generateNodes(result.goodSegments, false, query);
    let activityNodes = generateNodes(result.goodActivities, true, query);

    let nodes = [];
    nodes.push.apply(nodes, routeNodes);
    nodes.push.apply(nodes, segmentNodes);

    connectNodes(start, end, nodes);
    let explorativeResultPaths = makeComboPaths(start, end, nodes, query, false);
    let explorativePathLength = 0;
    let explorativePathComponentCount = 0;
    explorativeResultPaths.forEach((path) => {
        explorativePathLength += path.distance;
        explorativePathComponentCount += path.path.length;
    });
    Log.debug(TAG, 'Found ' + explorativeResultPaths.length + ' explorative parths paths with average distance ' + explorativePathLength / explorativeResultPaths.length
        + ' and ' + explorativePathComponentCount / explorativeResultPaths.length + ' components');

    nodes = [];
    nodes.push.apply(nodes, activityNodes);
    nodes.push.apply(nodes, routeNodes);
    connectNodes(start, end, nodes);
    let familiarResultPaths = makeComboPaths(start, end, nodes, query, activityNodes.length > 2);

    // If this did not work out, try again with the segments added
    if (familiarResultPaths.length === 0) {
        nodes = [];
        nodes.push.apply(nodes, activityNodes);
        nodes.push.apply(nodes, routeNodes);
        nodes.push.apply(nodes, segmentNodes);
        connectNodes(start, end, nodes);
        familiarResultPaths = makeComboPaths(start, end, nodes, query, activityNodes.length > 2);
    }

    let familiarPathLength = 0;
    let familiarPathComponentCount = 0;
    familiarResultPaths.forEach((path) => {
        familiarPathLength += path.distance;
        familiarPathComponentCount += path.path.length;
    });
    Log.debug(TAG, 'Found ' + familiarResultPaths.length + ' familair parths paths with average distance ' + familiarPathLength / familiarResultPaths.length
        + ' and ' + familiarPathComponentCount / familiarResultPaths.length + ' components');

    for (let pathObject of explorativeResultPaths) {
        const comboObject = {
            lowerBoundDistance: pathObject.distance,
            explorative: true,
            mixed: true,
            parts: pathObject.path
        };
        result.explorativeCombos.push(comboObject);
    }

    for (let pathObject of familiarResultPaths) {
        const comboObject = {
            lowerBoundDistance: pathObject.distance,
            explorative: false,
            mixed: true,
            parts: pathObject.path
        };
        result.familiarCombos.push(comboObject);
    }

    result.metadata.combine.push(result.explorativeCombos.length, result.familiarCombos.length, explorativePathComponentCount / explorativeResultPaths.length, familiarPathComponentCount / familiarResultPaths.length);

    Log.debug(TAG, result.explorativeCombos.length + ' explorative combos generated');
    Log.debug(TAG, result.familiarCombos.length + ' familiar combos generated');

    return result;
};

/**
 * Sort combos on the lower bound total distance in descending order
 */
const sortAndReduce = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Sort and Reduce ==');

    result.explorativeCombos.sort(function (a, b) {
        return (b.parts.length * 1000000 + b.lowerBoundDistance) - (a.parts.length * 1000000 + a.lowerBoundDistance);
    });

    result.familiarCombos.sort(function (a, b) {
        return b.lowerBoundDistance - a.lowerBoundDistance;
    });

    // reduce the list of explorative combos to a fixed number
    const keepBest = 1;
    while (result.explorativeCombos.length > keepBest) {
        let indexFromStart = result.explorativeCombos[0];
        let indexFromEnd = result.explorativeCombos[result.explorativeCombos.length - 1];
        if (indexFromStart.lowerBoundDistance - query.distance > query.distance - indexFromEnd.lowerBoundDistance) {
            result.explorativeCombos = result.explorativeCombos.slice(1, result.explorativeCombos.length);    // remove item form the beginning
        } else {
            result.explorativeCombos = result.explorativeCombos.slice(0, result.explorativeCombos.length - 1);    // remove item from the end
        }
    }

    // reduce the list of familiar combos to a fixed number
    while (result.familiarCombos.length > keepBest) {
        let indexFromStart = result.familiarCombos[0];
        let indexFromEnd = result.familiarCombos[result.familiarCombos.length - 1];
        if (indexFromStart.lowerBoundDistance - query.distance > query.distance - indexFromEnd.lowerBoundDistance) {
            result.familiarCombos = result.familiarCombos.slice(1, result.familiarCombos.length);    // remove item form the beginning
        } else {
            result.familiarCombos = result.familiarCombos.slice(0, result.familiarCombos.length - 1);    // remove item from the end
        }
    }

    result.metadata.sortAndReduce.push(result.explorativeCombos.length, result.familiarCombos.length);

    Log.debug(TAG, result.explorativeCombos.length + ' filtered explorative combos: ', result.explorativeCombos.map(r => r.lowerBoundDistance + ' m (' + r.parts.length + ' parts)'));
    Log.debug(TAG, result.familiarCombos.length + ' filtered familiar combos: ', result.familiarCombos.map(r => r.lowerBoundDistance + ' m (' + r.parts.length + ' parts)'));

    return result;
};

/**
 * Populates the remaining routes and generates with the full geo data
 */
const populate = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Populate ==');

    for (let ci = 0; ci < result.explorativeCombos.length; ci++) {
        let combo = result.explorativeCombos[ci];
        for (let pi = 0; pi < combo.parts.length; pi++) {
            let part = combo.parts[pi];

            // make sure every part of every combo has the geo field populated
            if (part.id !== 0) {
                result.explorativeCombos[ci].parts[pi].route = await Route.load(part.id);
            }
            if (part.isInv) {
                result.explorativeCombos[ci].parts[pi].route.geo.reverse();
            }
        }
    }

    for (let ci = 0; ci < result.familiarCombos.length; ci++) {
        let combo = result.familiarCombos[ci];
        for (let pi = 0; pi < combo.parts.length; pi++) {
            let part = combo.parts[pi];

            // make sure every part of every combo has the geo field populated
            if (part.id !== 0) {
                if (part.isActivity) {
                    result.familiarCombos[ci].parts[pi].route = await query.user.activities.find((act) => act._id === part.id);
                } else {
                    result.familiarCombos[ci].parts[pi].route = await Route.load(part.id);
                }
                if (part.isInv) {
                    result.explorativeCombos[ci].parts[pi].route.geo.reverse();
                }
            }
        }
    }

    result.metadata.populate.push(result.explorativeCombos.length, result.familiarCombos.length);

    Log.debug(TAG, result.explorativeCombos.length + ' explorative combos have been populated');
    Log.debug(TAG, result.familiarCombos.length + ' familiar combos have been populated');

    return result;
};

/**
 * Generate candidates from a 3rd party routing service using combos
 */
const generateCandidates = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Generate Candidates ==');
    if (result.explorativeCombos.length === 0 || result.familiarCombos.length === 0) {
        result.candidates = [];
        result.familiarCandidates = [];
        return result;
    }

    let explorativeRoutes = [];
    let familiarRoutes = [];

    let allCombos = result.explorativeCombos.concat(result.familiarCombos);

    // for every combo, generate a route
    for (let combo of allCombos) {

        // start with the starting point
        let coordinates = [{
            'coordinates': [
                query.start.lng,
                query.start.lat
            ],
            'type': 'Point'
        }];

        let geosTotal = 0;
        for (let part of combo.parts) {
            if (part.id !== 0) {
                geosTotal += part.route.geo.length;
            }
        }
        let ratio = 23 / geosTotal;

        // add all waypoints of the segment/route
        for (let part of combo.parts) {
            if (part.id !== 0) {
                const maxAllowedWaypoints = Math.max(Math.floor(part.route.geo.length * ratio), 2);
                let keepEvery = Math.ceil(part.route.geo.length / (maxAllowedWaypoints - 2));
                if (keepEvery > 1) {
                    // we have too many waypoints, downsample to something smaller
                    keepEvery = Math.ceil(keepEvery);
                    const waypointsTemp = Object.assign([], part.route.geo);
                    part.route.geo = [waypointsTemp[0]];     // start point must not be deleted
                    let counter = 0;

                    for (let wp of waypointsTemp) {
                        if (counter % keepEvery === 0 && coordinates.length + part.route.geo.length + 2 < 25) {
                            part.route.geo.push(wp);
                        }
                        ++counter;
                    }
                    part.route.geo.push(waypointsTemp[waypointsTemp.length - 1]);   // end point must also definitely be a waypoint
                }
                coordinates = coordinates.concat(part.route.geo.map(g => g.location));
            }
        }

        // add the end point last
        coordinates.push({
            'coordinates': [
                query.end.lng,
                query.end.lat
            ],
            'type': 'Point'
        });

        Log.debug(TAG, 'READY for OSRM: ' + coordinates.length);

        let route = await osrm.findRoute({waypoints: coordinates});
        if (route.distance > 0) {
            // save what parts are included in this route
            route.parts = combo.parts;

            // add this route to the list of all generated routes
            if (combo.explorative) {
                explorativeRoutes.push(route);
            } else {
                familiarRoutes.push(route);
            }
        }
    }

    // sort the resulting routes by distance
    explorativeRoutes.sort(function (a, b) {
        return Math.abs(b.distance - query.distance) - Math.abs(a.distance - query.distance);
    });

    // sort the resulting routes by distance
    familiarRoutes.sort(function (a, b) {
        return Math.abs(b.distance - query.distance) - Math.abs(a.distance - query.distance);
    });


    // only keep the best n routes by removing items form the front and end of the array
    const keepBest = 1;
    while (explorativeRoutes.length > keepBest) {
        let indexFromStart = explorativeRoutes[0];
        let indexFromEnd = explorativeRoutes[explorativeRoutes.length - 1];
        if (indexFromStart.distance - query.distance > query.distance - indexFromEnd.distance) {
            explorativeRoutes = explorativeRoutes.slice(1, explorativeRoutes.length);    // remove item form the beginning
        } else {
            explorativeRoutes = explorativeRoutes.slice(0, explorativeRoutes.length - 1);    // remove item from the end
        }
    }

    // only keep the best n routes by removing items form the front and end of the array
    while (familiarRoutes.length > keepBest) {
        let indexFromStart = familiarRoutes[0];
        let indexFromEnd = familiarRoutes[familiarRoutes.length - 1];
        if (indexFromStart.distance - query.distance > query.distance - indexFromEnd.distance) {
            familiarRoutes = familiarRoutes.slice(1, familiarRoutes.length);    // remove item form the beginning
        } else {
            familiarRoutes = familiarRoutes.slice(0, familiarRoutes.length - 1);    // remove item from the end
        }
    }

    result.candidates = explorativeRoutes;
    result.familiarCandidates = familiarRoutes;
    result.metadata.generateCandidates.push(result.candidates.length, result.familiarCandidates.length);

    Log.debug(TAG, explorativeRoutes.length + ' explorative routes generated by OSRM: ', explorativeRoutes.map(r => r.distance));
    Log.debug(TAG, familiarRoutes.length + ' familiar routes generated by OSRM: ', familiarRoutes.map(r => r.distance));

    return result;
};

/**
 * Filters the generated routes to only leave ones that are mostly familiar
 */
const familiarityFilter = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Familiarity Filter ==');

    if (result.candidates.length === 0 || result.familiarCandidates.length === 0) {
        return result;
    }

    for (let route of result.candidates.concat(result.familiarCandidates)) {
        let leave = 50;
        if (route.waypoints.length < leave) {
            leave = route.waypoints.length;
        }
        const takeEvery = Math.ceil(route.waypoints.length / leave);    // parameter for performance, only take every xth route point, 1 = every

        Log.debug(TAG, 'total: ' + route.waypoints.length + ', leave: ' + leave + ', take every: ' + takeEvery);

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
                    distance: 400,
                    latitude: waypoint[1],
                    longitude: waypoint[0]
                };

                let geos = await Geo.findWithinRadius(options);
                if (!geos) {
                    continue;
                }

                let matching = geos.some(function (geo) {
                    if (exploredGeos.includes(geo._id.toString())) {
                        return true;
                    }
                });

                if (matching) {
                    matches++;
                }
            }
        }
        Log.debug(TAG, 'matches: ' + matches);
        route.familiarityScore = matches / leave;
    }

    // sort explorative candidates by ascending familiarity
    result.candidates.sort(function (a, b) {
        return a.familiarityScore - b.familiarityScore;
    });

    // sort familiar candidates by descending familiarity
    result.familiarCandidates.sort(function (a, b) {
        return b.familiarityScore - a.familiarityScore;
    });

    const keepBest = 2;

    if (result.candidates.length) {
        result.candidates = result.candidates.slice(0, keepBest);
        Log.debug(TAG, 'Explorative route has familiarity score ' + result.candidates[0].familiarityScore);
    }

    if (result.familiarCandidates.length) {
        result.familiarCandidates = result.familiarCandidates.slice(0, keepBest);
        Log.debug(TAG, 'Familiar route has familiarity score ' + result.familiarCandidates[0].familiarityScore);
    }

    result.metadata.familiarityFilter.push(result.candidates.length, result.familiarCandidates.length);

    return result;
};

/**
 * Create Route objects from the generated candidates
 */
const createRoutes = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Create Routes ==');

    if (result.candidates.length === 0 || result.familiarCandidates.length === 0) {
        return result;
    }

    let generatedRoutes = [];
    let familiarityScores = [];

    for (let candidate of result.candidates.concat(result.familiarCandidates)) {
        // get the user
        const title = 'New Route (' + Math.floor(candidate.distance / 1000) + ' km)';
        const description = 'This route has been generated. Select this route and change the title and description.';
        let id = routes.makeid({
            title: title,
            distance: candidate.distance,
            start: candidate.waypoints[0],
            end: candidate.waypoints[candidate.waypoints.length - 1]
        });

        for (let i = 0; i < candidate.parts.length; ++i) {
            if (candidate.parts[i].id !== 0) {
                if (candidate.parts[i].route.isActivity) {
                    candidate.parts.splice(i, 1);
                }
            }
        }

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
            parts: candidate.parts.map((p) => p.route).slice(1, candidate.parts.length - 1)
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
        let i = 0;
        for (let waypoint of candidate.waypoints) {
            const geo = new Geo({
                name: 'Generated',
                altitude: ++i,
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

        // asynchronously export the route as gpx
        importExport.exportRoute({
            routeData: route,
            query: {},
        });

        Log.log(TAG, 'Created new route (' + route.title + ', with ' + route.geo.length + ' waypoints and  ' + route.parts.length + ' parts)');

        generatedRoutes.push(route);
        familiarityScores.push(candidate.familiarityScore);
    }

    result.resultRoutes = generatedRoutes;
    result.familiarityScores = familiarityScores;

    return result;
};

const respond = async function (query, result) {
    Log.debug(TAG, '');
    Log.log(TAG, '== Respond ==');

    if (result.resultRoutes.length === 0) {
        query.response.json({
            err: 'Could not generate routes for the given parameters'
        });
        return;
    }

    let resultRoutes = result.resultRoutes;
    let ratings = [];
    for (let r of resultRoutes) {
        let o = {
            route: r._id,
            rating: 0,
            comment: '',
        };
        ratings.push(o);
    }

    let creatorResult = new CreatorResult(
        {
            user: query.user._id,
            query: {
                distance: query.distance,
                start: query.start,
                end: query.end,
                roadType: query.roadType,
                preference: query.preference,
                metadata: result.metadata,
            },
            generatedRoutes: resultRoutes,
            familiarityScores: result.familiarityScores,
            routeRatings: ratings,
            acceptedRoutes: [],
        });

    query.user.creatorResults.push(creatorResult._id);
    await query.user.save();
    await creatorResult.save();
    let cr = await CreatorResult.load(creatorResult._id);
    query.response.json(cr);
    return result;
};


/** Helper Methods **/

/**
 * Generates path through the graph
 * @param source the current start point
 * @param destination the goal node (end)
 * @param localPathList path of the local DFS run
 * @param localDistance distance of the local DFS
 * @param maxDepth maximum number of nodes
 * @param minDepth minimum number of nodes
 * @param maxDistance maximum distance of the generated path
 * @param resultPaths global result list
 * @param stopAfter number of paths to look for before terminating
 * @param requireActivity only generate paths that contain an activity node
 * @param requireNoInv only generate paths that do not contain inverted nodes of included nodes
 */
const printAllPathsUntil = function (source, destination, localPathList, localDistance, maxDepth, minDepth, maxDistance, resultPaths, stopAfter, requireActivity, requireNoInv) {
    source.isVisited = true;
    if (source === destination && localPathList.length >= minDepth && resultPaths.length < stopAfter) {
        let found = true;
        if (requireActivity) {
            found = false;
            for (let node of localPathList) {
                if (node.isActivity) {
                    found = true;
                }
            }
        }
        if (found) {
            const clonePath = localPathList.slice();
            resultPaths.push({
                path: clonePath,
                distance: localDistance
            });
        }
    }

    let activityContained = false;
    activityContained = resultPaths.forEach((r) => {
        activityContained |= r.path.some((p) => p.isActivity);
    });

    // Recur for all the vertices adjacent to current vertex
    source.successors.slice(0, 60).forEach(function (succ) {

        if (activityContained && succ.node.isActivity) {
            Log.debug(TAG, 'Activity already contained');
            if (Math.random() < 0.7) {
                return;
            }
        }

        if (requireNoInv) {
            if (localPathList.filter((node) => {
                return (node.name === '(inv) ' + succ.node.name || succ.node.name === '(inv) ' + node.name);
            }).length > 0) {
                return;
            }
        }

        // Don't go the same part twice
        if (localPathList.includes(succ.node)) {
            return;
        }

        // Distance between two parts should not bee too long and not too short
        if (succ.distance > maxDistance / 3 || succ.distance < maxDistance / 100) {
            return;
        }

        // If the distance to the start of the successor is longer than to the end, do not take this
        const distToStart = geolib.getDistance({
            latitude: source.end[0],
            longitude: source.end[1]
        }, {
            latitude: succ.node.start[0],
            longitude: succ.node.start[1]
        });
        const distToEnd = geolib.getDistance({
            latitude: source.end[0],
            longitude: source.end[1]
        }, {
            latitude: succ.node.end[0],
            longitude: succ.node.end[1]
        });

        if (distToStart > distToEnd) {
            return;
        }

        // abort if algorithm parameters are violated
        const currDist = localDistance + source.distance + succ.distance;
        if (currDist >= maxDistance || localPathList.length >= maxDepth || resultPaths.length >= stopAfter) {
            return;
        }

        // prevent cycles going through the same track
        if (!succ.node.isVisited) {
            const addedDistance = source.distance + succ.distance;
            localPathList.push(succ.node);
            printAllPathsUntil(succ.node, destination, localPathList, localDistance + addedDistance, maxDepth, minDepth, maxDistance, resultPaths, stopAfter, requireActivity, requireNoInv);
            localPathList.splice(localPathList.indexOf(succ.node), 1);
        }
    });
    source.isVisited = false;
};

function routeActivitySimilarityFilter (r, a) {
    const distanceDelta = Math.abs(r.distance - a.distance);

    // when they are too different in terms of total distance, they are not similar
    if (distanceDelta > r.distance * 0.2) {
        return true;
    }


    let startPointRoute = [];
    let endPointRoute = [];
    if (r.geo) {
        startPointRoute = [r.geo[0].location.coordinates[1], r.geo[0].location.coordinates[0]];
        endPointRoute = [r.geo[r.geo.length - 1].location.coordinates[1], r.geo[r.geo.length - 1].location.coordinates[0]];
    }
    else {
        return true;
    }

    let startPointActivity = [];
    let endPointActivity = [];
    if (a.geo) {
        startPointActivity = [a.geo[0].location.coordinates[1], a.geo[0].location.coordinates[0]];
        endPointActivity = [a.geo[a.geo.length - 1].location.coordinates[1], a.geo[a.geo.length - 1].location.coordinates[0]];
    }
    else {
        return true;
    }

    const distanceOfStarts = geolib.getDistance(
        {latitude: startPointRoute[0], longitude: startPointRoute[1]},
        {latitude: startPointActivity[0], longitude: startPointActivity[1]}
    );

    const distanceOfEnds = geolib.getDistance(
        {latitude: endPointRoute[0], longitude: endPointRoute[1]},
        {latitude: endPointActivity[0], longitude: endPointActivity[1]}
    );

    const endsFarAppart = distanceOfStarts > 500 || distanceOfEnds > 500;
    if (endsFarAppart) {
        return true;
    } else {
        Log.debug(TAG, 'Route is too similar to activity ' + distanceOfStarts + ' ' + distanceOfEnds + r.title + ', ' + a.title);
    }
}

function roundCourseFilter (r) {
    let startPoint = [];
    let endPoint = [];
    if (!r.isRoute && !r.isActivity) {
        startPoint = r.strava.start_latlng;
        endPoint = r.strava.end_latlng;
    } else {
        if (r.geo) {
            startPoint = [r.geo[0].location.coordinates[1], r.geo[0].location.coordinates[0]];
            endPoint = [r.geo[r.geo.length - 1].location.coordinates[1], r.geo[r.geo.length - 1].location.coordinates[0]];
        }
        else {
            return true;
        }
    }
    const distance = geolib.getDistance(
        {latitude: startPoint[0], longitude: startPoint[1]},
        {latitude: endPoint[0], longitude: endPoint[1]}
    );
    return distance > r.distance / 4;
}

function generateNodes (routes, isActivity) {
    let nodes = [];

    // add the original routes
    for (let route of routes) {
        let start, end;
        if (route.strava.start_latlng) {
            start = route.strava.start_latlng;
            end = route.strava.end_latlng;
        } else {
            start = [route.geo[0].location.coordinates[1], route.geo[0].location.coordinates[0]];
            end = [route.geo[route.geo.length - 1].location.coordinates[1], route.geo[route.geo.length - 1].location.coordinates[0]];
        }

        let startGeo = 'T0';
        let endGeo = 'T3';

        let partitions = [startGeo, endGeo];

        for (let i = 0; i < partitions.length - 1; ++i) {
            for (let j = i + 1; j < partitions.length; ++j) {
                const partitionStart = partitions[i];
                const partitionEnd = partitions[j];

                let node = {
                    name: route.title,
                    start: start,
                    end: end,
                    distance: route.distance,
                    lowerBoundDistance: route.lowerBoundDistance,
                    successors: [],
                    inv: null,
                    isActivity: isActivity,
                    isInv: false,
                    firstGeo: partitionStart,
                    lastGeo: partitionEnd,
                    id: route._id,
                    route: null,
                };
                let nodeInv = {
                    name: '(inv) ' + route.title,
                    start: start,
                    end: end,
                    distance: route.distance,
                    lowerBoundDistance: route.lowerBoundDistance,
                    successors: [],
                    inv: node.name,
                    isActivity: isActivity,
                    isInv: true,
                    firstGeo: partitionEnd,
                    lastGeo: partitionStart,
                    id: route._id,
                    route: null,
                };
                node.inv = nodeInv.name;
                nodes.push(node, nodeInv);
            }
        }
    }
    return nodes;
}

function connectNodes (start, end, nodes) {
    start.successors = [];
    nodes.forEach(function (node) {
        node.successors = [];
        start.successors.push({
            node: node,
            distance: geolib.getDistance(
                {latitude: start.end[0], longitude: start.end[1]},
                {latitude: node.start[0], longitude: node.start[1]}
            )
        });

        node.successors.push({
            node: end,
            distance: geolib.getDistance(
                {latitude: node.end[0], longitude: node.end[1]},
                {latitude: end.start[0], longitude: end.start[1]}
            )
        });
        nodes.forEach(function (innerLoopNode) {
            if (node.inv !== '(inv) ' + innerLoopNode.name && (innerLoopNode.name !== '(inv) ' + node.inv)) {
                node.successors.push({
                    node: innerLoopNode,
                    distance: geolib.getDistance(
                        {latitude: node.end[0], longitude: node.end[1]},
                        {latitude: innerLoopNode.start[0], longitude: innerLoopNode.start[1]}
                    )
                });
            }
        });
    });
}

function makeComboPaths (start, end, nodes, query, requireActivity) {
    Log.debug(TAG, 'Make combo paths');

    let resultPaths = [];
    let distance = query.distance;
    if (requireActivity) {
        distance += query.distance * 0.3;
    }
    let useParts = Math.floor(Math.min(Math.max(distance / 30000, 1), 2));
    const minDepthOriginal = 2 + useParts;
    const stopAfter = 1;

    for (let i = 0; i < 7; ++i) {
        const minDepth = minDepthOriginal + (i % 3);
        const maxDepth = Math.min(Math.ceil(minDepth * 1.5), 5) + (i % 3);

        let localResultPaths = [];
        let pathList = [];
        pathList.push(start);

        // Log.debug(TAG, 'Starting DFS with parameters: minDepth = ' + minDepth + ', maxDepth = ' + maxDepth + ', maxDistance = ' + distance);

        let requireNoInv = resultPaths.length < 1 || i < 3;

        printAllPathsUntil(start, end, pathList, 0, maxDepth, minDepth, distance, localResultPaths, stopAfter, requireActivity, requireNoInv);
        resultPaths.push.apply(resultPaths, localResultPaths);
        start.successors.sort(function (a, b) {
            return b.node.lowerBoundDistance * (Math.random() * (1.2 - 0.8) + 0.8).toFixed(1)
                - a.node.lowerBoundDistance * (Math.random() * (1.2 - 0.8) + 0.8).toFixed(1);
        });
        start.isVisited = false;

        if (i % 3 === 2) {
            // rough sorting
            nodes.slice(0, 100).forEach(function (node) {
                node.isVisited = false;
                node.successors.sort(function (a, b) {
                    return b.node.lowerBoundDistance * (Math.random() * (1.2 - 0.8) + 0.8).toFixed(1)
                        - a.node.lowerBoundDistance * (Math.random() * (1.2 - 0.8) + 0.8).toFixed(1);
                });
            });
        }
    }

    // remove the duplicates
    let seen = [];
    resultPaths = resultPaths.filter((path) => {
        const okay = !seen.includes(path.distance);
        seen.push(path.distance);
        return okay;
    });
    return resultPaths;
}

