'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Log = require('../utils/logger');
const TAG = 'geo';
const ObjectId = require('mongoose').Types.ObjectId;
require('mongoose-geojson-schema');

const GeoSchema = new Schema({
    name: {type: String, default: '', trim: true},              // Optional name for this coordinate (e.g. "DFKI")
    location: {type: Schema.Types.Point, index: '2dsphere'},    // The coordinate with 2dsphere index for spatial queries, (lng, lat)
    routes: [{type: Schema.ObjectId, ref: 'Route'}],            // Routes that contain this point
    activities: [{type: Schema.ObjectId, ref: 'Activity'}],     // Activities that contain this point
    altitude: {type: Number, default: 0, trim: true},            // Altitude in meters
});

GeoSchema.path('location').required(true, 'Coordinates cannot be blank');

GeoSchema.statics = {

    /**
     * Find geo data by id
     * @param {ObjectId} _id
     */

    load: function (_id) {
        return this.findOne({_id}).exec();
    },

    /**
     * Load
     * @param {Object} options
     */

    load_options: function (options) {
        options.select = options.select || 'name';
        return this.findOne(options.criteria)
            .select(options.select)
            .exec();
    },

    /**
     * List geo data
     * @param {Object} options
     */

    list: function (options) {
        const criteria = options.criteria || {};
        const limit = options.limit || 10000;
        return this.find(criteria)
            .sort({createdAt: -1})
            .limit(limit)
            .skip(limit * Math.random() * 10)
            .exec();
    },


    findWithinRadiusSimple: function (options) {
        const latitude = options.latitude;
        const longitude = options.longitude;
        let distance = (options.distance || 10000);

        return this.geoNear({type: 'Point', coordinates: [longitude, latitude]}, {
            spherical: true,
            maxDistance: distance,
            distanceMultiplier: 6378137
        }).exec();
    },

    /**
     *
     * @param options: distance, longitude, latitude, limit
     */
    findWithinRadius: function (options) {
        const limit = options.limit || 1000000;
        const latitude = parseFloat(options.latitude);
        const longitude = parseFloat(options.longitude);
        const criteria = options.criteria || {};
        let distance = options.distance || 10000;

        return this.aggregate([
            {
                $geoNear: {
                    query: criteria,
                    near: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    maxDistance: distance,
                    minDistance: 0.00001,            // do not retrieve the point itself
                    spherical: true,
                    distanceField: 'distance',
                    limit: limit,
                }
            },
            {$sort: {distance: -1}},
        ]).exec();
    },

    findDistance: function (options) {
        options.criteria._id = ObjectId(options.criteria._id);
        return this.findWithinRadius(options);
    },

    /**
     * @param options: longitude, latitude
     */
    findClosest: function (options) {
        options.limit = 1;
        return this.findWithinRadius(options);
    },
};

mongoose.model('Geo', GeoSchema);
