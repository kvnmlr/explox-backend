'use strict';

module.exports = {
    db: 'mongodb://localhost/exploxdb_prod',
    frontend_url: 'http://umtl.dfki.de/explox/',
    email: process.env.EMAIL,
    email_password: process.env.EMAIL_PASSWORD,
    mapbox_token: process.env.MAPBOX_TOKEN,
    strava: {
        clientID: process.env.STRAVA_CLIENTID,
        clientSecret: process.env.STRAVA_SECRET,
        callbackURL: 'http://umtl.dfki.de/explox/backend/auth/strava/callback'
    },
};
