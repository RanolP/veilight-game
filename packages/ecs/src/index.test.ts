import { describe, expect, it, vi } from "vitest";
import { Serde } from "@internal/foundation";
import {
  Component,
  EntityUpdateQueue,
  EventQueue,
  EventQueueSystem,
  Marker,
  Resource,
  System,
  World,
  type WorldSave,
} from "./index";

describe("ECS definitions", () => {
  it("creates frozen component, marker, and resource set params", () => {
    const Position = Component<{ x: number; y: number }>("test/definition/position");
    const PlayerCharacter = Marker("test/definition/player-character", { singleton: true });
    const Score = Resource<number>("test/definition/score");

    expect(Object.isFrozen(Position)).toBe(true);
    expect(Object.isFrozen(PlayerCharacter)).toBe(true);
    expect(Position({ x: 1, y: 2 })).toEqual({ definition: Position, value: { x: 1, y: 2 } });
    expect(Score(3)).toEqual({ definition: Score, value: 3 });
  });
});

describe("World", () => {
  it("spawns entities with UUID ids and saves component data", () => {
    const Position = Component<{ x: number; y: number }>("test/spawn/position");
    const Bullet = Marker("test/spawn/bullet");
    const world = new World();
    const bullet = world.spawn(Bullet, Position({ x: 3, y: 4 }));

    expect(bullet.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(bullet.get(Position)).toEqual({ x: 3, y: 4 });
    expect(bullet.get(Bullet)).toEqual({});
    expect(world.toSave().entities).toEqual([
      {
        id: bullet.id,
        components: {
          "test/spawn/bullet": {},
          "test/spawn/position": { x: 3, y: 4 },
        },
      },
    ]);
  });

  it("gets or spawns singleton marker entities and rejects duplicates", () => {
    const PlayerCharacter = Marker("test/single/player-character", { singleton: true });
    const Position = Component<{ x: number; y: number }>("test/single/position");
    const world = new World();
    const first = world.single(PlayerCharacter, () => [PlayerCharacter, Position({ x: 0, y: 0 })]);
    const second = world.single(PlayerCharacter, () => [PlayerCharacter, Position({ x: 1, y: 1 })]);

    expect(second.id).toBe(first.id);
    world.spawn(PlayerCharacter);
    expect(() => world.validate()).toThrow(/Duplicate singleton marker entity/);
    expect(() => world.toSave()).toThrow(/Duplicate singleton marker entity/);
  });

  it("defers entity set, remove, and destroy until EntityUpdateQueue runs", () => {
    const Position = Component<{ x: number; y: number }>("test/deferred/position");
    const Velocity = Component<{ x: number; y: number }>("test/deferred/velocity");
    const world = new World();
    const entity = world.spawn(Position({ x: 0, y: 0 }));

    entity.set(Velocity({ x: 1, y: 2 }));
    expect(entity.get(Velocity)).toBeUndefined();
    world.tick([EntityUpdateQueue]);
    expect(entity.get(Velocity)).toEqual({ x: 1, y: 2 });

    entity.remove(Position);
    expect(entity.get(Position)).toEqual({ x: 0, y: 0 });
    world.tick([EntityUpdateQueue]);
    expect(entity.get(Position)).toBeUndefined();

    entity.destroy();
    expect(entity.get(Velocity)).toEqual({ x: 1, y: 2 });
    world.tick([EntityUpdateQueue]);
    expect(entity.get(Velocity)).toBeUndefined();
  });

  it("sets and removes resources immediately", () => {
    const Score = Resource<number>("test/resource/score");
    const world = new World();

    world.set(Score(12));
    expect(world.get(Score)).toBe(12);
    world.remove(Score);
    expect(world.get(Score)).toBeUndefined();
  });

  it("round trips WorldSave through foundation Serde and restores registered values", () => {
    const Events = Resource<EventQueue>("test/save/events");
    const Position = Component<{ x: number; y: number }>("test/save/position");
    const world = new World();
    world.spawn(Position({ x: 5, y: 6 }));
    world.set(Events(new EventQueue([{ type: "now", value: 1 }], [{ type: "later", value: 2 }])));

    const restoredSave = Serde.read(Serde.write(world)) as WorldSave;
    const restoredWorld = World.fromSave(restoredSave);

    expect(restoredWorld.toSave().entities).toEqual(world.toSave().entities);
    expect(restoredWorld.get(Events)).toBeInstanceOf(EventQueue);
    expect(restoredWorld.get(Events)?.consumeOfType("now")).toEqual([{ type: "now", value: 1 }]);

    const rawTaggedWorld = World.fromSave({
      version: 1,
      entities: [],
      resources: {
        "test/save/events": { EventQueue: { current: [{ type: "raw", value: 3 }], next: [] } },
      },
    });
    expect(rawTaggedWorld.get(Events)).toBeInstanceOf(EventQueue);
    expect(rawTaggedWorld.get(Events)?.consumeOfType("raw")).toEqual([{ type: "raw", value: 3 }]);
  });
});

describe("Systems", () => {
  it("runs entity systems over matching rows and exposes mutable component data", () => {
    const Position = Component<{ x: number; y: number }>("test/system/position");
    const Velocity = Component<{ x: number; y: number }>("test/system/velocity");
    const world = new World();
    const moving = world.spawn(Position({ x: 1, y: 2 }), Velocity({ x: 3, y: 4 }));
    world.spawn(Position({ x: 100, y: 100 }));
    const GravitySystem = System({ entity: { Position, Velocity } }, ({ entity }) => {
      entity.Position.x += entity.Velocity.x;
      entity.Position.y += entity.Velocity.y;
    });

    world.tick([GravitySystem]);

    expect(moving.get(Position)).toEqual({ x: 4, y: 6 });
  });

  it("uses a snapshot of cached matches during a run", () => {
    const Position = Component<{ x: number; y: number }>("test/cache/position");
    const Velocity = Component<{ x: number; y: number }>("test/cache/velocity");
    const world = new World();
    world.spawn(Position({ x: 0, y: 0 }), Velocity({ x: 1, y: 1 }));
    const seen: number[] = [];
    const SpawnDuringRun = System({ entity: { Position, Velocity } }, ({ entity, world }) => {
      seen.push(entity.Position.x);
      if (entity.Position.x === 0) {
        world.spawn(Position({ x: 10, y: 10 }), Velocity({ x: 1, y: 1 }));
      }
    });

    world.tick([SpawnDuringRun]);
    world.tick([SpawnDuringRun]);

    expect(seen).toEqual([0, 0, 10]);
  });

  it("runs resource-only systems once and skips missing resources with a log", () => {
    const Score = Resource<{ value: number }>("test/system/score");
    const world = new World();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ScoreSystem = System({ resources: { Score } }, ({ resources }) => {
      resources.Score.value += 1;
    });

    world.tick([ScoreSystem]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("test/system/score"));

    world.set(Score({ value: 1 }));
    world.tick([ScoreSystem]);
    expect(world.get(Score)).toEqual({ value: 2 });
    error.mockRestore();
  });

  it("combines entity and resource queries", () => {
    const PlayerCharacter = Marker("test/mixed/player-character", { singleton: true });
    const Position = Component<{ x: number; y: number }>("test/mixed/position");
    const Events = Resource<EventQueue>("test/mixed/events");
    const world = new World();
    world.spawn(PlayerCharacter, Position({ x: 2, y: 3 }));
    world.set(Events(new EventQueue([{ type: "input/fire", value: undefined }])));

    const ShootSystem = System(
      { entity: { PlayerCharacter, Position }, resources: { Events } },
      ({ entity, resources, world }) => {
        for (const event of resources.Events.consumeOfType("input/fire")) {
          world.spawn(
            Position({
              x: entity.Position.x,
              y: entity.Position.y + (event.value === undefined ? 1 : 0),
            }),
          );
        }
      },
    );

    world.tick([ShootSystem]);

    expect(
      world.toSave().entities.map((entity) => entity.components["test/mixed/position"]),
    ).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });
});

describe("EventQueue", () => {
  it("queues events for the next tick and advances through EventQueueSystem", () => {
    const Events = Resource<EventQueue>("test/event/events");
    const world = new World();
    const events = new EventQueue([{ type: "current", value: 1 }]);
    world.set(Events(events));

    events.trigger({ type: "next", value: 2 });
    expect(events.consumeOfType("next")).toEqual([]);

    world.tick([EventQueueSystem]);

    expect(events.consumeOfType("current")).toEqual([]);
    expect(events.consumeOfType<number>("next")).toEqual([{ type: "next", value: 2 }]);
  });
});
