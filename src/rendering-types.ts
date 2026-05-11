export type Sprite = Readonly<{
  id: number;
  atlas: number;
  x: number;
  y: number;
  w: number;
  h: number;
}>;

export type Shader = Readonly<{
  id: number;
  name: string;
  vertexSource: string;
  fragmentSource: string;
}>;

export type BlendMode = "alpha" | "opaque" | "additive";

export type UniformValue =
  | number
  | boolean
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export type UniformMap = Readonly<Record<string, UniformValue>>;

export type Material = Readonly<{
  id: number;
  shader: Shader;
  blendMode: BlendMode;
  uniforms: UniformMap;
}>;

export type Rotation = 0 | 1 | 2 | 3;

export type DrawSprite = {
  sprite: Sprite;
  material: Material;
  x: number;
  y: number;
  scale: number;
  rotation: Rotation;
};
