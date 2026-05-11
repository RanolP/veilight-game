import type { DrawSprite, Material, Rotation, Sprite } from "./rendering-types";

type DrawSpriteInput = {
  sprite: Sprite;
  material: Material;
  x: number;
  y: number;
  scale?: number;
  rotation?: Rotation;
};

const isDev = import.meta.env.DEV;

function coerceInteger(name: string, value: number): number {
  if (isDev && !Number.isInteger(value)) {
    console.warn(`RenderCommandCollector.drawSprite coerced non-integer ${name}: ${value}`);
  }

  return value | 0;
}

export class RenderCommandCollector {
  readonly #commands: DrawSprite[] = [];

  drawSprite({ sprite, material, x, y, scale = 1, rotation = 0 }: DrawSpriteInput): void {
    if (isDev) {
      if (!sprite || !Object.isFrozen(sprite)) {
        console.warn("RenderCommandCollector.drawSprite expected a frozen Sprite object.");
      }

      if (!material || !Object.isFrozen(material)) {
        console.warn("RenderCommandCollector.drawSprite expected a frozen Material object.");
      }
    }

    this.#commands.push({
      sprite,
      material,
      x: coerceInteger("x", x),
      y: coerceInteger("y", y),
      scale: coerceInteger("scale", scale),
      rotation,
    });
  }

  get commands(): readonly DrawSprite[] {
    return this.#commands;
  }

  reset(): void {
    this.#commands.length = 0;
  }
}
