'use strict';

/*
 *  Generic require login routing middleware
 */

exports.requiresLogin = function (req, res, next) {
    if (req.isAuthenticated()) return next();
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    res.status(400).json({
        errors: 'No user logged in',
        flash: 'Action requires logged in user, please log in'
    });
};

/*
 *  User authorization routing middleware
 */

exports.user = {
    hasAuthorization: function (req, res, next) {
        if (req.profile.id != req.user.id) {
            req.flash('info', 'You are not authorized');
            return res.redirect('/users/' + req.profile.id);
        }
        next();
    }
};

/*
 *  Route authorization routing middleware
 */

exports.article = {
    hasAuthorization: function (req, res, next) {
        // if it is a segment, it does not have a user. Still nobody should be able to delete segments
        if (!req.article.user) {
            req.flash('info', 'You are not authorized');
            res.status(400).json({
                errors: 'Unauthorized action',
                flash: 'You are not authorized'
            });
        }
        if (req.article.user.id !== req.user.id) {
            req.flash('info', 'You are not authorized');
            res.status(400).json({
                errors: 'Unauthorized action',
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
        // if the current user is comment owner or article owner
        // give them authority to delete
        if (req.user.id === req.comment.user.id || req.user.id === req.article.user.id) {
            next();
        } else {
            req.flash('info', 'You are not authorized');
            res.redirect('/routes/' + req.article.id);
        }
    }
};
