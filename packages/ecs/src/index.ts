import { registerSerdeType, Serde } from "@internal/foundation";

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

export type ComponentSetParam<TValue> = Readonly<{
  definition: ComponentDefinition<TValue>;
  value: TValue;
}>;

export type ComponentDefinition<TValue> = Readonly<{
  kind: "component";
  type: ComponentType;
}> &
  ((value: TValue) => ComponentSetParam<TValue>);

export type MarkerDefinition = Readonly<{
  kind: "marker";
  type: ComponentType;
  singleton: boolean;
}>;

export type MarkerOptions = Readonly<{
  singleton?: boolean;
}>;

export type ResourceSetParam<TValue> = Readonly<{
  definition: ResourceDefinition<TValue>;
  value: TValue;
}>;

export type ResourceDefinition<TValue> = Readonly<{
  kind: "resource";
  type: ResourceType;
}> &
  ((value: TValue) => ResourceSetParam<TValue>);

type AnyComponentDefinition = ComponentDefinition<any>;
type AnyResourceDefinition = ResourceDefinition<any>;
type EntitySetParam = ComponentSetParam<any> | MarkerDefinition;
type ComponentQuery = Readonly<Record<string, AnyComponentDefinition | MarkerDefinition>>;
type ResourceQuery = Readonly<Record<string, AnyResourceDefinition>>;
type ComponentQueryRow<TQuery extends ComponentQuery> = {
  -readonly [TKey in keyof TQuery]: TQuery[TKey] extends ComponentDefinition<infer TValue>
    ? TValue
    : TQuery[TKey] extends MarkerDefinition
      ? Record<string, never>
      : never;
};
type ResourceQueryRow<TQuery extends ResourceQuery> = {
  -readonly [TKey in keyof TQuery]: TQuery[TKey] extends ResourceDefinition<infer TValue>
    ? TValue
    : never;
};

type SystemQuery = Readonly<{
  entity?: ComponentQuery;
  resources?: ResourceQuery;
}>;

type SystemContext<TQuery extends SystemQuery> = Readonly<{
  entity: TQuery extends { entity: infer TEntity extends ComponentQuery }
    ? ComponentQueryRow<TEntity>
    : never;
  resources: TQuery extends { resources: infer TResources extends ResourceQuery }
    ? ResourceQueryRow<TResources>
    : Record<string, never>;
  world: World;
}>;

export type EcsSystem = Readonly<{
  query: SystemQuery;
  run(world: World): void;
}>;

const componentRegistry = new Map<ComponentType, AnyComponentDefinition | MarkerDefinition>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateType(kind: string, type: string): void {
  if (type.length === 0) {
    throw new Error(`${kind} type must not be empty.`);
  }
}

function registerComponent(definition: AnyComponentDefinition | MarkerDefinition): void {
  const previous = componentRegistry.get(definition.type);

  if (previous && previous !== definition) {
    throw new Error(`Component type already registered: ${definition.type}`);
  }

  componentRegistry.set(definition.type, definition);
}

export function Component<TValue>(type: ComponentType): ComponentDefinition<TValue> {
  validateType("Component", type);

  const definition = ((value: TValue) =>
    Object.freeze({
      definition,
      value,
    }) as ComponentSetParam<TValue>) as ComponentDefinition<TValue>;

  Object.defineProperties(definition, {
    kind: { value: "component", enumerable: true },
    type: { value: type, enumerable: true },
  });
  Object.freeze(definition);
  registerComponent(definition);

  return definition;
}

export function Marker(type: ComponentType, options: MarkerOptions = {}): MarkerDefinition {
  validateType("Marker", type);

  const definition = Object.freeze({
    kind: "marker" as const,
    type,
    singleton: options.singleton === true,
  });
  registerComponent(definition);

  return definition;
}

export function Resource<TValue>(type: ResourceType): ResourceDefinition<TValue> {
  validateType("Resource", type);

  const definition = ((value: TValue) =>
    Object.freeze({ definition, value }) as ResourceSetParam<TValue>) as ResourceDefinition<TValue>;

  Object.defineProperties(definition, {
    kind: { value: "resource", enumerable: true },
    type: { value: type, enumerable: true },
  });
  Object.freeze(definition);

  return definition;
}

