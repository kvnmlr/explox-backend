'use strict';

/**
 * Module dependencies.
 */

const mongoose = require('mongoose');
const test = require('tape');
const {cleanup} = require('./helper');
const Geo = mongoose.model('Geo');

var geos = [];
const specialPlace = 'special_place';
var createGeos = function(t) {
    var coords = [];
    coords[0] = 1.0;
    coords[1] = 1.0;

    const geo1 = new Geo({
        name: specialPlace,
        coordinates: coords
    });

    geo1.save(function () {
        geos[geos.length] = geo1;
    });

    coords = [];
    coords[0] = 2.0;
    coords[1] = 2.0;

    const geo2 = new Geo({
        coordinates: coords
    });

    geo2.save(function () {
        geos[geos.length] = geo2;
    });

    setTimeout(t.end, 100)
};

test('Clean up', cleanup);
test('Set up', createGeos);

test('Geodata available - should have one geo in the database', t => {
    Geo.count().exec(function (err, numGeos) {
        t.same(numGeos, 2, 'count of geos should be 2');
        t.end();
    });
});

test('Geodata find special - should retrieve points for a special location', t => {
    Geo.find({name: specialPlace}).exec(function (err, special) {
        t.same(special.length, 1, 'should find a special place');
        t.end()
    });
});

test('Geodata find close - should retrieve points within radius', t => {
    t.end();
});

