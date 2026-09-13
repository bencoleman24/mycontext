import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { useTempDataDir } from "../testDataDir.js";
import { JsonCollectionStore, JsonSingletonStore, type MigrationMap } from "../../src/storage/jsonFileStore.js";

const ItemSchema = z.object({ id: z.string(), label: z.string() });
const FileSchema = z.object({ items: z.array(ItemSchema).default([]) });

const ValueSchema = z.object({ count: z.number() });
const SingletonFileSchema = z.object({ value: ValueSchema.nullable() });

let cleanup: () => Promise<void>;
let dataDir: string;

beforeEach(async () => {
  const temp = await useTempDataDir();
  dataDir = temp.dataDir;
  cleanup = temp.cleanup;
});

afterEach(async () => {
  await cleanup();
});

async function writeRaw(filePath: string, body: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");
}

async function readRaw(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

describe("JsonCollectionStore", () => {
  it("round-trips items through upsert/list/get/delete", async () => {
    const store = new JsonCollectionStore(path.join(dataDir, "items.json"), FileSchema, 1);

    expect(await store.list()).toEqual([]);

    await store.upsert({ id: "a", label: "first" });
    await store.upsert({ id: "b", label: "second" });
    expect(await store.list()).toHaveLength(2);
    expect(await store.get("a")).toEqual({ id: "a", label: "first" });

    await store.upsert({ id: "a", label: "updated" });
    expect(await store.get("a")).toEqual({ id: "a", label: "updated" });
    expect(await store.list()).toHaveLength(2);

    const deleted = await store.delete("a");
    expect(deleted).toBe(true);
    expect(await store.list()).toHaveLength(1);

    const deletedAgain = await store.delete("a");
    expect(deletedAgain).toBe(false);
  });

  it("rejects data that doesn't match the schema instead of silently corrupting", async () => {
    const store = new JsonCollectionStore(path.join(dataDir, "items.json"), FileSchema, 1);
    // @ts-expect-error intentionally invalid item to exercise validation
    await expect(store.upsert({ id: "a" })).rejects.toThrow(/invalid data/i);
  });

  it("stamps the current schemaVersion when writing", async () => {
    const filePath = path.join(dataDir, "items.json");
    const store = new JsonCollectionStore(filePath, FileSchema, 1);

    await store.upsert({ id: "a", label: "first" });

    expect(await readRaw(filePath)).toEqual({ schemaVersion: 1, items: [{ id: "a", label: "first" }] });
  });

  it("reads a legacy file with no schemaVersion (implicit v0) and persists the tag on next read", async () => {
    const filePath = path.join(dataDir, "items.json");
    await writeRaw(filePath, { items: [{ id: "a", label: "first" }] });

    const store = new JsonCollectionStore(filePath, FileSchema, 1);
    expect(await store.list()).toEqual([{ id: "a", label: "first" }]);

    expect(await readRaw(filePath)).toEqual({ schemaVersion: 1, items: [{ id: "a", label: "first" }] });
  });

  it("runs a registered migration when the on-disk version is older than current", async () => {
    const filePath = path.join(dataDir, "items.json");
    await writeRaw(filePath, { schemaVersion: 1, items: [{ id: "a", label: "first" }] });

    const migrations: MigrationMap = {
      1: (raw) => {
        const file = raw as { items: Array<{ id: string; label: string }> };
        return { items: file.items.map((item) => ({ ...item, label: `${item.label}!` })) };
      },
    };
    const store = new JsonCollectionStore(filePath, FileSchema, 2, migrations);

    expect(await store.list()).toEqual([{ id: "a", label: "first!" }]);
    expect(await readRaw(filePath)).toMatchObject({ schemaVersion: 2 });
  });

  it("throws instead of silently reading a schemaVersion newer than this build understands", async () => {
    const filePath = path.join(dataDir, "items.json");
    await writeRaw(filePath, { schemaVersion: 99, items: [] });

    const store = new JsonCollectionStore(filePath, FileSchema, 1);
    await expect(store.list()).rejects.toThrow(/newer than this build/i);
  });

  it("throws instead of silently skipping a missing migration hop", async () => {
    const filePath = path.join(dataDir, "items.json");
    await writeRaw(filePath, { schemaVersion: 1, items: [] });

    // version 3 declared but no migration registered for the 1->2 or 2->3 hop
    const store = new JsonCollectionStore(filePath, FileSchema, 3, {});
    await expect(store.list()).rejects.toThrow(/needs a migration/i);
  });
});

describe("JsonSingletonStore", () => {
  it("returns null before anything is written, then round-trips a value", async () => {
    const store = new JsonSingletonStore(path.join(dataDir, "singleton.json"), SingletonFileSchema, 1);

    expect(await store.read()).toBeNull();

    await store.write({ count: 1 });
    expect(await store.read()).toEqual({ count: 1 });

    await store.write({ count: 2 });
    expect(await store.read()).toEqual({ count: 2 });
  });

  it("reads a legacy file with no schemaVersion and persists the tag on next read", async () => {
    const filePath = path.join(dataDir, "singleton.json");
    await writeRaw(filePath, { value: { count: 5 } });

    const store = new JsonSingletonStore(filePath, SingletonFileSchema, 1);
    expect(await store.read()).toEqual({ count: 5 });

    expect(await readRaw(filePath)).toEqual({ schemaVersion: 1, value: { count: 5 } });
  });
});

describe("concurrent writes", () => {
  const lockFiles = async () => (await readdir(dataDir)).filter((name) => name.endsWith(".lock"));

  it("keeps every item when many upserts run at once", async () => {
    const store = new JsonCollectionStore(path.join(dataDir, "items.json"), FileSchema, 1);
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.upsert({ id: `i${i}`, label: `item ${i}` })));
    expect(await store.list()).toHaveLength(25);
  });

  it("keeps every item when separate store instances write the same file, as separate processes would", async () => {
    const file = path.join(dataDir, "items.json");
    const a = new JsonCollectionStore(file, FileSchema, 1);
    const b = new JsonCollectionStore(file, FileSchema, 1);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).upsert({ id: `i${i}`, label: `item ${i}` })),
    );
    expect(await a.list()).toHaveLength(20);
  });

  it("applies overlapping read-modify-write updates without losing any", async () => {
    const store = new JsonSingletonStore(path.join(dataDir, "counter.json"), SingletonFileSchema, 1);
    await store.write({ count: 0 });
    await Promise.all(Array.from({ length: 30 }, () => store.update((current) => ({ count: (current?.count ?? 0) + 1 }))));
    expect(await store.read()).toEqual({ count: 30 });
  });

  it("releases the lock after a write fails validation", async () => {
    const store = new JsonCollectionStore(path.join(dataDir, "items.json"), FileSchema, 1);
    // @ts-expect-error intentionally invalid item
    await expect(store.upsert({ id: "a" })).rejects.toThrow(/invalid data/i);
    expect(await lockFiles()).toEqual([]);
    await expect(store.upsert({ id: "b", label: "ok" })).resolves.toEqual({ id: "b", label: "ok" });
  });

  it("leaves the file untouched when an update throws", async () => {
    const file = path.join(dataDir, "items.json");
    const store = new JsonCollectionStore(file, FileSchema, 1);
    await store.upsert({ id: "a", label: "first" });
    const before = await readFile(file, "utf-8");
    await expect(
      store.update((items) => {
        items.push({ id: "b", label: "second" });
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(await readFile(file, "utf-8")).toBe(before);
    expect(await lockFiles()).toEqual([]);
  });

  it("takes over a stale lock left behind by a crashed process", async () => {
    const file = path.join(dataDir, "items.json");
    await writeFile(`${file}.lock`, "12345 crashed", "utf-8");
    const old = new Date(Date.now() - 60_000);
    await utimes(`${file}.lock`, old, old);

    const store = new JsonCollectionStore(file, FileSchema, 1);
    await store.upsert({ id: "a", label: "first" });
    expect(await store.list()).toEqual([{ id: "a", label: "first" }]);
    expect(await lockFiles()).toEqual([]);
  });

  it("doesn't create a file when an update changes nothing", async () => {
    const file = path.join(dataDir, "items.json");
    const store = new JsonCollectionStore(file, FileSchema, 1);
    expect(await store.delete("missing")).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});
