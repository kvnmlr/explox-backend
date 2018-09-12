'use strict';

const express = require('express');
const session = require('express-session');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const methodOverride = require('method-override');
const csrf = require('csurf');
const bodyParser = require('body-parser');
const parseForm = bodyParser.urlencoded({ extended: false });
const cors = require('cors');
const upload = require('multer')({dest: 'uploads/'});
const mongoStore = require('connect-mongo')(session);
const flash = require('connect-flash');
const winston = require('winston');
const helpers = require('view-helpers');
const config = require('./');
const pkg = require('../package.json');

const env = process.env.NODE_ENV || 'development';

module.exports = function (app, passport) {
    app.use(parseForm);
    app.use(function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Headers', 'Origin, ' +
            'Cookie' +
            'X-Requested-With, ' +
            'Content-Type, ' +
            'Content-Length, ' +
            'Accept');
        next();
    });
    // Compression middleware (should be placed before express.static)
    app.use(compression({
        threshold: 512
    }));

    app.use(cors({
        origin: [
            'http://localhost:3000',
            'http://localhost:8080',
            'https://www.strava.com',
            'http://umtl.dfki.de/explox',
            'http://umtl.dfki.de/explox/backend',
        ],
    }));

    // Static files middleware
    app.use(express.static(config.root + '/public'));

    // Use winston on production
    let log = 'dev';
    if (env !== 'development') {
        log = {
            stream: {
                write: message => winston.info(message)
            }
        };
    }

    // Don't log during tests
    // Logging middleware
    if (env !== 'test') app.use(morgan('combined', log));

    // set views path, template engine and default layout
    app.set('views', config.root + '/app/views');
    app.set('view engine', 'jade');

    // expose package.json to views
    app.use(function (req, res, next) {
        res.locals.pkg = pkg;
        res.locals.env = env;
        next();
    });

    // bodyParser should be above methodOverride
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(upload.any());
    app.use(methodOverride(function (req) {
        if (req.body && typeof req.body === 'object' && '_method' in req.body) {
            // look in urlencoded POST bodies and delete it
            var method = req.body._method;
            delete req.body._method;
            return method;
        }
    }));

    // CookieParser should be above session
    app.use(cookieParser());
    // app.use(cookieSession({secret: 'secret'}));
    app.use(session({
        resave: false,
        saveUninitialized: true,
        secret: pkg.name,
        store: new mongoStore({
            url: config.db,
            collection: 'sessions'
        }),
        cookie: { path: '/', httpOnly: true, maxAge: 3600000},
        maxAge: new Date(Date.now() + 3600000),
        httpOnly: true,
    }));

    // use passport session
    app.use(passport.initialize());
    app.use(passport.session());

    // connect flash for flash messages - should be declared after sessions
    app.use(flash());

    // should be declared after session and flash
    app.use(helpers(pkg.name));

    if (env !== 'test') {
        app.use(csrf({cookie: true, ignoreMethods: ['GET' , 'HEAD', 'OPTIONS', 'DELETE']}));

        // This could be moved to view-helpers :-)
        app.use(function (req, res, next) {
            res.locals.csrf_token = req.csrfToken();
            next();
        });
    }

    if (env === 'development') {
        app.locals.pretty = true;
    }
};
