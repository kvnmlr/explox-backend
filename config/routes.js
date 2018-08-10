'use strict';
const users = require('../app/controllers/users');
const routes = require('../app/controllers/routes');
const comments = require('../app/controllers/comments');
const strava = require('../app/controllers/strava');
const crawler = require('../app/controllers/crawler');
const optimization = require('../app/controllers/optimization');
const generate = require('../app/controllers/generate');
const importexport = require('../app/controllers/importexport');
const auth = require('./middlewares/authorization');

const routeAuth = [auth.requiresLogin, auth.route.hasAuthorization];
const commentAuth = [auth.requiresLogin, auth.comment.hasAuthorization];

const fail = {
    failureRedirect: '/',
    failWithError: true
};

module.exports = function (app, passport) {
    const pauth = passport.authenticate.bind(passport);

    // Auth Routes
    app.get('/auth/strava/callback', pauth('strava', fail), users.authCallback, strava.authCallback);
    app.get('/auth/strava', pauth('strava', fail), users.signin);

    // General Routes
    app.get('/', routes.home);
    app.get('/hub', routes.hub);
    app.get('/about', routes.about);
    app.get('/logout', users.logout);
    app.get('/authorize', users.authorize);
    app.get('/csrf', users.getCsrfToken);
    app.post('/login', pauth('local', fail), users.session);
    app.post('/signup', users.signup);

    // User Routes
    app.param('userId', users.load_options);
    app.get('/users/:userId', users.show);                                   // TODO
    app.get('/users/:userId/export', importexport.exportAllActivitiesGPX);   // TODO
    app.get('/users/:userId/import', users.show);                            // TODO
    app.get('/users/:userId/update', strava.updateUser);                     // TODO
    app.put('/users/:userId', users.show);                                   // TODO
    app.delete('/users/:userId', users.show);                                // TODO

    // Route Routes
    app.param('id', routes.load_options);
    app.param('commentId', comments.load_options);
    app.get('/routes', routes.index);
    app.get('/routes/:id', routes.show);                                    // TODO
    app.get('/routes/:id/export', importexport.export);
    app.post('/routes/generate', generate.generate);
    app.post('/routes/import', auth.requiresLogin, importexport.import);
    app.post('/routes', auth.requiresLogin, routes.create);
    // app.post('/routes/generated', routes.userSavedChoice);                  // TODO
    app.post('/routes/:id/comments', auth.requiresLogin, comments.create);  // TODO test
    app.put('/routes/:id', routeAuth, routes.update);
    app.delete('/routes/:id', routeAuth, routes.destroy);
    app.delete('/routes/:id/comments', commentAuth, comments.destroy);      // TODO test

    // Testing Routes
    app.get('/crawl', crawler.crawlSegments);
    app.get('/optimize', optimization.prune);

    // Error Handling
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
                res.status(422).json({error: err.stack});
                return;
            }
        }


        // error page
        res.status(500).json({error: err.stack});
    });

    // assume 404 since no middleware responded
    app.use(function (req, res) {
        const payload = {
            url: req.originalUrl,
            error: 'Not found'
        };
        if (req.accepts('json')) return res.status(404).json(payload);
        res.status(404).json(payload);
    });
};
