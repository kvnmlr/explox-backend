'use strict';
const Log = require('../utils/logger');
const mongoose = require('mongoose');
const {wrap: async} = require('co');
const {respond} = require('../utils');
const only = require('only');
const mailer = require('../mailer/index');
const Strava = require('./strava');
const config = require('../../server').config;

const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const Feedbacks = mongoose.model('Feedback');
const Invitations = mongoose.model('Invitation');

const assign = Object.assign;
const TAG = 'views/users';

/**
 * Adds a req.profile attribute containing the user corresponding to the user ID
 */
exports.loadProfile = async function (req, res, next, _id) {
    const criteria = {_id: _id};
    const select = 'name role authToken';
    try {
        req.profile = await User.load_options({criteria: criteria, select: select});
        if (!req.profile) return next(new Error('User not found'));
    } catch (err) {
        return next(err);
    }
    next();
};

exports.finishRegistration = async function (req, res) {
    let user = req.user;
    assign(user, only(req.body, 'name email username password'));
    user.fullyRegistered = true;
    try {
        await user.save();
        req.logIn(user, err => {
            if (err) {
                res.status(400).json({
                    error: 'User exists but could not be logged in after registration',
                    flash: {
                        type: 'info',
                        text: 'You have been registered, please log in'
                    }
                });
            }
            mailer.registeredConfirmation(user);
            Log.log(TAG, 'User ' + user.username + ' has registered');
            res.json({
                errors: null,
                user: user,
            });
        });
    } catch (err) {
        res.status(400).json({
            error: err,
            user: null
        });
    }
};

/**
 * Creates a new user and logs them in using passport
 */
exports.signup = async function (req, res) {
    req.body.email = (req.body.email).toLowerCase();
    const user = new User(req.body);
    user.provider = 'local';
    user.role = 'user';
    try {
        await user.save();
        req.logIn(user, err => {
            if (err) {
                res.status(400).json({
                    error: 'User exists but could not be logged in after registration',
                    flash: {
                        type: 'info',
                        text: 'You have been registered, please log in'
                    }
                });
            }
            mailer.registeredConfirmation(user);
            Log.log(TAG, 'User ' + user.username + ' has registered');
            res.json({
                errors: null,
                user: user,
            });
        });
    } catch (err) {
        res.status(400).json({
            error: err,
            user: null
        });
    }
};

/**
 * Loads the data relevant for the dashboard of the logged in user
 */
exports.dashboard = async function (req, res) {
    if (req.user.role === 'admin') {
        await showAdminDashboard(req, res);
    }
    else {
        await showUserDashboard(req, res);
    }
};

/**
 * Collects and responds with the the logged in user's activities
 */
exports.activityMap = async function (req, res) {
    const id = req.profile._id;
    const userActivities = await User.load_activities(id, {});
    if (!userActivities) {
        return res.status(400).json({
            error: 'The given id does not belong to a user',
            flash: {
                type: 'error',
                text: 'Could not retrieve data for the given user id'
            }
        });
    }
    // const geos = Strava.activitiesToGeos(userActivities.activities);
    res.json({
        activities: userActivities.activities,
    });
};

/**
 * Responds the current csrf token
 */
exports.getCsrfToken = function (req, res) {
    res.json({
        csrfToken: res.locals.csrf_token
    });
};

/**
 * Terminates the currently active session for this user
 */
exports.logout = function (req, res) {
    req.logout();
    res.json({
        flash: {
            type: 'success',
            text: 'You are now logged out'
        }
    });
};

/**
 * Updates the current user in database with new data
 */
exports.update = async function (req, res) {
    let user = req.user;
    assign(user, only(req.body, 'name email username'));
    try {
        await user.save();
        res.json({
            user: user,
            flash: {
                text: 'Your data has been successfully updated',
                type: 'success'
            }
        });
    } catch (err) {
        Log.error(TAG, 'Error saving updated user', err);
        res.status(500).json({
            error: 'Error while updating user data',
            flash: {
                text: 'User data could not be updated',
                type: 'error'
            }
        });
    }
};

/**
 * Removes the current user from the database
 */
exports.destroy = async function (req, res) {
    await req.profile.remove();
    res.json({});
};

/**
 * Returns the current user if authentication was successful
 */
exports.authenticate = function (req, res) {
    if (!req.user) {
        res.json({
            deployTest: false,
            user: null,
        });
    }
    res.json({
        user: {
            deployTest: false,
            name: req.user.name,
            _id: req.user._id,
            role: req.user.role,
        }
    });
};

/**
 * After successful passport authentication updates the last logged in attribute for the user
 */
exports.session = async function (req, res) {
    User.update_user(req.user._id, {lastLogin: Date.now()});
    delete req.session.returnTo;
    if (req.oauth) {
        res.redirect(config.frontend_url + 'dashboard');
    } else {
        res.json({});
    }
};

/**
 * Responds data for the admin dashboard
 */
async function showAdminDashboard (req, res) {
    let users = await User.list({});
    let routes = await Route.list({criteria: {isRoute: true, isGenerated: false}});
    let generated = await Route.list({criteria: {isRoute: true, isGenerated: true}});
    let activities = await Activity.list({});
    let segments = await Route.list({criteria: {isRoute: false}});
    let feedbacks = await Feedbacks.list();
    let invitations = await Invitations.list();

    console.log(invitations);

    let apiLimits = await Strava.getLimits();
    respond(res, 'users/show_admin', {
        title: req.user.name,
        user: req.user,
        users: users,
        routes: routes,
        generated: generated,
        segments: segments,
        activities: activities,
        limits: apiLimits,
        feedbacks: feedbacks,
        invitations: invitations,
    });
}

/**
 * Responds data for the current user dashboard
 */
async function showUserDashboard (req, res) {
    let user = await User.load(req.user._id);
    if (user) {
        res.json({
            user: user,
        });
    } else {
        res.status(400).json({
            error: 'No user with matching id found in database',
            flash: {
                type: 'error',
                text: 'Could not retrieve data for the given user id'
            }
        });
    }
}