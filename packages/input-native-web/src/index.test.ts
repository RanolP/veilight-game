import { describe, expect, it } from "vitest";
import { MonotonicTimestamp } from "@internal/foundation";
import { createWebInputSource } from "./index";

type Listener = (event: Event) => void;

class FakeEventTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener as Listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatch(type: string, init: Record<string, unknown> = {}): void {
    const event = {
      type,
      timeStamp: 12,
      preventDefault() {
        init.prevented = true;
      },
      ...init,
    } as Event;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeControl extends FakeEventTarget {
  value = "";
  type = "";
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  removed = false;
  focused = false;

  constructor(readonly tagName: string) {
    super();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeDocument extends FakeEventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  readonly body = {
    appended: [] as FakeControl[],
    append: (control: FakeControl) => {
      this.body.appended.push(control);
    },
  };
  defaultView: FakeWindow | null = null;

  createElement(tagName: "input" | "textarea"): FakeControl {
    return new FakeControl(tagName.toUpperCase());
  }
}

class FakeWindow extends FakeEventTarget {
  readonly navigator = {
    gamepads: [] as (Gamepad | null)[],
    getGamepads: () => this.navigator.gamepads,
  };
}

class FakeElement extends FakeEventTarget {
  constructor(readonly ownerDocument: FakeDocument) {
    super();
  }
}

const time = MonotonicTimestamp.fromMilliseconds(100);

function setup(): { document: FakeDocument; window: FakeWindow; target: FakeElement } {
  const document = new FakeDocument();
  const window = new FakeWindow();
  document.defaultView = window;
  const target = new FakeElement(document);

  return { document, window, target };
}

describe("createWebInputSource", () => {
  it("maps DOM keyboard, pointer, wheel, and focus events into unprocessed core events", () => {
    const { document, window, target } = setup();
    const source = createWebInputSource({ target: target as unknown as HTMLElement });

    target.dispatch("keydown", {
      code: "KeyA",
      repeat: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
    target.dispatch("keyup", {
      code: "BrowserKey",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: true,
    });
    target.dispatch("pointerdown", {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 10,
      clientY: 20,
      pressure: 0.5,
    });
    target.dispatch("pointerup", {
      pointerId: 2,
      pointerType: "mouse",
      button: 9,
      clientX: 11,
      clientY: 21,
      pressure: 0,
    });
    target.dispatch("wheel", {
      clientX: 3,
      clientY: 4,
      deltaX: 1,
      deltaY: 2,
      deltaZ: 3,
      deltaMode: 1,
    });
    window.dispatch("blur");
    document.visibilityState = "hidden";
    document.dispatch("visibilitychange");
    window.dispatch("focus");

    const events = source.poll(time);

    expect(events.map((event) => event.type)).toEqual([
      "keyboard/key-down",
      "keyboard/key-up",
      "pointer/button-down",
      "pointer/button-up",
      "pointer/wheel",
      "focus/lost",
      "focus/lost",
      "focus/gained",
    ]);
    expect(events[0]).toMatchObject({ keyId: "KC_A", modifiers: { ctl: true } });
    expect(events[1]).toMatchObject({ keyId: "HOST:BrowserKey", modifiers: { gui: true } });
    expect(events[2]).toMatchObject({
      buttonId: "KC_MS_BTN1",
      position: { x: 10, y: 20, space: "web/client" },
    });
    expect(events[3]).toMatchObject({ buttonId: "HOST:pointer-button:9" });
    expect(events[4]).toMatchObject({ delta: { x: 1, y: 2, z: 3, unit: "line" } });
    expect(events[5]).toMatchObject({ reason: "blur" });
    expect(events[6]).toMatchObject({ reason: "hidden" });
    expect(source.poll(time)).toEqual([]);
  });

  it("samples gamepads and emits connection, sample, and disconnection events", () => {
    const { window, target } = setup();
    const source = createWebInputSource({ target: target as unknown as HTMLElement });
    const gamepad = {
      index: 0,
      id: "pad",
      mapping: "standard",
      buttons: [{ pressed: true, touched: false, value: 1 }],
      axes: [0.25],
    } as unknown as Gamepad;

    window.navigator.gamepads = [gamepad];
    let events = source.poll(time);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "gamepad/connected",
      gamepadId: 0,
      name: "pad",
      mapping: "standard",
    });
    expect(events[1]).toMatchObject({
      type: "gamepad/sample",
      gamepadId: 0,
      buttons: [{ buttonId: "JOY_BUTTON_A", pressed: true, touched: false, value: 1 }],
      axes: [{ axisId: "JOY_AXIS_LEFT_X", value: 0.25 }],
    });

    window.navigator.gamepads = [];
    events = source.poll(time);
    expect(events).toEqual([{ type: "gamepad/disconnected", gamepadId: 0, time }]);
  });

  it("opens text sessions with Enter behavior and anchor placement", async () => {
    const { document, target } = setup();
    const source = createWebInputSource({ target: target as unknown as HTMLElement });
    const session = source.openTextInput({
      anchor: { position: { x: 7, y: 8, space: "web/client" } },
      initialText: "hello",
      enterBehavior: { default: "newline", modKey: "submit" },
    });
    const control = document.body.appended[0]!;

    expect(control.tagName).toBe("TEXTAREA");
    expect(control.value).toBe("hello");
    expect(control.style.left).toBe("7px");
    expect(control.style.top).toBe("8px");
    expect(control.focused).toBe(true);

    const iterator = session.events[Symbol.asyncIterator]();
    control.value = "hello!";
    control.dispatch("input", { timeStamp: 21 });
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "text/update", text: "hello!" },
      done: false,
    });

    const keyEvent = {
      key: "Enter",
      ctrlKey: true,
      metaKey: false,
      timeStamp: 22,
      prevented: false,
    };
    control.dispatch("keydown", keyEvent);
    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: "text/dismiss", reason: "submit" },
      done: false,
    });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
    expect(keyEvent.prevented).toBe(true);
    expect(control.removed).toBe(true);
  });

  it("removes installed listeners on dispose", () => {
    const { window, target } = setup();
    const source = createWebInputSource({ target: target as unknown as HTMLElement });

    source.dispose();
    target.dispatch("keydown", {
      code: "KeyA",
      repeat: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
    window.dispatch("blur");

    expect(source.poll(time)).toEqual([]);
  });
});
