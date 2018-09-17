'use strict';

const users = require('../app/controllers/users');
const routes = require('../app/controllers/routes');
const comments = require('../app/controllers/comments');
const strava = require('../app/controllers/strava');
const optimization = require('../app/controllers/optimization');
const generate = require('../app/controllers/generate');
const importexport = require('../app/controllers/importexport');
const general = require('../app/controllers/general');
const scheduler = require('../app/controllers/scheduler');
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

    app.get('/stravaimport', userAuth, strava.uploadActivity);

    // General Routes
    app.param('feedbackId', general.loadFeedbackOptions);
    app.get('/', general.home);
    app.get('/hub', general.hub);
    app.get('/creator', auth.requiresLogin, routes.creator);
    app.get('/feedback', general.feedback);
    app.get('/invitation', general.invitation);
    app.get('/about', general.about);
    app.get('/logout', users.logout);
    app.get('/authenticate', users.authenticate);
    app.get('/csrf', users.getCsrfToken);
    app.post('/login', pauth('local', fail), users.session);
    app.post('/signup', users.signup);
    app.post('/finishRegistration', userAuth, users.finishRegistration);
    app.post('/feedback', general.submitFeedback);
    app.post('/invite', general.submitInvitation);
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
    app.get('/triggers/crawler', auth.adminOnly, scheduler.crawler);
    app.get('/triggers/users', auth.adminOnly, scheduler.updateUsers);
    app.get('/triggers/limits', auth.adminOnly, scheduler.updateLimits);
    app.get('/optimize', auth.adminOnly, optimization.prune);

    // Error Handling
    app.use(function (err, req, res, next) {
        if (!err || err === undefined) {
            return next();
        }

        if (err.message
            && (~err.message.indexOf('not found')
                || (~err.message.indexOf('Cast to ObjectId failed')))) {
            return next();
        }

        if (err.stack) {
            if (err.stack.includes('ValidationError')) {
                res.status(422).json({error: err.stack});
                return;
            }
        }
    });

    // 404 if no middleware responded
    app.use(function (req, res) {
        const payload = {
            url: req.originalUrl,
            error: 'Not found'
        };
        res.status(404).json(payload);
    });
};
