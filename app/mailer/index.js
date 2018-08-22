'use strict';

const nodemailer = require('nodemailer');
const Log = require('../utils/logger');
const config = require('../../server').config;
const TAG = 'Mailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.email,
        pass: config.email_password
    }
});

let mailOptions = {
    from: '"ExploX" <' + config.email + '>',
    to: 'kevin.mueller194@gmail.com',
    subject: 'This is a test email',
    text: 'It works'
};

module.exports = {
    registeredConfirmation: function (user) {
        mailOptions.to = user.email;
        mailOptions.subject = 'ExploX Registration Successful';
        mailOptions.html =
            '<h2>Welcome to ExploX</h2>' +
            '<p>You are now registered and can use all functions.</p>' +
            '<p><b>Visit Your Profile: </b>' + config.frontend_url + 'dashboard</p>';
        transporter.sendMail(mailOptions, function (error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
        this.newUserRegistered(user);
    },

    invite: function (invitation) {
        mailOptions.to = invitation.email;
        mailOptions.subject = invitation.sender + ' invited you to ExploX';
        mailOptions.html =
            '<h2>Invitation to Explox</h2>' +
            '<p>Hey' + ((invitation.receiver !== '') ? ' ' + invitation.receiver : '') + ',</p>' +
            '<p>' + invitation.sender + ' wants to use ExploX for Cyclists together with you.</p>' +
            '<p><b>Find out more: </b><a href="' + config.frontend_url + 'about">ExploX Website</a></p>' +
            '<p><b>Accept invitation: </b><a href="' + config.frontend_url + 'login">Register and Login</a></p>';
        transporter.sendMail(mailOptions, function (error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },

    feedbackReceived: function (feedback) {
        mailOptions.subject = '[ExploX] New Feedback Received';
        mailOptions.html =
            '<h2>New Feedback:</h2>' +
            '<p><b>Email: </b>' + feedback.email + '</p>' +
            '<p><b>Message: </b>' + feedback.body + '</p>';
        transporter.sendMail(mailOptions, function (error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },

    newUserRegistered: function (user) {
        mailOptions.subject = '[ExploX] New User Registered';
        mailOptions.html =
            '<h2>New Registration:</h2>' +
            '<p><b>Name: </b>' + user.name + '</p>' +
            '<p><b>Username: </b>' + user.username + '</p>' +
            '<p><b>E-Mail: </b>' + user.email + '</p>' +
            '<img src="' + user.strava.profile + '"/>';
        transporter.sendMail(mailOptions, function (error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },
};