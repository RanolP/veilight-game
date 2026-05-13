import { MonotonicTimestamp } from "@internal/foundation";
import { createInput, type InputSnapshot } from "@internal/input";
import { createWebInputSource } from "@internal/input-native-web";
import { createRenderer, loadAssets, RenderCommandCollector } from "@internal/renderer";
import { createGameLoop } from "./game-loop";
import { atlases, defaultMaterial, demo } from "./rendering-resources";

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 640;
const CAMERA_SPEED = 160;
const LEFT_STICK_DEADZONE = 0.2;

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

type Camera = {
  x: number;
  previousX: number;
  y: number;
  previousY: number;
};

type PanState = {
  pointerId: number | undefined;
  x: number;
  y: number;
};

type MovementVector = Readonly<{
  x: number;
  y: number;
}>;

const actor: Actor = {
  x: 32,
  previousX: 32,
  y: 304,
  speed: 72,
};

const camera: Camera = {
  x: 0,
  previousX: 0,
  y: 0,
  previousY: 0,
};

const pan: PanState = {
  pointerId: undefined,
  x: 0,
  y: 0,
};

function keyboardMovement(snapshot: InputSnapshot): MovementVector {
  let x = 0;
  let y = 0;

  if (snapshot.keyboard.isHeld("KC_A")) {
    x -= 1;
  }

  if (snapshot.keyboard.isHeld("KC_D")) {
    x += 1;
  }

  if (snapshot.keyboard.isHeld("KC_W")) {
    y -= 1;
  }

  if (snapshot.keyboard.isHeld("KC_S")) {
    y += 1;
  }

  return normalize({ x, y });
}

function leftStickMovement(snapshot: InputSnapshot): MovementVector {
  const gamepad = snapshot.gamepads.find((candidate) => candidate.connected);

  if (!gamepad) {
    return { x: 0, y: 0 };
  }

  return applyDeadzone({
    x: gamepad.getAxis("JOY_AXIS_LEFT_X")?.value ?? 0,
    y: gamepad.getAxis("JOY_AXIS_LEFT_Y")?.value ?? 0,
  });
}

function cameraMovement(snapshot: InputSnapshot): MovementVector {
  const keyboard = keyboardMovement(snapshot);
  const leftStick = leftStickMovement(snapshot);

  return normalize({
    x: keyboard.x + leftStick.x,
    y: keyboard.y + leftStick.y,
  });
}

function normalize(vector: MovementVector): MovementVector {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= 1) {
    return vector;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function applyDeadzone(vector: MovementVector): MovementVector {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= LEFT_STICK_DEADZONE) {
    return { x: 0, y: 0 };
  }

  const scaled = (length - LEFT_STICK_DEADZONE) / (1 - LEFT_STICK_DEADZONE);

  return {
    x: (vector.x / length) * scaled,
    y: (vector.y / length) * scaled,
  };
}

function virtualDisplayScale(canvas: HTMLCanvasElement): number {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const framebufferScale = Math.max(
    1,
    Math.floor(Math.min(canvas.width / VIRTUAL_WIDTH, canvas.height / VIRTUAL_HEIGHT)),
  );

  return framebufferScale / devicePixelRatio;
}

function applyPointerPan(input: InputSnapshot, canvas: HTMLCanvasElement): void {
  const activePointer = input.pointer.pointers.find((pointer) =>
    pointer.heldButtons.includes("KC_MS_BTN1"),
  );

  if (!activePointer) {
    pan.pointerId = undefined;
    return;
  }

  const { pointerId, position } = activePointer;

  if (pan.pointerId !== pointerId) {
    pan.pointerId = pointerId;
    pan.x = position.x;
    pan.y = position.y;
    return;
  }

  const deltaX = position.x - pan.x;
  const deltaY = position.y - pan.y;

  pan.x = position.x;
  pan.y = position.y;
  const scale = virtualDisplayScale(canvas);
  camera.x -= deltaX / scale;
  camera.y -= deltaY / scale;
}

function update(deltaSeconds: number, input: InputSnapshot, canvas: HTMLCanvasElement): void {
  actor.previousX = actor.x;
  actor.x += actor.speed * deltaSeconds;

  const rightBound = VIRTUAL_WIDTH - demo.pet.w;
  const leftBound = 0;

  if (actor.x >= rightBound || actor.x <= leftBound) {
    actor.x = Math.max(leftBound, Math.min(actor.x, rightBound));
    actor.speed *= -1;
  }

  const movement = cameraMovement(input);
  camera.previousX = camera.x;
  camera.previousY = camera.y;
  camera.x += movement.x * CAMERA_SPEED * deltaSeconds;
  camera.y += movement.y * CAMERA_SPEED * deltaSeconds;
  applyPointerPan(input, canvas);
}

async function bootstrap(): Promise<void> {
  const canvas = getCanvas();
  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", () => canvas.focus());
  canvas.focus();

  const nativeInput = createWebInputSource({ target: canvas });
  const input = createInput();
  const assets = await loadAssets({ atlases });
  const renderer = createRenderer(canvas, { assets });
  const collector = new RenderCommandCollector();

  createGameLoop({
    beforeUpdate(timeMilliseconds) {
      const time = MonotonicTimestamp.fromMilliseconds(timeMilliseconds);
      input.pushMany(nativeInput.poll(time));
      input.beginFrame(time);
    },
    update(deltaSeconds) {
      update(deltaSeconds, input.snapshot(), canvas);
    },
    render(alpha) {
      collector.reset();

      const interpolatedX = actor.previousX + (actor.x - actor.previousX) * alpha;
      const cameraX = camera.previousX + (camera.x - camera.previousX) * alpha;
      const cameraY = camera.previousY + (camera.y - camera.previousY) * alpha;

      collector.drawSprite({
        sprite: demo.pet,
        material: defaultMaterial,
        x: (interpolatedX - cameraX) | 0,
        y: (actor.y - cameraY) | 0,
      });
      collector.drawSprite({
        sprite: demo.pet,
        material: defaultMaterial,
        x: (VIRTUAL_WIDTH / 2 - demo.pet.w - cameraX) | 0,
        y: (VIRTUAL_HEIGHT / 2 - demo.pet.h - cameraY) | 0,
        scale: 2,
      });

      renderer.render(collector.commands);
    },
    afterRender() {
      input.endFrame();
    },
  }).start();
}

void bootstrap();
