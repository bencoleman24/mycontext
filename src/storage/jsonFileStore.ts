import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

  private async readFile(): Promise<{ items: T[] }> {
    const { data, migrated } = await readJsonFile(
      this.filePath,
      this.fileSchema,
      { items: [] as T[] },
      this.version,
      this.migrations,
    );
    if (migrated) {
      await writeJsonFile(this.filePath, this.fileSchema, data, this.version);
    }
    return data;
  }

  async list(): Promise<T[]> {
    const file = await this.readFile();
    return file.items;
  }

  async get(id: string): Promise<T | undefined> {
    const items = await this.list();
    return items.find((item) => item.id === id);
  }

  async upsert(item: T): Promise<T> {
    const items = await this.list();
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }
    await writeJsonFile(this.filePath, this.fileSchema, { items }, this.version);
    return item;
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.list();
    const next = items.filter((item) => item.id !== id);
    const changed = next.length !== items.length;
    if (changed) {
      await writeJsonFile(this.filePath, this.fileSchema, { items: next }, this.version);
    }
    return changed;
  }

  async deleteMany(predicate: (item: T) => boolean): Promise<number> {
    const items = await this.list();
    const next = items.filter((item) => !predicate(item));
    const removed = items.length - next.length;
    if (removed > 0) {
      await writeJsonFile(this.filePath, this.fileSchema, { items: next }, this.version);
    }
    return removed;
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

  async read(): Promise<T | null> {
    const { data, migrated } = await readJsonFile(
      this.filePath,
      this.fileSchema,
      { value: null as T | null },
      this.version,
      this.migrations,
    );
    if (migrated) {
      await writeJsonFile(this.filePath, this.fileSchema, data, this.version);
    }
    return data.value;
  }

  async write(value: T): Promise<T> {
    await writeJsonFile(this.filePath, this.fileSchema, { value }, this.version);
    return value;
  }
}
