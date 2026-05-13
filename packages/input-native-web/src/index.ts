import { MonotonicTimestamp, type Disposable, type SpatialPoint } from "@internal/foundation";
import type {
  EnterAction,
  GamepadAxisSample,
  GamepadButtonSample,
  GamepadMapping,
  InputEvent,
  KeyModifiers,
  NativeTextInput,
  PointerKind,
  TextDismissInputEvent,
  TextInputAnchor,
  TextInputEvent,
  TextInputOptions,
  TextInputSession,
  TextUpdateInputEvent,
  WheelDeltaUnit,
} from "@internal/input-core";

export type WebInputSource = Disposable &
  NativeTextInput & {
    poll(time: MonotonicTimestamp): readonly InputEvent[];
  };

export type WebInputSourceOptions = Readonly<{
  target: HTMLElement;
}>;

type ListenerTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

type ListenerRecord = Readonly<{
  target: ListenerTarget;
  type: string;
  listener: EventListener;
  options?: AddEventListenerOptions;
}>;

const KEY_CODE_MAP: Readonly<Record<string, string>> = Object.freeze({
  Backquote: "KC_GRAVE",
  Backslash: "KC_BSLS",
  Backspace: "KC_BSPACE",
  BracketLeft: "KC_LBRC",
  BracketRight: "KC_RBRC",
  CapsLock: "KC_CAPS",
  Comma: "KC_COMM",
  Delete: "KC_DELETE",
  Digit0: "KC_0",
  Digit1: "KC_1",
  Digit2: "KC_2",
  Digit3: "KC_3",
  Digit4: "KC_4",
  Digit5: "KC_5",
  Digit6: "KC_6",
  Digit7: "KC_7",
  Digit8: "KC_8",
  Digit9: "KC_9",
  End: "KC_END",
  Enter: "KC_ENTER",
  Equal: "KC_EQUAL",
  Escape: "KC_ESCAPE",
  Home: "KC_HOME",
  Insert: "KC_INSERT",
  Minus: "KC_MINUS",
  PageDown: "KC_PGDN",
  PageUp: "KC_PGUP",
  Period: "KC_DOT",
  Quote: "KC_QUOT",
  Semicolon: "KC_SCLN",
  Slash: "KC_SLSH",
  Space: "KC_SPACE",
  Tab: "KC_TAB",
  ArrowDown: "KC_DOWN",
  ArrowLeft: "KC_LEFT",
  ArrowRight: "KC_RGHT",
  ArrowUp: "KC_UP",
  AltLeft: "KC_LALT",
  AltRight: "KC_RALT",
  ControlLeft: "KC_LCTL",
  ControlRight: "KC_RCTL",
  MetaLeft: "KC_LGUI",
  MetaRight: "KC_RGUI",
  ShiftLeft: "KC_LSFT",
  ShiftRight: "KC_RSFT",
});

const STANDARD_GAMEPAD_BUTTONS = Object.freeze([
  "JOY_BUTTON_A",
  "JOY_BUTTON_B",
  "JOY_BUTTON_X",
  "JOY_BUTTON_Y",
  "JOY_BUTTON_LEFT_SHOULDER",
  "JOY_BUTTON_RIGHT_SHOULDER",
  "JOY_BUTTON_LEFT_TRIGGER",
  "JOY_BUTTON_RIGHT_TRIGGER",
  "JOY_BUTTON_BACK",
  "JOY_BUTTON_START",
  "JOY_BUTTON_LEFT_STICK",
  "JOY_BUTTON_RIGHT_STICK",
  "JOY_BUTTON_DPAD_UP",
  "JOY_BUTTON_DPAD_DOWN",
  "JOY_BUTTON_DPAD_LEFT",
  "JOY_BUTTON_DPAD_RIGHT",
  "JOY_BUTTON_GUIDE",
] as const);

