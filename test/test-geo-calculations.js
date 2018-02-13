'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const test = require('tape');
const {cleanup} = require('./helper');
const GeoJSON = mongoose.model('Geo');

var geos = [];
var coordinates = [];
const specialPlace1 = 'dfki';
const specialPlace2 = 'mpii';
const specialPlace3 = 'cispa';

var createGeos = function(t) {
    var coords1 = [];
    coords1[1] = 49.256807;
    coords1[0] = 7.04217;

    const geo1 = new GeoJSON({
        name: specialPlace1,
        location: {
            type: 'Point',
            coordinates: coords1
        }
    });

    geo1.save(function (err) {
        geos[geos.length] = geo1;
        coordinates[geos.length] = coords1;
    });

    var coords2 = [];
    coords2[1] = 49.2578580;
    coords2[0] = 7.045801;

    const geo2 = new GeoJSON({
        name: specialPlace2,
        location: {
            type: 'Point',
            coordinates: coords2
        }
    });

    geo2.save(function () {
        geos[geos.length] = geo2;
        coordinates[geos.length] = coords2;
    });

    var coords3 = [];
    coords3[1] = 49.259377;
    coords3[0] = 7.051695;

    const geo3 = new GeoJSON({
        name: specialPlace3,
        location: {
            type: 'Point',
            coordinates: coords3
        }
    });

    geo3.save(function () {
        geos[geos.length] = geo3;
        coordinates[geos.length] = coords3;
    });

    setTimeout(t.end, 100);
};

test('Clean up', cleanup);
test('Set up', createGeos);

test('Geodata available - should have three geos in the database', t => {
    GeoJSON.count().exec(function (err, numGeos) {
        t.same(numGeos, 3, 'count of geos should be 3');
        t.end();
    });
});

test('Geodata find special - should retrieve points for a special location', t => {
    GeoJSON.find({name: specialPlace1}).exec(function (err, special) {
        t.same(special.length, 1, 'should find a special place');
        t.end()
    });
});

test('Geodata find close - should retrieve all points within radius', t => {
    GeoJSON.findWithinRadius({latitude : coordinates[1][1], longitude: coordinates[1][0], distance : 400}, function(err, geos) {
        t.same(err, null, 'should not return an error');
        t.same(geos.length, 1, 'should return only one coordinate');        // should not return dfki itself
        t.same(geos[0].name, specialPlace2, 'should return mpii');
        t.same(Number((geos[0].distance).toFixed(1)), 288.6, 'distance between dfki and mpii should be 288.6m');
        t.end();
    });
});

test('Geodata find close - should retrieve one point within radius and limit', t => {
    GeoJSON.findWithinRadius({latitude : coordinates[1][1], longitude: coordinates[1][0], limit : 1, distance : 1000}, function(err, geos) {
        t.same(err, null, 'should not return an error');
        t.same(geos.length, 1, 'should limit the result to one item');
        t.end();
    });
});

test('Geodata find close - should retrieve all points within one kilometer', t => {
    GeoJSON.findWithinRadius({latitude : coordinates[1][1]+ 0.001 /*to return dfki*/, longitude: coordinates[1][0]}, function(err, geos) {
        t.same(err, null, 'should not return an error');
        t.same(geos.length, 3, 'should return dfki, mpii and cispa');
        t.end();
    });
});


test('Geodata find closest - should retrieve the closest coordinate', t => {
    GeoJSON.findClosest({latitude : coordinates[1][1]+ 0.001 /*not exactly dfki*/, longitude: coordinates[1][0]}, function(err, geos) {
        t.same(err, null, 'should not return an error');
        t.same(geos.length, 1, 'should return only one entry');
        t.same(geos[0].name, specialPlace1, 'should return dfki');
        t.end();
    });
});

