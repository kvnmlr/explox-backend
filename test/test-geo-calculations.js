'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const test = require('tape');
const {cleanup} = require('./helper');
const Geo = mongoose.model('Geo');

var geos = [];
var coordinates = [];
const specialPlace1 = 'dfki';
const specialPlace2 = 'mpii';
const specialPlace3 = 'cispa';

var createGeos = function(t) {
    var coords = [];
    coords[0] = 49.256807;
    coords[1] = 7.04217;

    const geo1 = new Geo({
        name: specialPlace1,
        coordinates: coords
    });

    geo1.save(function () {
        geos[geos.length] = geo1;
        coordinates[geos.length] = coords;
    });

    coords[0] = 49.2578580;
    coords[1] = 7.045801;

    const geo2 = new Geo({
        name: specialPlace2,
        coordinates: coords
    });

    geo2.save(function () {
        geos[geos.length] = geo2;
        coordinates[geos.length] = coords;
    });

    coords[0] = 49.259377;
    coords[1] = 7.051695;

    const geo3 = new Geo({
        name: specialPlace3,
        coordinates: coords
    });

    geo3.save(function () {
        geos[geos.length] = geo3;
        coordinates[geos.length] = coords;
    });

    setTimeout(function() {console.log("making index"); Geo.schema.index({coordinates : "2dsphere" });}, 100);
    setTimeout(t.end, 100);
};

test('Clean up', cleanup);
test('Set up', createGeos);

test('Geodata available - should have three geos in the database', t => {
    Geo.count().exec(function (err, numGeos) {
        t.same(numGeos, 3, 'count of geos should be 3');
        t.end();
    });
});

test('Geodata find special - should retrieve points for a special location', t => {
    Geo.find({name: specialPlace1}).exec(function (err, special) {
        t.same(special.length, 1, 'should find a special place');
        t.end()
    });
});

test('Geodata find close - should retrieve points within radius', t => {
    Geo.findWithinRadius({latitude : coordinates[1][0], longitude: coordinates[1][1], distance : 1000}, function(err, geos) {
        console.log('Geos:' + JSON.stringify(geos));
        t.same(err, null, 'should not return an error');
        t.end();
    });
});


