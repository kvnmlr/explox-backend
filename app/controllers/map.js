'use strict';

const Log = require('../utils/logger');
const TAG = "views/users";

/**
 * Transforms an array of db.geos into the data format used by leaflet.js to display a route on the map
 * @param geos array of geos
 */
exports.generateRouteMap = function(geos, exploredGeos) {
    const exploredData = exports.generateExploredMapData(exploredGeos);

    // TODO generate leaflet format from route geos (i.e. geojson points and lines to display on the map)
    exploredData.marker = {text: "A very cool route.<br> 80% undiscovered.", coords: [25.721, -80.270]};
    exploredData.hasMarker = true;
    exploredData.config = getConfig(geos /*union with exploredGeos*/);         // general map configuratio (e.g. zoom)

    return exploredData;
};

/**
 * Transforms an array of db.geos into the data format used by heatmao.js to show the explored map
 * @param exploredGeos
 */
exports.generateExploredMapData = function(exploredGeos) {
    const mapConfig = getConfig(exploredGeos); // general map configuratio (e.g. zoom)
    const maskConfig = getMaskConfiguration(); // mask
    // TODO generate heatmap format from user geos, transform geojson into heatmap js data format. This is just sample data how it should look like:

    var data = {
        max: 8,         // only used for dynamic content. Always set it to total number of points.
        data: [
            [25.7, -80.270],
            [25.8, -80.271],
            [25.9, -80.272]]
    };
    return {
        marker: [],
        maskConfig: maskConfig,
        config: mapConfig,
        heatmapData: data,
        hasMarker: false,
    };
};

/**
 * Returns the configuration for the explored map
 */
var getMaskConfiguration = function() {
    var config = {
        radius: 10000,              // radius in pixels or in meters (see useAbsoluteRadius)
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
        radius: .1,
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
        zoom: 10,                   // Zoom out such that every point is visible
        center: [25.72, -80.2707],  // Center in the middle of the points
        scrollWheelZoom: false,     // Prevents scrolling the map when scrolling the page (maybe turn on for non-mobile page)
    };
    return config;
};
