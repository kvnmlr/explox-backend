'use strict';

const mongoose = require('mongoose');
const StravaStrategy = require('passport-strava').Strategy;
const config = require('../');
const User = mongoose.model('User');
const Role = mongoose.model('Role');
const Invitation = mongoose.model('Invitation');
const Log = require('../../app/utils/logger');
const TAG = 'passport/strava';

module.exports = new StravaStrategy({
        clientID: config.strava.clientID,
        clientSecret: config.strava.clientSecret,
        callbackURL: config.strava.callbackURL,
        reponse_type: 'code',
        scope: 'view_private,write'
    },
    function (accessToken, refreshToken, profile, done) {
        const options = {
            criteria: {'strava.id': parseInt(profile.id)}
        };

        User.load_options(options, async function (err, user) {
            if (err) return done(err);
            if (!user) {
                user = new User({
                    activities: [],
                    routes: [],
                    fullyRegistered: false,
                    firstName: profile.name.first,
                    lastName: profile.name.last,
                    email: profile._json.email,
                    username: profile.displayName,
                    provider: 'strava',
                    strava: profile._json,
                    authToken: accessToken,
                    stravaId: profile.id,
                    role: 'user',
                    demographics: {
                        q1: '0',
                        q2: '0',
                        q3: '0',
                        q3Text: '',
                        q4: '0',
                        q5: '0',
                        q5Text: '',
                        q6: '0'
                    },
                    cyclingBehaviour: {
                        q1: '0',
                        q2: '0',
                        q3: [],
                        q4: [],
                        q5: '0',
                        q6: '0',
                        q7: '0',
                        q8: {
                            i1: 0,
                            i2: 0,
                            i3: 0,
                            i4: 0,
                            i5: 0,
                            i6: 0,
                            i7: 0,
                        }
                    },
                    routePlanning: {
                        q1: {
                            i1: 0,
                            i2: 0,
                            i3: 0,
                            i4: 0,
                            i5: 0,
                            i6: 0,
                        },
                        q2: [],
                        q3: '',
                        q4: '0',
                        q5: {
                            i1: 0,
                            i2: 0,
                            i3: 0,
                            i4: 0,
                            i5: 0,
                            i6: 0,
                            i7: 0,
                        },
                        q6: '',
                        q7: {
                            i1: 0,
                            i2: 0,
                            i3: 0,
                            i4: 0,
                            i5: 0,
                            i6: 0,
                            i7: 0,
                            i8: 0,
                            i9: 0,
                        },
                    },
                    questionnaireInfo: {
                        eligible: false,
                        canUseWebsite: false,
                        participates: false,
                    },
                });
                Log.debug(TAG, user);
                await user.save(async function (err, user) {
                    Log.debug(TAG, user);
                    if (err) {
                        Log.error(TAG, err);
                    }
                    const invitation = await Invitation.load_options({email: user.email});
                    if (invitation) {
                        invitation.accepted = true;
                        invitation.receiverUser = user;
                        await invitation.save();
                    }
                    return done(err, user);
                });
            } else {
                await User.update_user(user._id, {
                    authToken: accessToken,
                    stravaId: profile.id,
                    strava: profile._json,
                });
                return done(err, user);
            }
        });
    }
);
