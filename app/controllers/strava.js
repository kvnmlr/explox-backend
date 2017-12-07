'use strict';

const strava = require('strava-v3');
const request = require('request');
const config = require('../../server').config;

/**
 * Query user data
 */

exports.getAthlete = function (token, id, next) {
    console.log('getAthlete');
    token = 'bbce2bb24e29d612f1bdc546a2a8962f9e0a8e9d';
    id = 25958351;
    strava.athletes.get({ id: id, access_token: token },function (err,payload,limits) {
        if (err) {
            console.log('Error ' + err);
            return;
        }
        console.log('Limits ' + JSON.stringify(limits));
        console.log('Payload ' + JSON.stringify(payload));
        // todo update database
    });
    next();
};

exports.authCallback = function (req, res, next) {
    var myJSONObject = { 'client_id' : config.strava.clientID, 'client_secret' : config.strava.clientSecret, 'code' : req.query.code };
    request({
        url: 'https://www.strava.com/oauth/token',
        method: 'POST',
        json: true,
        body: myJSONObject
    }, function (error, response){
        // console.log(response);

        var id = 25958351;                                      // todo read id from response
        var token = '0127883379e9c79d0d617300a8aa24a37b1362a8'; // todo read token from response
        exports.getAthlete(token, id);
        next();
    });
};