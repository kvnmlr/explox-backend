'use strict';

const mongoose = require('mongoose');
const LocalStrategy = require('passport-local').Strategy;
const User = mongoose.model('User');

module.exports = new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    },
    function (email, password, done) {
        let options = {
            criteria: {email: email.toLowerCase()},
            select: 'name username email hashed_password salt'
        };
        if (!email.includes('@')) {
            options.criteria = {username: email};
        }

        User.load_options(options, function (err, user) {
            if (err) return done(err);
            if (!user) {
                return done(null, false, {message: 'Unknown user'});
            }
            if (!user.authenticate(password)) {
                return done(null, false, {message: 'Invalid password'});
            }
            return done(null, user);
        });
    }
);
