'use strict';
const Log = require('../../app/utils/logger');
const TAG = 'auth';

/*
 *  Generic require login routing middleware
 */
exports.requiresLogin = function (req, res, next) {
    if (req.isAuthenticated()) return next();
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    res.status(400).json({
        error: 'No user logged in',
        flash: {
            text: 'Action requires logged in user, please log in',
            type: 'info'
        }
    });
};

/*
 * Generic admin only routing middleware
 */
exports.userOnly = function (req, res, next) {
    if (req.user.role !== 'admin') {
        return next();
    } else {
        return res.status(401).json({
            error: 'Unauthorized action',
            flash: {
                text: 'This action is allowed by users only',
                type: 'error'
            }
        });
    }
};

/*
 * Generic admin only routing middleware
 */
exports.adminOnly = function (req, res, next) {
    if (req.user.role === 'admin') {
        return next();
    } else {
        return res.status(401).json({
            error: 'Unauthorized action',
            flash: {
                text: 'This action is allowed by system admins only',
                type: 'error'
            }
        });
    }
};

/*
 *  User authorization routing middleware
 */
exports.user = {
    hasAuthorization: function (req, res, next) {
        if (req.user.role === 'admin') {
            // admin can do anything with any user
            return next();
        }
        if (req.profile) {
            if (req.profile.id !== req.user.id) {
                return res.status(401).json({
                    error: 'Unauthorized action',
                    flash: {
                        text: 'You are not authorized',
                        type: 'error'
                    }
                });
            }
        }
        next();
    }
};

/*
 *  Route authorization routing middleware
 */
exports.route = {
    hasAuthorization: function (req, res, next) {
        if (req.user.role === 'admin' || (!req.routeData.user && req.routeData.isGenerated)) {
            // admin can do anything with any route
            return next();
        }
        if (!req.routeData.user && !req.routeData.isGenerated) {
            req.flash('info', 'You are not authorized');
            return res.status(401).json({
                error: 'Unauthorized action',
                flash: {
                    text: 'You are not authorized',
                    type: 'error'
                }
            });
        }
        if (req.routeData.user.id !== req.user.id) {
            req.flash('info', 'You are not authorized');
            return res.status(401).json({
                error: 'Unauthorized action',
                flash: {
                    text: 'You are not authorized',
                    type: 'error'
                }
            });
        }
        next();
    }
};

/**
 * Comment authorization routing middleware
 */
exports.comment = {
    hasAuthorization: function (req, res, next) {
        if (req.user.role === 'admin') {
            // admin can do anything with any comment
            return next();
        }
        if (req.user.id === req.comment.user.id || req.user.id === req.routeData.user.id) {
            next();
        } else {
            req.flash('info', 'You are not authorized');
            res.redirect('/routes/' + req.routeData.id);
        }
    }
};
