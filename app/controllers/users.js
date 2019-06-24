'use strict';

const Log = require('../utils/logger');
const TAG = 'views/users';
const mongoose = require('mongoose');
const only = require('only');
const mailer = require('../mailer/index');
const Strava = require('./strava');
const config = require('../../server').config;
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const Activity = mongoose.model('Activity');
const CreatorResult = mongoose.model('CreatorResult');
const Feedbacks = mongoose.model('Feedback');
const Invitations = mongoose.model('Invitation');
const assign = Object.assign;

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
    Log.debug(TAG, 'finish registration');
    let user = req.user;
    assign(user, only(req.body, 'firstName lastName email username subscriptions demographics cyclingBehaviour routePlanning questionnaireInfo'));

    Strava.updateUser({profile: user, max: 200});

    if (!req.body.cache) {
        user.fullyRegistered = true;
    }
    try {
        await user.save();
        if (req.body.cache) {
            res.json({
                errors: null,
            });
            return;
        }
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
    let headersSent = false;
    try {
        await user.save();
        req.logIn(user, err => {
            if (err) {
                headersSent = true;
                res.status(200).json({
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
        if (!headersSent) {
            res.status(400).json({
                error: err,
                user: null
            });
        }
    }
};

/**
 * Loads the data relevant for the dashboard of the logged in user
 */
exports.dashboard = async function (req, res) {
    if (req.user.role === 'user') {
        await showUserDashboard(req, res);
    } else {
        res.json({
            user: req.user,
        });
    }
};

/**
 * Loads the data relevant for the dashboard of the logged in user
 */
exports.adminDashboard = async function (req, res) {
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
    const user = await User.load_full(id, {});
    if (!user) {
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
        user: user
    });
};

/**
 * Responds the current csrf token
 */
exports.getCsrfToken = function (req, res) {
    res.json({
        csrf_token: res.locals.csrf_token
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
    assign(user, only(req.body, 'name email username subscriptions visitedActivityMap creatorTutorial firstTimeUsage'));
    try {
        await user.save();

        if (!req.body.visitedActivityMap) {
            res.json({
                user: user,
                flash: {
                    text: 'Your data has been successfully updated',
                    type: 'success'
                }
            });
        } else {
            res.json({});
        }


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
    req.user.fullyRegistered = false;
    try {
        await req.user.save();
        res.json({
            user: null,
            flash: {
                text: 'Your account has been successfully deleted',
                type: 'success'
            }
        });
    } catch (err) {
        Log.error(TAG, 'Error disabling updated user', err);
        res.status(500).json({
            error: 'Error while disabling user account',
            flash: {
                text: 'Your account could not be deleted',
                type: 'error'
            }
        });
    }
};

/**
 * Returns the current user if authentication was successful
 */
exports.authenticate = function (req, res) {
    if (!req.user) {
        res.json({
            user: null,
        });
    }
    res.json({
        user: {
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
    if (req.user.provider === 'strava') {
        // synchronize user on every login
        if (req.user.fullyRegistered) {
            // if user tries to log in, let him wait while synchronization is running
            await Strava.updateUser({profile: req.user, max: 3}); // only take 5 so login does not take too long
        } else {
            // synchronize asynchronously while they are registering
            Strava.updateUser({profile: req.user, max: 200});
        }
    }
    await User.update_user(req.user._id, {lastLogin: Date.now()});
    req.user = await User.load(req.user._id);
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
    let users = [];
    let routes = [];
    let generated = [];
    let activities = [];
    let segments = [];
    let creatorResults = [];
    let feedbacks = [];
    let invitations = [];
    let apiLimits = [];

    if (req.query.general) {
        feedbacks = await Feedbacks.list();
        invitations = await Invitations.list();
        apiLimits = await Strava.getLimits();
    }
    if (req.query.users) {
        users = await User.list({});
    }
    if (req.query.routes) {
        routes = await Route.list({criteria: {'strava.sub_type': 1, isRoute: true, isGenerated: false}, limit: 5000});
        generated = await Route.list({criteria: {isRoute: true, isGenerated: true}, limit: 5000});
        creatorResults = await CreatorResult.list();
    }
    if (req.query.segments) {
        segments = await Route.list({criteria: {isRoute: false}, limit: 5000});
    }
    if (req.query.activities) {
        activities = await Activity.list({criteria: {'strava.type': 'Ride'}});
    }

    res.json({
        title: req.user.name,
        user: req.user,
        users: users,
        routes: routes,
        generated: generated,
        segments: segments,
        activities: activities,
        limits: apiLimits,
        feedbacks: feedbacks,
        creatorResults: creatorResults,
        invitations: invitations,
    });
}

/**
 * Responds data for the current user dashboard
 */
async function showUserDashboard (req, res) {
    let user = await User.load(req.user._id);

    for (let i = 0; i < user.creatorResults.length; ++i) {
        user.creatorResults[i] = await CreatorResult.load_basic({criteria: {_id: user.creatorResults[i]._id}});
    }
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

/**
 * Responds the current csrf token
 */
exports.questionnaire = async function (req, res) {
    let questionnaires = await User.list({
        select: 'demographics cyclingBehaviour routePlanning questionnaireInfo'
    });
    Log.debug(TAG, '', questionnaires);
    if (questionnaires) {
        res.json({
            questionnaires: questionnaires,
        });
    }
};
