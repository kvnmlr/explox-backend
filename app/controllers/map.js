'use strict';

const Log = require('../utils/logger');
const TAG = 'map';

/**
 * Returns the configuration for the leaflet map (explored map)
 */
const getConfig = function () {
    return {
        // Probably not needed because we use fitBounds which does this automatically
        zoom: 11,                   // Zoom out such that every point is visible
        center: [49.2646, 6.9598],  // Center in the middle of the points
        scrollWheelZoom: true,     // Prevents scrolling the map when scrolling the page (maybe turn on for non-mobile page)
        zoomControl: false
    };
};
/**
 * Transforms an array of db.geos into the data format used by leaflet.js to display a route on the map
 * @param geos array of geos
 * @param exploredGeos array of explored geos
 */
exports.generateRouteMap = function (geos, exploredGeos) {
    const routeData = [];
    const leave = 25 - 2;
    let takeEvery = geos.length / leave;
    if (takeEvery > 1) {
        // we have too many waypoints, downsample to something smaller
        takeEvery = Math.ceil(takeEvery);

        const waypointsTemp = Object.assign([], geos);
        geos = [waypointsTemp[0]];     // start point must not be deleted
        let counter = 0;
        waypointsTemp.forEach(function (wp) {
            if (counter % takeEvery === 0) {
                geos.push(wp);
            }
            ++counter;
        });
        geos.push(waypointsTemp[waypointsTemp.length - 1]);   // end point must also definitely be a waypoint
    }
    for (let i = 0; i < geos.length; ++i) {
        if (geos[i].location) {
            const coords = [(geos[i].location.coordinates[0]),(geos[i].location.coordinates[1])];
            routeData.push(coords);
        }
    }

    let exploredData = {};
    if (exploredGeos) {
        exploredData = exports.generateExploredMapData(exploredGeos);
    }
    exploredData.marker = {text: 'A very cool route.<br> 80% undiscovered.', coords: [25.721, -80.270]};
    exploredData.hasRoute = true;
    exploredData.config = getConfig(geos /* union with exploredGeos*/);         // general map configuratio (e.g. zoom)
    exploredData.routeData = routeData;
    return exploredData;
};

/**
 * Returns the configuration for the explored map
 */
const getMaskConfiguration = function () {
    return {
        radius: 200,                // radius in pixels or in meters (see useAbsoluteRadius)
        useAbsoluteRadius: true,    // true: r in meters, false: r in pixels
        color: '#000',              // the color of the layer
        opacity: .5,                // opacity of the not covered area
        noMask: false,              // true results in normal (filled) circled, instead masked circles
        lineColor: '#A00',          // color of the circle outline if noMask is true
        updateWhenZooming: true,
    };
};
/**
 * Transforms an array of db.geos into the data format used by heatmao.js to show the explored map
 * @param exploredGeos
 */
exports.generateExploredMapData = function (exploredGeos) {
    const mapConfig = getConfig(exploredGeos); // general map configuratio (e.g. zoom)
    const maskConfig = getMaskConfiguration(); // mask

    const data = {
        max: 8,         // only used for dynamic content. Always set it to total number of points.
        data: exploredGeos
    };
    return {
        marker: [],
        maskConfig: maskConfig,
        config: mapConfig,
        heatmapData: data,
        hasRoute: false,
        routeData: ['L.latLng(0.0000000,0.00000001)']
    };
};
