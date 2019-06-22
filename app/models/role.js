'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RoleSchema = new Schema({
    name: {type: String, default: '', index: {unique: true}},   // name of the role, currently either "user" or "admin"
    permissions: [{type: String, default: ''}],                 // list of string permissions, currently not used
});

RoleSchema.path('name').required(true, 'Role name cannot be blank');
RoleSchema.statics = {

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
};

mongoose.model('Role', RoleSchema);
