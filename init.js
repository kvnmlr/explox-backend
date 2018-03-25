'use strict';
const Log = require('./app/utils/logger');
const TAG = 'Init';

let mongoose;
let Route, Geo, User, Role, Activity, Settings;
let geos = [];
let adminRole, userRole;

// Utility functions
const apply = function(callbacks) {
    checkAndCallback(callbacks);
};
const checkAndCallback = function(callbacks) {
    if (callbacks.length > 0) {
        const cb = callbacks[0];
        callbacks.shift();
        return cb(callbacks);
    }
};
const finished = function(callbacks) {
    Log.log('Init', "_______Server Ready________");
    checkAndCallback(callbacks);
};
exports.createSampleData = function (callbacks) {
    mongoose = require('mongoose');
    Route = mongoose.model('Route');
    Geo = mongoose.model('Geo');
    User = mongoose.model('User');
    Role = mongoose.model('Role');
    Activity = mongoose.model('Activity');
    Settings = mongoose.model('Settings');

    apply([createDefaultGeo1, createDefaultGeo2, createDefaultGeo3, createDefaultAdmins, createDefaultUsers, createSampleRoute, createDefaultSettings, finished]);
};

exports.init = function() {
    Log.log('Init', 'Initializing database');
    mongoose = require('mongoose');
    Route = mongoose.model('Route');
    Geo = mongoose.model('Geo');
    User = mongoose.model('User');
    Role = mongoose.model('Role');

    apply([createRoles, createDefaultAdmins, this.createSampleData])
};

const createDefaultGeo1 = function(callbacks) {
    createDefaultGeo("init1", 23.600800037384033, 46.76758746952729, callbacks);
};
const createDefaultGeo2 = function(callbacks) {
    createDefaultGeo("init2", 25.600800037384033, 48.76758746952729, callbacks);
};
const createDefaultGeo3 = function(callbacks) {
    createDefaultGeo("init3", 65.600800037384033, 2.76758746952729, callbacks);
};

const createDefaultGeo = function(name, lat, long, callbacks) {
    const options = {
        criteria: {'name': name}
    };

    Geo.load_options(options, function (err, geo) {
        if (err) Log.error("Init", err);
        if (!geo) {
            const coords = [];
            coords[1] = lat;
            coords[0] = long;

            const geo = new Geo({
                name: name,
                location: {
                    type: 'Point',
                    coordinates: coords
                }            });

            geo.save(function (err) {
                if (err) Log.error("Init", err);
                geos[geos.length] = geo;
                checkAndCallback(callbacks);
            });
        } else {
            checkAndCallback(callbacks);
        }
    });
};


const createDefaultAdmins = function(callbacks) {
    const options = {
        criteria: {'email': 'system@explox.de'}
    };
    User.load_options(options, function (err, user) {
        if (!user) {
            user = new User({
                name: 'system',
                email: 'system@explox.de',
                username: 'sys',
                provider: 'local',
                password: 'manager',
                role: adminRole,
                createdAt: Date.now()
            });
            user.save(function (err) {
                if (err) Log.error("Init", err);
                checkAndCallback(callbacks);
            });
        } else {
            checkAndCallback(callbacks);
        }
    });
};

const createDefaultUsers = function(callbacks) {
    const options = {
        criteria: {'email': 'user@explox.de'}
    };
    User.load_options(options, function (err, user) {
        if (err) {
            return done(err);
        }
        if (!user) {
            user = new User({
                name: 'user',
                email: 'user@explox.de',
                username: 'user',
                provider: 'local',
                password: 'password',
                geo: geos,
                role: userRole,
                createdAt: Date.now()
            });
            user.save(function (err) {
                if (err) Log.error("Init", err);;
                checkAndCallback(callbacks)
            });
        } else {
            checkAndCallback(callbacks)
        }
    });
};

const createDefaultSettings = function(callbacks) {
    Settings.loadValue("api", function (err, setting) {
        if (err) {
            return done(err);
        }
        if (!setting) {
            setting = new Settings({
                key: 'api',
                value: {
                    shortTerm: 0,
                    longTerm: 0
                }
            });
            setting.save(function (err) {
                if (err) Log.error("Init", err);;
                checkAndCallback(callbacks)
            });
        } else {
            checkAndCallback(callbacks)
        }
    });
};

const createRoles = function(callbacks) {
    adminRole = 'admin';
    userRole = 'user';
    /*
    var options = {
        criteria: {'name': 'admin'}
    };
    Role.load_options(options, function (err, role) {
        if (err) return done(err);
        adminRole = role;
        if (!role) {
            role = new Role({
                name: 'admin',
                permissions: 'all'
            });
            adminRole = role;
            role.save(function (err) {
                if (err) Log.error("Init", err);;
            });
        }
    });

    options = {
        criteria: {'name': 'user'}
    };
    Role.load_options(options, function (err, role) {
        if (err) return done(err);
        userRole = role;
        if (!role) {
            role = new Role({
                name: 'user',
                permissions: 'user'
            });
            userRole = role;
            role.save(function (err) {
                if (err) Log.error("Init", err);;
            });
        }
    });
    */
    checkAndCallback(callbacks)
};

const createSampleRoute = function(callbacks) {
    const options = {
        criteria: {'name': 'user'}
    };
    User.load_options(options, function (err, user) {
        if (err) return done(err);
        const options = {
            criteria: {'title': 'Saarbrücken Uni Route'}
        };
        Route.load_options(options, function (err, route) {
            if (!route) {
                route = new Route({
                    stravaId: 123456789,
                    title: 'Saarbrücken Uni Route',
                    body: 'This route leads through the univeristy in Saarbrücken.',
                    location: 'Saarbrücken',
                    user: user,
                    comments: [{
                        body: 'I ran this route today and it is very nice!',
                        user: user,
                    }],
                    tags: 'run, running, road',
                    geo: geos,
                    distance: 1337.42
                });
                route.save(function (err) {
                    if (err) Log.error("Init", err);
                    geos[0].routes.push(route);
                    geos[0].save();
                    checkAndCallback(callbacks)
                });
            } else {
                checkAndCallback(callbacks)
            }
        });
    });
};