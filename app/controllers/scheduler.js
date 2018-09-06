'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/scheduler';
const schedule = require('node-schedule');
const crawler = require('./crawler');
const strava = require('./strava');

const mongoose = require('mongoose');
const User = mongoose.model('User');

exports.init = function () {
    Log.log(TAG, 'Initialize Scheduler');

    /** Test Task:
     * Period: Every 60 seconds
     * Task: Outputs a heartbeat */
    schedule.scheduleJob('0 * * * * *', function (fireDate){
        Log.log(TAG, 'Test task ran at: ' + fireDate);
    });

    /** Limit Update Task:
     * Period: Every 60 seconds
     * Task: Updates API Limits */
    schedule.scheduleJob('0 * * * * *', function (fireDate){
        Log.log(TAG, 'Limit update task ran at: ' + fireDate);
        strava.queryLimits();
    });

    /** Coars Segment Crawler Task:
     * Period: Once every hour during the night (0 - 6) at the quarter hour (e.g. 2:15)
     * Task: Crawls coarse segments (i.e. large radius)  */
    schedule.scheduleJob('0 15 0-6 * * *', function (fireDate){
        Log.log(TAG, 'Crawl segments task ran at: ' + fireDate);
        crawler.crawlSegments({detailed: false});
    });

    /** Detailed Segment Crawler Task:
     * Period: Once every hour (1 - 23) at the full hour (e.g. 14:00)
     * Task: Crawls detailed segments (i.e. small radius) */
    schedule.scheduleJob('0 0 0-23 * * *', function (fireDate){
        Log.log(TAG, 'Crawl segments task ran at: ' + fireDate);
        crawler.crawlSegments({detailed: true});
    });

    /** Update User Task:
     * Period: Once every hour during the night (0 - 6) at the three-quarter hour (e.g. 2:45)
     * Task: Takes a 7th of all users and synchronizes their profiles */
    schedule.scheduleJob('0 45 0-6 * * *', async function (fireDate){
        Log.log(TAG, 'Update user task ran at: ' + fireDate);
        let users = await User.list({sort: {lastUpdated: 1}});
        users.forEach(async function (profile) {
            let req = {
                profile: profile
            };
            if (profile.provider === 'strava') {
                await strava.updateUser(req);
            }
        });
    });
};