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
const init = require('./init');

const models = join(__dirname, 'app/models');
const port = process.env.PORT || 3000;
const app = express();


/**
 * Expose
 */

module.exports = app;
module.exports.config = config;
module.exports.mongoose = mongoose;

// Bootstrap models
fs.readdirSync(models)
    .filter(file => ~file.search(/^[^\.].*\.js$/))
    .forEach(file => require(join(models, file)));

// Bootstrap routes
require('./config/passport')(passport);
require('./config/express')(app, passport);
require('./config/routes')(app, passport);

const Log = require('./app/utils/logger');

fs.writeFile('application.log', '');        // Reset the log file

connect()
    .on('error', console.log)
    .on('disconnected', connect)
    .once('open', listen);

function listen() {
    if (app.get('env') === 'test') return;
    app.listen(port);
    init.init(init.createSampleData);
    Log.log('Server', 'Server started on port ' + port);
}

function connect() {
    const options = {server: {socketOptions: {keepAlive: 1}}};
    mongoose.Promise = global.Promise;
    return mongoose.connect(config.db, options).connection;
}

Log.log("Server", "\n\nStarting Server\n---------------\n");

