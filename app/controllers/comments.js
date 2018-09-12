'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');

exports.load_options = function (req, res, next, id) {
    req.comment = req.routeData.comments
        .find(comment => comment.id === id);

    if (!req.comment) return next(new Error('Comment not found'));
    next();
};

/**
 * Create comment
 */

exports.create = async function (req, res) {
    const route = req.routeData;

    await route.addComment(req.user, req.body.comment);
    res.json({
        comment: {
            body: req.body.comment.body,
            user: req.user,
        },
        flash: {
            text: 'Your comment has been posted',
            type: 'success'
        },
    });
};

/**
 * Delete comment
 */

exports.destroy = async function (req, res) {
    await req.routeData.removeComment(req.comment._id);
    res.json({
        flash: {
            text: 'Your comment has been removed.',
            type: 'success'
        }
    });

};
