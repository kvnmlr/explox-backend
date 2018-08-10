'use strict';

/*
 *  Generic require login routing middleware
 */

exports.requiresLogin = function (req, res, next) {
    if (req.isAuthenticated()) return next();
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    res.status(400).json({
        error: 'No user logged in',
        flash: 'Action requires logged in user, please log in'
    });
};

exports.adminOnly = function (req, res, next) {
    if (req.user.role === 'admin') {
        return next();
    } else {
        return res.status(401).json({
            error: 'Unauthorized action',
            flash: 'This action is allowed by system admins only'
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
                    flash: 'You are not authorized'
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
        if (req.user.role === 'admin') {
            // admin can do anything with any route
            return next();
        }
        if (!req.routeData.user) {
            req.flash('info', 'You are not authorized');
            return res.status(401).json({
                error: 'Unauthorized action',
                flash: 'You are not authorized'
            });
        }
        if (req.routeData.user.id !== req.user.id) {
            req.flash('info', 'You are not authorized');
            return res.status(401).json({
                error: 'Unauthorized action',
                flash: 'You are not authorized'
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
