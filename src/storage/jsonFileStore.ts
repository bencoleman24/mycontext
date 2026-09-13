import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import type { CollectionStore, SingletonStore } from "./dataStore.js";

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Transforms raw on-disk JSON from one schemaVersion to the next. Keyed by
 * the version being migrated FROM (e.g. `1` maps a v1 file to its v2 shape).
 */
export type MigrationMap = Record<number, (raw: unknown) => unknown>;

/**
 * Strips the `schemaVersion` envelope and runs any registered migrations up
 * to `currentVersion`. Files with no `schemaVersion` key predate this
 * mechanism and are implicitly version 0 -- the 0 -> 1 step is always a
 * no-op tag-add, so it needs no registered migration. Any later gap without
 * a registered migration is a bug, not something to silently paper over.
 */
function migrateToCurrent(
  parsed: unknown,
  currentVersion: number,
  migrations: MigrationMap,
  filePath: string,
): { body: unknown; migrated: boolean } {
  const isRecord = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  const record = isRecord ? (parsed as Record<string, unknown>) : {};
  const onDiskVersion = typeof record.schemaVersion === "number" ? record.schemaVersion : 0;

  if (onDiskVersion > currentVersion) {
    throw new Error(
      `${filePath} is schemaVersion ${onDiskVersion}, newer than this build understands (${currentVersion}). Refusing to touch it -- update the app before opening this data.`,
    );
  }

  let body: unknown = isRecord
    ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== "schemaVersion"))
    : parsed;

  for (let v = onDiskVersion; v < currentVersion; v++) {
    const step = migrations[v];
    if (step) {
      body = step(body);
    } else if (v !== 0) {
      throw new Error(
        `${filePath} needs a migration from schemaVersion ${v} to ${v + 1}, but none is registered.`,
      );
    }
  }

  return { body, migrated: onDiskVersion < currentVersion };
}

async function readJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
  fallback: T,
  currentVersion: number,
  migrations: MigrationMap,
): Promise<{ data: T; migrated: boolean }> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { data: fallback, migrated: false };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${(err as Error).message}`);
  }

  const { body, migrated } = migrateToCurrent(parsed, currentVersion, migrations, filePath);

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Data in ${filePath} does not match the expected schema: ${result.error.message}`,
    );
  }
  return { data: result.data, migrated };
}

async function writeJsonFile<T extends Record<string, unknown>>(
  filePath: string,
  schema: z.ZodType<T>,
  value: T,
  currentVersion: number,
): Promise<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Refusing to write invalid data to ${filePath}: ${result.error.message}`);
  }

  await ensureDir(filePath);
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  const onDisk = { schemaVersion: currentVersion, ...result.data };
  await writeFile(tmpPath, JSON.stringify(onDisk, null, 2), "utf-8");
  await rename(tmpPath, filePath);
  return result.data;
}

// --- Write lock ------------------------------------------------------------
//
// Every write is read-modify-write on a whole file, so two writers that
// overlap would each read the old contents and the last rename would win,
// silently dropping the other's change. AI clients make parallel tool calls
// and some start several server processes at once, so writes are serialized
// with a lock file next to the data file. It works across processes, not
// just within one. Reads don't need it: writes land via atomic rename, so a
// reader always sees a complete file.

const LOCK_STALE_MS = 10_000;
const LOCK_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFileLock<R>(filePath: string, fn: () => Promise<R>): Promise<R> {
  await ensureDir(filePath);
  const lockPath = `${filePath}.lock`;
  const started = Date.now();
  let delay = 5;

  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }

    // A lock this old was left behind by a process that died mid-write.
    try {
      const { mtimeMs } = await stat(lockPath);
      if (Date.now() - mtimeMs > LOCK_STALE_MS) {
        await rm(lockPath, { force: true });
        continue;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }

    if (Date.now() - started > LOCK_TIMEOUT_MS) {
      throw new Error(
        `Timed out waiting to write ${filePath}. If no other mycontext process is running, delete ${lockPath}.`,
      );
    }
    await sleep(delay + Math.random() * delay);
    delay = Math.min(delay * 2, 100);
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

/**
 * A collection persisted as a single JSON file of shape
 * `{ schemaVersion, items: T[] }`, keyed by `item.id`.
 */
export class JsonCollectionStore<T extends { id: string }> implements CollectionStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly fileSchema: z.ZodType<{ items: T[] }>,
    private readonly version: number,
    private readonly migrations: MigrationMap = {},
  ) {}

  private async load(): Promise<{ items: T[]; migrated: boolean }> {
    const { data, migrated } = await readJsonFile(
      this.filePath,
      this.fileSchema,
      { items: [] as T[] },
      this.version,
      this.migrations,
    );
    return { items: data.items, migrated };
  }

  async list(): Promise<T[]> {
    const { items, migrated } = await this.load();
    if (!migrated) return items;
    // Persist the upgrade under the lock, re-reading in case another writer got there first.
    return this.update((current) => [...current]);
  }

  async get(id: string): Promise<T | undefined> {
    const items = await this.list();
    return items.find((item) => item.id === id);
  }

  /**
   * Read, change, and write the collection as one step no other writer can
   * interleave with. `mutate` edits `items` in place and returns a result.
   * Throwing inside `mutate` leaves the file untouched.
   */
  async update<R>(mutate: (items: T[]) => R | Promise<R>): Promise<R> {
    return withFileLock(this.filePath, async () => {
      const { items, migrated } = await this.load();
      const before = JSON.stringify(items);
      const result = await mutate(items);
      if (migrated || JSON.stringify(items) !== before) {
        await writeJsonFile(this.filePath, this.fileSchema, { items }, this.version);
      }
      return result;
    });
  }

  async upsert(item: T): Promise<T> {
    return this.update((items) => {
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      return item;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.update((items) => {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    });
  }

  async deleteMany(predicate: (item: T) => boolean): Promise<number> {
    return this.update((items) => {
      const kept = items.filter((item) => !predicate(item));
      const removed = items.length - kept.length;
      items.splice(0, items.length, ...kept);
      return removed;
    });
  }
}

/**
 * A single record persisted as its own JSON file, e.g. the user's profile.
 */
export class JsonSingletonStore<T> implements SingletonStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly fileSchema: z.ZodType<{ value: T | null }>,
    private readonly version: number,
    private readonly migrations: MigrationMap = {},
  ) {}

  private load(): Promise<{ data: { value: T | null }; migrated: boolean }> {
    return readJsonFile(this.filePath, this.fileSchema, { value: null as T | null }, this.version, this.migrations);
  }

  async read(): Promise<T | null> {
    const { data, migrated } = await this.load();
    if (!migrated) return data.value;
    return withFileLock(this.filePath, async () => {
      const current = await this.load();
      if (current.migrated) {
        await writeJsonFile(this.filePath, this.fileSchema, current.data, this.version);
      }
      return current.data.value;
    });
  }

  /** Read, change, and write the record as one step no other writer can interleave with. */
  async update(change: (current: T | null) => T | Promise<T>): Promise<T> {
    return withFileLock(this.filePath, async () => {
      const { data } = await this.load();
      const next = await change(data.value);
      await writeJsonFile(this.filePath, this.fileSchema, { value: next }, this.version);
      return next;
    });
  }

  async write(value: T): Promise<T> {
    return this.update(() => value);
  }
}
