/*global defineSuite*/
defineSuite([
        'Scene/Cesium3DTileset',
        'Core/Cartesian3',
        'Core/loadArrayBuffer',
        'Scene/Cesium3DTileContentState',
        'Scene/Cesium3DTileset',
        'Specs/createCanvas',
        'Specs/createScene',
        'Specs/pollToPromise'
    ], function(
        Instanced3DModel3DTileContentProvider,
        Cartesian3,
        loadArrayBuffer,
        Cesium3DTileContentState,
        Cesium3DTileset,
        createCanvas,
        createScene,
        pollToPromise) {
    "use strict";

    var scene;

    beforeAll(function() {
        scene = createScene();
        scene.camera.setView({
            destination : Cartesian3.fromRadians(-1.31995, 0.69871, 100)
        });
    });

    afterAll(function() {
        scene.destroyForSpecs();
    });

    beforeEach(function() {
        // TODO : Nothing here yet
    });

    afterEach(function() {
        scene.primitives.removeAll();
    });

    function verifyRender(tileset) {
        tileset.show = false;
        expect(scene.renderForSpecs()).toEqual(false);
        tileset.show = true;
        expect(scene.renderForSpecs()).toEqual(true);
    }

    it('resolves readyPromise', function() {
        var url = './Data/Tiles3D/instancedGltfEmbedded/';
        var tileset = new Cesium3DTileset({
            url : url
        });

        return tileset.readyPromise.then(function(tileset) {
            expect(tileset.ready).toBe(true);
        });
    });

    it('rejects readyPromise on error', function() {
        var url = 'invalid';
        var tileset = new Cesium3DTileset({
            url : url
        });

        return tileset.readyPromise.then(function(tileset) {
            fail('should not resolve');
        }).otherwise(function(error) {
            expect(tileset.ready).toBe(false);
            expect(error.statusCode).toEqual(404);
        });
    });

    // ---- Cesium3DTileset functions ------



    //it('throws with invalid magic', function() {
    //    var url = './Data/Tiles3D/instancedInvalidMagic/';
    //
    //    // Create tileset
    //    // Check when tileset is loaded through a ready promise
    //    // Get when instanced3dmodel array buffer is loaded (no promise for this)
    //    // Does a DeveloperError force the promise to fail? What scope
    //
    //    var tileset = scene.primitives.add(new Cesium3DTileset({
    //        url : url
    //    }));
    //
    //    return tileset.readyPromise.then(function(tileset) {
    //        expect(tileset.ready).toBe(true);
    //
    //
    //
    //        expect(function() {
    //            scene.renderForSpecs();
    //        }).toThrowDeveloperError();
    //    });
    //});

    it('throws with invalid format', function() {
        var url = './Data/Tiles3D/instancedInvalidGltfFormat/';
        return loadErrorPromise(url).then(function(tileset) {
            expect(tileset._root.isReady()).toBe(false);
        });
    });

    it('throws with invalid version', function() {
        var url = './Data/Tiles3D/instancedInvalidVersion/';
        return loadErrorPromise(url).then(function(tileset) {
            expect(tileset._root.isReady()).toBe(false);
        });
    });

    it('throws with invalid url', function() {
        var url = './Data/Tiles3D/instancedInvalidUrl/';
        return loadErrorPromise(url).then(function(tileset) {
            expect(tileset._root.isReady()).toBe(false);
        });
    });

    it('throws with empty gltf', function() {
        var url = './Data/Tiles3D/instancedEmptyGltfEmbedded/';
        return loadErrorPromise(url).then(function(tileset) {
            expect(tileset._root.isReady()).toBe(false);
        });
    });
    //
    //it('throws with empty url', function() {
    //    var url = './Data/Tiles3D/instancedEmptyGltfExternal/';
    //    return loadErrorPromise(url).then(function(tileset) {
    //        expect(tileset._root.isReady()).toBe(false);
    //    });
    //});

    it('loads with no instances', function() {
        var url = './Data/Tiles3D/instancedNoInstances/';
        return loadProcessingPromise(url).then(function(tileset) {
            expect(tileset._root.content._modelInstanceCollection.length).toEqual(0);
        });
    });

    //it('renders with embedded gltf', function() {
    //    var url = './Data/Tiles3D/instancedGltfEmbedded/';
    //    return loadSuccessPromise(url).then(verifyRender);
    //});
    //
    //it('renders with external gltf', function() {
    //    var url = './Data/Tiles3D/instancedGltfExternal/';
    //    return loadSuccessPromise(url).then(verifyRender);
    //});
    //
    //it('renders with batch table', function() {
    //    var url = './Data/Tiles3D/instancedWithBatchTable/';
    //    return loadSuccessPromise(url).then(verifyRender);
    //});
    //
    //it('renders without batch table', function() {
    //    var url = './Data/Tiles3D/instancedWithoutBatchTable/';
    //    return loadSuccessPromise(url).then(verifyRender);
    //});

    // TODO : checks
    // * Batch table too small
    // *

});
