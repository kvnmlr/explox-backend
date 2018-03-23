'use strict';

const Log = require('../utils/logger');
const TAG = "map";

/**
 * Transforms an array of db.geos into the data format used by leaflet.js to display a route on the map
 * @param geos array of geos
 * @param exploredGeos array of explored geos
 */
exports.generateRouteMap = function(geos, exploredGeos) {
    const routeGeo = [];
    Log.debug(TAG, geos.length);
    const len = geos.length < 200 ? geos.length : 200;
    for (let i = 0; i < len; ++i) {
        if (geos[i].location) {
            const coords = 'L.latLng('+geos[i].location.coordinates[1] + ',' + geos[i].location.coordinates[0]+')';
            routeGeo.push(coords);        }
    }
    Log.debug(TAG, "", routeGeo);

    const exploredData = exports.generateExploredMapData(exploredGeos);
    exploredData.marker = {text: "A very cool route.<br> 80% undiscovered.", coords: [25.721, -80.270]};
    exploredData.hasRoute = true;
    exploredData.config = getConfig(geos /*union with exploredGeos*/);         // general map configuratio (e.g. zoom)
    exploredData.routeData = routeGeo;
    return exploredData;
};

/**
 * Transforms an array of db.geos into the data format used by heatmao.js to show the explored map
 * @param exploredGeos
 */
exports.generateExploredMapData = function(exploredGeos) {
    const mapConfig = getConfig(exploredGeos); // general map configuratio (e.g. zoom)
    const maskConfig = getMaskConfiguration(); // mask

    var data = {
        max: 8,         // only used for dynamic content. Always set it to total number of points.
        data: exploredGeos
    };
    return {
        marker: [],
        maskConfig: maskConfig,
        config: mapConfig,
        heatmapData: data,
        hasRoute: false,
        routeData: ["L.latLng(0.0000000,0.00000001)"]
    };
};

/**
 * Returns the configuration for the explored map
 */
var getMaskConfiguration = function() {
    var config = {
        radius: 100,              // radius in pixels or in meters (see useAbsoluteRadius)
        useAbsoluteRadius: true,    // true: r in meters, false: r in pixels
        color: '#000',              // the color of the layer
        opacity: .8,                // opacity of the not covered area
        noMask: false,              // true results in normal (filled) circled, instead masked circles
        lineColor: '#A00',          // color of the circle outline if noMask is true
        blur: .5

    };
    return config;
};

/**
 * !!! NOT USED ATM !!! Returns the configuration for the explored map
 */
var getHeatmapConfig = function() {
    var config = {
        // this is static and should not depend on geos.
        radius: .5,
        maxOpacity: 100,
        minOpacity: 0.5,
        scaleRadius: true,
        useLocalExtrema: true,
        latField: 'lat',
        lngField: 'lng',
        valueField: 'count',
        //blur: .75,
        //backgroundColor: 'rgba(0,0,0,1)',
        gradient: {
            // enter n keys between 0 and 1 here
            // for gradient color customization
            '0': 'red',
            '.5': 'blue',
            '.8': 'red',
            '.95': 'rgba(255,255,255,0.001)'
            //'.95': 'transparent'

        },
    };
    return config;
};

/**
 * Returns the configuration for the leaflet map (explored map)
 */
var getConfig = function (geos) {
    var config = {
        // Probably not needed because we use fitBounds which does this automatically
        zoom: 11,                   // Zoom out such that every point is visible
        center: [49.21296,7.127770000000001],  // Center in the middle of the points
        scrollWheelZoom: false,     // Prevents scrolling the map when scrolling the page (maybe turn on for non-mobile page)
    };
    return config;
};