const STANDARD_GAMEPAD_AXES = Object.freeze([
  "JOY_AXIS_LEFT_X",
  "JOY_AXIS_LEFT_Y",
  "JOY_AXIS_RIGHT_X",
  "JOY_AXIS_RIGHT_Y",
] as const);

function keyIdFromCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) {
    return `KC_${code.slice(3)}`;
  }

  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return `KC_${code.toUpperCase()}`;
  }

  return KEY_CODE_MAP[code] ?? `HOST:${code}`;
}

function modifiersFromEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
): KeyModifiers {
  return Object.freeze({
    ctl: event.ctrlKey,
    sft: event.shiftKey,
    alt: event.altKey,
    gui: event.metaKey,
  });
}

function timestampFromEvent(event: Pick<Event, "timeStamp">): MonotonicTimestamp {
  return MonotonicTimestamp.fromMilliseconds(event.timeStamp);
}

function pointerKind(value: string): PointerKind {
  switch (value) {
    case "mouse":
    case "pen":
    case "touch": {
      return value;
    }
    default: {
      return "unknown";
    }
  }
}

function pointerButtonId(button: number): string {
  switch (button) {
    case 0:
      return "KC_MS_BTN1";
    case 1:
      return "KC_MS_BTN3";
    case 2:
      return "KC_MS_BTN2";
    case 3:
      return "KC_MS_BTN4";
    case 4:
      return "KC_MS_BTN5";
    default:
      return `HOST:pointer-button:${button}`;
  }
}

function pointFromClient(
  event: Pick<PointerEvent | WheelEvent, "clientX" | "clientY">,
): SpatialPoint {
  return Object.freeze({ x: event.clientX, y: event.clientY, space: "web/client" });
}

function wheelUnit(deltaMode: number): WheelDeltaUnit {
  switch (deltaMode) {
    case 1:
      return "line";
    case 2:
      return "page";
    default:
      return "pixel";
  }
}

function gamepadMapping(gamepad: Gamepad): GamepadMapping {
  return gamepad.mapping === "standard" ? "standard" : "unknown";
}

function gamepadButtonId(gamepad: Gamepad, index: number): string {
  return gamepad.mapping === "standard"
    ? (STANDARD_GAMEPAD_BUTTONS[index] ?? `HOST:gamepad-button:${index}`)
    : `HOST:gamepad-button:${index}`;
}

