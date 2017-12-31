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
    activityId: {type: String, default: ''},
    createdAt: {type: Date, default: Date.now},
    geo: [{type: Schema.ObjectId, ref: 'GeoJSON'}],
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
