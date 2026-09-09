import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let thoughtService: typeof import("../../src/services/thoughtService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  cleanup = temp.cleanup;
  thoughtService = await import("../../src/services/thoughtService.js");
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanup();
});

describe("thoughtService", () => {
  it("adds a thought with an optional title", async () => {
    const thought = await thoughtService.addThought({ title: "Idea", content: "Build a thing." });

    expect(thought.id).toBeTruthy();
    expect(thought.title).toBe("Idea");
    expect(thought.content).toBe("Build a thing.");
    expect(thought.createdAt).toBeTruthy();
  });

  it("adds a thought with no title", async () => {
    const thought = await thoughtService.addThought({ content: "Just a note." });
    expect(thought.title).toBeUndefined();
  });

  it("lists thoughts newest-first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    await thoughtService.addThought({ content: "First" });
    vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));
    await thoughtService.addThought({ content: "Second" });

    const thoughts = await thoughtService.listThoughts({ limit: 50 });
    expect(thoughts.map((t) => t.content)).toEqual(["Second", "First"]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await thoughtService.addThought({ content: `Thought ${i}` });
    }

    expect(await thoughtService.listThoughts({ limit: 3 })).toHaveLength(3);
  });

  it("filters by from/to date range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    await thoughtService.addThought({ content: "Too early" });
    vi.setSystemTime(new Date("2024-02-15T00:00:00.000Z"));
    await thoughtService.addThought({ content: "In range" });
    vi.setSystemTime(new Date("2024-03-01T00:00:00.000Z"));
    await thoughtService.addThought({ content: "Too late" });

    const thoughts = await thoughtService.listThoughts({
      from: "2024-02-01T00:00:00.000Z",
      to: "2024-02-28T00:00:00.000Z",
      limit: 50,
    });

    expect(thoughts.map((t) => t.content)).toEqual(["In range"]);
  });

  it("deletes a thought", async () => {
    const thought = await thoughtService.addThought({ content: "Delete me" });
    expect(await thoughtService.deleteThought(thought.id)).toBe(true);
    expect(await thoughtService.listThoughts({ limit: 50 })).toHaveLength(0);
  });

  it("returns false when deleting a thought that doesn't exist", async () => {
    expect(await thoughtService.deleteThought("11111111-1111-4111-8111-111111111111")).toBe(false);
  });
});
