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
    name: {type: String, default: '', trim: true},  // Optional name for this coordinate (e.g. "DFKI")
    location: Schema.Types.Point,
    createdAt: {type: Date, default: Date.now}
},{ autoIndex: false });
GeoSchema.index({ location : '2dsphere' },{unique: true, name: 'location_2dsphere'}); // TODO geht nicht

/**
 * Validations
 */

GeoSchema.path('location').required(true, 'Coordinates cannot be blank');

/**
 * Pre-remove hook
 */

GeoSchema.pre('remove', function (next) {
    // const imager = new Imager(imagerConfig, 'S3');
    // const files = this.image.files;

    // if there are files associated with the item, remove from the cloud too
    // imager.remove(files, function (err) {
    //   if (err) return next(err);
    // }, 'Route');

    next();
});

/**
 * Statics
 */

GeoSchema.statics = {

    /**
     * Find geo data by id
     *
     * @param {ObjectId} id
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

mongoose.model('GeoJSON', GeoSchema);
