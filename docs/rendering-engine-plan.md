# 2D Pixel Rendering Engine Plan

## Goal

Build a small, powerful, no-library 2D rendering engine for a Tamagotchi-style web game.

The engine is optimized for pixelated 2D games and uses WebGL2 only.

## Locked Core Decisions

### Backend

- WebGL2 only.
- Canvas2D is not a backend.
- The engine renders to a virtual framebuffer first, then presents to the browser canvas.

### Virtual Screen

- Virtual framebuffer size: `360x640`.
- Game rendering happens at virtual resolution.
- Final presentation uses integer scaling only.
- Presentation is centered on the real canvas.
- Extra screen area is letterboxed/pillarboxed.
- Texture filtering is nearest-neighbor.
- No subpixel presentation.

### Primitive

The renderer core has exactly one drawable primitive: sprite texture quads.

No core primitives for:

- rect
- circle
- path
- text
- polygon

Any future solid/debug/pixel text rendering should be expressed through sprites/textures above core.

### Sprite Resource

Generated sprite resources are frozen objects named `Sprite`.

```ts
export type Sprite = Readonly<{
  id: number;
  atlas: number;
  x: number;
  y: number;
  w: number;
  h: number;
}>;
```

Rules:

- `Sprite` is a generated runtime object, not just an ID.
- Draw calls pass `Sprite` object references directly.
- `Sprite` objects are always frozen.
- `atlas` indexes into the generated atlas URL array and loaded atlas image array.

### Draw Command

The only render command is `DrawSprite`.

```ts
export type Rotation = 0 | 1 | 2 | 3;

export type DrawSprite = {
  sprite: Sprite;
  material: Material;
  x: number;
  y: number;
  scale: number;
  rotation: Rotation;
};
```

Rotation values:

- `0`: 0 degrees
- `1`: 90 degrees
- `2`: 180 degrees
- `3`: 270 degrees

Rules:

- No `kind` field for now.
- Commands are plain frame-local objects.
- Commands are never frozen.
- Renderer treats commands as read-only and never mutates them.
- Command sequence order is the draw order.
- Renderer never reorders commands.

### Collector API

Render passes emit commands through a collector.

```ts
collector.drawSprite({
  sprite,
  material,
  x,
  y,
  scale,
  rotation,
});
```

Required fields:

- `sprite`
- `material`
- `x`
- `y`

Defaults:

- `scale = 1`
- `rotation = 0`

Collector responsibilities:

- Validate and normalize command inputs.
- Warn in dev mode when integer-only values are non-integer.
- Coerce `x`, `y`, and `scale` using integer coercion, e.g. `value | 0`.
- Emit clean `DrawSprite` commands.

Renderer responsibilities:

- Trust commands.
- Do no validation/coercion on the hot path.

### Integer Pixel Policy

- Positions are integer-only.
- Scale is integer-only.
- Movement should resolve to integer pixel positions before reaching renderer core.
- Non-integer values warn in dev mode at collector level.
- Non-integer values are coerced by the collector.

### Materials

`Material` is required on every `DrawSprite`.

```ts
export type BlendMode = "alpha" | "opaque" | "additive";

export type Material = Readonly<{
  id: number;
  shader: Shader;
  blendMode: BlendMode;
  uniforms: UniformMap;
}>;
```

Rules:

- No arbitrary per-draw uniform overrides.
- If one sprite needs different shader values, derive a new material.
- Materials are always frozen.
- Uniform maps are frozen.
- Materials should be easy to derive, similar to Kotlin `copy`.

Example surface API:

```ts
const flashing = copyMaterial(normal, {
  flash: 1,
});
```

### Shaders

- Shaders are generated from paired shader files.
- Paired file convention:

```txt
src/shaders/sprite.vert
src/shaders/sprite.frag
```

Generated shader objects are frozen.

Future tooling should parse shader uniforms and generate typed material factories.

Example uniform mapping:

- `float` -> `number`
- `int` -> `number`
- `bool` -> `boolean`
- `vec2` -> `[number, number]`
- `vec3` -> `[number, number, number]`
- `vec4` -> `[number, number, number, number]`
- `sampler2D` -> texture/image resource type

