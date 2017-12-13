'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const {wrap: async} = require('co');
const {respond} = require('../utils');
const Route = mongoose.model('Route');

/**
 * List items tagged with a tag
 */

exports.index = async(function* (req, res) {
    const criteria = {tags: req.params.tag};
    const page = (req.params.page > 0 ? req.params.page : 1) - 1;
    const limit = 30;
    const options = {
        limit: limit,
        page: page,
        criteria: criteria
    };

    const routes = yield Route.list(options);
    const count = yield Route.count(criteria);

    respond(res, 'routes/index', {
        title: 'Routes tagged ' + req.params.tag,
        routes: routes,
        page: page + 1,
        pages: Math.ceil(count / limit)
    });
});
