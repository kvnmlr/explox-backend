'use strict';

/**
 * Module dependencies.
 */
const Log = require('../utils/logger');
const mongoose = require('mongoose');
const {wrap: async} = require('co');
const {respond} = require('../utils');
const User = mongoose.model('User');
const Role = mongoose.model('Role');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Settings = mongoose.model('Settings');
const only = require('only');
const assign = Object.assign;
const mailer = require('../mailer/index');

const Strava = require('./strava');
const Map = require('./map');

const TAG = 'views/users';
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
exports.signup = async(function* (req, res) {
    console.log(req.body);
    req.body.email = (req.body.email).toLowerCase();
    const user = new User(req.body);
    user.provider = 'local';
    user.role = 'user';
    try {
        yield user.save();
        req.logIn(user, err => {
            if (err) req.flash('info', 'Sorry! We are not able to log you in!');
            mailer.registeredConfirmation(user);
            Log.log(TAG, 'User ' + user.username + ' has registered');
            res.json({
                errors: null,
                user: user,
            });
        });
    } catch (err) {
        res.status(400).json({
            errors: err,
            user: null
        });
    }
});

/**
 * Show Dashboard
 */
exports.dashboard = async(function* (req, res) {
    if (req.user.role === 'admin') {
        yield showAdminDashboard(req, res);
    }
    else {
        yield showUserDashboard(req, res);
    }
});


exports.show = async function (req, res) {
    const user = req.profile;
    if (!user) {
        return res.status(400).json({
            error: 'The given id does not belong to a user',
            flash: 'This user does not exist anymore'
        });
    }

    const geos = Strava.activitiesToGeos(user.activities);
    const generatedRoutes = req.generatedRoutes || [];
    const foundRoutes = generatedRoutes.length > 0;
    const hasGeneratedRoutes = req.hasGeneratedRoutes || false;
    const exploredMap = Map.generateExploredMapData(geos);
    let routeMaps = [
        {routeData: ['0', '0']},
        {routeData: ['0', '0']},
        {routeData: ['0', '0']},
        {routeData: ['0', '0']},
        {routeData: ['0', '0']},
    ];

    if (hasGeneratedRoutes) {
        if (generatedRoutes.length > 0) {
            generatedRoutes.forEach(function (route, index) {
                routeMaps[index] = Map.generateRouteMap(route.geo);
                routeMaps[index].distance = route.distance;
                routeMaps[index].id = route._id;
                routeMaps[index].parts = route.parts;
                routeMaps[index].familiarityScore = route.familiarityScore;
            });
        }
    }

    return res.json({
        title: user.name,
        user: user,
        map: exploredMap,
        routeMaps: routeMaps,
        userData: 'User data goes here',
        hasGeneratedRoutes: hasGeneratedRoutes,
        hasRoute: false,
        foundRoutes: foundRoutes,
        numRoutes: generatedRoutes.length,
        generatedRoutes: generatedRoutes,
        isUserProfile: req.profile._id === user._id
    });
};

exports.signin = function () {
};

exports.authCallback = login;

exports.login = function (req, res) {
    res.render('users/login', {
        title: 'Login'
    });
};

exports.getCsrfToken = function (req, res) {
    res.json({
        csrfToken: res.locals.csrf_token
    });
};

exports.logout = function (req, res) {
    req.logout();
    res.json();
};

exports.update = async function (req, res) {
    let user = req.profile;
    assign(user, only(req.body, 'name email username'));
    try {
        await user.save();
        res.json({});
    } catch (err) {
        console.log(err);
        res.status(500).json({
            error: 'Error while updating user data',
            flash: 'User data could not be updated'
        });
    }
};

exports.destroy = async function (req, res) {
    await req.profile.remove();
    res.json({});
};

exports.authorize = function (req, res) {
    res.json({
        user: req.user
    });
};

exports.session = login;

function login (req, res) {
    User.update_user(req.user._id, {lastLogin: Date.now()});
    delete req.session.returnTo;
    res.json();
}

async function showAdminDashboard (req, res) {
    let users = await User.list({});
    let routes = await Route.list({criteria: {isRoute: true, isGenerated: false}});
    let generated = await Route.list({criteria: {isRoute: true, isGenerated: true}});
    let activities = await Activity.list({});
    let segments = await Route.list({criteria: {isRoute: false}});
    let apiLimits = await Strava.getLimits();
    respond(res, 'users/show_admin', {
        title: req.user.name,
        user: req.user,
        data: 'Admin data goes here',
        all: users,
        routes: routes,
        generated: generated,
        segments: segments,
        activities: activities,
        limits: apiLimits
    });
}

async function showUserDashboard (req, res) {
    let user = await User.load_full(req.user._id, {});
    if (user) {
        const geos = Strava.activitiesToGeos(user.activities);
        const generatedRoutes = req.generatedRoutes || [];
        const foundRoutes = generatedRoutes.length > 0;
        const hasGeneratedRoutes = req.hasGeneratedRoutes || false;
        const exploredMap = Map.generateExploredMapData(geos);
        let routeMaps = [
            {routeData: ['0', '0']},
            {routeData: ['0', '0']},
            {routeData: ['0', '0']},
            {routeData: ['0', '0']},
            {routeData: ['0', '0']},
        ];

        if (hasGeneratedRoutes) {
            if (generatedRoutes.length > 0) {
                generatedRoutes.forEach(function (route, index) {
                    routeMaps[index] = Map.generateRouteMap(route.geo);
                    routeMaps[index].distance = route.distance;
                    routeMaps[index].id = route._id;
                    routeMaps[index].parts = route.parts;
                    routeMaps[index].familiarityScore = route.familiarityScore;
                });
            }
        }

        res.json({
            title: user.name,
            user: user,
            map: exploredMap,
            routeMaps: routeMaps,
            userData: 'User data goes here',
            hasGeneratedRoutes: hasGeneratedRoutes,
            hasRoute: false,
            foundRoutes: foundRoutes,
            numRoutes: generatedRoutes.length,
            generatedRoutes: generatedRoutes,
        });
    }
}