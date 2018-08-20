'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/general';
const mongoose = require('mongoose');
const Feedback = mongoose.model('Feedback');

exports.home = async(function (req, res) {
    res.json({
        text: 'Home text',
    });
});

exports.hub = async(function (req, res) {
    res.json({
        text: 'Hub text',
    });
});

exports.about = async(function (req, res) {
    res.json({
        version: '0.1',
        text: 'About text'
    });
});

exports.feedback = async function (req, res) {
    const feedback = await Feedback.list();
    console.log(feedback);
    res.json(feedback);
};

exports.submitFeedback = async function (req, res) {
    req.body.email = (req.body.email).toLowerCase();
    // console.log(req.body);
    const feedback = new Feedback(req.body);
    try {
        await feedback.save();
        res.json({});
    } catch (err) {
        res.status(400).json({
            error: err,
            user: null
        });
    }
};

exports.destroyFeedback = async function (req, res) {
    await req.feedback.remove();
    res.json({
        flash: {
            type: 'success',
            text: 'Feedback removes'
        }
    });
};

exports.loadFeedbackOptions = async(function* (req, res, next, _id) {
    try {
        req.feedback = yield Feedback.load(_id);
        if (!req.feedback) return next(new Error('User not found'));
    } catch (err) {
        return next(err);
    }
    next();
});