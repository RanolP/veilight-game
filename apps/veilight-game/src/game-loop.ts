export type GameLoopHooks = {
  beforeUpdate?: (timeMilliseconds: number) => void;
  update: (deltaSeconds: number) => void;
  render: (alpha: number) => void;
  afterRender?: () => void;
};

export type GameLoopOptions = GameLoopHooks & {
  fixedDeltaSeconds?: number;
  maxFrameDeltaSeconds?: number;
  maxUpdatesPerFrame?: number;
};

export type GameLoop = {
  start: () => void;
  stop: () => void;
  get isRunning(): boolean;
};

const DEFAULT_FIXED_DELTA_SECONDS = 1 / 60;
const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.25;
const DEFAULT_MAX_UPDATES_PER_FRAME = 5;

export function createGameLoop({
  beforeUpdate,
  update,
  render,
  afterRender,
  fixedDeltaSeconds = DEFAULT_FIXED_DELTA_SECONDS,
  maxFrameDeltaSeconds = DEFAULT_MAX_FRAME_DELTA_SECONDS,
  maxUpdatesPerFrame = DEFAULT_MAX_UPDATES_PER_FRAME,
}: GameLoopOptions): GameLoop {
  let animationFrameId = 0;
  let accumulatorSeconds = 0;
  let lastTimeSeconds = 0;
  let running = false;

  const frame = (timeMilliseconds: number) => {
    if (!running) {
      return;
    }

    beforeUpdate?.(timeMilliseconds);

    const timeSeconds = timeMilliseconds / 1000;
    const frameDeltaSeconds = Math.min(timeSeconds - lastTimeSeconds, maxFrameDeltaSeconds);

    lastTimeSeconds = timeSeconds;
    accumulatorSeconds += frameDeltaSeconds;

    let updates = 0;
    while (accumulatorSeconds >= fixedDeltaSeconds && updates < maxUpdatesPerFrame) {
      update(fixedDeltaSeconds);
      accumulatorSeconds -= fixedDeltaSeconds;
      updates += 1;
    }

    if (updates === maxUpdatesPerFrame) {
      accumulatorSeconds = 0;
    }

    render(accumulatorSeconds / fixedDeltaSeconds);
    afterRender?.();
    animationFrameId = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      accumulatorSeconds = 0;
      lastTimeSeconds = performance.now() / 1000;
      animationFrameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(animationFrameId);
    },
    get isRunning() {
      return running;
    },
  };
}