function gamepadAxisId(gamepad: Gamepad, index: number): string {
  return gamepad.mapping === "standard"
    ? (STANDARD_GAMEPAD_AXES[index] ?? `HOST:gamepad-axis:${index}`)
    : `HOST:gamepad-axis:${index}`;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  readonly #values: T[] = [];
  readonly #waiters: ((value: IteratorResult<T>) => void)[] = [];
  #closed = false;

  push(value: T): void {
    if (this.#closed) {
      return;
    }

    const waiter = this.#waiters.shift();

    if (waiter) {
      waiter({ value, done: false });
      return;
    }

    this.#values.push(value);
  }

  close(): void {
    this.#closed = true;

    for (const waiter of this.#waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();

        if (value !== undefined) {
          return Promise.resolve({ value, done: false });
        }

        if (this.#closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}

class WebTextInputSession implements TextInputSession {
  readonly #document: Document;
  readonly #control: HTMLInputElement | HTMLTextAreaElement;
  readonly #events = new AsyncEventQueue<TextInputEvent>();
  readonly #listeners: ListenerRecord[] = [];
  #closed = false;

  constructor(document: Document, options: TextInputOptions) {
    this.#document = document;
    this.#control = this.#createControl(options);
    this.#control.value = options.initialText ?? "";
    this.setAnchor(options.anchor);
    this.#install(options);
    this.#document.body.append(this.#control);
    this.#control.focus();
  }

  get events(): AsyncIterable<TextInputEvent> {
    return this.#events;
  }

  setAnchor(anchor: TextInputAnchor): void {
    this.#control.style.left = `${anchor.position.x}px`;
    this.#control.style.top = `${anchor.position.y}px`;
  }

  close(): void {
    this.#dismiss("cancel");
  }

  #createControl(options: TextInputOptions): HTMLInputElement | HTMLTextAreaElement {
    const multiline = Object.values(options.enterBehavior).includes("newline");
    const control = multiline
      ? this.#document.createElement("textarea")
      : this.#document.createElement("input");

    if (control.tagName === "INPUT") {
      (control as HTMLInputElement).type = "text";
    }

    control.style.position = "fixed";
    control.style.width = "1px";
    control.style.height = "1px";
    control.style.opacity = "0";
    control.style.pointerEvents = "none";
    control.setAttribute("aria-hidden", "true");

    return control;
  }

  #install(options: TextInputOptions): void {
    this.#listen(this.#control, "input", (event) => {
      this.#events.push({
        type: "text/update",
        text: this.#control.value,
        time: timestampFromEvent(event),
      } satisfies TextUpdateInputEvent);
    });

    this.#listen(this.#control, "keydown", (event) => {
      const keyboard = event as KeyboardEvent;

      if (keyboard.key !== "Enter") {
        return;
      }

      const action = resolveEnterAction(options, keyboard.ctrlKey || keyboard.metaKey);

      if (action === "submit") {
        keyboard.preventDefault();
        this.#dismiss("submit", timestampFromEvent(keyboard));
      } else if (action === "ignore") {
        keyboard.preventDefault();
      }
    });

    this.#listen(this.#control, "blur", (event) =>
      this.#dismiss("blur", timestampFromEvent(event)),
    );
  }

  #listen(target: ListenerTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.#listeners.push({ target, type, listener });
  }

  #dismiss(
    reason: TextDismissInputEvent["reason"],
    time = MonotonicTimestamp.fromMilliseconds(0),
  ): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;

    for (const { target, type, listener } of this.#listeners.splice(0)) {
      target.removeEventListener(type, listener);
    }

    this.#control.remove();
    this.#events.push({ type: "text/dismiss", reason, time });
    this.#events.close();
  }
}

function resolveEnterAction(options: TextInputOptions, modified: boolean): EnterAction {
  if (modified && options.enterBehavior.modKey) {
    return options.enterBehavior.modKey;
  }

  return options.enterBehavior.default;
}

