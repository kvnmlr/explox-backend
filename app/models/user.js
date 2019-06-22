'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const ObjectId = require('mongoose').Types.ObjectId;
const Schema = mongoose.Schema;
const oAuthTypes = ['strava'];
const TAG = 'models/user';

const UserSchema = new Schema({
    firstName: {type: String, default: ''},
    lastName: {type: String, default: ''},
    email: {type: String, default: '', index: {unique: true}},
    username: {type: String, default: '', trim: true, index: {unique: true}},
    provider: {type: String, default: ''},
    fullyRegistered: {type: Boolean, default: false},
    visitedActivityMap: {type: Boolean, default: false},
    creatorTutorial: {type: Boolean, default: false},
    firstTimeUsage: {type: Boolean, default: true},
    hashed_password: {type: String, default: ''},
    salt: {type: String, default: ''},
    authToken: {type: String, default: ''},
    stravaId: {type: String, default: ''},
    strava: {},
    stravaStats: {},
    routes: [{type: Schema.ObjectId, ref: 'Route'}],
    activities: [{type: Schema.ObjectId, ref: 'Activity'}],
    creatorResults: [{type: Schema.ObjectId, ref: 'CreatorResult'}],
    role: {type: String, default: 'user'},
    subscriptions: [{type: String, default: ''}],
    createdAt: {type: Date, default: Date.now},
    lastLogin: {type: Date, default: Date.now},
    lastUpdated: {type: Date, default: Date.now},
    demographics: {},
    cyclingBehaviour: {},
    routePlanning: {},
    questionnaireInfo: {},
});

const validatePresenceOf = value => value && value.length;

UserSchema
    .virtual('password')
    .set(function (password) {
        this._password = password;
        this.salt = this.makeSalt();
        this.hashed_password = this.encryptPassword(password);
    })
    .get(function () {
        return this._password;
    });

/**
 * Validations only apply when signing up traditionally
 */
UserSchema.path('firstName').validate(function (name) {
    if (this.skipValidation()) return true;
    return name.length;
}, 'First name cannot be blank');
UserSchema.path('lastName').validate(function (name) {
    if (this.skipValidation()) return true;
    return name.length;
}, 'Last name cannot be blank');
UserSchema.path('email').validate(function (email) {
    if (this.skipValidation()) return true;
    return email.length;
}, 'Email cannot be blank');

UserSchema.path('email').validate(function (email) {
    const User = mongoose.model('User');
    if (this.skipValidation()) return (true);

    // Check only when it is a new user or when email field is modified
    if (this.isNew || this.isModified('email')) {
        User.find({email: email}).exec(function (err, users) {
            return (!err && users.length === 0);
        });
    } else return (true);
}, 'Email already exists');

UserSchema.path('username').validate(function (username) {
    if (this.skipValidation()) return true;
    return username.length;
}, 'Username cannot be blank');

UserSchema.path('hashed_password').validate(function (hashed_password) {
    if (this.skipValidation()) return true;
    return hashed_password.length && this._password.length;
}, 'Password cannot be blank');


/**
 * Pre-save hook
 */

UserSchema.pre('save', function (cb) {
    if (!this.isNew) return cb();

    if (!validatePresenceOf(this.password) && !this.skipValidation()) {
        cb(new Error('Invalid password'));
    } else {
        cb();
    }
});

UserSchema.methods = {
    /**
     * Authenticate - check if the passwords are the same
     * @param {String} plainText
     * @return {Boolean}
     */
    authenticate: function (plainText) {
        return this.encryptPassword(plainText) === this.hashed_password;
    },

    /**
     * Make salt
     * @return {String}
     */
    makeSalt: function () {
        return Math.round((new Date().valueOf() * Math.random())) + '';
    },

    /**
     * Encrypt password
     * @param {String} password
     * @return {String}
     */
    encryptPassword: function (password) {
        if (!password) return '';
        try {
            return crypto
                .createHmac('sha1', this.salt)
                .update(password)
                .digest('hex');
        } catch (err) {
            return '';
        }
    },

    /**
     * Validation is not required if using OAuth
     */
    skipValidation: function () {
        return ~oAuthTypes.indexOf(this.provider);
    }
};

/**
 * Statics
 */

UserSchema.statics = {

    /**
     * Populates all activities, this can get quite large so only use it when all data is required.
     * @param _id
     * @param options
     */
    load_full: function (_id, options) {
        options.select = options.select || '-hashed_password -lastLogin -salt';
        return this.findOne({_id: ObjectId(_id)})
            .populate({
                path: 'activities',
                populate: {
                    path: 'geo',
                    model: 'Geo'
                }
            })
            .populate({
                path: 'routes',
                populate: {
                    path: 'geo',
                    model: 'Geo'
                }
            })
            .select(options.select)
            .exec();
    },

    /**
     * Returns only the fully populated activities for the given user id
     * @param _id
     * @param options
     */
    load_activities: function (_id, options) {
        options.select = options.select || 'activities';
        return this.findOne({_id: ObjectId(_id)})
            .populate({
                path: 'activities',
                populate: {
                    path: 'geo',
                    select: 'location',
                },
            })
            .select(options.select)
            .exec();
    },

    /**
     * Returns only the fully populated routes for the given user id
     * @param _id
     * @param options
     */
    load_routes: function (_id, options) {
        options.select = options.select || 'routes';
        return this.findOne({_id: ObjectId(_id)})
            .sort({createdAt: 'desc'})
            .populate({
                path: 'routes',
                select: 'title geo',
                populate: {
                    path: 'geo',
                    select: 'location',
                },
            })
            .select(options.select)
            .exec();
    },

    /**
     * Load
     * @param {Object} options
     * @param cb
     */
    load_options: function (options, cb) {
        options.select = options.select || '-hashed_password -salt';
        return this.findOne(options.criteria)
            .select(options.select)
            .sort({createdAt: 'desc'})
            .populate({
                path: 'routes',
                select: '-geo -parts',
            })
            .populate({
                path: 'activities',
                select: '-geo',
            })
            .populate({
                path: 'creatorResults',
            })
            .exec(cb);
    },

    /**
     * Find route by id
     * @param {ObjectId} _id the id
     */
    load: function (_id) {
        return this.load_options({criteria: {_id: _id}});
    },

    /**
     * Update user by id
     * @param {ObjectId} id
     * @param data data to update
     */
    update_user: function (id, data) {
        return this.update({_id: ObjectId(id)}, data).exec();
    },

    /**
     * Returns all (unpopulated) users matching the given options
     * @param options
     * @returns {Promise|*|RegExpExecArray}
     */
    list: function (options) {
        options.select = options.select || '-hashed_password -salt';
        const sort = options.sort || {createdAt: -1};
        const criteria = options.criteria || {};
        return this.find(criteria)
            .select(options.select)
            .sort(sort)
            .exec();
    }
};

mongoose.model('User', UserSchema);
