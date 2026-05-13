export type CoordinateSpaceId = string;

export type SpatialPoint = Readonly<{
  x: number;
  y: number;
  space: CoordinateSpaceId;
}>;

export type Disposable = Readonly<{
  dispose(): void;
}>;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}

export class Duration {
  readonly #milliseconds: number;

  private constructor(milliseconds: number) {
    assertFinite("Duration milliseconds", milliseconds);
    this.#milliseconds = milliseconds;
  }

  static fromMilliseconds(milliseconds: number): Duration {
    return new Duration(milliseconds);
  }

  toMilliseconds(): number {
    return this.#milliseconds;
  }

  compare(other: Duration): number {
    return Math.sign(this.#milliseconds - other.#milliseconds);
  }

  equals(other: Duration): boolean {
    return this.#milliseconds === other.#milliseconds;
  }

  add(other: Duration): Duration {
    return Duration.fromMilliseconds(this.#milliseconds + other.#milliseconds);
  }

  subtract(other: Duration): Duration {
    return Duration.fromMilliseconds(this.#milliseconds - other.#milliseconds);
  }

  negate(): Duration {
    return Duration.fromMilliseconds(-this.#milliseconds);
  }

  abs(): Duration {
    return Duration.fromMilliseconds(Math.abs(this.#milliseconds));
  }

  toJSON(): { duration$millis: number } {
    return { duration$millis: this.#milliseconds };
  }
}

export class MonotonicTimestamp {
  readonly #milliseconds: number;

  private constructor(milliseconds: number) {
    assertFinite("MonotonicTimestamp milliseconds", milliseconds);
    this.#milliseconds = milliseconds;
  }

  static fromMilliseconds(milliseconds: number): MonotonicTimestamp {
    return new MonotonicTimestamp(milliseconds);
  }

  toMilliseconds(): number {
    return this.#milliseconds;
  }

  compare(other: MonotonicTimestamp): number {
    return Math.sign(this.#milliseconds - other.#milliseconds);
  }

  equals(other: MonotonicTimestamp): boolean {
    return this.#milliseconds === other.#milliseconds;
  }

  durationSince(earlier: MonotonicTimestamp): Duration {
    return Duration.fromMilliseconds(this.#milliseconds - earlier.#milliseconds);
  }

  add(duration: Duration): MonotonicTimestamp {
    return MonotonicTimestamp.fromMilliseconds(this.#milliseconds + duration.toMilliseconds());
  }

  subtract(duration: Duration): MonotonicTimestamp {
    return MonotonicTimestamp.fromMilliseconds(this.#milliseconds - duration.toMilliseconds());
  }

  toJSON(): { ts$millis: number } {
    return { ts$millis: this.#milliseconds };
  }
}

type TaggedFactory = (value: unknown) => unknown;

const factories = new Map<string, TaggedFactory>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function register(tag: string, factory: TaggedFactory): void {
  if (factories.has(tag)) {
    throw new Error(`Serde tag already registered: ${tag}`);
  }

  factories.set(tag, factory);
}

export function registerSerdeType(tag: string, factory: TaggedFactory): Disposable {
  register(tag, factory);

  return {
    dispose() {
      if (factories.get(tag) === factory) {
        factories.delete(tag);
      }
    },
  };
}

function reviveTagged(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const keys = Object.keys(value);

  if (keys.length !== 1) {
    return value;
  }

  const tag = keys[0];

  if (tag === undefined) {
    return value;
  }

  const factory = factories.get(tag);

  if (!factory) {
    return value;
  }

  return factory(value[tag]);
}

register("ts$millis", (value) => {
  if (typeof value !== "number") {
    throw new Error("Invalid MonotonicTimestamp payload.");
  }

  return MonotonicTimestamp.fromMilliseconds(value);
});

register("duration$millis", (value) => {
  if (typeof value !== "number") {
    throw new Error("Invalid Duration payload.");
  }

  return Duration.fromMilliseconds(value);
});

export const Serde = Object.freeze({
  write(value: unknown): string {
    return JSON.stringify(value);
  },

  read(text: string): unknown {
    return JSON.parse(text, (_key, value: unknown) => reviveTagged(value));
  },
});
