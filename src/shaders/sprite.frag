#version 300 es
precision mediump float;

uniform sampler2D u_atlas;
uniform vec4 u_tint;

in vec2 v_texcoord;
out vec4 outColor;

void main() {
  outColor = texture(u_atlas, v_texcoord) * u_tint;
}