### Batching

Renderer groups only consecutive compatible commands.

Rules:

- Preserve command sequence order.
- Never reorder commands.
- Batch sequential work that is batch-compatible.

Initial batch compatibility:

- same `sprite.atlas`
- same `material`

Example:

```txt
A A A -> one batch
B B   -> one batch
A     -> new batch
```

But:

```txt
A B A
```

must not become:

```txt
A A B
```

### Generated Sprite Atlas

Atlas generation outputs TypeScript directly.

No TypeScript namespaces.

Generated sprite groups are folder-based `const` exports using `snake_case` keys.

Example input:

```txt
assets/sprites/pet/idle-0.png
assets/sprites/pet/idle-1.png
assets/sprites/ui/button.png
```

Example generated output:

```ts
import atlas_0_url from "./atlases/atlas_0.png";
import atlas_1_url from "./atlases/atlas_1.png";

export const atlases = Object.freeze([atlas_0_url, atlas_1_url]);

export const pet = Object.freeze({
  idle_0: Object.freeze({
    id: 1,
    atlas: 0,
    x: 0,
    y: 0,
    w: 32,
    h: 32,
  }),
  idle_1: Object.freeze({
    id: 2,
    atlas: 0,
    x: 32,
    y: 0,
    w: 32,
    h: 32,
  }),
});

export const ui = Object.freeze({
  button: Object.freeze({
    id: 3,
    atlas: 1,
    x: 0,
    y: 0,
    w: 64,
    h: 16,
  }),
});
```

Rules:

- Multiple atlases from day 1.
- Generated `atlases` array is loaded by the asset loader.
- Sprite constants refer to an atlas by numeric index.
- Folder groups become frozen const objects.
- File names become `snake_case` keys.

### Asset Loading

Asset loading is separate from renderer construction.

```ts
const assets = await loadAssets({ atlases });
const renderer = createRenderer(canvas, { assets });
```

Asset loader responsibilities:

- Load generated atlas URLs.
- Preserve atlas order.
- Decode images.
- Return decoded atlas image sources.
- Fail clearly when loading fails.

Renderer responsibilities:

- Own WebGL context.
- Create WebGL textures from decoded atlas images.
- Apply nearest filtering.
- Apply clamp wrapping.
- Bind atlas textures during batching.

Asset type:

```ts
export type AtlasImage = ImageBitmap | HTMLImageElement;

export type Assets = Readonly<{
  atlases: readonly AtlasImage[];
}>;
```

Loading strategy:

- Prefer `fetch -> blob -> createImageBitmap`.
- Fallback to `HTMLImageElement`.

## Initial Implementation Milestone

Implement engine core v1 without the atlas generator plugin yet.

Scope:

1. Add core render types:
   - `Sprite`
   - `Shader`
   - `Material`
   - `BlendMode`
   - `Rotation`
   - `DrawSprite`
2. Add material helpers:
   - create frozen material
   - copy/derive frozen material
3. Add `RenderCommandCollector`:
   - `drawSprite(...)`
   - command storage/reset
   - integer warnings/coercion
4. Add asset loader:
   - load atlas URLs
   - decode with `createImageBitmap`
   - fallback to `Image`
5. Add WebGL2 renderer:
   - virtual framebuffer `360x640`
   - integer-scale presentation
   - nearest texture filtering
   - sprite shader pipeline
   - consecutive compatible batching
6. Add temporary generated-like resources:
   - one atlas image or generated placeholder texture
   - one frozen sprite const
   - one default material
7. Update `main.ts`:
   - bootstrap canvas
   - load assets
   - create renderer
   - emit one or more `DrawSprite` commands through collector
   - render via existing fixed timestep loop
8. Run:

```bash
pnpm run check
```

9. Commit after review.

## Deferred Work

Not part of the first implementation:

- Real atlas packing plugin.
- Shader uniform type generation.
- Sprite animation system.
- Scene graph.
- World/camera/zoom layer.
- UI framework.
- Input routing.
- Audio.
- ECS.
- Text rendering.
