import { MonotonicTimestamp, registerSerdeType } from "@internal/foundation";
import {
  ZERO_WHEEL_DELTA,
  type FocusLostReason,
  type GamepadAxisId,
  type GamepadAxisSample,
  type GamepadButtonId,
  type GamepadButtonSample,
  type GamepadId,
  type GamepadMapping,
  type InputEvent,
  type KeyId,
  type NativeTextInput,
  type PointerButtonId,
  type PointerId,
  type PointerKind,
  type TextInputOptions,
  type TextInputSession,
  type WheelDelta,
} from "@internal/input-core";

export type InputOptions = Readonly<{
  debug?: boolean;
}>;

export type Input = {
  push(event: InputEvent): void;
  pushMany(events: Iterable<InputEvent>): void;
  beginFrame(time: MonotonicTimestamp): void;
  snapshot(): InputSnapshot;
  endFrame(): void;
  openTextInput(native: NativeTextInput, options: TextInputOptions): TextInputSession;
};

function unique<T>(values: Iterable<T>): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function has<T>(values: readonly T[], value: T): boolean {
  return values.includes(value);
}

export class KeyboardSnapshot {
  readonly #data: KeyboardSnapshotData;

  constructor(data: KeyboardSnapshotData) {
    this.#data = Object.freeze({
      heldKeys: Object.freeze([...data.heldKeys]),
      pressedKeys: Object.freeze([...data.pressedKeys]),
      releasedKeys: Object.freeze([...data.releasedKeys]),
    });
  }

  get heldKeys(): readonly KeyId[] {
    return this.#data.heldKeys;
  }

  get pressedKeys(): readonly KeyId[] {
    return this.#data.pressedKeys;
  }

  get releasedKeys(): readonly KeyId[] {
    return this.#data.releasedKeys;
  }

  isHeld(keyId: KeyId): boolean {
    return has(this.heldKeys, keyId);
  }

  wasPressed(keyId: KeyId): boolean {
    return has(this.pressedKeys, keyId);
  }

  wasReleased(keyId: KeyId): boolean {
    return has(this.releasedKeys, keyId);
  }

  toJSON(): { KeyboardSnapshot: KeyboardSnapshotData } {
    return { KeyboardSnapshot: this.#data };
  }
}

export type KeyboardSnapshotData = Readonly<{
  heldKeys: readonly KeyId[];
  pressedKeys: readonly KeyId[];
  releasedKeys: readonly KeyId[];
}>;

export class PointerSnapshot {
  readonly #data: PointerSnapshotData;

  constructor(data: PointerSnapshotData) {
    this.#data = Object.freeze({
      pointers: Object.freeze(data.pointers.map(freezePointerState)),
      wheel: Object.freeze({ ...data.wheel }),
    });
  }

  get pointers(): readonly PointerState[] {
    return this.#data.pointers;
  }

  get wheel(): WheelDelta {
    return this.#data.wheel;
  }

  getPointer(pointerId: PointerId): PointerState | undefined {
    return this.pointers.find((pointer) => pointer.pointerId === pointerId);
  }

  isButtonHeld(pointerId: PointerId, buttonId: PointerButtonId): boolean {
    return has(this.getPointer(pointerId)?.heldButtons ?? [], buttonId);
  }

  wasButtonPressed(pointerId: PointerId, buttonId: PointerButtonId): boolean {
    return has(this.getPointer(pointerId)?.pressedButtons ?? [], buttonId);
  }

  wasButtonReleased(pointerId: PointerId, buttonId: PointerButtonId): boolean {
    return has(this.getPointer(pointerId)?.releasedButtons ?? [], buttonId);
  }

  toJSON(): { PointerSnapshot: PointerSnapshotData } {
    return { PointerSnapshot: this.#data };
  }
}

export type PointerSnapshotData = Readonly<{
  pointers: readonly PointerState[];
  wheel: WheelDelta;
}>;

export type PointerState = Readonly<{
  pointerId: PointerId;
  kind: PointerKind;
  position: Readonly<{ x: number; y: number; space: string }>;
  pressure: number;
  heldButtons: readonly PointerButtonId[];
  pressedButtons: readonly PointerButtonId[];
  releasedButtons: readonly PointerButtonId[];
}>;

