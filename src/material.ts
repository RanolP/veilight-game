import type { BlendMode, Material, Shader, UniformMap } from "./rendering-types";

export type MaterialOptions = {
  shader: Shader;
  blendMode: BlendMode;
  uniforms?: UniformMap;
};

let nextMaterialId = 1;

function freezeUniforms(uniforms: UniformMap = {}): UniformMap {
  return Object.freeze({ ...uniforms });
}

export function createMaterial({ shader, blendMode, uniforms }: MaterialOptions): Material {
  return Object.freeze({
    id: nextMaterialId++,
    shader,
    blendMode,
    uniforms: freezeUniforms(uniforms),
  });
}

export function copyMaterial(
  material: Material,
  uniforms: UniformMap,
  blendMode = material.blendMode,
): Material {
  return createMaterial({
    shader: material.shader,
    blendMode,
    uniforms: {
      ...material.uniforms,
      ...uniforms,
    },
  });
}