function componentTypeOf(param: EntitySetParam): ComponentType {
  return "definition" in param ? param.definition.type : param.type;
}

function componentValueOf(param: EntitySetParam): unknown {
  return "definition" in param ? param.value : {};
}

function createEntityId(): EntityId {
  const cryptoWithRandomUuid = globalThis.crypto as Crypto | undefined;

  if (cryptoWithRandomUuid?.randomUUID) {
    return cryptoWithRandomUuid.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

class EntityState {
  constructor(
    readonly id: EntityId,
    readonly components = new Map<ComponentType, unknown>(),
  ) {}
}

type EntityUpdate =
  | Readonly<{ kind: "set"; id: EntityId; params: readonly EntitySetParam[] }>
  | Readonly<{
      kind: "remove";
      id: EntityId;
      definitions: readonly (AnyComponentDefinition | MarkerDefinition)[];
    }>
  | Readonly<{ kind: "destroy"; id: EntityId }>;

class QueryCache {
  readonly matches = new Set<EntityId>();
  dirty = true;
}

export class EntityRef {
  readonly #world: World;
  readonly #id: EntityId;

  constructor(world: World, id: EntityId) {
    this.#world = world;
    this.#id = id;
  }

  get id(): EntityId {
    return this.#id;
  }

  has(definition: AnyComponentDefinition | MarkerDefinition): boolean {
    return this.#world.hasComponent(this.#id, definition.type);
  }

  get<TValue>(definition: ComponentDefinition<TValue>): TValue | undefined;
  get(definition: MarkerDefinition): Record<string, never> | undefined;
  get<TValue>(
    definition: ComponentDefinition<TValue> | MarkerDefinition,
  ): TValue | Record<string, never> | undefined {
    return this.#world.getComponent(this.#id, definition.type) as
      | TValue
      | Record<string, never>
      | undefined;
  }

  set(...params: readonly EntitySetParam[]): void {
    this.#world.enqueueEntityUpdate({ kind: "set", id: this.#id, params });
  }

  remove(...definitions: readonly (AnyComponentDefinition | MarkerDefinition)[]): void {
    this.#world.enqueueEntityUpdate({ kind: "remove", id: this.#id, definitions });
  }

  destroy(): void {
    this.#world.enqueueEntityUpdate({ kind: "destroy", id: this.#id });
  }
}

export class World {
  readonly #entities = new Map<EntityId, EntityState>();
  readonly #resources = new Map<ResourceType, unknown>();
  readonly #entityUpdates: EntityUpdate[] = [];
  readonly #queryCaches = new Map<EcsSystem, QueryCache>();

  spawn(...params: readonly EntitySetParam[]): EntityRef {
    const entity = new EntityState(createEntityId());

    for (const param of params) {
      entity.components.set(componentTypeOf(param), componentValueOf(param));
    }

    this.#entities.set(entity.id, entity);
    this.#markQueriesDirty();

    return new EntityRef(this, entity.id);
  }

  single(marker: MarkerDefinition, factory: () => readonly EntitySetParam[]): EntityRef {
    if (!marker.singleton) {
      throw new Error(`world.single requires a singleton marker: ${marker.type}`);
    }

    const matches = [...this.#entities.values()].filter((entity) =>
      entity.components.has(marker.type),
    );

    if (matches.length === 0) {
      return this.spawn(...factory());
    }

    if (matches.length > 1) {
      throw new Error(`Duplicate singleton marker entity: ${marker.type}`);
    }

    const match = matches[0];

    if (!match) {
      throw new Error(`Unable to resolve singleton marker: ${marker.type}`);
    }

    return new EntityRef(this, match.id);
  }

  set<TValue>(param: ResourceSetParam<TValue>): void {
    this.#resources.set(param.definition.type, param.value);
  }

  remove(definition: AnyResourceDefinition): void {
    this.#resources.delete(definition.type);
  }

  get<TValue>(definition: ResourceDefinition<TValue>): TValue | undefined {
    return this.#resources.get(definition.type) as TValue | undefined;
  }

  tick(systems: readonly EcsSystem[]): void {
    for (const system of systems) {
      system.run(this);
    }
  }

  toSave(): WorldSave {
    this.validate();

    const save = {
      version: 1,
      entities: [...this.#entities.values()].map((entity) => ({
        id: entity.id,
        components: Object.fromEntries(entity.components),
      })),
      resources: Object.fromEntries(this.#resources),
    };

    validateWorldSave(save);

    return save;
  }

  toJSON(): { WorldSave: WorldSave } {
    return { WorldSave: this.toSave() };
  }

  static fromSave(save: WorldSave): World {
    const restoredSave = Serde.read(Serde.write(save)) as WorldSave;
    validateWorldSave(restoredSave);

    const world = new World();

    for (const entitySave of restoredSave.entities) {
      world.#entities.set(
        entitySave.id,
        new EntityState(entitySave.id, new Map(Object.entries(entitySave.components))),
      );
    }

    for (const [type, value] of Object.entries(restoredSave.resources)) {
      world.#resources.set(type, value);
    }

    world.validate();

    return world;
  }

  validate(): void {
    for (const definition of componentRegistry.values()) {
      if (definition.kind !== "marker" || !definition.singleton) {
        continue;
      }

      let count = 0;

      for (const entity of this.#entities.values()) {
        if (entity.components.has(definition.type)) {
          count += 1;
        }
      }

      if (count > 1) {
        throw new Error(`Duplicate singleton marker entity: ${definition.type}`);
      }
    }
  }

  runQuery<TQuery extends SystemQuery>(
    system: EcsSystem,
    query: TQuery,
    callback: (context: SystemContext<TQuery>) => void,
  ): void {
    const resources = this.#createResourceRow(query.resources);

    if (resources === undefined) {
      return;
    }

    if (!query.entity) {
      callback({
        entity: undefined as never,
        resources,
        world: this,
      } as unknown as SystemContext<TQuery>);
      return;
    }

    const cache = this.#ensureQueryCache(system, query.entity);
    const matches = [...cache.matches];

    for (const id of matches) {
      const entity = this.#entities.get(id);

      if (!entity || !this.#matchesQuery(entity, query.entity)) {
        continue;
      }

      callback({
        entity: this.#createEntityRow(entity, query.entity),
        resources,
        world: this,
      } as unknown as SystemContext<TQuery>);
    }
  }

  applyEntityUpdates(): void {
    const updates = this.#entityUpdates.splice(0);

    for (const update of updates) {
      const entity = this.#entities.get(update.id);

      if (!entity) {
        continue;
      }

      if (update.kind === "destroy") {
        this.#entities.delete(update.id);
        this.#markQueriesDirty();
        continue;
      }

      if (update.kind === "set") {
        for (const param of update.params) {
          entity.components.set(componentTypeOf(param), componentValueOf(param));
        }
        this.#markQueriesDirty();
        continue;
      }

      for (const definition of update.definitions) {
        entity.components.delete(definition.type);
      }
      this.#markQueriesDirty();
    }

    this.validate();
  }

  advanceEventQueues(): void {
    for (const resource of this.#resources.values()) {
      if (resource instanceof EventQueue) {
        resource.advance();
      }
    }
  }

  hasComponent(id: EntityId, type: ComponentType): boolean {
    return this.#entities.get(id)?.components.has(type) ?? false;
  }

  getComponent(id: EntityId, type: ComponentType): unknown {
    return this.#entities.get(id)?.components.get(type);
  }

  enqueueEntityUpdate(update: EntityUpdate): void {
    this.#entityUpdates.push(update);
  }

  #ensureQueryCache(system: EcsSystem, query: ComponentQuery): QueryCache {
    let cache = this.#queryCaches.get(system);

    if (!cache) {
      cache = new QueryCache();
      this.#queryCaches.set(system, cache);
    }

    if (cache.dirty) {
      cache.matches.clear();

      for (const entity of this.#entities.values()) {
        if (this.#matchesQuery(entity, query)) {
          cache.matches.add(entity.id);
        }
      }

      cache.dirty = false;
    }

    return cache;
  }

  #matchesQuery(entity: EntityState, query: ComponentQuery): boolean {
    return Object.values(query).every((definition) => entity.components.has(definition.type));
  }

  #createEntityRow<TQuery extends ComponentQuery>(
    entity: EntityState,
    query: TQuery,
  ): ComponentQueryRow<TQuery> {
    return Object.fromEntries(
      Object.entries(query).map(([name, definition]) => [
        name,
        entity.components.get(definition.type),
      ]),
    ) as ComponentQueryRow<TQuery>;
  }

  #createResourceRow<TQuery extends ResourceQuery>(
    query: TQuery | undefined,
  ): ResourceQueryRow<TQuery> | undefined {
    if (!query) {
      return {} as ResourceQueryRow<TQuery>;
    }

    const row: Record<string, unknown> = {};

    for (const [name, definition] of Object.entries(query)) {
      if (!this.#resources.has(definition.type)) {
        console.error(`ECS system skipped because resource is missing: ${definition.type}`);
        return undefined;
      }

      row[name] = this.#resources.get(definition.type);
    }

    return row as ResourceQueryRow<TQuery>;
  }

  #markQueriesDirty(): void {
    for (const cache of this.#queryCaches.values()) {
      cache.dirty = true;
    }
  }
}

