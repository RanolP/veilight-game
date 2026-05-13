import { describe, expect, it } from "vitest";
import { Duration, MonotonicTimestamp, registerSerdeType, Serde } from "./index";

describe("foundation value classes", () => {
  it("performs timestamp and duration arithmetic", () => {
    const start = MonotonicTimestamp.fromMilliseconds(10);
    const duration = Duration.fromMilliseconds(5);
    const end = start.add(duration);

    expect(end.toMilliseconds()).toBe(15);
    expect(end.durationSince(start).equals(duration)).toBe(true);
    expect(end.subtract(duration).equals(start)).toBe(true);
    expect(duration.negate().toMilliseconds()).toBe(-5);
    expect(duration.negate().abs().equals(duration)).toBe(true);
  });

  it("rejects non-finite values", () => {
    expect(() => Duration.fromMilliseconds(Number.NaN)).toThrow(/finite/);
    expect(() => MonotonicTimestamp.fromMilliseconds(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });
});

describe("Serde", () => {
  it("round trips built-in tagged values", () => {
    const value = {
      time: MonotonicTimestamp.fromMilliseconds(12),
      elapsed: Duration.fromMilliseconds(-3),
    };

    const restored = Serde.read(Serde.write(value)) as typeof value;

    expect(restored.time).toBeInstanceOf(MonotonicTimestamp);
    expect(restored.elapsed).toBeInstanceOf(Duration);
    expect(restored.time.toMilliseconds()).toBe(12);
    expect(restored.elapsed.toMilliseconds()).toBe(-3);
  });

  it("restores custom tagged classes and can unregister them", () => {
    class Box {
      constructor(readonly value: number) {}
    }

    const disposable = registerSerdeType(
      "Box",
      (value) => new Box((value as { value: number }).value),
    );
    const restored = Serde.read('{"Box":{"value":7}}');

    expect(restored).toBeInstanceOf(Box);
    expect((restored as Box).value).toBe(7);

    disposable.dispose();
    expect(Serde.read('{"Box":{"value":7}}')).toEqual({ Box: { value: 7 } });
  });
});
