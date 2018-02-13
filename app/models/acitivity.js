'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Role Schema
 */

const ActivitySchema = new Schema({
    /** TODO extend schema
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
     * @param {Function} cb
     * @api private
     */

    load_options: function (options, cb) {
        options.select = options.select || 'activityId';
        return this.findOne(options.criteria)
            .populate('geo')
            .select(options.select)
            .exec(cb);
    },

    list: function (options, cb) {
        const criteria = options.criteria || {};
        return this.find(criteria)
            .sort({createdAt: -1})
            .exec(cb);
    }
};

mongoose.model('Activity', ActivitySchema);
