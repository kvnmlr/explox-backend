'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const GeoJSON = require('mongoose-geojson-schema');
const Log = require('../utils/logger');
const TAG = 'geo';

/**
 * Route Schema
 */

const GeoSchema = new Schema({
    name: { type: String, default: '', trim: true },              // Optional name for this coordinate (e.g. "DFKI")
    location: { type: Schema.Types.Point, index: '2dsphere' },    // The coordinate with 2dsphere index for spatial queries
    routes: [{ type: Schema.ObjectId, ref: 'Route' }],            // Routes that contain this point
    activities: [{ type: Schema.ObjectId, ref: 'Activity' }],     // Activities that contain this point
});

/**
 * Validations
 */
GeoSchema.path('location').required(true, 'Coordinates cannot be blank');

/**
 * Pre-remove hook
 */


/**
 * Statics
 */

GeoSchema.statics = {

    /**
     * Find geo data by id
     *
     * @param {ObjectId} _id
     * @api private
     */

    load: function (_id) {
        return this.findOne({ _id }).exec();
    },

    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    load_options: function (options, cb) {
        options.select = options.select || 'name';         // TODO
        return this.findOne(options.criteria)
            .select(options.select)
            .exec(cb);
    },

    /**
     * List geo data
     *
     * @param {Object} options
     * @api private
     */

    list: function (options) {
        const criteria = options.criteria || {};
        const page = options.page || 0;
        const limit = options.limit || 30;
        return this.find(criteria)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(limit * page)
            .exec();
    },


    findWithinRadiusSimple: function (options, cb) {
        const latitude = options.latitude;
        const longitude = options.longitude;
        let distance = (options.distance || 10000);

        return this.geoNear({ type: 'Point', coordinates: [longitude, latitude] }, {
            spherical: true,
            maxDistance: distance,
            distanceMultiplier: 6378137
        }, (err, geos) => {
            cb(err, geos);
        });
    },

    /**
     *
     * @param options: distance, longitude, latitude, limit
     * @param cb
     */
    findWithinRadius: function (options, cb) {
        const limit = options.limit || 100;
        const latitude = options.latitude;
        const longitude = options.longitude;
        let distance = (options.distance || 10000);
        return this.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    maxDistance: distance,
                    minDistance: 0.001,            // do not retrieve the point itself
                    spherical: true,
                    distanceField: 'distance',
                }
            }
        ]).limit(limit).sort('distance').exec(cb);
    },

    /**
     *
     * @param options: longitude, latitude
     * @param cb
     */
    findClosest: function (options, cb) {
        options.limit = 1;
        return this.findWithinRadius(options, cb);
    },

    /**
     *
     * @param options: coarseness
     * @param cb
     */
    prune: function (options, cb) {
        const coarseness = options.coarseness || 100;     // higher value means more points being merged

        // Get the count of all users
        var findOneFunction = this;
        this.count().exec(function (err, count) {
            // Get a random entry
            const random = Math.floor(Math.random() * count);

            // Again query all users but only fetch one offset by our random #
            findOneFunction.findOne().skip(random).exec(
                function (err, geo) {
                    Log.debug(TAG, 'found ', geo);
                    findOneFunction.findWithinRadiusSimple({
                        latitude: geo.location.coordinates[1],
                        longitude: geo.location.coordinates[0],
                        distance: coarseness
                    }, (err, geos) => {
                        if (err) {
                            Log.error(TAG, 'error', err);
                        }
                        Log.debug(TAG, 'found ' + geos.length + ' in radius');

                        for (let i = 0; i < geos.length; ++i) {
                            const geo = geos[i].obj;
                            Log.debug(TAG, 'edited  ', geo);
                            geo.name = 'changed';
                            geo.save((err) => {});
                        }
                    });
                });
        });
    },
};

mongoose.model('Geo', GeoSchema);
