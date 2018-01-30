'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const notify = require('../mailer');
const Schema = mongoose.Schema;
const getTags = tags => tags.join(',');
const setTags = tags => tags.split(',');
var ObjectId = require('mongoose').Types.ObjectId;

/**
 * Route Schema
 */

const RouteSchema = new Schema({
    stravaId: {type: String, default: ''},
    title: {type: String, default: '', trim: true},     // Title of the route
    location: {type: String, default: '', trim: true},     // General location (e.g. the city)
    body: {type: String, default: '', trim: true},      // Optional description
    user: {type: Schema.ObjectId, ref: 'User', default: null},         // The user who created this route
    geo: [{type: Schema.ObjectId, ref: 'GeoJSON'}],         // List of geo points
    distance: {type: String, default: '', trim: true},     // Title of the route
    comments: [{
        body: {type: String, default: ''},
        user: {type: Schema.ObjectId, ref: 'User'},
        createdAt: {type: Date, default: Date.now}
    }],
    tags: {type: [], get: getTags, set: setTags},
    createdAt: {type: Date, default: Date.now},
    isRoute: {type: Boolean, default: true}
});

/**
 * Validations
 */

RouteSchema.path('title').required(true, 'Route title cannot be blank');

/**
 * Pre-remove hook
 */

RouteSchema.pre('remove', function (next) {
    // const imager = new Imager(imagerConfig, 'S3');
    // const files = this.image.files;

    // if there are files associated with the item, remove from the cloud too
    // imager.remove(files, function (err) {
    //   if (err) return next(err);
    // }, 'Route');

    next();
});

/**
 * Methods
 */

RouteSchema.methods = {

    /**
     * Save article and upload image
     *
     * @param {Object} images
     * @api private
     */

    uploadAndSave: function (image) {
        const err = this.validateSync();
        if (err && err.toString()) throw new Error(err.toString());
        return this.save();

        /*
        if (images && !images.length) return this.save();
        const imager = new Imager(imagerConfig, 'S3');
    
        imager.upload(images, function (err, cdnUri, files) {
          if (err) return cb(err);
          if (files.length) {
            self.image = { cdnUri : cdnUri, files : files };
          }
          self.save(cb);
        }, 'Route');
        */
    },

    /**
     * Add comment
     *
     * @param {User} user
     * @param {Object} comment
     * @api private
     */

    addComment: function (user, comment) {
        this.comments.push({
            body: comment.body,
            user: user._id
        });

        if (!this.user.email) this.user.email = 'email@product.com';

        this.user.email = 'kevin.mueller194@gmail.com'; // TODO remove

        notify.comment({
            article: this,
            currentUser: user,
            comment: comment.body
        });

        return this.save();
    },

    /**
     * Remove comment
     *
     * @param {commentId} String
     * @api private
     */

    removeComment: function (commentId) {
        const index = this.comments
            .map(comment => comment.id)
            .indexOf(commentId);

        if (~index) this.comments.splice(index, 1);
        else throw new Error('Comment not found');
        return this.save();
    }
};

/**
 * Statics
 */

RouteSchema.statics = {

    /**
     * Find route by id
     *
     * @param {ObjectId} id
     * @api private
     */

    load: function (_id) {
        return this.load_options({criteria: {_id: _id}}, null);
    },

    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    load_options: function (options, cb) {
        options.select = options.select || '';
        return this.findOne(options.criteria)
            .populate('user', 'name email username')
            .populate('geo')
            .populate('comments.user')
            .select(options.select)
            .exec(cb);
    },

    /**
     * List routes
     *
     * @param {Object} options
     * @api private
     */

    list: function (options, cb) {
        const criteria = options.criteria || {};
        return this.find(criteria)
            .populate('user', 'name username')
            .populate('geo')
            .sort({createdAt: -1})
            .exec(cb);
    },

    update_route: function (id, data, next) {
        return this.update({_id: ObjectId(id)}, data, function(err) {
            if (err) {
            }
            if (next) {
                next();
            }
        });
    },
};

mongoose.model('Route', RouteSchema);
