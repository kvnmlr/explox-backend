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
    name: {type: String, default: '', index: {unique: true}},   // name of the role, currently either "user" or "admin"
    permissions: [{type: String, default: ''}],                 // list of string permissions, currently not used
});

RoleSchema.path('name').required(true, 'Role name cannot be blank');


RoleSchema.statics = {

    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    load_options: function (options, cb) {
        options.select = options.select || 'name';
        return this.findOne(options.criteria)
            .select(options.select)
            .exec(cb);
    },
};

mongoose.model('Role', RoleSchema);
