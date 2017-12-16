'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const {wrap: async} = require('co');
const {respond} = require('../utils');
const User = mongoose.model('User');
const Role = mongoose.model('Role');

/**
 * Load
 */

exports.load = async(function* (req, res, next, _id) {
    const criteria = {_id};
    try {
        req.profile = yield User.load({criteria});
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
    try {
        yield user.save();
        req.logIn(user, err => {
            if (err) req.flash('info', 'Sorry! We are not able to log you in!');
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

exports.show = function (req, res) {
    const user = req.profile;
    console.log(req.profile);

    var options = {
        criteria: {'_id': req.profile.role}
    };
    Role.load(options, function (err, role) {
        console.log(role.name);
        if (role.name === 'admin') {
            // Show admin dashboard
            respond(res, 'users/show', {
                title: user.name,
                user: user,
                data: 'Admin data goes here'
            });
        } else {
            // Show user profile
            respond(res, 'users/show', {
                title: user.name,
                user: user,
                userData: 'User data goes here'
            });
        }
    });
};

exports.signin = function () {
    console.log('signin')
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
    const redirectTo = req.session.returnTo
        ? req.session.returnTo
        : '/';
    delete req.session.returnTo;
    res.redirect(redirectTo);
}
