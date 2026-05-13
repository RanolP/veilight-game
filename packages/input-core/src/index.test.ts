import { describe, expect, it } from "vitest";
import { MonotonicTimestamp, Serde } from "@internal/foundation";
import { isHostFallbackId, type InputEvent, ZERO_WHEEL_DELTA } from "./index";

describe("input-core event vocabulary", () => {
  it("keeps event shapes serializable through foundation Serde", () => {
    const event: InputEvent = {
      type: "keyboard/key-down",
      keyId: "KC_A",
      repeat: false,
      modifiers: { ctl: false, sft: true, alt: false, gui: false },
      time: MonotonicTimestamp.fromMilliseconds(4),
    };

    const restored = Serde.read(Serde.write(event)) as InputEvent;

    expect(restored.type).toBe("keyboard/key-down");
    expect(restored.time).toBeInstanceOf(MonotonicTimestamp);
  });

  it("defines a frozen zero wheel delta", () => {
    expect(ZERO_WHEEL_DELTA).toEqual({ x: 0, y: 0, z: 0, unit: "pixel" });
    expect(Object.isFrozen(ZERO_WHEEL_DELTA)).toBe(true);
  });

  it("detects host fallback identifiers", () => {
    expect(isHostFallbackId("HOST:BrowserVendorKey")).toBe(true);
    expect(isHostFallbackId("KC_A")).toBe(false);
  });
});
