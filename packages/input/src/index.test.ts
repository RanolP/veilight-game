import { describe, expect, it, vi } from "vitest";
import { MonotonicTimestamp, Serde } from "@internal/foundation";
import type { InputEvent } from "@internal/input-core";
import { createInput, InputSnapshot } from "./index";

const t = (milliseconds: number) => MonotonicTimestamp.fromMilliseconds(milliseconds);

const keyDown = (keyId: string, repeat = false): InputEvent => ({
  type: "keyboard/key-down",
  keyId,
  repeat,
  modifiers: { ctl: false, sft: false, alt: false, gui: false },
  time: t(1),
});

const keyUp = (keyId: string): InputEvent => ({
  type: "keyboard/key-up",
  keyId,
  modifiers: { ctl: false, sft: false, alt: false, gui: false },
  time: t(2),
});

describe("input frame boundaries", () => {
  it("keeps pushed events invisible until beginFrame", () => {
    const input = createInput();

    input.beginFrame(t(0));
    input.push(keyDown("KC_A"));

    expect(input.snapshot().keyboard.isHeld("KC_A")).toBe(false);

    input.beginFrame(t(1));

    expect(input.snapshot().keyboard.isHeld("KC_A")).toBe(true);
    expect(input.snapshot().keyboard.wasPressed("KC_A")).toBe(true);
  });

  it("preserves down-up within one frame as pressed and released but not held", () => {
    const input = createInput();

    input.pushMany([keyDown("KC_A"), keyUp("KC_A")]);
    input.beginFrame(t(1));

    const snapshot = input.snapshot();

    expect(snapshot.keyboard.isHeld("KC_A")).toBe(false);
    expect(snapshot.keyboard.wasPressed("KC_A")).toBe(true);
    expect(snapshot.keyboard.wasReleased("KC_A")).toBe(true);
  });

  it("does not treat key repeat as a fresh press", () => {
    const input = createInput();

    input.push(keyDown("KC_A"));
    input.beginFrame(t(1));
    input.push(keyDown("KC_A", true));
    input.beginFrame(t(2));

    expect(input.snapshot().keyboard.isHeld("KC_A")).toBe(true);
    expect(input.snapshot().keyboard.wasPressed("KC_A")).toBe(false);
  });
});

describe("pointer snapshots", () => {
  it("tracks pointer position, button transitions, cancel, and latest wheel", () => {
    const input = createInput();

    input.pushMany([
      {
        type: "pointer/button-down",
        pointerId: 1,
        kind: "mouse",
        buttonId: "KC_MS_BTN1",
        position: { x: 4, y: 5, space: "web/client" },
        pressure: 0.5,
        time: t(1),
      },
      {
        type: "pointer/wheel",
        position: { x: 0, y: 0, space: "web/client" },
        delta: { x: 1, y: 2, z: 3, unit: "pixel" },
        time: t(1),
      },
    ]);
    input.beginFrame(t(1));

    expect(input.snapshot().pointer.isButtonHeld(1, "KC_MS_BTN1")).toBe(true);
    expect(input.snapshot().pointer.wasButtonPressed(1, "KC_MS_BTN1")).toBe(true);
    expect(input.snapshot().pointer.getPointer(1)?.position).toEqual({
      x: 4,
      y: 5,
      space: "web/client",
    });
    expect(input.snapshot().pointer.wheel).toEqual({ x: 1, y: 2, z: 3, unit: "pixel" });

    input.push({ type: "pointer/cancel", pointerId: 1, kind: "mouse", time: t(2) });
    input.beginFrame(t(2));

    expect(input.snapshot().pointer.isButtonHeld(1, "KC_MS_BTN1")).toBe(false);
    expect(input.snapshot().pointer.wasButtonReleased(1, "KC_MS_BTN1")).toBe(true);
    expect(input.snapshot().pointer.wheel).toEqual({ x: 0, y: 0, z: 0, unit: "pixel" });
  });
});

