'use strict';

/**
 * Module dependencies
 */

require('dotenv').config();

const fs = require('fs');
const join = require('path').join;
const express = require('express');
const mongoose = require('mongoose');
const cluster = require('cluster');

const passport = require('passport');
const config = require('./config');
const init = require('./init');

const models = join(__dirname, 'app/models');
const port = process.env.PORT || 3000;
const app = express();
const os = require('os');
const numCPUs = os.cpus().length;

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

if (cluster.isMaster) {
    Log.log("Server", "\n\nStarting Server\n---------------\n");
    Log.log('Server', 'Starting ' + numCPUs + ' workers on port ' + port);

    connect()
        .on('error', console.log)
        .on('disconnected', connect)
        .once('open', initialize);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    cluster.on('exit', function(deadWorker, code, signal) {
        // Restart the worker
        const worker = cluster.fork();

        // Log the event
        Log.error('Server', 'Worker '+deadWorker.process.pid+' has died.');
        Log.log('Server', 'Worker '+worker.process.pid+' was born.');
    });

    Object.keys(cluster.workers).forEach(function(id) {
        Log.log('Server', 'Worker with PID ' + cluster.workers[id].process.pid + ' is ready');
    });
} else {
    connect()
        .on('error', console.log)
        .on('disconnected', connect)
        .once('open', listen);
}

function listen() {
    if (app.get('env') === 'test') return;
    app.listen(port);
}

function initialize() {
    init.init(init.createSampleData);

}

function connect() {
    const options = {
        keepAlive: true,
        useMongoClient: true,
        autoIndex: false,                   // TODO build the spatial index
        reconnectTries: Number.MAX_VALUE,   // Always try to reconnect
        reconnectInterval: 500,             // Reconnect every 500ms
        bufferMaxEntries: 0                 // If not connected, return errors immediately
    };
    mongoose.Promise = global.Promise;
    return mongoose.connect(config.db, options);
}

