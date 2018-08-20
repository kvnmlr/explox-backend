'use strict';

/**
 * Expose
 */

module.exports = {
    db: 'mongodb://localhost/exploxdb_prod',
    email: process.env.EMAIL,
    email_password: process.env.EMAIL_PASSWORD,
    mapbox_token: process.env.MAPBOX_TOKEN,
    strava: {
        clientID: process.env.STRAVA_CLIENTID,
        clientSecret: process.env.STRAVA_SECRET,
        callbackURL: 'umtl.dfki.de/auth/strava/callback'
    },
};
