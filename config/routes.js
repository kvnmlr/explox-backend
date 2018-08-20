'use strict';
const users = require('../app/controllers/users');
const routes = require('../app/controllers/routes');
const comments = require('../app/controllers/comments');
const strava = require('../app/controllers/strava');
const crawler = require('../app/controllers/crawler');
const optimization = require('../app/controllers/optimization');
const generate = require('../app/controllers/generate');
const importexport = require('../app/controllers/importexport');
const general = require('../app/controllers/general');
const auth = require('./middlewares/authorization');

const routeAuth = [auth.requiresLogin, auth.route.hasAuthorization];
const commentAuth = [auth.requiresLogin, auth.comment.hasAuthorization];
const userAuth = [auth.requiresLogin, auth.user.hasAuthorization];

const fail = {
    failureRedirect: '/',
    failWithError: true
};

module.exports = function (app, passport) {
    const pauth = passport.authenticate.bind(passport);

    // Auth Routes
    app.get('/auth/strava/callback', pauth('strava', fail), strava.authCallback, users.session);
    app.get('/auth/strava', pauth('strava', fail), users.session);

    // General Routes
    app.param('feedbackId', general.loadFeedbackOptions);
    app.get('/', general.home);
    app.get('/hub', general.hub);
    app.get('/creator', auth.requiresLogin, routes.creator);
    app.get('/feedback', general.feedback);
    app.get('/about', general.about);
    app.get('/logout', users.logout);
    app.get('/authenticate', users.authenticate);
    app.get('/csrf', users.getCsrfToken);
    app.post('/login', pauth('local', fail), users.session);
    app.post('/signup', users.signup);
    app.post('/feedback', general.submitFeedback);
    app.delete('/feedback/:feedbackId', auth.adminOnly, general.destroyFeedback);

    // User Routes
    app.param('userId', users.loadProfile);
    app.get('/users/:userId',  auth.requiresLogin, users.activityMap);
    app.get('/dashboard', userAuth, users.dashboard);
    app.get('/users/:userId/export', userAuth, importexport.exportUser);
    app.get('/users/:userId/import', userAuth, importexport.import);
    app.get('/users/:userId/update', userAuth, strava.updateUser);
    app.put('/users/:userId', userAuth, users.update);
    app.delete('/users/:userId', userAuth, users.destroy);

    // Route Routes
    app.param('id', routes.load_options);
    app.param('commentId', comments.load_options);
    app.get('/routes', routes.index);
    app.get('/routes/:id', routes.routeData);
    app.get('/routes/:id/export', importexport.exportRoute);
    app.post('/routes/generate', generate.generate);
    app.post('/routes/import', auth.requiresLogin, importexport.import);
    app.post('/routes', auth.requiresLogin, routes.create);
    // app.post('/routes/generated', routes.userSavedChoice);                  // TODO
    app.post('/routes/:id/comments', auth.requiresLogin, comments.create);
    app.put('/routes/:id', routeAuth, routes.update);
    app.delete('/routes/:id', routeAuth, routes.destroy);
    app.delete('/routes/:id/comments/:commentId', commentAuth, comments.destroy);

    // Admin Routes
    app.get('/crawl', auth.adminOnly, crawler.crawlSegments);
    app.get('/optimize', auth.adminOnly, optimization.prune);

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
        // res.status(500).json({error: err.stack});
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
