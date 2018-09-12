'use strict';

const mongoose = require('mongoose');
const test = require('tape');
const request = require('supertest');
const app = require('../server');
const {cleanup} = require('./helper');
const User = mongoose.model('User');

test('Clean up', cleanup);

test('no email - should respond with errors', t => {
    request(app)
        .post('/signup')
        .field('firstName', 'Foo')
        .field('lastName', 'Bar')
        .field('username', 'foobar')
        .field('email', '')
        .field('password', 'foobar')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(async err => {
            const count = await User.count().exec();
            t.ifError(err);
            t.same(count, 0, 'count of users should be 0');
            t.end();
        });
});

test('no name - should respond with errors', t => {
    request(app)
        .post('/signup')
        .field('firstName', '')
        .field('lastName', 'Bar')
        .field('username', 'foobar')
        .field('email', 'foobar@example.com')
        .field('password', 'foobar')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(async err => {
            const count = await User.count().exec();
            t.ifError(err);
            t.same(count, 0, 'count of users should be 0');
            t.end();
        });
});

test('no password - should respond with errors', t => {
    request(app)
        .post('/signup')
        .field('firstName', 'Foo')
        .field('lastName', 'Bar')
        .field('username', 'foobar')
        .field('email', 'foobar@example.com')
        .field('password', '')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(async err => {
            const count = await User.count().exec();
            t.ifError(err);
            t.same(count, 0, 'count of users should be 0');
            t.end();
        });
});

test('valid signup - should redirect to /', t => {
    request(app)
        .post('/signup')
        .field('firstName', 'Foo')
        .field('lastName', 'Bar')
        .field('username', 'foobar')
        .field('email', 'foobar@example.com')
        .field('password', 'foobar')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(async err => {
            const count = await User.count().exec();
            const user = await User.findOne({username: 'foobar'}).exec();
            t.ifError(err);
            t.same(count, 1, 'count of users should be 1');
            t.same(user.email, 'foobar@example.com');
            t.end();
        });
});

test('strava redirect - should redirect', t => {
    request(app)
        .get('/auth/strava')
        .expect('Location', /\//)
        .expect(302)
        .end(async err => {
            t.ifError(err);
            t.end();
        });
});

test('strava auth callback - should redirect', t => {
    request(app)
        .get('/auth/strava/callback')
        .expect(302)
        .expect('Location', /\//)
        .end(async err => {
            t.ifError(err);
            t.end();
        });
});

test.onFinish(() => process.exit(0));