describe("gamepad snapshots", () => {
  it("diffs samples into pressed and released transitions", () => {
    const input = createInput();

    input.pushMany([
      { type: "gamepad/connected", gamepadId: 0, name: "pad", mapping: "standard", time: t(1) },
      {
        type: "gamepad/sample",
        gamepadId: 0,
        buttons: [{ buttonId: "JOY_BUTTON_A", pressed: true, touched: true, value: 1 }],
        axes: [{ axisId: "JOY_AXIS_LEFT_X", value: 0.5 }],
        time: t(1),
      },
    ]);
    input.beginFrame(t(1));

    let gamepad = input.snapshot().gamepads[0];
    expect(gamepad?.connected).toBe(true);
    expect(gamepad?.isButtonHeld("JOY_BUTTON_A")).toBe(true);
    expect(gamepad?.wasButtonPressed("JOY_BUTTON_A")).toBe(true);
    expect(gamepad?.getAxis("JOY_AXIS_LEFT_X")?.value).toBe(0.5);

    input.push({
      type: "gamepad/sample",
      gamepadId: 0,
      buttons: [{ buttonId: "JOY_BUTTON_A", pressed: false, touched: false, value: 0 }],
      axes: [{ axisId: "JOY_AXIS_LEFT_X", value: -0.25 }],
      time: t(2),
    });
    input.beginFrame(t(2));

    gamepad = input.snapshot().gamepads[0];
    expect(gamepad?.isButtonHeld("JOY_BUTTON_A")).toBe(false);
    expect(gamepad?.wasButtonReleased("JOY_BUTTON_A")).toBe(true);
    expect(gamepad?.getAxis("JOY_AXIS_LEFT_X")?.value).toBe(-0.25);
  });
});

describe("focus policy", () => {
  it("clears keyboard, pointer, and gamepad interaction state on focus loss", () => {
    const input = createInput();

    input.pushMany([
      keyDown("KC_A"),
      {
        type: "pointer/button-down",
        pointerId: 1,
        kind: "mouse",
        buttonId: "KC_MS_BTN1",
        position: { x: 0, y: 0, space: "web/client" },
        pressure: 1,
        time: t(1),
      },
      { type: "gamepad/connected", gamepadId: 0, name: "pad", mapping: "standard", time: t(1) },
      {
        type: "gamepad/sample",
        gamepadId: 0,
        buttons: [{ buttonId: "JOY_BUTTON_A", pressed: true, touched: true, value: 1 }],
        axes: [{ axisId: "JOY_AXIS_LEFT_X", value: 1 }],
        time: t(1),
      },
    ]);
    input.beginFrame(t(1));

    input.push({ type: "focus/lost", reason: "blur", time: t(2) });
    input.beginFrame(t(2));

    const snapshot = input.snapshot();
    const gamepad = snapshot.gamepads[0];

    expect(snapshot.keyboard.isHeld("KC_A")).toBe(false);
    expect(snapshot.keyboard.wasReleased("KC_A")).toBe(true);
    expect(snapshot.pointer.isButtonHeld(1, "KC_MS_BTN1")).toBe(false);
    expect(snapshot.pointer.wasButtonReleased(1, "KC_MS_BTN1")).toBe(true);
    expect(gamepad?.connected).toBe(true);
    expect(gamepad?.isButtonHeld("JOY_BUTTON_A")).toBe(false);
    expect(gamepad?.wasButtonReleased("JOY_BUTTON_A")).toBe(true);
    expect(gamepad?.getAxis("JOY_AXIS_LEFT_X")?.value).toBe(0);
    expect(snapshot.focus.focused).toBe(false);
    expect(snapshot.focus.lostThisFrame).toBe(true);
    expect(snapshot.focus.lostReason).toBe("blur");
  });
});

describe("snapshot Serde", () => {
  it("restores snapshot classes from tagged JSON", () => {
    const input = createInput();
    input.push(keyDown("KC_A"));
    input.beginFrame(t(1));

    const restored = Serde.read(Serde.write(input.snapshot()));

    expect(restored).toBeInstanceOf(InputSnapshot);
    expect((restored as InputSnapshot).keyboard.isHeld("KC_A")).toBe(true);
  });
});

describe("debug warnings", () => {
  it("warns once per fallback id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = createInput({ debug: true });

    input.pushMany([keyDown("HOST:Odd"), keyUp("HOST:Odd"), keyDown("HOST:Odd")]);
    input.beginFrame(t(1));

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
