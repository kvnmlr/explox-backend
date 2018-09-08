'use strict';

const Log = require('../utils/logger');
const TAG = 'controllers/scheduler';
const schedule = require('node-schedule');
const crawler = require('./crawler');
const strava = require('./strava');

const mongoose = require('mongoose');
const User = mongoose.model('User');


const heartbeatTask = function (fireDate){
    Log.log(TAG, 'Heartbeat task ran at: ' + fireDate);
};

const updateLimitsTask = function (fireDate){
    Log.log(TAG, 'Limit update task ran at: ' + fireDate);
    strava.queryLimits();
};

let coarseSegmentCrawlerTask = function (fireDate){
    Log.log(TAG, 'Crawl coarse segments task ran at: ' + fireDate);
    crawler.crawlSegments({detailed: false});
};

let fineSegmentCrawlerTask = function (fireDate){
    Log.log(TAG, 'Crawl fine segments task ran at: ' + fireDate);
    crawler.crawlSegments({detailed: true});
};

let updateUserTask = async function (fireDate){
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
};

exports.init = function () {
    Log.log(TAG, 'Initialize Scheduler');

    /** Test Task:
     * Period: Every 60 seconds
     * Task: Outputs a heartbeat */
    schedule.scheduleJob('0 * * * * *', heartbeatTask);

    /** Limit Update Task:
     * Period: Every 60 seconds
     * Task: Updates API Limits */
    schedule.scheduleJob('0 * * * * *', updateLimitsTask);

    /** Coars Segment Crawler Task:
     * Period: Once every hour during the night (0 - 6) at the half hour
     * Task: Crawls coarse segments (i.e. large radius)  */
    schedule.scheduleJob('0 30 0-6 * * *', coarseSegmentCrawlerTask);

    /** Detailed Segment Crawler Task:
     * Period: 4 times every hour (1 - 23)
     * Task: Crawls detailed segments (i.e. small radius) */
    schedule.scheduleJob('0 0-59/15 0-23 * * *', fineSegmentCrawlerTask);

        /** Update User Task:
     * Period: 4 times every hour during the night (0 - 6)
     * Task: Takes a portion all users and synchronizes their profiles */
    schedule.scheduleJob('0 0-59/15  0-6 * * *', updateUserTask);
};

exports.crawler = function (req, res) {
    console.log(req.query);
    if (req.query.detailed === 'true') {
        fineSegmentCrawlerTask(Date.now());
    } else if (req.query.detailed === 'false') {
        coarseSegmentCrawlerTask(Date.now());
    }
    res.json({});
};

exports.updateUsers = async function (req, res) {
    await updateUserTask(Date.now());
    res.json({});
};

exports.updateLimits = function (req, res) {
    updateLimitsTask(Date.now());
    res.json({});
};