function freezePointerState(pointer: PointerState): PointerState {
  return Object.freeze({
    pointerId: pointer.pointerId,
    kind: pointer.kind,
    position: Object.freeze({ ...pointer.position }),
    pressure: pointer.pressure,
    heldButtons: Object.freeze([...pointer.heldButtons]),
    pressedButtons: Object.freeze([...pointer.pressedButtons]),
    releasedButtons: Object.freeze([...pointer.releasedButtons]),
  });
}

export class GamepadSnapshot {
  readonly #data: GamepadSnapshotData;

  constructor(data: GamepadSnapshotData) {
    this.#data = Object.freeze({
      gamepadId: data.gamepadId,
      name: data.name,
      mapping: data.mapping,
      connected: data.connected,
      buttons: Object.freeze(data.buttons.map((button) => Object.freeze({ ...button }))),
      axes: Object.freeze(data.axes.map((axis) => Object.freeze({ ...axis }))),
      pressedButtons: Object.freeze([...data.pressedButtons]),
      releasedButtons: Object.freeze([...data.releasedButtons]),
    });
  }

  get gamepadId(): GamepadId {
    return this.#data.gamepadId;
  }

  get name(): string {
    return this.#data.name;
  }

  get mapping(): GamepadMapping {
    return this.#data.mapping;
  }

  get connected(): boolean {
    return this.#data.connected;
  }

  get buttons(): readonly GamepadButtonState[] {
    return this.#data.buttons;
  }

  get axes(): readonly GamepadAxisSample[] {
    return this.#data.axes;
  }

  get pressedButtons(): readonly GamepadButtonId[] {
    return this.#data.pressedButtons;
  }

  get releasedButtons(): readonly GamepadButtonId[] {
    return this.#data.releasedButtons;
  }

  getButton(buttonId: GamepadButtonId): GamepadButtonState | undefined {
    return this.buttons.find((button) => button.buttonId === buttonId);
  }

  getAxis(axisId: GamepadAxisId): GamepadAxisSample | undefined {
    return this.axes.find((axis) => axis.axisId === axisId);
  }

  isButtonHeld(buttonId: GamepadButtonId): boolean {
    return this.getButton(buttonId)?.held ?? false;
  }

  wasButtonPressed(buttonId: GamepadButtonId): boolean {
    return has(this.pressedButtons, buttonId);
  }

  wasButtonReleased(buttonId: GamepadButtonId): boolean {
    return has(this.releasedButtons, buttonId);
  }

  toJSON(): { GamepadSnapshot: GamepadSnapshotData } {
    return { GamepadSnapshot: this.#data };
  }
}

export type GamepadSnapshotData = Readonly<{
  gamepadId: GamepadId;
  name: string;
  mapping: GamepadMapping;
  connected: boolean;
  buttons: readonly GamepadButtonState[];
  axes: readonly GamepadAxisSample[];
  pressedButtons: readonly GamepadButtonId[];
  releasedButtons: readonly GamepadButtonId[];
}>;

export type GamepadButtonState = Readonly<{
  buttonId: GamepadButtonId;
  held: boolean;
  touched: boolean;
  value: number;
}>;

export class FocusSnapshot {
  readonly #data: FocusSnapshotData;

  constructor(data: FocusSnapshotData) {
    this.#data = Object.freeze({ ...data });
  }

  get focused(): boolean {
    return this.#data.focused;
  }

  get lostThisFrame(): boolean {
    return this.#data.lostThisFrame;
  }

  get gainedThisFrame(): boolean {
    return this.#data.gainedThisFrame;
  }

  get lostReason(): FocusLostReason | undefined {
    return this.#data.lostReason;
  }

  toJSON(): { FocusSnapshot: FocusSnapshotData } {
    return { FocusSnapshot: this.#data };
  }
}

export type FocusSnapshotData = Readonly<{
  focused: boolean;
  lostThisFrame: boolean;
  gainedThisFrame: boolean;
  lostReason?: FocusLostReason;
}>;

type InputSnapshotStorage = Readonly<{
  time: MonotonicTimestamp;
  keyboard: KeyboardSnapshot;
  pointer: PointerSnapshot;
  gamepads: readonly GamepadSnapshot[];
  focus: FocusSnapshot;
}>;

export class InputSnapshot {
  readonly #data: InputSnapshotStorage;

