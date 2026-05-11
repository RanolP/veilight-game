import { loadAssets } from "./assets";
import { createGameLoop } from "./game-loop";
import { RenderCommandCollector } from "./render-command-collector";
import { atlases, defaultMaterial, demo } from "./rendering-resources";
import { createRenderer } from "./renderer";

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 640;

function getCanvas(): HTMLCanvasElement {
  const element = document.querySelector<HTMLCanvasElement>("#game");

  if (!element) {
    throw new Error("Missing #game canvas");
  }

  return element;
}

type Actor = {
  x: number;
  previousX: number;
  y: number;
  speed: number;
};

const actor: Actor = {
  x: 32,
  previousX: 32,
  y: 304,
  speed: 72,
};

function update(deltaSeconds: number): void {
  actor.previousX = actor.x;
  actor.x += actor.speed * deltaSeconds;

  const rightBound = VIRTUAL_WIDTH - demo.pet.w;
  const leftBound = 0;

  if (actor.x >= rightBound || actor.x <= leftBound) {
    actor.x = Math.max(leftBound, Math.min(actor.x, rightBound));
    actor.speed *= -1;
  }
}

async function bootstrap(): Promise<void> {
  const canvas = getCanvas();
  const assets = await loadAssets({ atlases });
  const renderer = createRenderer(canvas, { assets });
  const collector = new RenderCommandCollector();

  createGameLoop({
    update,
    render(alpha) {
      collector.reset();

      const interpolatedX = actor.previousX + (actor.x - actor.previousX) * alpha;

      collector.drawSprite({
        sprite: demo.pet,
        material: defaultMaterial,
        x: interpolatedX | 0,
        y: actor.y,
      });
      collector.drawSprite({
        sprite: demo.pet,
        material: defaultMaterial,
        x: VIRTUAL_WIDTH / 2 - demo.pet.w,
        y: VIRTUAL_HEIGHT / 2 - demo.pet.h,
        scale: 2,
      });

      renderer.render(collector.commands);
    },
  }).start();
}

void bootstrap();
