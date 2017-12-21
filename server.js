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

connect()
    .on('error', console.log)
    .on('disconnected', connect)
    .once('open', listen);

function listen() {
    if (app.get('env') === 'test') return;
    app.listen(port);

    console.log('Express app started on port ' + port);

    init.init(init.createSampleData);

}

function connect() {
    var options = {server: {socketOptions: {keepAlive: 1}}};
    mongoose.Promise = global.Promise;
    return mongoose.connect(config.db, options).connection;
}

