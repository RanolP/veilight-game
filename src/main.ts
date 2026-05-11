import { createGameLoop } from "./game-loop";

function getCanvas(): HTMLCanvasElement {
  const element = document.querySelector<HTMLCanvasElement>("#game");

  if (!element) {
    throw new Error("Missing #game canvas");
  }

  return element;
}

const canvas = getCanvas();

const canvasContext = canvas.getContext("2d");

if (!canvasContext) {
  throw new Error("Canvas 2D context is unavailable");
}

const context = canvasContext;
const devicePixelRatio = window.devicePixelRatio || 1;

type Actor = {
  x: number;
  previousX: number;
  y: number;
  radius: number;
  speed: number;
};

const actor: Actor = {
  x: 120,
  previousX: 120,
  y: 0,
  radius: 24,
  speed: 180,
};

function resizeCanvas() {
  const width = Math.floor(window.innerWidth * devicePixelRatio);
  const height = Math.floor(window.innerHeight * devicePixelRatio);

  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  actor.y = canvas.height / 2;
  actor.x = Math.max(actor.radius, Math.min(actor.x, canvas.width - actor.radius));
  actor.previousX = actor.x;
}

function update(deltaSeconds: number) {
  actor.previousX = actor.x;
  actor.x += actor.speed * devicePixelRatio * deltaSeconds;

  const rightBound = canvas.width - actor.radius;
  const leftBound = actor.radius;

  if (actor.x >= rightBound || actor.x <= leftBound) {
    actor.x = Math.max(leftBound, Math.min(actor.x, rightBound));
    actor.speed *= -1;
  }
}

function render(alpha: number) {
  resizeCanvas();

  const interpolatedX = actor.previousX + (actor.x - actor.previousX) * alpha;

  context.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#1b211c");
  gradient.addColorStop(1, "#0c0d0c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgb(246 241 222 / 0.12)";
  context.lineWidth = 2 * devicePixelRatio;
  context.strokeRect(
    32 * devicePixelRatio,
    32 * devicePixelRatio,
    canvas.width - 64 * devicePixelRatio,
    canvas.height - 64 * devicePixelRatio,
  );

  context.beginPath();
  context.arc(interpolatedX, actor.y, actor.radius * devicePixelRatio, 0, Math.PI * 2);
  context.fillStyle = "#f3c969";
  context.shadowColor = "rgb(243 201 105 / 0.45)";
  context.shadowBlur = 24 * devicePixelRatio;
  context.fill();
  context.shadowBlur = 0;
}

resizeCanvas();
createGameLoop({ update, render }).start();
