/*global defineSuite*/
defineSuite([
        'Scene/ShadowMap',
        'Core/BoundingSphere',
        'Core/BoxGeometry',
        'Core/Cartesian3',
        'Core/CesiumTerrainProvider',
        'Core/ComponentDatatype',
        'Core/Color',
        'Core/ColorGeometryInstanceAttribute',
        'Core/defined',
        'Core/GeometryInstance',
        'Core/HeadingPitchRange',
        'Core/JulianDate',
        'Core/Math',
        'Core/PixelFormat',
        'Core/Transforms',
        'Scene/Camera',
        'Scene/Globe',
        'Scene/GridImageryProvider',
        'Scene/Model',
        'Scene/OrthographicFrustum',
        'Scene/PerInstanceColorAppearance',
        'Scene/Primitive',
        'Specs/createScene',
        'Specs/pollToPromise',
        'ThirdParty/when'
    ], function(
        ShadowMap,
        BoundingSphere,
        BoxGeometry,
        Cartesian3,
        CesiumTerrainProvider,
        ComponentDatatype,
        Color,
        ColorGeometryInstanceAttribute,
        defined,
        GeometryInstance,
        HeadingPitchRange,
        JulianDate,
        CesiumMath,
        PixelFormat,
        Transforms,
        Camera,
        Globe,
        GridImageryProvider,
        Model,
        OrthographicFrustum,
        PerInstanceColorAppearance,
        Primitive,
        createScene,
        pollToPromise,
        when) {
    'use strict';

    var scene;
    var sunShadowMap;
    var backgroundColor = [0, 0, 0, 255];

    var longitude = -1.31968;
    var latitude = 0.4101524;
    var height = 0.0;
    var boxHeight = 4.0;
    var floorHeight = -1.0;

    var boxUrl = './Data/Models/Shadows/Box.gltf';
    var boxTranslucentUrl = './Data/Models/Shadows/BoxTranslucent.gltf';
    var boxCutoutUrl = './Data/Models/Shadows/BoxCutout.gltf';
    var boxInvertedUrl = './Data/Models/Shadows/BoxInverted.gltf';

    var box;
    var boxTranslucent;
    var boxCutout;
    var room;
    var floor;

    var primitiveBox;
    var primitiveBoxRTC;
    var primitiveBoxTranslucent;
    var primitiveFloor;
    var primitiveFloorRTC;

    beforeAll(function() {
        scene = createScene();
        scene.frameState.scene3DOnly = true;
        Color.unpack(backgroundColor, 0, scene.backgroundColor);

        scene.globe = new Globe();
        sunShadowMap = scene.shadowMap;

        var boxOrigin = new Cartesian3.fromRadians(longitude, latitude, boxHeight);
        var boxTransform = Transforms.headingPitchRollToFixedFrame(boxOrigin, 0.0, 0.0, 0.0);

        var floorOrigin = new Cartesian3.fromRadians(longitude, latitude, floorHeight);
        var floorTransform = Transforms.headingPitchRollToFixedFrame(floorOrigin, 0.0, 0.0, 0.0);

        var roomOrigin = new Cartesian3.fromRadians(longitude, latitude, height);
        var roomTransform = Transforms.headingPitchRollToFixedFrame(roomOrigin, 0.0, 0.0, 0.0);

        var modelPromises = [];
        modelPromises.push(loadModel({
            url : boxUrl,
            modelMatrix : boxTransform,
            scale : 0.5,
            show : false
        }).then(function(model) {
            box = model;
        }));
        modelPromises.push(loadModel({
            url : boxTranslucentUrl,
            modelMatrix : boxTransform,
            scale : 0.5,
            show : false
        }).then(function(model) {
            boxTranslucent = model;
        }));
        modelPromises.push(loadModel({
            url : boxCutoutUrl,
            modelMatrix : boxTransform,
            scale : 0.5,
            incrementallyLoadTextures : false,
            show : false
        }).then(function(model) {
            boxCutout = model;
        }));
        modelPromises.push(loadModel({
            url : boxUrl,
            modelMatrix : floorTransform,
            scale : 2.0,
            show : false
        }).then(function(model) {
            floor = model;
        }));
        modelPromises.push(loadModel({
            url : boxInvertedUrl,
            modelMatrix : roomTransform,
            scale : 8.0,
            show : false
        }).then(function(model) {
            room = model;
        }));

        primitiveBox = createPrimitive(boxTransform, 0.5, Color.RED);
        primitiveBoxRTC = createPrimitiveRTC(boxTransform, 0.5, Color.RED);
        primitiveBoxTranslucent = createPrimitive(boxTransform, 0.5, Color.RED.withAlpha(0.5));
        primitiveFloor = createPrimitive(floorTransform, 2.0, Color.RED);
        primitiveFloorRTC = createPrimitiveRTC(floorTransform, 2.0, Color.RED);

        return when.all(modelPromises);
    });

    function createPrimitive(transform, size, color) {
        return scene.primitives.add(new Primitive({
            geometryInstances : new GeometryInstance({
                geometry : BoxGeometry.fromDimensions({
                    dimensions : new Cartesian3(size, size, size),
                    vertexFormat : PerInstanceColorAppearance.VERTEX_FORMAT
                }),
                modelMatrix : transform,
                attributes : {
                    color : ColorGeometryInstanceAttribute.fromColor(color)
                }
            }),
            appearance : new PerInstanceColorAppearance({
                translucent : false,
                closed : true
            }),
            asynchronous : false,
            show : false,
            castShadows : true,
            receiveShadows : true
        }));
    }

    function createPrimitiveRTC(transform, size, color) {
        var boxGeometry = BoxGeometry.createGeometry(BoxGeometry.fromDimensions({
            vertexFormat : PerInstanceColorAppearance.VERTEX_FORMAT,
            dimensions : new Cartesian3(size, size, size)
        }));

        var positions = boxGeometry.attributes.position.values;
        var newPositions = new Float32Array(positions.length);
        for (var i = 0; i < positions.length; ++i) {
            newPositions[i] = positions[i];
        }
        boxGeometry.attributes.position.values = newPositions;
        boxGeometry.attributes.position.componentDatatype = ComponentDatatype.FLOAT;

        BoundingSphere.transform(boxGeometry.boundingSphere, transform, boxGeometry.boundingSphere);

        var boxGeometryInstance = new GeometryInstance({
            geometry : boxGeometry,
            attributes : {
                color : ColorGeometryInstanceAttribute.fromColor(color)
            }
        });

        return scene.primitives.add(new Primitive({
            geometryInstances : boxGeometryInstance,
            appearance : new PerInstanceColorAppearance({
                translucent : false,
                closed : true
            }),
            asynchronous : false,
            rtcCenter : boxGeometry.boundingSphere.center,
            show : false,
            castShadows : true,
            receiveShadows : true
        }));
    }

    function loadModel(options) {
        var model = scene.primitives.add(Model.fromGltf(options));
        return pollToPromise(function() {
            // Render scene to progressively load the model
            scene.render();
            return model.ready;
        }, { timeout: 10000 }).then(function() {
            return model;
        });
    }

    /**
     * Repeatedly calls render until the load queue is empty. Returns a promise that resolves
     * when the load queue is empty.
     */
    function loadGlobe() {
        return pollToPromise(function() {
            scene.render();
            return scene.globe._surface.tileProvider.ready && !defined(scene.globe._surface._tileLoadQueue.head) && scene.globe._surface._debug.tilesWaitingForChildren === 0;
        });
    }

    afterAll(function() {
        scene.destroyForSpecs();
    });

    beforeEach(function() {
    });

    afterEach(function() {
        var length = scene.primitives.length;
        for (var i = 0; i < length; ++i) {
            scene.primitives.get(i).show = false;
        }
        scene.globe.show = false;

        // if (scene.shadowMap !== sunShadowMap) {
        //     scene.shadowMap.destroy();
        // }
    });

    function createCascadedShadowMap() {
        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        // Create light camera pointing straight down
        var lightCamera = new Camera(scene);
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 1.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera
        });
    }

    function createSingleCascadeShadowMap() {
        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        // Create light camera pointing straight down
        var lightCamera = new Camera(scene);
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 1.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera,
            numberOfCascades : 1
        });
    }

    function createShadowMapForDirectionalLight() {
        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        var frustum = new OrthographicFrustum();
        frustum.left = -50.0;
        frustum.right = 50.0;
        frustum.bottom = -50.0;
        frustum.top = 50.0;
        frustum.near = 1.0;
        frustum.far = 100;

        // Create light camera pointing straight down
        var lightCamera = new Camera(scene);
        lightCamera.frustum = frustum;
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 20.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera,
            cascadesEnabled : false
        });
    }

    function createShadowMapForSpotLight() {
        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        var lightCamera = new Camera(scene);
        lightCamera.frustum.fov = CesiumMath.PI_OVER_TWO;
        lightCamera.frustum.aspectRatio = 1.0;
        lightCamera.frustum.near = 1.0;
        lightCamera.frustum.far = 100.0;
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 20.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera,
            cascadesEnabled : false
        });
    }

    function createShadowMapForPointLight() {
        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        var lightCamera = new Camera(scene);
        lightCamera.position = center;

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera,
            isPointLight : true
        });
    }

    function render(time) {
        scene.render(time); // Computes shadow near/far for next frame
        return scene.renderForSpecs(time);
    }

    function verifyShadows(caster, receiver) {
        caster.castShadows = true;
        receiver.receiveShadows = true;

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();
        expect(unshadowedColor).not.toEqual(backgroundColor);

        // Render with shadows
        scene.shadowMap.enabled = true;
        var shadowedColor = render();
        expect(shadowedColor).not.toEqual(backgroundColor);
        expect(shadowedColor).not.toEqual(unshadowedColor);

        // Turn shadow casting off/on
        caster.castShadows = false;
        expect(render()).toEqual(unshadowedColor);
        caster.castShadows = true;
        expect(render()).toEqual(shadowedColor);

        // Turn shadow receiving off/on
        receiver.receiveShadows = false;
        expect(render()).toEqual(unshadowedColor);
        receiver.receiveShadows = true;
        expect(render()).toEqual(shadowedColor);

        // Move the camera away from the shadow
        caster.castShadows = true;
        scene.camera.moveRight(0.5);
        expect(render()).toEqual(unshadowedColor);
    }

    it('model casts shadows onto another model', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();
        verifyShadows(box, floor);
    });

    it('translucent model casts shadows onto another model' , function() {
        boxTranslucent.show = true;
        floor.show = true;
        createCascadedShadowMap();
        verifyShadows(boxTranslucent, floor);
    });

    it('model with cutout texture casts shadows onto another model', function() {
        boxCutout.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();
        expect(unshadowedColor).not.toEqual(backgroundColor);

        // Render with shadows. The area should not be shadowed because the box's texture is transparent in the center.
        scene.shadowMap.enabled = true;
        expect(render()).toEqual(unshadowedColor);

        // Move the camera into the shadowed area
        scene.camera.moveRight(0.2);
        var shadowedColor = render();
        expect(shadowedColor).not.toEqual(backgroundColor);
        expect(shadowedColor).not.toEqual(unshadowedColor);

        // Move the camera away from the shadow
        scene.camera.moveRight(0.3);
        expect(render()).toEqual(unshadowedColor);
    });

    it('primitive casts shadows onto another primitive' , function() {
        primitiveBox.show = true;
        primitiveFloor.show = true;
        createCascadedShadowMap();
        verifyShadows(primitiveBox, primitiveFloor);
    });

    it('RTC primitive casts shadows onto another RTC primitive' , function() {
        primitiveBoxRTC.show = true;
        primitiveFloorRTC.show = true;
        createCascadedShadowMap();
        verifyShadows(primitiveBoxRTC, primitiveFloorRTC);
    });

    it('translucent primitive casts shadows onto another primitive' , function() {
        primitiveBoxTranslucent.show = true;
        primitiveFloor.show = true;
        createCascadedShadowMap();
        verifyShadows(primitiveBoxTranslucent, primitiveFloor);
    });

    // it('Model casts shadow onto globe', function() {
    //     box.show = true;
    //     scene.globe.show = true;
    //     scene.camera.frustum._sseDenominator = 0.005;
    //     createCascadedShadowMap();
    //     return loadGlobe().then(function() {
    //         verifyShadows(box, floor);
    //     });
    // });

    it('throws without options.context', function() {
        expect(function() {
            var shadowMap = new ShadowMap({
                lightCamera : new Camera(scene)
            });
        }).toThrowDeveloperError();
    });

    it('throws without options.lightCamera', function() {
        expect(function() {
            var shadowMap = new ShadowMap({
                context : scene.context
            });
        }).toThrowDeveloperError();
    });

    it('throws when options.numberOfCascades is not one or four', function() {
        expect(function() {
            var shadowMap = new ShadowMap({
                context : scene.context,
                lightCamera : new Camera(scene),
                numberOfCascades : 3
            });
        }).toThrowDeveloperError();
    });

    it('sets default shadow map properties', function() {
        var shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : new Camera(scene)
        });

        expect(shadowMap.enabled).toBe(true);
        expect(shadowMap.softShadows).toBe(false);
        expect(shadowMap.isPointLight).toBe(false);
        expect(shadowMap._isSpotLight).toBe(false);
        expect(shadowMap._cascadesEnabled).toBe(true);
        expect(shadowMap._numberOfCascades).toBe(4);
    });

    it('changes light direction', function() {
        box.show = true;
        floor.show = true;

        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        // Create light camera pointing straight down
        var lightCamera = new Camera(scene);
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 1.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera
        });

        // Render with shadows
        var shadowedColor = render();

        // Move the camera away from the shadow
        scene.camera.moveLeft(0.5);
        var unshadowedColor = render();
        expect(unshadowedColor).not.toEqual(backgroundColor);
        expect(unshadowedColor).not.toEqual(shadowedColor);

        // Change the light direction so the unshadowed area is now shadowed
        lightCamera.lookAt(center, new Cartesian3(0.1, 0.0, 1.0));
        expect(render()).toEqual(shadowedColor);
    });

    it('does not render shadows when the camera is far away from any shadow receivers', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        render();
        expect(scene.shadowMap.outOfView).toBe(false);
        expect(scene.shadowMap._needsUpdate).toBe(true);

        var center = new Cartesian3.fromRadians(longitude, latitude, 200000);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        render();
        expect(scene.shadowMap.outOfView).toBe(true);
        expect(scene.shadowMap._needsUpdate).toBe(false);
    });

    it('does not render shadows when the light direction is below the horizon', function() {
        box.show = true;
        floor.show = true;

        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        // Create light camera pointing straight down
        var lightCamera = new Camera(scene);
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, 1.0));

        scene.shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : lightCamera
        });

        render();
        expect(scene.shadowMap.outOfView).toBe(false);
        expect(scene.shadowMap._needsUpdate).toBe(true);

        // Change light direction
        lightCamera.lookAt(center, new Cartesian3(0.0, 0.0, -1.0));
        render();
        expect(scene.shadowMap.outOfView).toBe(true);
        expect(scene.shadowMap._needsUpdate).toBe(false);
    });

    it('sun shadow map works', function() {
        box.show = true;
        floor.show = true;

        var startTime = new JulianDate(2457561.211806); // Sun pointing straight above
        var endTime = new JulianDate(2457561.276389); // Sun at an angle

        var center = new Cartesian3.fromRadians(longitude, latitude, height);
        scene.camera.lookAt(center, new HeadingPitchRange(0.0, CesiumMath.toRadians(-70.0), 5.0));

        // Use the default shadow map which uses the sun as a light source
        scene.shadowMap = sunShadowMap;

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render(startTime);
        expect(unshadowedColor).not.toEqual(backgroundColor);

        // Render with shadows
        scene.shadowMap.enabled = true;
        var shadowedColor = render(startTime);
        expect(shadowedColor).not.toEqual(backgroundColor);
        expect(shadowedColor).not.toEqual(unshadowedColor);

        // Change the time so that the shadows are no longer pointing straight down
        expect(render(endTime)).toEqual(unshadowedColor);
    });

    it('changes size', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render with shadows
        var shadowedColor = render();

        // Change size
        scene.shadowMap.size = 256;
        expect(render()).toEqual(shadowedColor);

        // Cascaded shadows combine four maps into one texture
        expect(scene.shadowMap._shadowMapTexture.width).toBe(512);
        expect(scene.shadowMap._shadowMapTexture.height).toBe(512);
        expect(scene.shadowMap.size).toBe(256);
    });

    it('enable debugCascadeColors', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render with shadows
        var shadowedColor = render();

        // Render cascade colors
        scene.shadowMap.debugCascadeColors = true;
        expect(scene.shadowMap.dirty).toBe(true);
        var debugColor = render();
        expect(debugColor).not.toEqual(backgroundColor);
        expect(debugColor).not.toEqual(shadowedColor);
    });

    it('enable soft shadows', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();

        // Render with shadows
        scene.shadowMap.enabled = true;
        expect(scene.shadowMap.dirty).toBe(true);
        var shadowedColor = render();

        // Render with soft shadows
        scene.shadowMap.softShadows = true;
        scene.shadowMap.size = 256; // Make resolution smaller to more easily verify soft edges
        scene.camera.moveRight(0.25);
        var softColor = render();
        expect(softColor).not.toEqual(backgroundColor);
        expect(softColor).not.toEqual(unshadowedColor);
        expect(softColor).not.toEqual(shadowedColor);
    });

    it('changes darkness', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();

        // Render with shadows
        scene.shadowMap.enabled = true;
        var shadowedColor = render();

        scene.shadowMap.darkness = 0.5;
        var darkColor = render();
        expect(darkColor).not.toEqual(backgroundColor);
        expect(darkColor).not.toEqual(unshadowedColor);
        expect(darkColor).not.toEqual(shadowedColor);
    });

    it('defaults to color texture if depth texture extension is not supported', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        render();
        if (scene.context.depthTexture) {
            expect(scene.shadowMap._usesDepthTexture).toBe(true);
            expect(scene.shadowMap._shadowMapTexture.pixelFormat).toEqual(PixelFormat.DEPTH_STENCIL);
        }

        // Disable extension
        var depthTexture = scene.context._depthTexture;
        scene.context._depthTexture = false;
        createCascadedShadowMap();
        render();
        expect(scene.shadowMap._usesDepthTexture).toBe(false);
        expect(scene.shadowMap._shadowMapTexture.pixelFormat).toEqual(PixelFormat.RGBA);

        // Re-enable extension
        scene.context._depthTexture = depthTexture;
    });

    it('enable debugShow for cascaded shadow map', function() {
        createCascadedShadowMap();

        // Shadow overlay command, shadow volume outline, camera outline, and four cascade outlines
        scene.shadowMap.debugShow = true;
        scene.shadowMap.debugFreezeFrame = true;
        render();
        expect(scene.frameState.commandList.length).toBe(7);

        scene.shadowMap.debugShow = false;
        render();
        expect(scene.frameState.commandList.length).toBe(0);
    });

    it('enable debugShow for fixed shadow map', function() {
        createShadowMapForDirectionalLight();

        // Overlay command and shadow volume outline
        scene.shadowMap.debugShow = true;
        render();
        expect(scene.frameState.commandList.length).toBe(2);

        scene.shadowMap.debugShow = false;
        render();
        expect(scene.frameState.commandList.length).toBe(0);
    });

    it('enable debugShow for point light shadow map', function() {
        createShadowMapForPointLight();

        // Overlay command and shadow volume outline
        scene.shadowMap.debugShow = true;
        render();
        expect(scene.frameState.commandList.length).toBe(2);

        scene.shadowMap.debugShow = false;
        render();
        expect(scene.frameState.commandList.length).toBe(0);
    });

    it('single cascade shadow map', function() {
        box.show = true;
        floor.show = true;
        createSingleCascadeShadowMap();
        verifyShadows(box, floor);
        // TODO: WHY DOES THIS FAIL IF ITS RUN WITH ALL THE OTHERS
    });

    it('directional shadow map', function() {
        box.show = true;
        floor.show = true;
        createShadowMapForDirectionalLight();
        verifyShadows(box, floor);
    });

    it('spot light shadow map', function() {
        box.show = true;
        floor.show = true;
        createShadowMapForSpotLight();
        verifyShadows(box, floor);
    });

    it('point light shadows', function() {
        // Check that shadows are cast from all directions.
        // Place the point light in the middle of an enclosed area and place a box on each side.
        room.show = true;
        createShadowMapForPointLight();

        var longitudeSpacing = 0.0000003419296208325038;
        var latitudeSpacing = 0.000000315782;
        var heightSpacing = 2.0;

        var origins = [
            Cartesian3.fromRadians(longitude, latitude + latitudeSpacing, height),
            Cartesian3.fromRadians(longitude, latitude - latitudeSpacing, height),
            Cartesian3.fromRadians(longitude + longitudeSpacing, latitude, height),
            Cartesian3.fromRadians(longitude - longitudeSpacing, latitude, height),
            Cartesian3.fromRadians(longitude, latitude, height - heightSpacing),
            Cartesian3.fromRadians(longitude, latitude, height + heightSpacing)
        ];

        var offsets = [
            new HeadingPitchRange(0.0, 0.0, 0.1),
            new HeadingPitchRange(CesiumMath.PI, 0.0, 0.1),
            new HeadingPitchRange(CesiumMath.PI_OVER_TWO, 0.0, 0.1),
            new HeadingPitchRange(CesiumMath.THREE_PI_OVER_TWO, 0.0, 0.1),
            new HeadingPitchRange(0, -CesiumMath.PI_OVER_TWO, 0.1),
            new HeadingPitchRange(0, CesiumMath.PI_OVER_TWO, 0.1)
        ];

        for (var i = 0; i < 6; ++i) {
            var box = scene.primitives.add(Model.fromGltf({
                url : boxUrl,
                modelMatrix : Transforms.headingPitchRollToFixedFrame(origins[i], 0.0, 0.0, 0.0),
                scale : 0.2
            }));
            scene.render(); // Model is pre-loaded, render one frame to make it ready

            scene.camera.lookAt(origins[i], offsets[i]);

            // Render without shadows
            scene.shadowMap.enabled = false;
            var unshadowedColor = render();
            expect(unshadowedColor).not.toEqual(backgroundColor);

            // Render with shadows
            scene.shadowMap.enabled = true;
            var shadowedColor = render();
            expect(shadowedColor).not.toEqual(backgroundColor);
            expect(shadowedColor).not.toEqual(unshadowedColor);

            // Check that setting a smaller radius works
            var radius = scene.shadowMap._pointLightRadius;
            scene.shadowMap._pointLightRadius = 3.0;
            expect(render()).toEqual(unshadowedColor);
            scene.shadowMap._pointLightRadius = radius;

            // Move the camera away from the shadow
            scene.camera.moveRight(0.5);
            expect(render()).toEqual(unshadowedColor);

            scene.primitives.remove(box);
        }
    });

    it('shadows are disabled during the pick pass', function() {
        box.show = true;
        floor.show = true;

        createCascadedShadowMap();
        
        // Shadows should not cast into the shadow


        // createCascadedShadowMap();
        // scene.shadowMap.enabled = false;
        // render();
        // console.log(scene.frameState.commandList[0]._lastDirtyTime);
        //
        // scene.shadowMap.enabled = true;
        // render();
        // console.log(scene.frameState.commandList[0]._lastDirtyTime);
        //
        // scene.shadowMap.enabled = false;
        // render();
        // console.log(scene.frameState.commandList[0]._lastDirtyTime);

        // Look at commands and see that they aren't shadowed?
        scene.pickForSpecs();
    });

    it('destroys', function() {
        var shadowMap = new ShadowMap({
            context : scene.context,
            lightCamera : new Camera(scene)
        });

        expect(shadowMap.isDestroyed()).toEqual(false);
        shadowMap.destroy();
        expect(shadowMap.isDestroyed()).toEqual(true);
    });
    
    it('enable fitNearFar', function() {
        box.show = true;
        floor.show = true;
        createShadowMapForDirectionalLight();
        scene.shadowMap._fitNearFar = true; // True by default
        render();
        var shadowNearFit = scene.shadowMap._sceneCamera.frustum.near;
        var shadowFarFit = scene.shadowMap._sceneCamera.frustum.far;

        scene.shadowMap._fitNearFar = false;
        render();
        var shadowNear = scene.shadowMap._sceneCamera.frustum.near;
        var shadowFar = scene.shadowMap._sceneCamera.frustum.far;

        // When fitNearFar is true the shadowed region is smaller
        expect(shadowNear).toBeLessThan(shadowNearFit);
        expect(shadowFar).toBeGreaterThan(shadowFarFit);
    });

    it('set maximumDistance', function() {
        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();
        expect(unshadowedColor).not.toEqual(backgroundColor);

        // Render with shadows
        scene.shadowMap.enabled = true;
        var shadowedColor = render();
        expect(shadowedColor).not.toEqual(backgroundColor);
        expect(shadowedColor).not.toEqual(unshadowedColor);

        // Set a maximum distance where the shadows start to fade out
        scene.shadowMap.maximumDistance = 6.0;
        var fadedColor = render();
        expect(fadedColor).not.toEqual(backgroundColor);
        expect(fadedColor).not.toEqual(unshadowedColor);
        expect(fadedColor).not.toEqual(shadowedColor);

        // Set a maximimum distance where the shadows are not visible
        scene.shadowMap.maximumDistance = 3.0;
        expect(render()).toEqual(unshadowedColor);
    });

    it('model updates derived commands when the shadow map is dirty', function() {
        var spy = spyOn(ShadowMap, 'createDerivedCommands').and.callThrough();

        box.show = true;
        floor.show = true;
        createCascadedShadowMap();

        // Render without shadows
        scene.shadowMap.enabled = false;
        var unshadowedColor = render();
        expect(unshadowedColor).not.toEqual(backgroundColor);

        // Render with shadows
        scene.shadowMap.enabled = true;
        var shadowedColor = render();
        expect(shadowedColor).not.toEqual(backgroundColor);
        expect(shadowedColor).not.toEqual(unshadowedColor);

        // Hide floor temporarily and change the shadow map
        floor.show = false;
        scene.shadowMap.debugCascadeColors = true;

        // Render a few frames
        render();
        render();
        render();

        // Show the floor and render. The receive shadows shader should now be up-to-date.
        floor.show = true;
        var debugShadowColor = render();
        expect(debugShadowColor).not.toEqual(backgroundColor);
        expect(debugShadowColor).not.toEqual(unshadowedColor);
        expect(debugShadowColor).not.toEqual(shadowedColor);

        // Render a few more frames
        render();
        render();
        render();

        // Expect derived commands to be update twice for both the floor and box,
        // once on the first frame and again when the shadow map is dirty
        expect(spy.calls.count()).toEqual(4);

        box.show = false;
        floor.show = false;
    });

}, 'WebGL');
