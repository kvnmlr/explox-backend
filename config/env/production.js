'use strict';

module.exports = {
    env: 'production',
    db: 'mongodb://localhost/exploxdb_prod',
    frontend_url: 'https://umtl.dfki.de/explox/',
    email: process.env.EMAIL,
    email_password: process.env.EMAIL_PASSWORD,
    mapbox_token: process.env.MAPBOX_TOKEN,
    strava: {
        clientID: process.env.STRAVA_CLIENTID,
        clientSecret: process.env.STRAVA_SECRET,
        callbackURL: 'https://umtl.dfki.de/explox/backend/auth/strava/callback'
    },
};
