'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const {wrap: async} = require('co');
const only = require('only');
const {respond, respondOrRedirect} = require('../utils');
const Route = mongoose.model('Route');
const assign = Object.assign;

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
    respond(res, 'routes/show', {
        title: req.article.title,
        article: req.article
    });
};

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
