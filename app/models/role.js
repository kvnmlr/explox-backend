'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Role Schema
 */

const RoleSchema = new Schema({
    name: {type: String, default: ''},
    permissions: [{type: String, default: ''}],
});

RoleSchema.statics = {

    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    load: function (options, cb) {
        options.select = options.select || 'name username';
        return this.findOne(options.criteria)
            .select(options.select)
            .exec(cb);
    }
};

mongoose.model('Role', RoleSchema);
