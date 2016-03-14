/*global define*/
define([
        '../Core/defaultValue',
        '../Core/defined',
        '../Renderer/ShaderSource'
    ], function(
        defaultValue,
        defined,
        ShaderSource) {
    'use strict';

    /**
     * @private
     */
    function ShadowMapShader() {
    }

    ShadowMapShader.createShadowCastVertexShader = function(vs, frameState, positionECVaryingName) {
        var isPointLight = frameState.shadowMap.isPointLight;
        if (isPointLight) {
            // If a world-space position varying does not exist, create one to send to the fragment shader
            var hasPositionEC = defined(positionECVaryingName) && (vs.indexOf(positionECVaryingName) > -1);
            if (!hasPositionEC) {
                vs = ShaderSource.replaceMain(vs, 'czm_shadow_main');
                vs +=
                    'varying vec3 v_positionEC; \n' +
                    'void main() \n' +
                    '{ \n' +
                    '    czm_shadow_main(); \n' +
                    '    v_positionEC = (czm_inverseViewProjection * gl_Position).xyz; \n' +
                    '} \n';
            }
        }

        return vs;
    };

    ShadowMapShader.createShadowCastFragmentShader = function(fs, frameState, opaque, positionECVaryingName) {
        // TODO : is there an easy way to tell if a model or primitive is opaque before going here?
        opaque = defaultValue(opaque, false);
        var isPointLight = frameState.shadowMap.isPointLight;
        var usesDepthTexture = frameState.shadowMap.usesDepthTexture;
        var hasPositionEC = true;

        var outputText;
        if (isPointLight) {
            // Write the distance from the light into the depth texture, scaled to the [0, 1] range.
            hasPositionEC = defined(positionECVaryingName) && (fs.indexOf(positionECVaryingName) > -1);
            positionECVaryingName = hasPositionEC ? positionECVaryingName : 'v_positionEC';
            outputText =
                'float distance = length(' + positionECVaryingName + ') / czm_sunShadowMapRadius; \n' +
                'gl_FragColor = czm_packDepth(distance); \n';
        } else {
            if (usesDepthTexture) {
                // Depth already written to the depth buffer
                outputText = 'gl_FragColor = vec4(1.0) \n';
            } else {
                // Pack depth and store in the color target
                outputText = 'gl_FragColor = czm_packDepth(gl_FragCoord.z); \n';
            }
        }

        fs = ShaderSource.replaceMain(fs, 'czm_shadow_main');
        fs += (!hasPositionEC ? 'varying vec3 ' + positionECVaryingName +'; \n' : '');
        fs +=
            'void main() \n' +
            '{ \n' +
            (!opaque ?
            '    // Discard fragment if alpha is 0.0 \n' +
            '    czm_shadow_main(); \n' +
            '    if (gl_FragColor.a == 0.0) { \n' +
            '       discard; \n' +
            '    } \n' : '') +
            outputText +
            '} \n';

        return fs;
    };

    ShadowMapShader.createShadowReceiveVertexShader = function(vs, frameState) {
        var isPointLight = frameState.shadowMap.isPointLight;
        if (!isPointLight) {
            vs = ShaderSource.replaceMain(vs, 'czm_shadow_main');
            vs +=
                'varying vec3 v_shadowPosition; \n' +
                'void main() \n' +
                '{ \n' +
                '    czm_shadow_main(); \n' +
                '    v_shadowPosition = (czm_sunShadowMapMatrix * gl_Position).xyz; \n' +
                '} \n';
        }

        return vs;
    };

    ShadowMapShader.createShadowReceiveFragmentShader = function(fs, frameState, normalVaryingName, positionVaryingName) {
        var hasNormalVarying = defined(normalVaryingName) && (fs.indexOf(normalVaryingName) > -1);
        var hasPositionVarying = defined(positionVaryingName) && (fs.indexOf(positionVaryingName) > -1);

        var usesDepthTexture = frameState.shadowMap.usesDepthTexture;
        var isPointLight = frameState.shadowMap.isPointLight;
        var hasCascades = frameState.shadowMap.numberOfCascades > 1;
        var debugVisualizeCascades = frameState.shadowMap.debugVisualizeCascades;

        fs = ShaderSource.replaceMain(fs, 'czm_shadow_main');
        fs +=
            (!isPointLight ? 'varying vec3 v_shadowPosition; \n' : '') +
            ' \n' +
            'vec4 getCascadeWeights(float depthEye) \n' +
            '{ \n' +
            '    // One component is set to 1.0 and all others set to 0.0. \n' +
            '    vec4 near = step(czm_sunShadowMapCascadeSplits[0], vec4(depthEye)); \n' +
            '    vec4 far = step(depthEye, czm_sunShadowMapCascadeSplits[1]); \n' +
            '    return near * far; \n' +
            '} \n' +
            'vec4 getCascadeViewport(vec4 weights) \n' +
            '{ \n' +
            '    return vec4(0.0, 0.0, 0.5, 0.5) * weights.x + \n' +
            '           vec4(0.5, 0.0, 0.5, 0.5) * weights.y + \n' +
            '           vec4(0.0, 0.5, 0.5, 0.5) * weights.z + \n' +
            '           vec4(0.5, 0.5, 0.5, 0.5) * weights.w; \n' +
            '} \n' +
            'vec3 getCascadeOffset(vec4 weights) \n' +
            '{ \n' +
            '    return czm_sunShadowMapCascadeOffsets[0] * weights.x + \n' +
            '           czm_sunShadowMapCascadeOffsets[1] * weights.y + \n' +
            '           czm_sunShadowMapCascadeOffsets[2] * weights.z + \n' +
            '           czm_sunShadowMapCascadeOffsets[3] * weights.w; \n' +
            '} \n' +
            'vec3 getCascadeScale(vec4 weights) \n' +
            '{ \n' +
            '    return czm_sunShadowMapCascadeScales[0] * weights.x + \n' +
            '           czm_sunShadowMapCascadeScales[1] * weights.y + \n' +
            '           czm_sunShadowMapCascadeScales[2] * weights.z + \n' +
            '           czm_sunShadowMapCascadeScales[3] * weights.w; \n' +
            '} \n' +
            'vec4 getCascadeColor(vec4 weights) \n' +
            '{ \n' +
            '    return vec4(1.0, 0.0, 0.0, 1.0) * weights.x + \n' +
            '           vec4(0.0, 1.0, 0.0, 1.0) * weights.y + \n' +
            '           vec4(0.0, 0.0, 1.0, 1.0) * weights.z + \n' +
            '           vec4(1.0, 0.0, 1.0, 1.0) * weights.w; \n' +
            '} \n' +
            ' \n' +
            'float getDepthEye() \n' +
            '{ \n' +

            (hasPositionVarying ?
            '    return czm_projection[3][2] / ((gl_FragCoord.z * 2.0 - 1.0) + czm_projection[2][2]); \n' :
            '    return ' + positionVaryingName + '.z; \n') +

            '} \n' +
            ' \n' +
            'float sampleTexture(vec2 shadowCoordinate) \n' +
            '{ \n' +

            (usesDepthTexture ?
            '    return texture2D(czm_sunShadowMapTexture, shadowCoordinate).r; \n' :
            '    return czm_unpackDepth(texture2D(czm_sunShadowMapTexture, shadowCoordinate)); \n') +

            '} \n' +
            ' \n' +
            'float getVisibility(vec3 shadowPosition, vec3 lightDirectionEC) \n' +
            '{ \n' +
            '    float depth = shadowPosition.z; \n' +
            '    float shadowDepth = sampleTexture(shadowPosition.xy); \n' +
            '    float visibility = step(depth, shadowDepth); \n' +

            (hasNormalVarying ?
            '    // If the normal is facing away from the light, then it is in shadow \n' +
            '    float angle = dot(normalize(' + normalVaryingName + '), lightDirectionEC); \n' +
            '    float strength = step(0.0, angle); \n' +
            '    //float strength = clamp(angle * 10.0, 0.0, 1.0); \n' +
            '    visibility *= strength; \n' : '') +

            '    visibility = max(visibility, 0.3); \n' +
            '    return visibility; \n' +
            '} \n' +
            ' \n' +
            'vec2 directionToUV(vec3 v) { \n' +
            ' \n' +
            '    vec3 abs = abs(v); \n' +
            '    float max = max(max(abs.x, abs.y), abs.z); // Get the largest component \n' +
            '    vec3 weights = step(max, abs); // 1.0 for the largest component, 0.0 for the others \n' +
            '    float sign = dot(weights, sign(v)) * 0.5 + 0.5; // 0 or 1 \n' +
            '    float sc = dot(weights, mix(vec3(v.z, v.x, -v.x), vec3(-v.z, v.x, v.x), sign)); \n' +
            '    float tc = dot(weights, mix(vec3(-v.y, -v.z, -v.y), vec3(-v.y, v.z, -v.y), sign)); \n' +
            '    vec2 uv = (vec2(sc, tc) / max) * 0.5 + 0.5; \n' +
            '    float offsetX = dot(weights, vec3(0.0, 1.0, 2.0)); \n' +
            '    float offsetY = sign; \n' +
            '    uv.x = (uv.x + offsetX) / 3.0; \n' +
            '    uv.y = (uv.y + offsetY) / 2.0; \n' +
            '    return uv; \n' +
            '} \n';

        if (isPointLight) {
            fs +=
                'void main() \n' +
                '{ \n' +
                '    czm_shadow_main(); \n' +
                '    vec3 directionEC = ' + positionVaryingName + ' - czm_sunShadowMapLightPositionEC; \n' +
                '    float distance = length(directionEC) / czm_sunShadowMapRadius; \n' +
                '    vec3 directionWC  = czm_inverseViewRotation * directionEC; \n' +
                '    vec2 uv = directionToUV(directionWC); \n' +
                '    float visibility = getVisibility(vec3(uv, distance), -directionEC); \n' +
                '    gl_FragColor.rgb *= visibility; \n' +
                '} \n';
        } else {
            fs +=
                'void main() \n' +
                '{ \n' +
                '    czm_shadow_main(); \n' +
                '    vec3 shadowPosition = v_shadowPosition; \n' +
                '    // Do not apply shadowing if outside of the shadow map bounds \n' +
                '    if (any(lessThan(shadowPosition, vec3(0.0))) || any(greaterThan(shadowPosition, vec3(1.0)))) { \n' +
                '        return; \n' +
                '    } \n' +
                ' \n' +

                (hasCascades ?
                '    // Get the cascade \n' +
                '    float depthEye = getDepthEye(); \n' +
                '    vec4 weights = getCascadeWeights(depthEye); \n' +
                ' \n' +
                '    // Transform shadowPosition into the cascade \n' +
                '    shadowPosition += getCascadeOffset(weights); \n' +
                '    shadowPosition *= getCascadeScale(weights); \n' +
                ' \n' +
                '    // Modify texture coordinates to read from the correct cascade in the texture atlas \n' +
                '    vec4 viewport = getCascadeViewport(weights); \n' +
                '    shadowPosition.xy = shadowPosition.xy * viewport.zw + viewport.xy; \n' +
                ' \n' +

                (debugVisualizeCascades ?
                '    // Draw cascade colors for debugging \n' +
                '    gl_FragColor *= getCascadeColor(weights); \n' : '') : '') +

                ' \n' +
                '    // Apply shadowing \n' +
                '    float visibility = getVisibility(shadowPosition, czm_sunShadowMapLightDirectionEC); \n' +
                '    gl_FragColor.rgb *= visibility; \n' +
                '} \n';
        }

        return fs;
    };

    return ShadowMapShader;
});
