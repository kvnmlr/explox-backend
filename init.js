'use strict';

const Log = require('./app/utils/logger');
const TAG = 'Init';
const  mongoose = require('mongoose');
const Route = mongoose.model('Route');
const Geo = mongoose.model('Geo');
const User = mongoose.model('User');
const Settings = mongoose.model('Settings');
const scheduler = require('./app/controllers/scheduler');
const crawler = require('./app/controllers/crawler');

let geos = [];
let adminRole, userRole;

exports.init = async function () {
    Log.log('Init', 'Initializing database');

    try {
        await createRoles();
        let initialized = await createDefaultAdmins();
        if (!initialized) {
            await createDefaultUsers();
            await createDefaultSettings();
            // await createSampleRoute();
        }
        scheduler.init();
        crawler.init();
        finished();
    } catch (e) {
        Log.error(TAG, 'An error occurred during initialization', e);
    }
};

const createDefaultGeo1 = async function () {
    await createDefaultGeo('init1', 23.600800037384033, 46.76758746952729);
};
const createDefaultGeo2 = async function () {
    await createDefaultGeo('init2', 25.600800037384033, 48.76758746952729);
};
const createDefaultGeo3 = async function () {
    await  createDefaultGeo('init3', 65.600800037384033, 2.76758746952729);
};

const createDefaultGeo = async function (name, lat, long) {
    Log.debug(TAG, 'createDefaultGeo');
    const options = {
        criteria: {'name': name}
    };

    let geo = await Geo.load_options(options);
    if (!geo) {
        const coords = [];
        coords[1] = lat;
        coords[0] = long;

        const geo = new Geo({
            name: name,
            location: {
                type: 'Point',
                coordinates: coords
            }
        });

        await geo.save();
        geos[geos.length] = geo;

    }
    Log.debug(TAG, 'createDefaultGeo done');

};

const createDefaultAdmins = async function () {
    const options = {
        criteria: {'email': 'admin@explox.de'}
    };
    let user = await User.load_options(options);
    if (!user) {
        Log.debug(TAG, 'createDefaultAdmins');
        user = new User({
            firstName: 'System',
            lastName: 'Admin',
            email: 'admin@explox.de',
            username: 'System Admin',
            provider: 'local',
            password: 'manager',
            role: adminRole,
            createdAt: Date.now(),
            fullyRegistered: true,
        });
        await user.save();
        Log.debug(TAG, 'createDefaultAdmins done');
        return false;
    }
    return true;
};

const createDefaultUsers = async function () {
    Log.debug(TAG, 'createDefaultUsers');
    const options = {
        criteria: {'email': 'user@explox.de'}
    };
    let user = await User.load_options(options);
    if (!user) {
        user = new User({
            firstName: 'System',
            lastName: 'User',
            email: 'user@explox.de',
            username: 'System User',
            provider: 'local',
            password: 'password',
            role: userRole,
            createdAt: Date.now(),
            fullyRegistered: true,
        });
        await user.save();
    }
    Log.debug(TAG, 'createDefaultUsers done');
};

const createDefaultSettings = async function () {
    let setting = await Settings.loadValue('api');
    if (!setting) {
        setting = new Settings({
            key: 'api',
            value: {
                shortTerm: 0,
                longTerm: 0,
            }
        });
        await setting.save();
    }
};

const createRoles = function () {
    adminRole = 'admin';
    userRole = 'user';
};

const createSampleRoute = async function () {
    Log.debug(TAG, 'createSampleRoute');

    const optionsUser = {
        criteria: {'name': 'user'}
    };
    let user = await User.load_options(optionsUser);
    const optionsRoute = {
        criteria: {'title': 'Saarbrücken Uni Route'}
    };
    let route = await Route.load_options(optionsRoute);
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
        await route.save();
        if (geos.length > 0) {
            geos[0].routes.push(route);
            await geos[0].save();
        }
    }
    Log.debug(TAG, 'createSampleRoute done');
};

const finished = function () {
    Log.log('Init', '_______Server Ready________');
};
