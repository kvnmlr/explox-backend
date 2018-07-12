'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongoose').Types.ObjectId;

/**
 * Role Schema
 */

const ActivitySchema = new Schema({
    /** TODO 001 extend schema
     * 1. add user reference
     * 2. add distance
     * 3. add title
     */
    activityId: {type: String, default: '', trim: true,  index: {unique: true}},     // The ID this activity has in Strava
    createdAt: {type: Date, default: Date.now},                         // The creation date (i.e. when imported into ExploX)
    geo: [{type: Schema.ObjectId, ref: 'Geo'}],                     // List of references to geo points
});

ActivitySchema.statics = {

    /**
     * Load
     *
     * @param {Object} options
     * @api private
     */

    load_options: function (options) {
        options.select = options.select || 'activityId';
        return this.findOne(options.criteria)
            .populate('geo')
            .select(options.select)
            .exec();
    },

    list: function (options) {
        const criteria = options.criteria || {};
        return this.find(criteria)
            .populate('user', 'name username')
            .populate('geo', 'name location')
            .sort({createdAt: -1})
            .exec();
    },

    load: function (_id) {
        return this.load_options({criteria: {_id: ObjectId(_id)}});
    },
};

mongoose.model('Activity', ActivitySchema);