export function createWebInputSource({ target }: WebInputSourceOptions): WebInputSource {
  const document = target.ownerDocument;
  const window = document.defaultView;

  if (!window) {
    throw new Error("Cannot create web input source without a window.");
  }

  const buffered: InputEvent[] = [];
  const listeners: ListenerRecord[] = [];
  const connectedGamepads = new Map<number, Gamepad>();

  function listen(
    listenerTarget: ListenerTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    listenerTarget.addEventListener(type, listener, options);
    listeners.push({ target: listenerTarget, type, listener, options });
  }

  listen(target, "keydown", (event) => {
    const keyboard = event as KeyboardEvent;
    buffered.push({
      type: "keyboard/key-down",
      keyId: keyIdFromCode(keyboard.code),
      repeat: keyboard.repeat,
      modifiers: modifiersFromEvent(keyboard),
      time: timestampFromEvent(keyboard),
    });
  });

  listen(target, "keyup", (event) => {
    const keyboard = event as KeyboardEvent;
    buffered.push({
      type: "keyboard/key-up",
      keyId: keyIdFromCode(keyboard.code),
      modifiers: modifiersFromEvent(keyboard),
      time: timestampFromEvent(keyboard),
    });
  });

  listen(target, "pointermove", (event) => {
    const pointer = event as PointerEvent;
    buffered.push({
      type: "pointer/move",
      pointerId: pointer.pointerId,
      kind: pointerKind(pointer.pointerType),
      position: pointFromClient(pointer),
      pressure: pointer.pressure,
      time: timestampFromEvent(pointer),
    });
  });

  listen(target, "pointerdown", (event) => {
    const pointer = event as PointerEvent;
    buffered.push({
      type: "pointer/button-down",
      pointerId: pointer.pointerId,
      kind: pointerKind(pointer.pointerType),
      buttonId: pointerButtonId(pointer.button),
      position: pointFromClient(pointer),
      pressure: pointer.pressure,
      time: timestampFromEvent(pointer),
    });
  });

  listen(target, "pointerup", (event) => {
    const pointer = event as PointerEvent;
    buffered.push({
      type: "pointer/button-up",
      pointerId: pointer.pointerId,
      kind: pointerKind(pointer.pointerType),
      buttonId: pointerButtonId(pointer.button),
      position: pointFromClient(pointer),
      pressure: pointer.pressure,
      time: timestampFromEvent(pointer),
    });
  });

  listen(target, "pointercancel", (event) => {
    const pointer = event as PointerEvent;
    buffered.push({
      type: "pointer/cancel",
      pointerId: pointer.pointerId,
      kind: pointerKind(pointer.pointerType),
      time: timestampFromEvent(pointer),
    });
  });

  listen(target, "wheel", (event) => {
    const wheel = event as WheelEvent;
    buffered.push({
      type: "pointer/wheel",
      position: pointFromClient(wheel),
      delta: {
        x: wheel.deltaX,
        y: wheel.deltaY,
        z: wheel.deltaZ,
        unit: wheelUnit(wheel.deltaMode),
      },
      time: timestampFromEvent(wheel),
    });
  });

  listen(window, "blur", (event) => {
    buffered.push({ type: "focus/lost", reason: "blur", time: timestampFromEvent(event) });
  });

  listen(window, "focus", (event) => {
    buffered.push({ type: "focus/gained", time: timestampFromEvent(event) });
  });

  listen(document, "visibilitychange", (event) => {
    if (document.visibilityState === "hidden") {
      buffered.push({ type: "focus/lost", reason: "hidden", time: timestampFromEvent(event) });
    }
  });

  return {
    poll(time: MonotonicTimestamp): readonly InputEvent[] {
      const events = buffered.splice(0);
      const gamepads = Array.from(window.navigator.getGamepads?.() ?? []);
      const seen = new Set<number>();

      for (const gamepad of gamepads) {
        if (!gamepad) {
          continue;
        }

        seen.add(gamepad.index);

        if (!connectedGamepads.has(gamepad.index)) {
          events.push({
            type: "gamepad/connected",
            gamepadId: gamepad.index,
            name: gamepad.id,
            mapping: gamepadMapping(gamepad),
            time,
          });
        }

        connectedGamepads.set(gamepad.index, gamepad);
        events.push({
          type: "gamepad/sample",
          gamepadId: gamepad.index,
          buttons: gamepad.buttons.map(
            (button, index): GamepadButtonSample => ({
              buttonId: gamepadButtonId(gamepad, index),
              pressed: button.pressed,
              touched: button.touched,
              value: button.value,
            }),
          ),
          axes: gamepad.axes.map(
            (value, index): GamepadAxisSample => ({
              axisId: gamepadAxisId(gamepad, index),
              value,
            }),
          ),
          time,
        });
      }

      for (const gamepadId of Array.from(connectedGamepads.keys())) {
        if (!seen.has(gamepadId)) {
          connectedGamepads.delete(gamepadId);
          events.push({ type: "gamepad/disconnected", gamepadId, time });
        }
      }

      return Object.freeze(events);
    },

    openTextInput(options: TextInputOptions): TextInputSession {
      return new WebTextInputSession(document, options);
    },

    dispose(): void {
      for (const { target: listenerTarget, type, listener, options } of listeners.splice(0)) {
        listenerTarget.removeEventListener(type, listener, options);
      }

      buffered.length = 0;
      connectedGamepads.clear();
    },
  };
}
