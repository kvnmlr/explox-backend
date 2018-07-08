'use strict';

/*
 * Module dependencies.
 */

const users = require('../app/controllers/users');
const routes = require('../app/controllers/routes');
const comments = require('../app/controllers/comments');
const strava = require('../app/controllers/strava');
const tags = require('../app/controllers/tags');
const crawler = require('../app/controllers/crawler');
const optimization = require('../app/controllers/optimization');
const generate = require('../app/controllers/generate');
const importexport = require('../app/controllers/importexport');

const auth = require('./middlewares/authorization');



/**
 * Route middlewares
 */

const routeAuth = [auth.requiresLogin, auth.article.hasAuthorization];
const commentAuth = [auth.requiresLogin, auth.comment.hasAuthorization];

const fail = {
    failureRedirect: '/login',
    failWithError: true
};

/**
 * Expose routes
 */

module.exports = function (app, passport) {
    const pauth = passport.authenticate.bind(passport);

    // strava routes
    app.get('/auth/strava/callback', pauth('strava', fail), users.authCallback, strava.authCallback);
    app.get('/auth/strava', pauth('strava', fail), users.signin);

    // crawler
    app.get('/crawl', crawler.crawlSegments);
    app.get('/opti', optimization.prune);

    // user routes
    app.get('/login', users.login);
    app.get('/signup', users.signup);
    app.get('/logout', users.logout);

    app.get('/generate', generate.generate);
    app.post('/users', users.create);
    app.post('/users/session',
        pauth('local', {
            failureRedirect: '/login',
            failureFlash: 'Invalid email or password.'
        }), users.session);

    app.post('/routes/generated', routes.userSavedChoice);
    app.get('/users/:userId', users.show);
    app.get('/users/:userId/update', strava.updateUser);

    /* app.get('/auth/facebook',
        pauth('facebook', {
            scope: ['email', 'user_about_me'],
            failureRedirect: '/login'
        }), users.signin);
    app.get('/auth/facebook/callback', pauth('facebook', fail), users.authCallback);
    app.get('/auth/github', pauth('github', fail), users.signin);
    app.get('/auth/github/callback', pauth('github', fail), users.authCallback);
    app.get('/auth/twitter', pauth('twitter', fail), users.signin);
    app.get('/auth/twitter/callback', pauth('twitter', fail), users.authCallback);
    app.get('/auth/google',
        pauth('google', {
            failureRedirect: '/login',
            scope: [
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email'
            ]
        }), users.signin);
    app.get('/auth/google/callback', pauth('google', fail), users.authCallback);
    app.get('/auth/linkedin',
        pauth('linkedin', {
            failureRedirect: '/login',
            scope: [
                'r_emailaddress'
            ]
        }), users.signin);
    app.get('/auth/linkedin/callback', pauth('linkedin', fail), users.authCallback); */

    app.param('userId', users.load_options);

    // article routes
    app.param('id', routes.load_options);
    app.get('/routes', routes.index);
    app.get('/routes/new', auth.requiresLogin, routes.new);
    app.post('/routes', auth.requiresLogin, routes.create);
    app.get('/routes/:id', routes.show);
    app.get('/routes/:id/edit', routeAuth, routes.edit);
    app.put('/routes/:id', routeAuth, routes.update);
    app.delete('/routes/:id', routeAuth, routes.destroy);

    // home route
    app.get('/', routes.home);
    app.get('/about', routes.about);

    // comment routes
    app.param('commentId', comments.load_options);
    app.post('/routes/:id/comments', auth.requiresLogin, comments.create);
    app.get('/routes/:id/comments', auth.requiresLogin, comments.create);
    app.delete('/routes/:id/comments/:commentId', commentAuth, comments.destroy);

    // import export route
    app.get('/routes/:id/export/gpx', importexport.exportGPX);
    app.get('/routes/import/gpx', importexport.importGPX);

    app.get('/import', importexport.import);

    // tag routes
    app.get('/tags/:tag', tags.index);


    /**
     * Error handling
     */

    app.use(function (err, req, res, next) {
        if (!err || err === undefined) {
            return next();
        }
        // treat as 404
        if (err.message
            && (~err.message.indexOf('not found')
                || (~err.message.indexOf('Cast to ObjectId failed')))) {
            return next();
        }

        console.error('Error: ' + JSON.stringify(err));

        if (err.stack) {
            if (err.stack.includes('ValidationError')) {
                res.status(422).render('422', {error: err.stack});
                return;
            }
        }


        // error page
        res.status(500).render('500', {error: err.stack});
    });

    // assume 404 since no middleware responded
    app.use(function (req, res) {
        const payload = {
            url: req.originalUrl,
            error: 'Not found'
        };
        if (req.accepts('json')) return res.status(404).json(payload);
        res.status(404).render('404', payload);
    });
};
