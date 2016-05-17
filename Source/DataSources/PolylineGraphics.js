/*global define*/
define([
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/DeveloperError',
        '../Core/Event',
        './createMaterialPropertyDescriptor',
        './createPropertyDescriptor'
    ], function(
        defaultValue,
        defined,
        defineProperties,
        DeveloperError,
        Event,
        createMaterialPropertyDescriptor,
        createPropertyDescriptor) {
    'use strict';

    /**
     * Describes a polyline defined as a line strip. The first two positions define a line segment,
     * and each additional position defines a line segment from the previous position. The segments
     * can be linear connected points or great arcs.
     *
     * @alias PolylineGraphics
     * @constructor
     *
     * @param {Object} [options] Object with the following properties:
     * @param {Property} [options.positions] A Property specifying the array of {@link Cartesian3} positions that define the line strip.
     * @param {Property} [options.followSurface=true] A boolean Property specifying whether the line segments should be great arcs or linearly connected.
     * @param {Property} [options.width=1.0] A numeric Property specifying the width in pixels.
     * @param {Property} [options.show=true] A boolean Property specifying the visibility of the polyline.
     * @param {MaterialProperty} [options.material=Color.WHITE] A Property specifying the material used to draw the polyline.
     * @param {Property} [options.granularity=Cesium.Math.RADIANS_PER_DEGREE] A numeric Property specifying the angular distance between each latitude and longitude if followSurface is true.
     * @param {Property} [options.castShadows=true] A boolean Property specifying whether the polyline casts shadows from each light source.
     * @param {Property} [options.receiveShadows=true] A boolean Property specifying whether the polyline receives shadows from shadow casters in the scene.
     *
     * @see Entity
     * @demo {@link http://cesiumjs.org/Cesium/Apps/Sandcastle/index.html?src=Polyline.html|Cesium Sandcastle Polyline Demo}
     */
    function PolylineGraphics(options) {
        this._show = undefined;
        this._showSubscription = undefined;
        this._material = undefined;
        this._materialSubscription = undefined;
        this._positions = undefined;
        this._positionsSubscription = undefined;
        this._followSurface = undefined;
        this._followSurfaceSubscription = undefined;
        this._granularity = undefined;
        this._granularitySubscription = undefined;
        this._widthSubscription = undefined;
        this._width = undefined;
        this._widthSubscription = undefined;
        this._castShadows = undefined;
        this._castShadowsSubscription = undefined;
        this._receiveShadows = undefined;
        this._receiveShadowsSubscription = undefined;
        this._definitionChanged = new Event();

        this.merge(defaultValue(options, defaultValue.EMPTY_OBJECT));
    }

    defineProperties(PolylineGraphics.prototype, {
        /**
         * Gets the event that is raised whenever a property or sub-property is changed or modified.
         * @memberof PolylineGraphics.prototype
         *
         * @type {Event}
         * @readonly
         */
        definitionChanged : {
            get : function() {
                return this._definitionChanged;
            }
        },

        /**
         * Gets or sets the boolean Property specifying the visibility of the polyline.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         * @default true
         */
        show : createPropertyDescriptor('show'),

        /**
         * Gets or sets the Property specifying the material used to draw the polyline.
         * @memberof PolylineGraphics.prototype
         * @type {MaterialProperty}
         * @default Color.WHITE
         */
        material : createMaterialPropertyDescriptor('material'),

        /**
         * Gets or sets the Property specifying the array of {@link Cartesian3}
         * positions that define the line strip.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         */
        positions : createPropertyDescriptor('positions'),

        /**
         * Gets or sets the numeric Property specifying the width in pixels.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         * @default 1.0
         */
        width : createPropertyDescriptor('width'),

        /**
         * Gets or sets the boolean Property specifying whether the line segments
         * should be great arcs or linearly connected.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         * @default true
         */
        followSurface : createPropertyDescriptor('followSurface'),

        /**
         * Gets or sets the numeric Property specifying the angular distance between each latitude and longitude if followSurface is true.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         * @default Cesium.Math.RADIANS_PER_DEGREE
         */
        granularity : createPropertyDescriptor('granularity'),
        
        /**
         * Get or sets the boolean Property specifying whether the polyline
         * casts shadows from each light source.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         */
        castShadows : createPropertyDescriptor('castShadows'),

        /**
         * Get or sets the boolean Property specifying whether the polyline
         * receives shadows from shadow casters in the scene.
         * @memberof PolylineGraphics.prototype
         * @type {Property}
         */
        receiveShadows : createPropertyDescriptor('receiveShadows')
    });

    /**
     * Duplicates this instance.
     *
     * @param {PolylineGraphics} [result] The object onto which to store the result.
     * @returns {PolylineGraphics} The modified result parameter or a new instance if one was not provided.
     */
    PolylineGraphics.prototype.clone = function(result) {
        if (!defined(result)) {
            return new PolylineGraphics(this);
        }
        result.show = this.show;
        result.material = this.material;
        result.positions = this.positions;
        result.width = this.width;
        result.followSurface = this.followSurface;
        result.granularity = this.granularity;
        result.castShadows = this.castShadows;
        result.receiveShadows = this.receiveShadows;
        return result;
    };

    /**
     * Assigns each unassigned property on this object to the value
     * of the same property on the provided source object.
     *
     * @param {PolylineGraphics} source The object to be merged into this object.
     */
    PolylineGraphics.prototype.merge = function(source) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(source)) {
            throw new DeveloperError('source is required.');
        }
        //>>includeEnd('debug');

        this.show = defaultValue(this.show, source.show);
        this.material = defaultValue(this.material, source.material);
        this.positions = defaultValue(this.positions, source.positions);
        this.width = defaultValue(this.width, source.width);
        this.followSurface = defaultValue(this.followSurface, source.followSurface);
        this.granularity = defaultValue(this.granularity, source.granularity);
        this.castShadows = defaultValue(this.castShadows, source.castShadows);
        this.receiveShadows = defaultValue(this.receiveShadows, source.receiveShadows);
    };

    return PolylineGraphics;
});
