'use strict';

const mongoose = require('mongoose');
const test = require('tape');
const request = require('supertest');
const app = require('../server');
const {cleanup} = require('./helper');
const User = mongoose.model('User');
const Route = mongoose.model('Route');
const agent = request.agent(app);

const _user = {
    email: 'foo@email.com',
    firstName: 'Foo',
    lastName: 'Bar',
    username: 'foobar',
    password: 'foobar'
};

test('Clean up', cleanup);

test('Create user', async t => {
    const user = new User(_user);
    return await user.save(t.end);
});

test('POST /routes - when not logged in - should redirect to /login', t => {
    request(app)
        .post('/routes')
        .expect('Content-Type', /json/)
        .expect(400)    // Bad Request
        .end(t.end);
});

test('User login', t => {
    agent
        .post('/login')
        .field('email', _user.email)
        .field('password', _user.password)
        .expect('Content-Type', /json/)
        .expect(200)    // OK
        .end(t.end);
});

test('POST /routes - invalid form - should respond with error', t => {
    agent
        .post('/routes')
        .field('title', '')
        .field('body', 'foo')
        .field('tags', 'cycling,road')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(async err => {
            const count = await Route.count().exec();
            t.ifError(err);
            t.same(count, 0, 'Count should be 0');
            t.end();
        });
});

test('POST /routes - valid form - should redirect to the new article page', t => {
    agent
        .post('/routes')
        .field('title', 'foo')
        .field('body', 'bar')
        .field('tags', 'cycling,road')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(async err => {
            const count = await Route.count().exec();
            t.ifError(err);
            t.same(count, 1, 'Count should be 1');
            t.end();
        });
});

test.onFinish(() => process.exit(0));
