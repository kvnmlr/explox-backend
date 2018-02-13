'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const GeoJSON = require('mongoose-geojson-schema');

/**
 * Route Schema
 */

const GeoSchema = new Schema({
    // TODO extend schema with a list of routes/activities that contain this point
    name: {type: String, default: '', trim: true},              // Optional name for this coordinate (e.g. "DFKI")
    location: {type: Schema.Types.Point, index: '2dsphere'},    // The coordinate with 2dsphere index for spatial queries
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
        return this.findOne({_id}).exec();
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
            .sort({createdAt: -1})
            .limit(limit)
            .skip(limit * page)
            .exec();
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
        let distance = (options.distance || 1000);
        return this.aggregate([
            { $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    },
                    maxDistance: distance,
                    minDistance: 0.001,            // do not retrieve the point itself
                    spherical: true,
                    distanceField: "distance",
                }}
        ]).limit(limit).sort('distance').exec(cb)
    },

    /**
     *
     * @param options: longitude, latitude
     * @param cb
     */
    findClosest: function (options, cb) {
        options.limit = 1;
        return this.findWithinRadius(options, cb);
    }
};

mongoose.model('Geo', GeoSchema);
