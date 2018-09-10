'use strict';

require('dotenv').config();

const fs = require('fs');
const join = require('path').join;
const express = require('express');
const app = express();

const mongoose = require('mongoose');
const cluster = require('cluster');
const favicon = require('serve-favicon')

const passport = require('passport');
const config = require('./config');
const init = require('./init');

const models = join(__dirname, 'app/models');
const port = process.env.PORT || 3000;
process.setMaxListeners(0);

app.use(favicon(join(__dirname, 'public', 'favicon.ico')));

const os = require('os');
const numCPUs = 1; // os.cpus().length;

/**
 * Expose
 */

module.exports = app;
module.exports.config = config;
module.exports.mongoose = mongoose;

// Bootstrap models
fs.readdirSync(models)
    .filter(file => ~file.search(/^[^.].*\.js$/))
    .forEach(file => require(join(models, file)));

// Bootstrap routes
require('./config/passport')(passport);
require('./config/express')(app, passport);
require('./config/routes')(app, passport);

const Log = require('./app/utils/logger');

// Reset the log file
fs.writeFile('application.log', '', (err) => {
    if (err) throw err;
});

if (cluster.isMaster) {
    Log.log('Server', '_____Starting Server_____');
    Log.log('Server', 'Starting ' + numCPUs + ' workers on port ' + port);

    connect()
        .on('error', console.log)
        .on('disconnected', connect)
        .once('open', initialize);

    if (app.get('env') !== 'test') {
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        Object.keys(cluster.workers).forEach(function (id) {
            Log.log('Server', 'Worker with PID ' + cluster.workers[id].process.pid + ' is ready');
        });
    }

    cluster.on('exit', function (deadWorker) {
        // Restart the worker
        const worker = cluster.fork();

        // Log the event
        Log.error('Server', 'Worker ' + deadWorker.process.pid + ' has died');
        Log.log('Server', 'Worker ' + worker.process.pid + ' was born');
    });

} else {
    connect()
        .on('error', console.log)
        .on('disconnected', connect)
        .once('open', listen);
}

function listen () {
    if (app.get('env') === 'test') return;
    app.listen(port);
}

async function initialize () {
    if (app.get('env') === 'test') return;
    init.init();
}

function connect () {
    const options = {
        keepAlive: true,
        autoIndex: true,
        reconnectTries: Number.MAX_VALUE,   // Always try to reconnect
        reconnectInterval: 500,             // Reconnect every 500ms
        bufferMaxEntries: 0                 // If not connected, return errors immediately
    };
    mongoose.Promise = global.Promise;
    mongoose.connect(config.db, options);
    return mongoose.connection;
}