export function System<TQuery extends SystemQuery>(
  query: TQuery,
  callback: (context: SystemContext<TQuery>) => void,
): EcsSystem {
  const system = {
    query,
    run(world: World): void {
      world.runQuery(system, query, callback);
    },
  } satisfies EcsSystem;

  return Object.freeze(system);
}

export const EntityUpdateQueue = Object.freeze({
  query: {},
  run(world: World): void {
    world.applyEntityUpdates();
  },
}) satisfies EcsSystem;

export type EventType = string;

export type EcsEvent = Readonly<{
  type: EventType;
  value: unknown;
}>;

export type TypedEcsEvent<TValue> = Readonly<{
  type: EventType;
  value: TValue;
}>;

export class EventQueue {
  readonly #current: EcsEvent[];
  readonly #next: EcsEvent[];

  constructor(current: Iterable<EcsEvent> = [], next: Iterable<EcsEvent> = []) {
    this.#current = [...current];
    this.#next = [...next];
  }

  trigger(...events: readonly EcsEvent[]): void {
    this.#next.push(...events);
  }

  consumeOfType<TValue = unknown>(type: EventType): readonly TypedEcsEvent<TValue>[] {
    return this.#current.filter((event) => event.type === type) as readonly TypedEcsEvent<TValue>[];
  }

