/**
 * Compositing for Weighted Blended Order-Independent Transparency. See:
 * - http://jcgt.org/published/0002/02/09/
 * - http://casual-effects.blogspot.com/2014/03/weighted-blended-order-independent.html
 */
 
uniform sampler2D u_opaque;
uniform sampler2D u_accumulation;
uniform sampler2D u_revealage;

varying vec2 v_textureCoordinates;

void main()
{
    vec4 opaque = texture2D(u_opaque, vec2(0.0,0.0));
    vec4 accum = texture2D(u_accumulation, vec2(0.0,0.0));
    float r = texture2D(u_revealage, vec2(0.0,0.0)).r;
    //gl_FragColor = accum;
    //gl_FragColor = r;
    //gl_FragColor = (1.0 - transparent.a) * transparent + transparent.a * opaque;
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
