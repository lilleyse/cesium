#ifdef MRT
#extension GL_EXT_draw_buffers : enable
#endif

uniform vec4 u_bgColor;
uniform sampler2D u_depthTexture;

varying vec2 v_textureCoordinates;

void main()
{
    gl_FragData[0] = vec4(0.5);
    gl_FragData[1] = vec4(0.5);
}
