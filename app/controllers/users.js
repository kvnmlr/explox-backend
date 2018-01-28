'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const mailer = require('../mailer/index');
const mongoose = require('mongoose');
const {wrap: async} = require('co');
const {respond} = require('../utils');
const User = mongoose.model('User');
const Role = mongoose.model('Role');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const mailer = require('../mailer/index');

const Strava = require('./strava');
const Map = require('./map');

const TAG = "views/users";
/**
 * Load
 */

exports.load_options = async(function* (req, res, next, _id) {
    const criteria = {_id};
    try {
        req.profile = yield User.load_options({criteria});
        if (!req.profile) return next(new Error('User not found'));
    } catch (err) {
        return next(err);
    }
    next();
});

/**
 * Create user
 */

exports.create = async(function* (req, res) {
    const user = new User(req.body);
    user.provider = 'local';
    user.role = 'user';
    try {
        yield user.save();
        req.logIn(user, err => {
            if (err) req.flash('info', 'Sorry! We are not able to log you in!');
            mailer.registeredConfirmation(user);
            Log.log(TAG, "User " + user.username + " has registered");
            return res.redirect('/');
        });
    } catch (err) {
        const errors = Object.keys(err.errors)
            .map(field => err.errors[field].message);

        res.render('users/signup', {
            title: 'Sign up',
            errors,
            user
        });
    }
});

/**
 *  Show profile
 */

exports.show = async(function* (req, res) {
    const user = req.profile;
    var options = {
        criteria: {'_id': req.profile.role}
    };
    Role.load_options(options, function (err, role) {
        if (role) {
            if (role.name === 'admin') {
                User.list({}, function (err, users) {
                    Route.list({}, function (err, routes) {
                        // Show admin dashboard
                        Activity.list({}, function (err, activities) {
                            respond(res, 'users/show', {
                                title: user.name,
                                user: user,
                                data: 'Admin data goes here',
                                all: users,
                                routes: routes,
                                activities: activities,
                                limits: Strava.getLimits()
                            });
                        });
                    });
                });
            }
            else {
                // Show user profile
                User.load_full({ criteria: { _id: req.user._id } }, function (err, user) {
                    if (user) {
                        const geos = Strava.activitiesToGeos(user.activities);
                        const map = Map.generateExploredMapData(geos);
                        respond(res, 'users/show', {
                            title: user.name,
                            user: user,
                            map: map,
                            userData: 'User data goes here'

                        });
                    }
                });
            }
        }
    }
});

exports.signin = function () {
};

/**
 * Auth callback
 */

exports.authCallback = login;

/**
 * Show login form
 */

exports.login = function (req, res) {
    res.render('users/login', {
        title: 'Login'
    });
};

/**
 * Show sign up form
 */

exports.signup = function (req, res) {
    res.render('users/signup', {
        title: 'Sign up',
        user: new User()
    });
};

/**
 * Logout
 */

exports.logout = function (req, res) {
    req.logout();
    res.redirect('/login');
};

/**
 * Session
 */

exports.session = login;

/**
 * Login
 */

function login(req, res) {
    User.update_user(req.user._id, {lastLogin: Date.now()});
    const redirectTo = req.session.returnTo
        ? req.session.returnTo
        : '/';
    delete req.session.returnTo;
    res.redirect(redirectTo);
}
