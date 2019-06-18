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
    to: config.email,
    subject: 'This is a test email',
};

module.exports = {
    registeredConfirmation: function (user) {
        mailOptions.to = user.email;
        mailOptions.subject = 'ExploX Registration Successful';
        mailOptions.html =
            '<h2 style="color: #ee5b19">Welcome to ExploX</h2>' +
            '<p><b>You are now registered and can use all features.</b></p>' +
            '<p>We will reward your participation in the study with the chance to win one of <b>6 x 25€ Amazon Voucher</b> that\n' +
            'you will receive\n' +
            'at the end of the study. You have to fulfill the following criteria in order to receive the voucher:</p>\n' +
            '<ul>\n' +
            '<li>You have completed the following questionnaires and you are eligible to participate</li>\n' +
            '<li>You have done at least 15 (successful) route generations and rated each of the resulting routes</li>\n' +
            '<li>You have filled out the User Experience Questionnaire at the end of the study</li>\n' +
            '<li>You have filled out a short qualitative questionnaire and provided feedback</li>\n' +
            '</ul>\n' +
            '<br>\n' +
            '<p><b style="color: #ee5b19">Additionally:</b> The participants that actually cycle at least 2 of\n' +
            'the generated routes,\n' +
            'track and save them as Strava activities and give us detailed information about the routes can\n' +
            'win a <b>30€ Voucher</b>. If you did this and did not receive an automatic e-mail within one week after the study period, please contact us.\n' +
            '</p>\n' +
            '<br>' +
            '<p><b>You can see the progress of your study duties in your personal profile page. ' +
            'Visit Your Profile: </b>' + config.frontend_url + 'dashboard</p>';
        transporter.sendMail(mailOptions, function (error, info) {
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
            '<h2>Invitation to ExploX</h2>' +
            '<p>Hey' + ((invitation.receiver !== '') ? ' ' + invitation.receiver : '') + ',</p>' +
            '<p>' + invitation.sender + ' wants to use ExploX for Cyclists together with you.</p>' +
            '<p><b>Find out more: </b><a href="' + config.frontend_url + '">ExploX Website</a></p>' +
            '<p><b>Accept invitation: </b><a href="' + config.frontend_url + 'login">Register and Login</a></p>';
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },

    feedbackReceived: function (feedback) {
        mailOptions.to = config.email;
        mailOptions.subject = '[ExploX] New Feedback Received';
        mailOptions.html =
            '<h2>New Feedback:</h2>' +
            '<p><b>Email: </b>' + feedback.email + '</p>' +
            '<p><b>Message: </b>' + feedback.body + '</p>';
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }

        });
    },

    newUserRegistered: function (user) {
        mailOptions.to = config.email;
        mailOptions.subject = '[ExploX] New User Registered';
        mailOptions.html =
            '<h2>New Registration:</h2>' +
            '<p><b>Name: </b>' + user.name + '</p>' +
            '<p><b>Username: </b>' + user.username + '</p>' +
            '<p><b>E-Mail: </b>' + user.email + '</p>' +
            '<img src="' + user.strava.profile + '"/>';
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },

    crawlerFinished: function () {
        mailOptions.to = config.email;
        mailOptions.subject = '[ExploX] Crawler finished';
        mailOptions.html =
            '<h2>Crawler Finished:</h2>' +
            '<p>The crawler has finished and is now repeating old locations.</p>';
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }

        });
    },
};
