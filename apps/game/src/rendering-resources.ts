import spriteFragmentSource from "./shaders/sprite.frag?raw";
import spriteVertexSource from "./shaders/sprite.vert?raw";
import { createMaterial, type Shader, type Sprite } from "@veilight/renderer";

export const spriteShader: Shader = Object.freeze({
  id: 1,
  name: "sprite",
  vertexSource: spriteVertexSource,
  fragmentSource: spriteFragmentSource,
});

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" fill="#00000000"/><rect x="8" y="8" width="16" height="16" fill="#f3c969"/><rect x="12" y="12" width="4" height="4" fill="#1b211c"/><rect x="20" y="12" width="4" height="4" fill="#1b211c"/><rect x="12" y="22" width="12" height="2" fill="#1b211c"/></svg>`;

export const atlases = Object.freeze([`data:image/svg+xml,${encodeURIComponent(placeholderSvg)}`]);

export const demo = Object.freeze({
  pet: Object.freeze({
    id: 1,
    atlas: 0,
    x: 0,
    y: 0,
    w: 32,
    h: 32,
  } satisfies Sprite),
});

export const defaultMaterial = createMaterial({
  shader: spriteShader,
  blendMode: "alpha",
  uniforms: {
    u_tint: [1, 1, 1, 1],
  },
});
