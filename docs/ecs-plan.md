# ECS Plan

## Goal

ECS is the core persistent world model for the engine.

The world owns:

- entities
- components
- resources
- save/load shape
- system ticking
- static query execution

Renderer, input, audio, DOM, and WebGL handles stay outside persistent ECS state.

## Package Boundary

ECS lives in:

```txt
packages/ecs
```

It may depend on:

```txt
@internal/foundation
```

ECS must use the shared foundation Serde rather than defining a separate
serialization/revival system.

## Save-Facing Types

```ts
export type EntityId = string;
export type ComponentType = string;
export type ResourceType = string;

export type EntitySave = Readonly<{
  id: EntityId;
  components: Readonly<Record<ComponentType, unknown>>;
}>;

export type WorldSave = Readonly<{
  version: number;
  entities: readonly EntitySave[];
  resources: Readonly<Record<ResourceType, unknown>>;
}>;
```

`EntityId` is a raw UUID v4 string. It does not need an `entity:` prefix because
the field/type already gives it entity meaning.

`WorldSave` is registered with foundation Serde.

## Component Definitions

Components are runtime definitions that also carry TypeScript value typing.

```ts
export const Position = Component<{ x: number; y: number }>("core/position");
```

Data components are called to create set params:

```ts
Position({ x: 0, y: 0 });
```

Component definitions are frozen runtime objects.

## Marker Components

Markers are components with no meaningful data.

```ts
export const PlayerCharacter = Marker("veiday/player-character", {
  singleton: true,
});
```

Markers are complete values by themselves. They are not called.

```ts
const PlayerBundle = () => [PlayerCharacter, Position({ x: 0, y: 0 })];
```

Marker save value is:

```json
{}
```

`singleton: true` means at most one entity may have that marker. Duplicate
singleton marker entities are invalid and throw during save load / validation.

## Resources

Resources mirror components.

```ts
export const CoreEvents = Resource<EventQueue>("core/events");
```

Resource set params are created by calling the resource definition:

```ts
CoreEvents(new EventQueue());
```

Resource mutation is world-scoped:

```ts
world.set(CoreEvents(new EventQueue()));
world.remove(CoreEvents);
```

## Entities

`world.spawn(...)` creates a fresh entity with a UUID v4 id and returns an
`EntityRef`.

```ts
const bullet = world.spawn(Bullet, Position({ x, y }), Velocity({ x: 8, y: 0 }));
```

Singleton marker access uses `world.single`.

```ts
const player = world.single(PlayerCharacter, PlayerBundle);
```

Semantics:

- 0 matching entities: spawn the factory result
- 1 matching entity: return it
- 2+ matching entities: throw

`world.single` supports one singleton marker only.

## Deferred Entity Updates

Entity mutation is deferred through an update queue.

```txt
entity.set(...)
entity.remove(...)
entity.destroy()
```

All three apply on the next tick, not immediately.

The explicit lifecycle/update system is named:

```ts
EntityUpdateQueue;
```

It applies queued entity component sets, component removals, and destroys.

Recommended schedule placement:

```ts
world.tick([
  EntityUpdateQueue,
  EventQueueSystem,
  // game systems...
]);
```

## Systems

Systems define static queries.

```ts
export const GravitySystem = System(
  {
    entity: { Position, Velocity },
  },
  ({ entity }) => {
    entity.Velocity.y += 1;
  },
);
```

System callback context includes:

```ts
{
  (entity, resources, world);
}
```

Entity callbacks run once per matched entity. Resource-only systems run once per
tick.

Mixed query example:

```ts
export const ShootSystem = System(
  {
    entity: { PlayerCharacter, Position },
    resources: { CoreEvents },
  },
  ({ entity, resources, world }) => {
    for (const event of resources.CoreEvents.consumeOfType("input/fire")) {
      world.spawn(Bullet, Position({ x: entity.Position.x, y: entity.Position.y }));
    }
  },
);
```

If a queried resource is missing, the system run is skipped and an error is
logged using LogTape. Exact LogTape category/message details are implementation
best effort.

## Query Caching

Queries are cached from day 1.

World maintains match caches for each static system query. As entities or
resources appear, disappear, or change, affected cached query matches are
retested.

System iteration uses a snapshot of cached matches for that run.

## Event Queue

Events are resource-backed transient ECS state.

```ts
export type EventType = string;

export type EcsEvent = Readonly<{
  type: EventType;
  value: unknown;
}>;

export type TypedEcsEvent<TValue> = Readonly<{
  type: EventType;
  value: TValue;
}>;
```

`EventQueue` is a mutable class and is Serde-compatible.

Public API:

```ts
export class EventQueue {
  constructor(current?: Iterable<EcsEvent>, next?: Iterable<EcsEvent>);

  trigger(...events: readonly EcsEvent[]): void;

  consumeOfType<TValue = unknown>(type: EventType): readonly TypedEcsEvent<TValue>[];

  toJSON(): {
    EventQueue: {
      current: readonly EcsEvent[];
      next: readonly EcsEvent[];
    };
  };
}
```

Semantics:

- `consumeOfType` reads current tick events only
- `trigger` queues events for the next tick
- same-tick event passing never happens

Event advancement is handled by an explicit system:

```ts
EventQueueSystem;
```

`EventQueueSystem` advances all resources whose value is an `EventQueue`.

## World Construction

Use:

```ts
new World();
World.fromSave(save);
```

`fromSave` validates singleton markers and restores registered Serde values.

## Open Work

- Exact TypeScript type implementation for named system query rows.
- Exact cached-query internal representation.
- Exact EntityRef API surface.
- Exact LogTape logger category and message wording.
- Migration/versioning policy beyond initial `WorldSave.version`.
