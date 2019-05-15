'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/routes';
const mongoose = require('mongoose');
const {wrap: async} = require('co');
const only = require('only');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const assign = Object.assign;

exports.creator = async(function (req, res) {
    // TODO check required API limits
    let limitsOk = true;

    if (!limitsOk) {
        res.status(400).json({
            error: 'Creator currently not available',
            flash: {
                text: 'Creator is currently not available',
                type: 'error'
            }
        });
    }
    res.json({});
});

exports.load_options = async function (req, res, next, id) {
    try {
        // check if it is a route
        req.routeData = await Route.load(id);
        if (!req.routeData) {
            // check if it is an activity
            req.routeData = await Activity.load(id);
            if (!req.routeData) {
                return next(new Error('Route or Activity not found'));
            }        }
    } catch (err) {
        return next(err);
    }
    next();
};

exports.index = async function (req, res) {
    const page = (req.query.page > 0 ? req.query.page : 1) - 1;
    const _id = req.query.item;
    const tag = req.query.tag;
    const distance = req.query.distance;
    const segments = req.query.segments === 'true';
    const limit = 1000;

    let distanceQuery = {$gt: 0};
    if (distance !== '') {
        const dist = parseInt(distance);
        distanceQuery = {$gt: dist - (dist * 0.1), $lt: dist + (dist * 0.1)};
    }

    const options = {
        limit: limit,
        page: page,
        detailed: false,
        criteria: {
            isRoute: (!segments),
            isGenerated: false,
            distance: distanceQuery,
            geo: {$exists: true, $not: {$size: 0}},
        }
    };

    if (_id) options.criteria._id = {_id};
    if (tag) options.criteria.tags = tag;

    const routes = await Route.list(options);
    const count = await Route.count();

    res.json({
        title: 'Routes',
        routes: routes,
        page: page + 1,
        pages: Math.ceil(count / limit)
    });
};

/**
 * Create a new route
 */
exports.create = async function (req, res) {
    const route = new Route();
    assign(route, only(req.body, 'title body'));
    route.tags = req.body.tags.replace(/[\[\]&"]+/g, ''); // eslint-disable-line no-useless-escape

    try {
        await route.save();
        res.json({});
    } catch (err) {
        Log.error(TAG, 'Error saving newly created route', err);
        res.status(400).json({
            error: 'Error while creating the route',
            flash: 'Route could not be created'
        });
    }
};

/**
 * Updates a route
 */
exports.update = async function (req, res) {
    let route = req.routeData;
    assign(route, only(req.body, 'title body rating'));
    route.tags = req.body.tags.replace(/[\[\]&"]+/g, ''); // eslint-disable-line no-useless-escape
    try {
        await route.save();
        res.json({
            flash: {
                type: 'success',
                text: 'The route details have been updated.'
            }
        });
    } catch (err) {
        Log.error(TAG, 'Error saving updated route', err);
        res.status(400).json({
            error: 'Error while updating the route',
            flash: {
                type: 'error',
                text: 'Route could not be updated'
            }
        });
    }
};

/**
 * Responds the route data for the requested route
 */
exports.routeData = function (req, res) {
    res.json({
        route: req.routeData,
    });
};

exports.userSavedChoice = async function (req, res) {
    let generatedRoutes = JSON.parse(req.body.generatedRoutes);
    let keep = JSON.parse(req.body.keep);
    const limit = 10;
    const options = {
        limit: limit,
        page: 1
    };
    let routes = [];
    for (let index = 0; index < generatedRoutes.length; ++index) {
        if (keep.includes(index)) {
            let _id = generatedRoutes[index].id;
            options.criteria = {
                _id: _id
            };
            const route = await Route.list(options);
            if (route.length > 0) {
                route[0].geo = [];
                routes.push(route[0]);
            }
        } else {
            await Route.delete(generatedRoutes[index].id);
        }
    }
    /* respond(res, 'routes/index', {
        title: 'Routes',
        routes: routes,
        page: 1,
        pages: 1
    }); */
};

/**
 * Delete the given route
 */
exports.destroy = async function (req, res) {
    await req.routeData.remove();
    res.json({});
};

/**
 * Create a hash of the given route
 */
exports.makeid = function (route) {
    let hash = Math.ceil(route.distance * route.start[0] * route.start[1] * route.end[0] * route.end[1] * 1000);

    if (route.title.length === 0) {
        return hash;
    }
    for (let i = 0; i < route.title.length; i++) {
        const char = route.title.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};
