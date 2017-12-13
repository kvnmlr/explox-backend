'use strict';

/**
 * Module dependencies
 */

require('dotenv').config();

const fs = require('fs');
const join = require('path').join;
const express = require('express');
const mongoose = require('mongoose');

const passport = require('passport');
const config = require('./config');

const models = join(__dirname, 'app/models');
const port = process.env.PORT || 3000;
const app = express();


/**
 * Expose
 */

module.exports = app;
module.exports.config = config;

// Bootstrap models
fs.readdirSync(models)
    .filter(file => ~file.search(/^[^\.].*\.js$/))
    .forEach(file => require(join(models, file)));

// Bootstrap routes
require('./config/passport')(passport);
require('./config/express')(app, passport);
require('./config/routes')(app, passport);

connect()
    .on('error', console.log)
    .on('disconnected', connect)
    .once('open', listen);

function listen() {
    if (app.get('env') === 'test') return;
    app.listen(port);

    console.log('Express app started on port ' + port);

    createDefaultUsers();
    createSampleRoute();
}

function connect() {
    var options = {server: {socketOptions: {keepAlive: 1}}};
    return mongoose.connect(config.db, options).connection;

}

function createDefaultUsers() {
    console.log("Creating default users ...");

    const User = mongoose.model('User');
    const options = {
        criteria: {'email': 'system@explox.de'}
    };
    User.load(options, function (err, user) {
        if (err) return done(err);
        if (!user) {
            user = new User({
                name: 'system',
                email: 'system@explox.de',
                username: 'sys',
                provider: 'local',
                password: 'manager'
            });
            user.save(function (err) {
                if (err) console.log(err);
            });
        }
    });
}

function createSampleRoute() {
    console.log("Creating sample route ...");
    const Route = mongoose.model('Article');

    Route.find({}).exec(function (err, routes) {
        const options = {
            criteria: {'email': 'system@explox.de'}
        };
        const User = mongoose.model('User');
        User.load(options, function (err, user) {
            if (err) return done(err);
            if (routes.length === 0) {
                Route.load_options(options, function (err, route) {
                    route = new Route({
                        title: 'Test Route',
                        body: 'body',
                        user: user
                    });
                    route.save(function (err) {
                        if (err) console.log(err);
                    });
                });
            }
        });
    });
}