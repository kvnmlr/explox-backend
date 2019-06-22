'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = require('mongoose').Types.ObjectId;

const ActivitySchema = new Schema({
    title: {type: String, default: '', trim: true},                                 // Title of the route
    activityId: {type: String, default: '', trim: true, index: {unique: true}},    // The ID this activity has in Strava
    createdAt: {type: Date, default: Date.now},                                     // The creation date (i.e. when imported into ExploX)
    geo: [{type: Schema.ObjectId, ref: 'Geo'}],                                     // List of references to geo points
    user: {type: Schema.ObjectId, ref: 'User', default: null},                      // The user who created this route
    distance: {type: Number, default: 0, trim: true},                              // Distance in meters
    strava: {},
});

ActivitySchema.statics = {

    /**
     * Load
     * @param {Object} options
     * @api private
     */
    load_options: function (options) {
        options.select = options.select || '';
        return this.findOne(options.criteria)
            .populate('user', 'name email username')
            .populate('geo')
            .select(options.select)
            .exec();
    },

    list: function (options) {
        const criteria = options.criteria || {};
        if (!options.detailed) {
            return this.find(criteria)
                .select('-geo')
                .populate('user', 'name username')
                .sort({createdAt: -1})
                .exec();
        }
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
