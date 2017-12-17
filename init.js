'use strict';

var mongoose;
var Route;
var Geo;
var User;
var Role;

var geos = [];
var adminRole;
var userRole;

function executeAsynchronously(functions, timeout) {
    for(var i = 0; i < functions.length; i++) {
        setTimeout(functions[i], timeout * i);
    }
}

exports.createSampleData = function () {
    console.log("creating sample data ...");
    mongoose = require('mongoose');
    Route = mongoose.model('Route');
    Geo = mongoose.model('Geo');
    User = mongoose.model('User');
    Role = mongoose.model('Role');

    executeAsynchronously(
        [createDefaultGeo1, createDefaultGeo2, createDefaultGeo3, createDefaultAdmins, createDefaultUsers, createSampleRoute, function () {
            console.log("done");
        }], 50
    );
}

exports.init = function(next) {
    console.log("initializing ...");
    mongoose = require('mongoose');
    Route = mongoose.model('Route');
    Geo = mongoose.model('Geo');
    User = mongoose.model('User');
    Role = mongoose.model('Role');

    executeAsynchronously(
        [createRoles, createDefaultAdmins, next], 50
    );
};

const createDefaultGeo1 = function(next) {
    createDefaultGeo("init1", 23.600800037384033, 46.76758746952729, next);
};
const createDefaultGeo2 = function(next) {
    createDefaultGeo("init2", 25.600800037384033, 48.76758746952729, next);
};
const createDefaultGeo3 = function(next) {
    createDefaultGeo("init3", 65.600800037384033, 2.76758746952729, next);
};

const createDefaultGeo = function(name, lat, long, next) {
    const options = {
        criteria: {'name': name}
    };

    Geo.load_options(options, function (err, geo) {
        if (err) console.log(err);
        if (!geo) {
            const coords = [];
            coords[0] = lat;
            coords[1] = long;

            const geo = new Geo({
                name: name,
                coordinates: coords
            });

            geo.save(function (err) {
                if (err) console.log(err);
                geos[geos.length] = geo;
                if (next) {
                    next();
                }
            });
        }
    });
};


const createDefaultAdmins = function(next) {
    var options = {
        criteria: {'email': 'system@explox.de'}
    };
    User.load_options(options, function (err, user) {
        if (err) return done(err);
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
                if (err) console.log(err);
                if (next) {
                    next();
                }
            });
        }
    });
};

const createDefaultUsers = function(next) {
    var options = {
        criteria: {'email': 'user@explox.de'}
    };
    User.load_options(options, function (err, user) {
        if (err) return done(err);
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
                if (err) console.log(err);
                if (next) {
                    next();
                }
            });
        }
    });
};

const createRoles = function(next) {
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
                if (err) console.log(err);
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
                if (err) console.log(err);
            });
        }
    });
};

const createSampleRoute = function(next) {
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
                    title: 'Saarbrücken Uni Route',
                    body: 'This route leads through the univeristy in Saarbrücken.',
                    location: 'Saarbrücken',
                    user: user,
                    comments: [{
                        body: 'I ran this route today and it is very nice!',
                        user: user,
                    }],
                    tags: 'Running, Intermediate, Urban',
                    geo: geos
                });
                route.save(function (err) {
                    if (err) console.log(err);
                    if (next) {
                        next();
                    }
                });
            }
        });
    });
};