/*global define*/
define([
        '../Core/BoundingRectangle',
        '../Core/Cartesian3',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/Matrix4',
        '../Core/PixelFormat',
        '../Renderer/ClearCommand',
        '../Renderer/Framebuffer',
        '../Renderer/PassState',
        '../Renderer/PixelDatatype',
        '../Renderer/RenderState',
        '../Renderer/ShaderProgram',
        '../Renderer/ShaderSource',
        '../Renderer/Texture',
        './Camera',
        './CullFace',
        './OrthographicFrustum'
    ], function(
        BoundingRectangle,
        Cartesian3,
        defined,
        destroyObject,
        Matrix4,
        PixelFormat,
        ClearCommand,
        Framebuffer,
        PassState,
        PixelDatatype,
        RenderState,
        ShaderProgram,
        ShaderSource,
        Texture,
        Camera,
        CullFace,
        OrthographicFrustum) {
    "use strict";

    // TODO : doc

    /**
     * @private
     */
    function ShadowMap(scene) {
        this.enabled = true;

        this._depthStencilTexture = undefined;
        this._framebuffer = undefined;
        this._size = 1024; // Width and height of the shadow map in pixels

        this.renderState = RenderState.fromCache({
            cull : {
                enabled : true,
                face : CullFace.BACK
            },
            depthTest : {
                enabled : true
            },
            colorMask : {
                red : false,
                green : false,
                blue : false,
                alpha : false
            },
            depthMask : true
        });

        var ps = new PassState(scene.context);
        ps.viewport = new BoundingRectangle();
        ps.viewport.x = 0;
        ps.viewport.y = 0;
        ps.viewport.width = this._size;
        ps.viewport.height = this._size;
        this.passState = ps;

        // TODO : The frustum should change based on the objects in it
        var frustum = new OrthographicFrustum();
        frustum.left = -10.0;
        frustum.right = 10.0;
        frustum.bottom = -10.0;
        frustum.top = 5.0;
        frustum.near = 1.0;
        frustum.far = 100.0;
        this._frustum = frustum;

        // TODO : set a fake direction for now
        var camera = new Camera(scene);
        var centerLongitude = -1.31968;
        var centerLatitude = 0.698874;
        camera.lookAt(Cartesian3.fromRadians(centerLongitude, centerLatitude), new Cartesian3(0.0, 0.0, 75.0));
        this.camera = camera;

        // TODO : need to pass in a renderState in order to trigger applyViewport at RenderState:757. There should be a better way.
        this._clearCommand = new ClearCommand({
            depth : 1.0,
            renderState : this.renderState,
            owner : this
        });
    }

    function destroyTextures(shadowMap) {
        shadowMap._depthStencilTexture = shadowMap._depthStencilTexture && !shadowMap._depthStencilTexture.isDestroyed() && shadowMap._depthStencilTexture.destroy();
    }

    function destroyFramebuffers(shadowMap) {
        shadowMap.framebuffer = shadowMap.framebuffer && !shadowMap.framebuffer.isDestroyed() && shadowMap.framebuffer.destroy();
    }

    function createTextures(shadowMap, context) {
        // TODO : create sampler. Use nearest filtering for testing.
        shadowMap._depthStencilTexture = new Texture({
            context : context,
            width : shadowMap._size,
            height : shadowMap._size,
            pixelFormat : PixelFormat.DEPTH_STENCIL,
            pixelDatatype : PixelDatatype.UNSIGNED_INT_24_8
        });
    }

    function createFramebuffers(shadowMap, context) {
        destroyTextures(shadowMap);
        destroyFramebuffers(shadowMap);

        createTextures(shadowMap, context);

        var framebuffer = new Framebuffer({
            context : context,
            depthStencilTexture : shadowMap._depthStencilTexture,
            destroyAttachments : false
        });
        shadowMap._framebuffer = framebuffer;
        shadowMap.passState.framebuffer = framebuffer;
    }

    function updateFramebuffers(shadowMap, context) {
        var depthStencilTexture = shadowMap._depthStencilTexture;
        var textureChanged = !defined(depthStencilTexture) || (depthStencilTexture.width !== shadowMap._size);
        if (!defined(shadowMap.framebuffer) || textureChanged) {
            createFramebuffers(shadowMap, context);
        }
    }

    ShadowMap.createShadowCastProgram = function(shaderProgram) {
        // TODO : need to store somewhere to destroy later?
        // TODO : vertex shader may be doing extra work than is needed for shadow pass, but it may be compiled out based on varyings
        // TODO : is mismatched varyings an error?
        var vs = shaderProgram.vertexShaderText;
        var fs =
            'void main()\n' +
            '{\n' +
            '    gl_FragColor = vec4(0.0);\n' +
            '}\n';

        return ShaderProgram.fromCache({
            vertexShaderSource : vs,
            fragmentShaderSource : fs,
            attributeLocations : shaderProgram._attributeLocations
        });
    };

    ShadowMap.createReceiveShadowsVertexShader = function(vs) {
        // TODO : handle if depth texture extension is not supported
        vs = ShaderSource.replaceMain(vs, 'czm_shadow_main');
        vs +=
            'varying vec3 czm_shadowMapCoordinate; \n' +
            'void main() \n' +
            '{ \n' +
            '    czm_shadow_main(); \n' +
            '    czm_shadowMapCoordinate = (czm_shadowMapMatrix * gl_Position).xyz; \n' +
            '} \n';
        return vs;
    };

    ShadowMap.createReceiveShadowsFragmentShader = function(fs) {
        fs = ShaderSource.replaceMain(fs, 'czm_shadow_main');
        fs +=
            'varying vec3 czm_shadowMapCoordinate; \n' +
            'void main() \n' +
            '{ \n' +
            '    czm_shadow_main(); \n' +
            '    float depth = czm_shadowMapCoordinate.z; \n' +
            '    float shadowDepth = texture2D(czm_shadowMapTexture, czm_shadowMapCoordinate.xy).r; \n' +
            //'    if (depth > shadowDepth) { \n' +
            //'        gl_FragColor.rgb = 0.2; \n' +
            //'    } \n' +
            //'    float visibility = float(lessThan(depth, shadowDepth)); \n' +
            '    gl_FragColor.rgb *= shadowDepth; \n' +
            '} \n';
        return fs;
    };

    ShadowMap.prototype.setSize = function(size) {
        this._size = size;
        this.passState.viewport.width = this._size;
        this.passState.viewport.height = this._size;
    };

    // Converts from NDC space to texture space
    var offsetMatrix = new Matrix4(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
    var scratchMatrix = new Matrix4();

    ShadowMap.prototype.update = function(frameState) {
        var enabled = frameState.shadowsEnabled = this.enabled;
        if (!enabled) {
            return;
        }

        var context = frameState.context;
        var uniformState = context.uniformState;

        updateFramebuffers(this, context);

        // TODO : is it bad practice to execute the command here?
        // Clear depth
        this._clearCommand.execute(context, this.passState);

        // Calculate shadow map matrix. It converts gl_Position to shadow map texture space.
        // TODO : only compute matrix when dirty
        var viewMatrix = this.camera.viewMatrix;
        var projectionMatrix = this._frustum.projectionMatrix;
        var shadowMapViewProjection = Matrix4.multiplyTransformation(projectionMatrix, viewMatrix, scratchMatrix);
        Matrix4.multiplyTransformation(offsetMatrix, shadowMapViewProjection, shadowMapViewProjection);
        Matrix4.multiply(shadowMapViewProjection, uniformState.inverseViewProjection, shadowMapViewProjection);

        // Update uniforms for shadow receive
        uniformState.shadowMapTexture = this._depthStencilTexture;
        uniformState.shadowMapMatrix = shadowMapViewProjection;
    };

    ShadowMap.prototype.isDestroyed = function() {
        return false;
    };

    ShadowMap.prototype.destroy = function() {
        destroyTextures(this);
        destroyFramebuffers(this);

        return destroyObject(this);
    };

    return ShadowMap;
});
