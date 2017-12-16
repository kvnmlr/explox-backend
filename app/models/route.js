'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const notify = require('../mailer');
const Schema = mongoose.Schema;
const getTags = tags => tags.join(',');
const setTags = tags => tags.split(',');

/**
 * Route Schema
 */

const RouteSchema = new Schema({
    title: {type: String, default: '', trim: true},     // Title of the route
    location: {type: String, default: '', trim: true},     // General location (e.g. the city)
    body: {type: String, default: '', trim: true},      // Optional description
    user: {type: Schema.ObjectId, ref: 'User', default: null},         // The user who created this route
    geo: [{type: Schema.ObjectId, ref: 'Geo'}],         // List of geo points
    comments: [{
        body: {type: String, default: ''},
        user: {type: Schema.ObjectId, ref: 'User'},
        createdAt: {type: Date, default: Date.now}
    }],
    tags: {type: [], get: getTags, set: setTags},
    createdAt: {type: Date, default: Date.now}
});

/**
 * Validations
 */

RouteSchema.path('title').required(true, 'Route title cannot be blank');
RouteSchema.path('body').required(true, 'Route body cannot be blank');

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
        return this.findOne({_id})
            .populate('user', 'name email username')
            .populate('comments.user')
            .exec();
    },

    /**
     * Load
     *
     * @param {Object} options
     * @param {Function} cb
     * @api private
     */

    load_options: function (options, cb) {
        options.select = options.select || 'title';
        return this.findOne(options.criteria)
            .select(options.select)
            .exec(cb);
    },

    /**
     * List routes
     *
     * @param {Object} options
     * @api private
     */

    list: function (options) {
        const criteria = options.criteria || {};
        const page = options.page || 0;
        const limit = options.limit || 30;
        return this.find(criteria)
            .populate('user', 'name username')
            .sort({createdAt: -1})
            .limit(limit)
            .skip(limit * page)
            .exec();
    }
};

mongoose.model('Route', RouteSchema);
