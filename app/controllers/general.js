'use strict';

const {wrap: async} = require('co');
const Log = require('../utils/logger');
const TAG = 'controllers/general';
const mongoose = require('mongoose');
const Feedback = mongoose.model('Feedback');
const Invitation = mongoose.model('Invitation');
const config = require('../../server').config;
const mailer = require('../mailer/index');

exports.home = async(function (req, res) {
    res.json({
        text: 'Home text',
        env: config
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
    res.json(feedback);
};

exports.submitFeedback = async function (req, res) {
    req.body.email = (req.body.email).toLowerCase();
    const feedback = new Feedback(req.body);
    mailer.feedbackReceived(feedback);
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

exports.invitation = async function (req, res) {
    const invitations = await Invitation.list();
    console.log(invitations);
    res.json(invitations);
};

exports.submitInvitation = async function (req, res) {
    const invite = {
        user: req.user,
        sender: req.user.name,
        receiver: req.body.name,
        email: req.body.email.toLowerCase(),
    };
    mailer.invite(invite);
    const invitation = new Invitation(invite);
    try {
        await invitation.save();
        res.json({
            flash: {
                type: 'success',
                text: 'Thanks! An invitation e-mail has been sent' + ((invite.receiver === '') ? '.' : (' to ' + invite.receiver + '.')),
            }
        });    } catch (err) {
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
            text: 'Feedback removed'
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