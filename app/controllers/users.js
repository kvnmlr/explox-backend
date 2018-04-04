'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const mongoose = require('mongoose');
const { wrap: async } = require('co');
const { respond } = require('../utils');
const User = mongoose.model('User');
const Role = mongoose.model('Role');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Settings = mongoose.model('Settings');

const mailer = require('../mailer/index');

const Strava = require('./strava');
const Map = require('./map');

const TAG = 'views/users';
/**
 * Load
 */

exports.load_options = async(function* (req, res, next, _id) {
    const criteria = { _id };
    try {
        req.profile = yield User.load_options({ criteria });
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
            Log.log(TAG, 'User ' + user.username + ' has registered');
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
    if (req.user === undefined) {
        res.render('users/login', {
            title: 'Login'
        });
    }

    if (req.user.role === 'admin' && req.profile.role === 'admin') {
        User.list({}, function (err, users) {
            //Log.debug(TAG, "Admin: " + users);
            Route.list({criteria: {isRoute: true, isGenerated: false}}, function (err, routes) {
                Route.list({criteria: {isRoute: true, isGenerated: true}}, function (err, generated) {
                    //Log.debug(TAG, "Routes: " + users);
                    // Show admin dashboard
                    Activity.list({}, function (err, activities) {
                        //Log.debug(TAG, "Activities: " + activities);
                        Route.list({criteria: {isRoute: false}}, function(err, segments) {
                            //Log.debug(TAG, "Segments: " + segments);
                            Strava.getLimits(function (err, apiLimits) {
                                respond(res, 'users/show_admin', {
                                    title: user.name,
                                    user: user,
                                    data: 'Admin data goes here',
                                    all: users,
                                    routes: routes,
                                    generated: generated,
                                    segments: segments,
                                    activities: activities,
                                    limits: apiLimits
                                });
                            });
                        });
                    });
                });
            });
        });
    }
    else {
        // Show user profile
        if (req.params.userId === undefined) {
            req.params.userId = req.user._id;
        }
        User.load_full(req.params.userId, {}, function (err, user) {
            if (user) {
                const geos = Strava.activitiesToGeos(user.activities);
                const generatedRoutes = req.generatedRoutes || [];
                const foundRoutes = generatedRoutes.length > 0;
                const hasGeneratedRoutes = req.hasGeneratedRoutes || false;
                const exploredMap = Map.generateExploredMapData(geos);
                let routeMaps = [
                    {routeData: ["0", "0"]},
                    {routeData: ["0", "0"]},
                    {routeData: ["0", "0"]},
                    {routeData: ["0", "0"]},
                    {routeData: ["0", "0"]},
                    ];

                if (hasGeneratedRoutes) {
                    if (generatedRoutes.length > 0) {
                        generatedRoutes.forEach(function(route, index){
                            routeMaps[index] = Map.generateRouteMap(route.geo);
                            routeMaps[index].distance = route.distance;
                            routeMaps[index].id = route._id;
                            routeMaps[index].parts = route.parts;
                            routeMaps[index].familiarityScore = route.familiarityScore;
                        });
                    }
                }

                respond(res, 'users/show', {
                    title: user.name,
                    user: user,
                    map: exploredMap,
                    routeMaps: routeMaps,
                    userData: 'User data goes here',
                    hasGeneratedRoutes : hasGeneratedRoutes,
                    hasRoute: false,
                    foundRoutes: foundRoutes,
                    numRoutes: generatedRoutes.length,
                    generatedRoutes: generatedRoutes
                });
            }
        });
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

function login (req, res) {
    User.update_user(req.user._id, { lastLogin: Date.now() });
    const redirectTo = req.session.returnTo
        ? req.session.returnTo
        : '/';
    delete req.session.returnTo;
    res.redirect(redirectTo);
}
