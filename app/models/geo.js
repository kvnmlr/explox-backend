'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Route Schema
 */

const GeoSchema = new Schema({
    name: {type: String, default: '', trim: true},  // Optional name for this coordinate (e.g. "DFKI")
    coordinates: {
        type: [Number],     // [<longitude>, <latitude>]
        index: '2d'         // create the geospatial index
    },
    createdAt: {type: Date, default: Date.now}
});

/**
 * Validations
 */

GeoSchema.path('coordinates').required(true, 'Coordinates cannot be blank');

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

    load_options: function (_id) {
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
    }
};

mongoose.model('Geo', GeoSchema);
