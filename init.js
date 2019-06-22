'use strict';

const Log = require('./app/utils/logger');
const TAG = 'Init';
const mongoose = require('mongoose');
const User = mongoose.model('User');
const Settings = mongoose.model('Settings');
const scheduler = require('./app/controllers/scheduler');
const crawler = require('./app/controllers/crawler');

let adminRole, userRole;

exports.init = async function () {
    Log.log('Init', 'Initializing database');

    try {
        await createRoles();
        let initialized = await createDefaultAdmins();
        if (!initialized) {
            await createDefaultUsers();
        }
        await createDefaultSettings();
        scheduler.init();
        crawler.init();
        finished();
    } catch (e) {
        Log.error(TAG, 'An error occurred during initialization', e);
    }
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
    let setting2 = await Settings.loadValue('queue');

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
    if (!setting2) {
        setting2 = new Settings({
            key: 'queue',
            value: [],
        });
        await setting2.save();
    }
};

const createRoles = function () {
    adminRole = 'admin';
    userRole = 'user';
};

const finished = function () {
    Log.log('Init', '_______Server Ready________');
};
