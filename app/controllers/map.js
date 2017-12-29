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
 * @param geos
 */
exports.generateExploredMapData = function(geos) {
    const config = getConfig(geos);         // general map configuratio (e.g. zoom)
    const heatmap = getHeatmapConfig();     // heatmap

    // TODO generate heatmap format from user geos, transform geojson into heatmap js data format. This is just sample data how it should look like:
    var data = {
        max: 8,         // only used for dynamic content. Always set it to total number of points.
        data: [
            {lat: 25.7, lng: -80.270, count: 1},
            {lat: 25.8, lng: -80.271, count: 1},
            {lat: 25.9, lng: -80.272, count: 1}]
    };
    return {
        marker: [],
        heatmapConfig: heatmap,
        config: config,
        heatmapData: data,
        hasMarker: false,
    };
};

/**
 * Returns the configuration for the explored map
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
 * Returns the configuration for the explored map
 */
var getConfig = function (geos) {
    var config = {
        // TODO determine based on geos
        zoom: 10,                   // Zoom out such that every point is visible
        center: [25.72, -80.2707],  // Center in the middle of the points
        scrollWheelZoom: false,     // Prevents scrolling the map when scrolling the page (maybe turn on for non-mobile page)
    };
    return config;
};
