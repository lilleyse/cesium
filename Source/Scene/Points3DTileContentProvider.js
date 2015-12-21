/*global define*/
define([
        '../Core/BoundingSphere',
        '../Core/Cartesian3',
        '../Core/Color',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/GeometryInstance',
        '../Core/getMagic',
        '../Core/loadArrayBuffer',
        '../Core/PointGeometry',
        '../ThirdParty/when',
        './Cesium3DTileContentState',
        './PointAppearance',
        './Primitive'
    ], function(
        BoundingSphere,
        Cartesian3,
        Color,
        defaultValue,
        defined,
        destroyObject,
        DeveloperError,
        GeometryInstance,
        getMagic,
        loadArrayBuffer,
        PointGeometry,
        when,
        Cesium3DTileContentState,
        PointAppearance,
        Primitive) {
    "use strict";

    /**
     * @private
     */
    var Points3DTileContentProvider = function(tileset, tile, url) {
        this._primitive = undefined;
        this._url = url;

        /**
         * @readonly
         */
        this.state = Cesium3DTileContentState.UNLOADED;

        /**
         * @type {Promise}
         */
        this.processingPromise = when.defer();

        /**
         * @type {Promise}
         */
        this.readyPromise = when.defer();

        this.boundingSphere = BoundingSphere.fromOrientedBoundingBox(tile.orientedBoundingBox);

        this._debugColor = Color.fromRandom({ alpha : 1.0 });
        this._debugColorizeTiles = false;
    };

    var sizeOfUint32 = Uint32Array.BYTES_PER_ELEMENT;

    /**
     * DOC_TBA
     *
     * Use Cesium3DTile#requestContent
     */
    Points3DTileContentProvider.prototype.request = function() {
        var that = this;

        this.state = Cesium3DTileContentState.LOADING;

        loadArrayBuffer(this._url).then(function(arrayBuffer) {
            if (that.isDestroyed()) {
                return when.reject('tileset is destroyed');
            }
            that.initialize(arrayBuffer);
        }).otherwise(function(error) {
            that.state = Cesium3DTileContentState.FAILED;
            that.readyPromise.reject(error);
        });
    };

    Points3DTileContentProvider.prototype.initialize = function(arrayBuffer, byteOffset) {
        byteOffset = defaultValue(byteOffset, 0);

        var uint8Array = new Uint8Array(arrayBuffer);
        var magic = getMagic(uint8Array, byteOffset);
        if (magic !== 'pnts') {
            throw new DeveloperError('Invalid Points tile.  Expected magic=pnts.  Read magic=' + magic);
        }

        var view = new DataView(arrayBuffer);
        byteOffset += sizeOfUint32;  // Skip magic number

        //>>includeStart('debug', pragmas.debug);
        var version = view.getUint32(byteOffset, true);
        if (version !== 1) {
            throw new DeveloperError('Only Points tile version 1 is supported.  Version ' + version + ' is not.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        // Skip byteLength
        byteOffset += sizeOfUint32;

        var pointsLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        var positionsOffsetInBytes = byteOffset;
        var positions = new Float32Array(arrayBuffer, positionsOffsetInBytes, pointsLength * 3);

        var colorsOffsetInBytes = positionsOffsetInBytes + (pointsLength * (3 * Float32Array.BYTES_PER_ELEMENT));
        var colors = new Uint8Array(arrayBuffer, colorsOffsetInBytes, pointsLength * 3);

        // TODO: performance test with 'interleave : true'
        var instance = new GeometryInstance({
            geometry : new PointGeometry({
                positionsTypedArray : positions,
                colorsTypedArray: colors,
                boundingSphere: this.boundingSphere
            })
        });
        var primitive = new Primitive({
            geometryInstances : instance,
            appearance : new PointAppearance(),
            asynchronous : false,
            allowPicking : false,
            cull : false,
            rtcCenter : this.boundingSphere.center
        });

        this._primitive = primitive;
        this.state = Cesium3DTileContentState.PROCESSING;
        this.processingPromise.resolve(this);

        var that = this;

        when(primitive.readyPromise).then(function(primitive) {
            that.state = Cesium3DTileContentState.READY;
            that.readyPromise.resolve(that);
        }).otherwise(function(error) {
            that.state = Cesium3DTileContentState.FAILED;
            that.readyPromise.reject(error);
        });
    };

    function applyDebugSettings(owner, content) {
        if (owner.debugColorizeTiles && !content._debugColorizeTiles) {
            content._debugColorizeTiles = true;
            content._primitive.appearance.uniforms.highlightColor = content._debugColor;
        } else if (!owner.debugColorizeTiles && content._debugColorizeTiles) {
            content._debugColorizeTiles = false;
            content._primitive.appearance.uniforms.highlightColor = Color.WHITE;
        }
    }

    Points3DTileContentProvider.prototype.update = function(owner, frameState) {
        // In the PROCESSING state we may be calling update() to move forward
        // the content's resource loading.  In the READY state, it will
        // actually generate commands.

        applyDebugSettings(owner, this);

        this._primitive.update(frameState);
    };

    Points3DTileContentProvider.prototype.isDestroyed = function() {
        return false;
    };

    Points3DTileContentProvider.prototype.destroy = function() {
        this._primitive = this._primitive && this._primitive.destroy();
        return destroyObject(this);
    };

    return Points3DTileContentProvider;
});
