'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Role Schema
 */

const SettingsSchema = new Schema({
    key: {type: String, default: '', index: {unique: true}},
    value: {type: Schema.Types.Mixed, default: {}},
});

SettingsSchema.path('key').required(true, 'Key name cannot be blank');

SettingsSchema.statics = {
    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    updateValue: function (options) {
        return this.update({key: options.key}, {value: options.value}).exec();
    },

    loadValue: function (key) {
        return this.findOne({key: key}).exec();
    },
};

mongoose.model('Settings', SettingsSchema);