  advance(): void {
    this.#current.splice(0, this.#current.length, ...this.#next.splice(0));
  }

  toJSON(): { EventQueue: { current: readonly EcsEvent[]; next: readonly EcsEvent[] } } {
    return {
      EventQueue: {
        current: this.#current,
        next: this.#next,
      },
    };
  }
}

export const EventQueueSystem = Object.freeze({
  query: {},
  run(world: World): void {
    world.advanceEventQueues();
  },
}) satisfies EcsSystem;

function validateEntitySave(value: unknown): asserts value is EntitySave {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.components)) {
    throw new Error("Invalid EntitySave payload.");
  }
}

function validateWorldSave(value: unknown): asserts value is WorldSave {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.entities) ||
    !isRecord(value.resources)
  ) {
    throw new Error("Invalid WorldSave payload.");
  }

  for (const entity of value.entities) {
    validateEntitySave(entity);
  }
}

registerSerdeType("EventQueue", (value) => {
  if (!isRecord(value) || !Array.isArray(value.current) || !Array.isArray(value.next)) {
    throw new Error("Invalid EventQueue payload.");
  }

  return new EventQueue(value.current as readonly EcsEvent[], value.next as readonly EcsEvent[]);
});

registerSerdeType("WorldSave", (value) => {
  validateWorldSave(value);
  return value;
});
