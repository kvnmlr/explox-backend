'use strict';

const Log = require('../utils/logger');
const TAG = "controllers/routes";

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
 * Load
 */

exports.load_options = async(function* (req, res, next, id) {
    try {
        req.article = yield Route.load(id);
        if (!req.article) return next(new Error('Route not found'));
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
    const limit = 30;
    const options = {
        limit: limit,
        page: page
    };

    if (_id) options.criteria = {_id};

    const routes = yield Route.list(options);
    const count = yield Route.count();
    respond(res, 'routes/index', {
        title: 'Routes',
        routes: routes,
        page: page + 1,
        pages: Math.ceil(count / limit)
    });
});

/**
 * New article
 */

exports.new = function (req, res) {
    res.render('routes/new', {
        title: 'New Route',
        article: new Route()
    });
};

/**
 * Create an article
 * Upload an image
 */

exports.create = async(function* (req, res) {
    const article = new Route(only(req.body, 'title body tags'));
    article.user = req.user;
    try {
        yield article.uploadAndSave(req.file);
        respondOrRedirect({req, res}, `/routes/${article._id}`, article, {
            type: 'success',
            text: 'Successfully created article!'
        });
    } catch (err) {
        respond(res, 'routes/new', {
            title: article.title || 'New Route',
            errors: [err.toString()],
            article
        }, 422);
    }
});

/**
 * Edit an article
 */

exports.edit = function (req, res) {
    res.render('routes/edit', {
        title: 'Edit ' + req.article.title,
        article: req.article
    });
};

/**
 * Update article
 */

exports.update = async(function* (req, res) {
    const article = req.article;
    assign(article, only(req.body, 'title body tags'));
    try {
        yield article.uploadAndSave(req.file);
        respondOrRedirect({res}, `/routes/${article._id}`, article);
    } catch (err) {
        respond(res, 'routes/edit', {
            title: 'Edit ' + article.title,
            errors: [err.toString()],
            article
        }, 422);
    }
});

/**
 * Show
 */

exports.show = function (req, res) {
    if (req.user) {
        User.load_full(req.user._id, {}, function(err, user) {
            if (user) {
                const geos = Strava.activitiesToGeos(user.activities);
                const exploredMap = Map.generateExploredMapData(geos);
                const map = Map.generateRouteMap(req.article.geo);
                map.distance = req.article.distance;
                respond(res, 'routes/show', {
                    title: req.article.title,
                    article: req.article,
                    map: exploredMap,
                    routeMaps: [map, {routeData: [",", ","]}, {routeData: [",", ","]}, {routeData: [",", ","]}, {routeData: [",", ","]}],
                    hasRoute: true,
                    foundRoutes: false,
                    numRoutes: 0
                });
            }
        })
    } else {
        const map = Map.generateRouteMap(req.article.geo, null);
        respond(res, 'routes/show', {
            title: req.article.title,
            article: req.article,
            map: map
        });
    }


};

exports.userSavedChoice = async(function* (req, res) {
    //Log.debug(TAG, "genr", )
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
                routes.push(route[0]);
            }
        } else {
            Route.delete(generatedRoutes[index].id, function (err) {
                if (err) {
                    Log.error(TAG, "Remove failed");
                    return;
                }
                Log.debug(TAG, "delete worked");
            });
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
 * Delete an article
 */

exports.destroy = async(function* (req, res) {
    yield req.article.remove();
    respondOrRedirect({req, res}, '/routes', {}, {
        type: 'info',
        text: 'Deleted successfully'
    });
});



exports.makeid = function (route) {
    let hash = Math.ceil(route.distance * route.start[0] * route.start[1] * route.end[0] * route.end[1] * 1000);

    if (route.title.length === 0) {
        return hash;
    }
    for (let i = 0; i < route.title.length; i++) {
        const char = route.title.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
};