  constructor(data: InputSnapshotData) {
    this.#data = Object.freeze({
      time: data.time,
      keyboard:
        data.keyboard instanceof KeyboardSnapshot
          ? data.keyboard
          : new KeyboardSnapshot(data.keyboard),
      pointer:
        data.pointer instanceof PointerSnapshot ? data.pointer : new PointerSnapshot(data.pointer),
      gamepads: Object.freeze(
        data.gamepads.map((gamepad) =>
          gamepad instanceof GamepadSnapshot ? gamepad : new GamepadSnapshot(gamepad),
        ),
      ),
      focus: data.focus instanceof FocusSnapshot ? data.focus : new FocusSnapshot(data.focus),
    });
  }

  get time(): MonotonicTimestamp {
    return this.#data.time;
  }

  get keyboard(): KeyboardSnapshot {
    return this.#data.keyboard;
  }

  get pointer(): PointerSnapshot {
    return this.#data.pointer;
  }

  get gamepads(): readonly GamepadSnapshot[] {
    return this.#data.gamepads;
  }

  get focus(): FocusSnapshot {
    return this.#data.focus;
  }

  toJSON(): { InputSnapshot: InputSnapshotData } {
    return { InputSnapshot: this.#data };
  }
}

export type InputSnapshotData = Readonly<{
  time: MonotonicTimestamp;
  keyboard: KeyboardSnapshot | KeyboardSnapshotData;
  pointer: PointerSnapshot | PointerSnapshotData;
  gamepads: readonly (GamepadSnapshot | GamepadSnapshotData)[];
  focus: FocusSnapshot | FocusSnapshotData;
}>;

type MutablePointer = {
  pointerId: PointerId;
  kind: PointerKind;
  position: PointerState["position"];
  pressure: number;
  heldButtons: Set<PointerButtonId>;
};

type MutableGamepad = {
  gamepadId: GamepadId;
  name: string;
  mapping: GamepadMapping;
  connected: boolean;
  buttons: Map<GamepadButtonId, GamepadButtonState>;
  axes: Map<GamepadAxisId, GamepadAxisSample>;
};

const EMPTY_KEYBOARD = new KeyboardSnapshot({ heldKeys: [], pressedKeys: [], releasedKeys: [] });
const EMPTY_POINTER = new PointerSnapshot({ pointers: [], wheel: ZERO_WHEEL_DELTA });
const EMPTY_FOCUS = new FocusSnapshot({
  focused: true,
  lostThisFrame: false,
  gainedThisFrame: false,
});

class InputImpl implements Input {
  readonly #pending: InputEvent[] = [];
  readonly #heldKeys = new Set<KeyId>();
  readonly #pointers = new Map<PointerId, MutablePointer>();
  readonly #gamepads = new Map<GamepadId, MutableGamepad>();
  readonly #warnedFallbackIds = new Set<string>();
  readonly #debug: boolean;
  #focused = true;
  #snapshot: InputSnapshot;

