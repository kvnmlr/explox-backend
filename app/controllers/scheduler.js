'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/scheduler';
const schedule = require('node-schedule');
const crawler = require('./crawler');
const strava = require('./strava');
const backup = require('mongodb-backup');
const config = require('../../config');
const fs = require('fs');
const mongoose = require('mongoose');
const User = mongoose.model('User');

const heartbeatTask = function (fireDate) {
    Log.log(TAG, 'Heartbeat task ran at: ' + fireDate);
};

const updateLimitsTask = async function (fireDate) {
    Log.log(TAG, 'Limit update task ran at: ' + fireDate);
    await strava.queryLimits();
};

let coarseSegmentCrawlerTask = async function (fireDate) {
    Log.log(TAG, 'Crawl coarse segments task ran at: ' + fireDate);
    await crawler.crawlSegments({detailed: false});
};

let fineSegmentCrawlerTask = async function (fireDate) {
    Log.log(TAG, 'Crawl fine segments task ran at: ' + fireDate);
    await crawler.crawlSegments({detailed: true});
};

let updateUserTask = async function (fireDate) {
    Log.log(TAG, 'Update user task ran at: ' + fireDate);
    let users = await User.list({sort: {lastUpdated: 1}});
    for (const profile of users) {
        let req = {
            profile: profile
        };
        if (profile.provider === 'strava') {
            await strava.updateUser(req);
        }
    }
};

let backupTask = async function (fireDate) {
    Log.log(TAG, 'Backup task ran at: ' + fireDate);

    const now = new Date();
    const date = now.getDate() + '-' + now.getMonth() + '-' + now.getFullYear() + '-' + now.getHours() + '-' + now.getMinutes();
    let path = './backup/';

    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    path += date;
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }

    backup({
        uri: config.db,
        root: path,
        callback: function (err) {
            if (err) {
                Log.error(TAG, 'Error during backup', err);
            } else {
                Log.log(TAG, 'Backup successful');
            }
        }
    });
};

exports.init = function () {
    Log.log(TAG, 'Initialize Scheduler');

    /** Test Task:
     * Period: Every 60 seconds
     * Task: Outputs a heartbeat */
    // schedule.scheduleJob('0 * * * * *', heartbeatTask);

    /** Limit Update Task:
     * Period: Every 60 seconds
     * Task: Updates API Limits */
    // schedule.scheduleJob('0 * * * * *', updateLimitsTask);

    /** Coars Segment Crawler Task:
     * Period: Every eleven minutes during the night (0 - 6)
     * Task: Crawls coarse segments (i.e. large radius)  */
    schedule.scheduleJob('0 0-59/7 0-23 * * *', coarseSegmentCrawlerTask);

    /** Detailed Segment Crawler Task:
     * Period: 4 times every hour (1 - 23)
     * Task: Crawls detailed segments (i.e. small radius) */
    schedule.scheduleJob('0 0-59/9 0-23 * * *', fineSegmentCrawlerTask);

    /** Update User Task:
     * Period: 4 times every hour during the night (0 - 6)
     * Task: Takes a portion all users and synchronizes their profiles */
    schedule.scheduleJob('0 0-59/15 0-6 * * *', updateUserTask);

    /** Backup Task:
     * Period: Once at 4:20 am
     * Task: Create a backup of the whole database
     */
    schedule.scheduleJob('0 20 4 * * *', backupTask);
};

exports.crawler = async function (req, res) {
    if (req.query.detailed === 'true') {
        await fineSegmentCrawlerTask(Date.now());
    } else if (req.query.detailed === 'false') {
        await coarseSegmentCrawlerTask(Date.now());
    }
    res.json({});
};

exports.updateUsers = async function (req, res) {
    await updateUserTask(Date.now());
    res.json({});
};

exports.updateLimits = async function (req, res) {
    await updateLimitsTask(Date.now());
    res.json({});
};

exports.backup = async function (req, res) {
    await backupTask(Date.now());
    res.json({});
};

