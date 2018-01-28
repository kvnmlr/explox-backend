'use strict';

/**
 * Module dependencies.
 */
const nodemailer = require('nodemailer');
const Log = require('../utils/logger')
const config = require('../../server').config;

const TAG = "Mailer";

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config.email,
        pass: config.email_password
    }
});

var mailOptions = {
    from: '"ExploX" <'+config.email+'>',
    to: 'kevin.mueller194@gmail.com',
    subject: 'This is a test email',
    text: 'It works'
};


/**
 * Expose
 */

module.exports = {
    registeredConfirmation: function (user, cb) {
        mailOptions.to = user.email;
        mailOptions.subject = "You have been registered!";
        mailOptions.html = "<h1>Welcome</h1><p>You are now registered!</p>'";
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    },

    updatedData: function (user, cb) {
        mailOptions.to = user.email;
        mailOptions.subject = "Data updated";
        mailOptions.html = "<p>Your data has been updated!</p>";
        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                Log.error(TAG, error);
            } else {
                Log.log(TAG, 'Email sent: ' + info.response);
            }
        });
    }
};