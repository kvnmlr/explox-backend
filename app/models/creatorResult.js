'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CreatorResultSchema = new Schema({
    createdAt: {type: Date, default: Date.now},
    user: {type: Schema.ObjectId, ref: 'User', default: null},
    query: {},
    generatedRoutes: [{type: Schema.ObjectId, ref: 'Route', default: null}],
    acceptedRoutes: [{type: Schema.ObjectId, ref: 'Route', default: null}],
    familiarityScores: [Number],

});

CreatorResultSchema.statics = {
    updateValue: function (options) {
        return this.update({key: options.key}, {value: options.value}).exec();
    },

    loadValue: function (key) {
        return this.findOne({key: key}).exec();
    },

    list: function () {
        return this.find()
            .populate('user', 'name username email')
            .populate('receiverUser', 'name username email')
            .sort({createdAt: -1})
            .exec();
    },

    load: function (_id) {
        return this.load_options({ criteria: { _id: _id } });
    },

    load_options: function (options, cb) {
        options.select = options.select || '';
        return this.findOne(options.criteria)
            .populate('user', 'name username email')
            .populate('receiverUser', 'name username email')
            .select(options.select)
            .exec(cb);
    },

};

mongoose.model('CreatorResult', CreatorResultSchema);
