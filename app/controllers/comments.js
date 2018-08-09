'use strict';

/**
 * Module dependencies.
 */

const {wrap: async} = require('co');
const {respondOrRedirect} = require('../utils');
const Log = require('../utils/logger');

/**
 * Load comment
 */

exports.load_options = function (req, res, next, id) {
    req.comment = req.routeData.comments
        .find(comment => comment.id === id);

    if (!req.comment) return next(new Error('Comment not found'));
    next();
};

/**
 * Create comment
 */

exports.create = async(function* (req, res) {
    const route = req.routeData;
    yield route.addComment(req.user, req.body.comment);
    res.json({});
});

/**
 * Delete comment
 */

exports.destroy = async(function* (req, res) {
    yield req.routeData.removeComment(req.body.commentId);
    req.flash('info', 'Removed comment');
    res.redirect('/routes/' + req.routeData.id);
    res.json({
        flash: 'Your comment has been removed.'
    });

});
