'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/routes';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const {wrap: async} = require('co');
const only = require('only');
const {respond, respondOrRedirect} = require('../utils');
const Route = mongoose.model('Route');
const assign = Object.assign;
const Map = require('./map');
const Strava = require('./strava');
const User = mongoose.model('User');

/**
 * Home Page
 */

exports.home = async(function (req, res) {
    res.json({
        text: 'Home text',
    });
});

exports.hub = async(function (req, res) {
    res.json({
        text: 'Hub text',
    });
});

exports.about = async(function (req, res) {
    res.json({
        version: '0.1',
        text: 'About text'
    });
});


/**
 * Load
 */

exports.load_options = async(function* (req, res, next, id) {
    try {
        req.routeData = yield Route.load(id);
        if (!req.routeData) return next(new Error('Route not found'));
    } catch (err) {
        return next(err);
    }
    next();
});

/**
 * List
 */

exports.index = async(function* (req, res) {
    const page = (req.query.page > 0 ? req.query.page : 1) - 1;
    const _id = req.query.item;
    const tag = req.query.tag;
    const segments = req.query.segments === 'true';
    const limit = 30;
    const options = {
        limit: limit,
        page: page,
        detailed: false,
        criteria: {
            isRoute: (!segments),
        }
    };

    console.log(options);

    if (_id) options.criteria._id = {_id};
    if (tag) options.criteria.tags = tag;

    const routes = yield Route.list(options);
    const count = yield Route.count();

    res.json({
        title: 'Routes',
        routes: routes,
        page: page + 1,
        pages: Math.ceil(count / limit)
    });
});

/**
 * New route
 */

exports.new = function (req, res) {
    res.render('routes/new', {
        title: 'New Route',
        route: new Route()
    });
};

/**
 * Create an route
 * Upload an image
 */

exports.create = async(function* (req, res) {
    const route = new Route();
    assign(route, only(req.body, 'title body'));
    route.tags = req.body.tags.replace(/[\[\]&"]+/g, '');

    try {
        yield route.save();
        res.json({});
    } catch (err) {
        console.log(err);
        res.status(500).json({
            error: 'Error while creating the route',
            flash: 'Route could not be created'
        });
    }
});

/**
 * Edit an route
 */

exports.edit = function (req, res) {
    res.render('routes/edit', {
        title: 'Edit ' + req.routeData.title,
        route: req.routeData
    });
};

/**
 * Update route
 */

exports.update = async function (req, res) {
    let route = req.routeData;
    assign(route, only(req.body, 'title body'));
    route.tags = req.body.tags.replace(/[\[\]&"]+/g, '');
    try {
        await route.save();
        res.json({});
    } catch (err) {
        console.log(err);
        res.status(500).json({
            error: 'Error while updating the route',
            flash: 'Route could not be updated'
        });
    }
};

/**
 * Show
 */

exports.show = async(function* (req, res) {
    if (req.user) {
        let user = yield User.load_full(req.user._id, {});
        if (user) {
            const geos = Strava.activitiesToGeos(user.activities);
            const exploredMap = Map.generateExploredMapData(geos);
            const map = Map.generateRouteMap(req.routeData.geo);
            map.distance = req.routeData.distance;
            res.json({
                title: req.routeData.title,
                route: req.routeData,
                map: exploredMap,
                routeMaps: [
                    map,
                    {routeData: ['0', '0']},
                    {routeData: ['0', '0']},
                    {routeData: ['0', '0']},
                    {routeData: ['0', '0']}
                ],
                hasRoute: true,
                foundRoutes: false,
                numRoutes: 0,
                hasGeneratedRoutes: false,
            });
        }
    } else {
        // const exploredMap = Map.generateExploredMapData([]);
        // const map = Map.generateRouteMap(req.route.geo, null);
        res.json({
            title: req.routeData.title,
            route: req.routeData,
            /* map: exploredMap,
            routeMaps: [
                map,
                {routeData: ['0', '0']},
                {routeData: ['0', '0']},
                {routeData: ['0', '0']},
                {routeData: ['0', '0']}
            ], */
            hasRoute: true,
            foundRoutes: false,
            numRoutes: 0,
            hasGeneratedRoutes: false,
        });
    }
});

exports.userSavedChoice = async(function* (req, res) {
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
            const route = yield Route.list(options);
            if (route.length > 0) {
                route[0].geo = [];
                routes.push(route[0]);
            }
        } else {
            yield Route.delete(generatedRoutes[index].id);
        }
    }
    respond(res, 'routes/index', {
        title: 'Routes',
        routes: routes,
        page: 1,
        pages: 1
    });
});

/**
 * Delete an route
 */

exports.destroy = async(function* (req, res) {
    yield req.routeData.remove();
    res.json({});
});


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