  constructor(options: InputOptions = {}) {
    this.#debug = options.debug ?? false;
    this.#snapshot = new InputSnapshot({
      time: MonotonicTimestamp.fromMilliseconds(0),
      keyboard: EMPTY_KEYBOARD,
      pointer: EMPTY_POINTER,
      gamepads: [],
      focus: EMPTY_FOCUS,
    });
  }

  push(event: InputEvent): void {
    this.#pending.push(event);
  }

  pushMany(events: Iterable<InputEvent>): void {
    for (const event of events) {
      this.push(event);
    }
  }

  beginFrame(time: MonotonicTimestamp): void {
    const pressedKeys = new Set<KeyId>();
    const releasedKeys = new Set<KeyId>();
    const pointerPressed = new Map<PointerId, Set<PointerButtonId>>();
    const pointerReleased = new Map<PointerId, Set<PointerButtonId>>();
    const gamepadPressed = new Map<GamepadId, Set<GamepadButtonId>>();
    const gamepadReleased = new Map<GamepadId, Set<GamepadButtonId>>();
    let wheel: WheelDelta = ZERO_WHEEL_DELTA;
    let lostThisFrame = false;
    let gainedThisFrame = false;
    let lostReason: FocusLostReason | undefined;

    for (const event of this.#pending.splice(0)) {
      switch (event.type) {
        case "keyboard/key-down": {
          this.#warnFallback(event.keyId);
          if (!event.repeat && !this.#heldKeys.has(event.keyId)) {
            pressedKeys.add(event.keyId);
          }
          this.#heldKeys.add(event.keyId);
          break;
        }
        case "keyboard/key-up": {
          this.#warnFallback(event.keyId);
          if (this.#heldKeys.has(event.keyId) || pressedKeys.has(event.keyId)) {
            releasedKeys.add(event.keyId);
          }
          this.#heldKeys.delete(event.keyId);
          break;
        }
        case "pointer/move": {
          const pointer = this.#ensurePointer(event.pointerId, event.kind);
          pointer.position = event.position;
          pointer.pressure = event.pressure;
          pointer.kind = event.kind;
          break;
        }
        case "pointer/button-down": {
          this.#warnFallback(event.buttonId);
          const pointer = this.#ensurePointer(event.pointerId, event.kind);
          pointer.position = event.position;
          pointer.pressure = event.pressure;
          pointer.kind = event.kind;
          if (!pointer.heldButtons.has(event.buttonId)) {
            getSet(pointerPressed, event.pointerId).add(event.buttonId);
          }
          pointer.heldButtons.add(event.buttonId);
          break;
        }
        case "pointer/button-up": {
          this.#warnFallback(event.buttonId);
          const pointer = this.#ensurePointer(event.pointerId, event.kind);
          pointer.position = event.position;
          pointer.pressure = event.pressure;
          pointer.kind = event.kind;
          if (
            pointer.heldButtons.has(event.buttonId) ||
            getSet(pointerPressed, event.pointerId).has(event.buttonId)
          ) {
            getSet(pointerReleased, event.pointerId).add(event.buttonId);
          }
          pointer.heldButtons.delete(event.buttonId);
          break;
        }
        case "pointer/cancel": {
          const pointer = this.#ensurePointer(event.pointerId, event.kind);
          for (const buttonId of pointer.heldButtons) {
            getSet(pointerReleased, event.pointerId).add(buttonId);
          }
          pointer.heldButtons.clear();
          break;
        }
        case "pointer/wheel": {
          wheel = event.delta;
          break;
        }
        case "gamepad/connected": {
          this.#gamepads.set(event.gamepadId, {
            gamepadId: event.gamepadId,
            name: event.name,
            mapping: event.mapping,
            connected: true,
            buttons: new Map(),
            axes: new Map(),
          });
          break;
        }
        case "gamepad/disconnected": {
          const gamepad = this.#gamepads.get(event.gamepadId);
          if (gamepad) {
            for (const button of gamepad.buttons.values()) {
              if (button.held) {
                getSet(gamepadReleased, event.gamepadId).add(button.buttonId);
              }
            }
            gamepad.connected = false;
            gamepad.buttons.clear();
            gamepad.axes.clear();
          }
          break;
        }
        case "gamepad/sample": {
          const gamepad = this.#ensureGamepad(event.gamepadId);
          for (const sample of event.buttons) {
            this.#warnFallback(sample.buttonId);
            const previous = gamepad.buttons.get(sample.buttonId);
            if (sample.pressed && !previous?.held) {
              getSet(gamepadPressed, event.gamepadId).add(sample.buttonId);
            }
            if (!sample.pressed && previous?.held) {
              getSet(gamepadReleased, event.gamepadId).add(sample.buttonId);
            }
            gamepad.buttons.set(sample.buttonId, sampleToButtonState(sample));
          }
          gamepad.axes = new Map(event.axes.map((axis) => [axis.axisId, axis]));
          break;
        }
        case "text/update":
        case "text/dismiss": {
          break;
        }
        case "focus/lost": {
          this.#focused = false;
          lostThisFrame = true;
          lostReason = event.reason;
          for (const keyId of this.#heldKeys) {
            releasedKeys.add(keyId);
          }
          this.#heldKeys.clear();
          for (const pointer of this.#pointers.values()) {
            for (const buttonId of pointer.heldButtons) {
              getSet(pointerReleased, pointer.pointerId).add(buttonId);
            }
            pointer.heldButtons.clear();
          }
          for (const gamepad of this.#gamepads.values()) {
            for (const button of gamepad.buttons.values()) {
              if (button.held) {
                getSet(gamepadReleased, gamepad.gamepadId).add(button.buttonId);
              }
              gamepad.buttons.set(button.buttonId, {
                ...button,
                held: false,
                touched: false,
                value: 0,
              });
            }
            gamepad.axes = new Map(
              [...gamepad.axes].map(([axisId]) => [axisId, { axisId, value: 0 }]),
            );
          }
          break;
        }
        case "focus/gained": {
          this.#focused = true;
          gainedThisFrame = true;
          break;
        }
      }
    }

    const keyboard = new KeyboardSnapshot({
      heldKeys: unique(this.#heldKeys),
      pressedKeys: unique(pressedKeys),
      releasedKeys: unique(releasedKeys),
    });

    const pointer = new PointerSnapshot({
      pointers: [...this.#pointers.values()].map((state) => ({
        pointerId: state.pointerId,
        kind: state.kind,
        position: state.position,
        pressure: state.pressure,
        heldButtons: unique(state.heldButtons),
        pressedButtons: unique(pointerPressed.get(state.pointerId) ?? []),
        releasedButtons: unique(pointerReleased.get(state.pointerId) ?? []),
      })),
      wheel,
    });

    const gamepads = [...this.#gamepads.values()].map(
      (gamepad) =>
        new GamepadSnapshot({
          gamepadId: gamepad.gamepadId,
          name: gamepad.name,
          mapping: gamepad.mapping,
          connected: gamepad.connected,
          buttons: Object.freeze([...gamepad.buttons.values()]),
          axes: Object.freeze([...gamepad.axes.values()]),
          pressedButtons: unique(gamepadPressed.get(gamepad.gamepadId) ?? []),
          releasedButtons: unique(gamepadReleased.get(gamepad.gamepadId) ?? []),
        }),
    );

    const focus = new FocusSnapshot({
      focused: this.#focused,
      lostThisFrame,
      gainedThisFrame,
      ...(lostReason ? { lostReason } : {}),
    });

    this.#snapshot = new InputSnapshot({ time, keyboard, pointer, gamepads, focus });
  }

  snapshot(): InputSnapshot {
    return this.#snapshot;
  }

  endFrame(): void {
    // Per-frame transient values are materialized in immutable snapshots. The next beginFrame recomputes them.
  }

  openTextInput(native: NativeTextInput, options: TextInputOptions): TextInputSession {
    return native.openTextInput(options);
  }

  #ensurePointer(pointerId: PointerId, kind: PointerKind): MutablePointer {
    const existing = this.#pointers.get(pointerId);

    if (existing) {
      return existing;
    }

    const pointer: MutablePointer = {
      pointerId,
      kind,
      position: Object.freeze({ x: 0, y: 0, space: "unknown" }),
      pressure: 0,
      heldButtons: new Set(),
    };

    this.#pointers.set(pointerId, pointer);
    return pointer;
  }

  #ensureGamepad(gamepadId: GamepadId): MutableGamepad {
    const existing = this.#gamepads.get(gamepadId);

    if (existing) {
      return existing;
    }

    const gamepad: MutableGamepad = {
      gamepadId,
      name: "",
      mapping: "unknown",
      connected: true,
      buttons: new Map(),
      axes: new Map(),
    };

    this.#gamepads.set(gamepadId, gamepad);
    return gamepad;
  }

  #warnFallback(id: string): void {
    if (!this.#debug || !id.startsWith("HOST:") || this.#warnedFallbackIds.has(id)) {
      return;
    }

    this.#warnedFallbackIds.add(id);
    console.warn(`Unknown input identifier: ${id}`);
  }
}

function getSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  const existing = map.get(key);

  if (existing) {
    return existing;
  }

  const set = new Set<V>();
  map.set(key, set);
  return set;
}

function sampleToButtonState(sample: GamepadButtonSample): GamepadButtonState {
  return Object.freeze({
    buttonId: sample.buttonId,
    held: sample.pressed,
    touched: sample.touched,
    value: sample.value,
  });
}

export function createInput(options?: InputOptions): Input {
  return new InputImpl(options);
}

registerSerdeType(
  "KeyboardSnapshot",
  (value) => new KeyboardSnapshot(value as KeyboardSnapshotData),
);
registerSerdeType("PointerSnapshot", (value) => new PointerSnapshot(value as PointerSnapshotData));
registerSerdeType("GamepadSnapshot", (value) => new GamepadSnapshot(value as GamepadSnapshotData));
registerSerdeType("FocusSnapshot", (value) => new FocusSnapshot(value as FocusSnapshotData));
registerSerdeType("InputSnapshot", (value) => new InputSnapshot(value as InputSnapshotData));
