/*global defineSuite*/
defineSuite([
        'Scene/Cesium3DTileset',
        'Core/Cartesian3',
        'Core/HeadingPitchRange',
        'Scene/Cesium3DTileContentState',
        'Scene/Cesium3DTileRefine',
        'Specs/Cesium3DTilesTester',
        'Specs/createScene',
        'Specs/pollToPromise'
    ], function(
        Cesium3DTileset,
        Cartesian3,
        HeadingPitchRange,
        Cesium3DTileContentState,
        Cesium3DTileRefine,
        Cesium3DTilesTester,
        createScene,
        pollToPromise) {
    "use strict";

    var scene;
    var centerLongitude = -1.31995;
    var centerLatitude = 0.69871;

    // Parent tile with content and four child tiles with content
    var cityUrl = './Data/Cesium3DTiles/Tilesets/Basic';

    beforeAll(function() {
        scene = createScene();
    });

    afterAll(function() {
        scene.destroyForSpecs();
    });

    beforeEach(function() {
        setZoom(20.0);
    });

    afterEach(function() {
        scene.primitives.removeAll();
    });

    function setZoom(distance) {
        var center = Cartesian3.fromRadians(centerLongitude, centerLatitude);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, -1.57, distance));
    }

    it('throws with undefined url', function() {
        expect(function() {
            return new Cesium3DTileset();
        }).toThrowDeveloperError();
    });

    it('rejects readyPromise with invalid tiles.json', function() {
        var tileset = new Cesium3DTileset({
            url : 'invalid'
        });
        return tileset.readyPromise.then(function(tileset) {
            fail('should not resolve');
        }).otherwise(function(error) {
            expect(tileset.ready).toEqual(false);
            expect(error.statusCode).toEqual(404);
        });
    });

    it('resolves readyPromise', function() {
        return Cesium3DTilesTester.loadTileset(scene, cityUrl).then(function(tileset) {
            tileset.readyPromise.then(function(tileset) {
                expect(tileset.ready).toEqual(true);
            });
        });
    });

    it('loads tiles.json', function() {
        return Cesium3DTilesTester.loadTilesetRoot(scene, cityUrl).then(function(tileset) {
            var properties = tileset.properties;
            expect(properties).toBeDefined();
            expect(properties.id).toBeDefined();
            expect(tileset.geometricError).toEqual(240.0);
            expect(tileset.root).toBeDefined();
            expect(tileset.url).toEqual(cityUrl);
        });
    });

    //it('renders city', function() {
    //    return Cesium3DTilesTester.loadTileset(scene, cityUrl).then(function(tileset) {
    //        Cesium3DTilesTester.expectRenderTileset(scene, tileset);
    //    });
    //});

    // TODO : different name
    it('verify statistics', function() {
        var tileset = scene.primitives.add(new Cesium3DTileset({
            url : cityUrl
        }));

        return tileset.readyPromise.then(function(tileset) {
            // Verify initial values
            var stats = tileset._statistics;
            expect(stats.visited).toEqual(0);
            expect(stats.numberOfCommands).toEqual(0);
            expect(stats.numberOfPendingRequests).toEqual(0);
            expect(stats.numberProcessing).toEqual(0);

            // Update and check that root tile is requested
            scene.renderForSpecs();
            expect(stats.visited).toEqual(0);
            expect(stats.numberOfCommands).toEqual(0);
            expect(stats.numberOfPendingRequests).toEqual(1);
            expect(stats.numberProcessing).toEqual(0);

            // Update again and check that child tiles are now requested
            scene.renderForSpecs();
            expect(stats.visited).toEqual(1); // Root is visited
            expect(stats.numberOfCommands).toEqual(0);
            expect(stats.numberOfPendingRequests).toEqual(5);
            expect(stats.numberProcessing).toEqual(0);

            // TODO : maybe some more checks for numberProcessing
        });
    });

    it('additive refinement - selects root when sse is met', function() {
        return Cesium3DTilesTester.loadTileset(scene, cityUrl).then(function(tileset) {
            tileset._root.refine = Cesium3DTileRefine.ADD;
            var stats = tileset._statistics;

            // Meets screen space error, only root tile is rendered
            setZoom(100.0);
            tileset.update(scene.frameState);
            expect(stats.visited).toEqual(1);
            expect(stats.numberOfCommands).toEqual(1);
        });
    });

    it('additive refinement - selects all tiles when sse is not met', function() {
        return Cesium3DTilesTester.loadTileset(scene, cityUrl).then(function(tileset) {
            tileset._root.refine = Cesium3DTileRefine.ADD;
            var stats = tileset._statistics;

            // Does not meet screen space error, all tiles are visible
            setZoom(20.0);
            tileset.update(scene.frameState);
            expect(stats.visited).toEqual(5);
            expect(stats.numberOfCommands).toEqual(5);
        });
    });


    it('replacement refinement - selects root when sse is met', function() {
        return Cesium3DTilesTester.loadTileset(scene, replacementUrl).then(function(tileset) {
            tileset._root.refine = Cesium3DTileRefine.REPLACE;
            var stats = tileset._statistics;

            // Meets screen space error, only root tile is rendered
            setZoom(100.0);
            tileset.update(scene.frameState);
            expect(stats.visited).toEqual(1);
            expect(stats.numberOfCommands).toEqual(1);
        });
    });

    it('replacement refinement - selects children when sse is not met', function() {
        return Cesium3DTilesTester.loadTileset(scene, replacementUrl).then(function(tileset) {
            tileset._root.refine = Cesium3DTileRefine.REPLACE;
            var stats = tileset._statistics;

            // Does not meet screen space error, child tiles replace root tile
            setZoom(20.0);
            tileset.update(scene.frameState);
            expect(stats.visited).toEqual(5); // Visits root, but does not render it
            expect(stats.numberOfCommands).toEqual(4);
        });
    });

    it('replacement refinement - selects root when sse is not met and children are not ready', function() {
        setZoom(100.0);
        return Cesium3DTilesTester.loadTilesetRoot(scene, cityUrl).then(function(tileset) {
            var root = tileset._root;
            root.refine = Cesium3DTileRefine.REPLACE;

            setZoom(20.0);
            tileset.update(scene.frameState);

            var stats = tileset._statistics;
            expect(stats.visited).toEqual(1);
            expect(stats.numberOfCommands).toEqual(1);
            //expect(stats.numberOfPendingRequests).toEqual(4); // TODO : this is messed up because previous tests still have pending requests left over
            expect(root.numberOfChildrenWithoutContent).toEqual(4);
            console.log(stats.visited, stats.numberOfCommands, stats.numberOfPendingRequests, stats.numberProcessing);
        });
    });

    it('throws when getting properties and tileset is not ready', function() {
        var tileset = new Cesium3DTileset(cityUrl);
        expect(function() {
            return tileset.properties;
        }).toThrowDeveloperError();
    });

    //it('tiles.json pointing to tiles.json', function() {
    //    return Cesium3DTilesTester.loadTileset(scene, cityUrl).then(function(tileset) {
    //
    //    });
    //});

    //it('resolves readyPromise', function() {
    //    var content = new Empty3DTileContentProvider();
    //    content.request();
    //    content.update();
    //    return content.readyPromise.then(function(content) {
    //        expect(content.state).toEqual(Cesium3DTileContentState.READY);
    //    });
    //});
    //
    //it('destroys', function() {
    //    var content = new Empty3DTileContentProvider();
    //    expect(content.isDestroyed()).toEqual(false);
    //    content.destroy();
    //    expect(content.isDestroyed()).toEqual(true);
    //});

}, 'WebGL');
