import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";
import type { Summarizer } from "../../src/lib/summarizer.js";
import { SearchJournalSchema } from "../../src/schemas/journal.js";
import { ListThoughtsSchema } from "../../src/schemas/thought.js";

let cleanup: () => Promise<void>;
let journalService: typeof import("../../src/services/journalService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  cleanup = temp.cleanup;
  journalService = await import("../../src/services/journalService.js");
});

afterEach(async () => {
  await cleanup();
});

function fakeSummarizer(overrides: Partial<Summarizer> = {}): Summarizer {
  return {
    id: "fake",
    summarize: vi.fn().mockResolvedValue("A fake summary."),
    ...overrides,
  };
}

describe("journal entry summaries", () => {
  it("marks a summary provided at creation time as manual", async () => {
    const entry = await journalService.addJournalEntry({
      title: "Day one",
      content: "Started the rewrite.",
      summary: "Kicked off the rewrite.",
    });

    expect(entry.summary).toBe("Kicked off the rewrite.");
    expect(entry.summaryBackend).toBe("manual");
    expect(entry.summaryGeneratedAt).toBeTruthy();
  });

  it("leaves summary fields unset when none is provided at creation", async () => {
    const entry = await journalService.addJournalEntry({ title: "Day one", content: "Nothing to say yet." });

    expect(entry.summary).toBeUndefined();
    expect(entry.summaryBackend).toBeUndefined();
    expect(entry.summaryGeneratedAt).toBeUndefined();
  });

  it("setJournalSummary updates the summary fields on an existing entry", async () => {
    const entry = await journalService.addJournalEntry({ title: "Day one", content: "Some content." });

    const updated = await journalService.setJournalSummary(entry.id, "Manually written.", "manual");

    expect(updated.summary).toBe("Manually written.");
    expect(updated.summaryBackend).toBe("manual");
    expect(updated.summaryGeneratedAt).toBeTruthy();
  });

  it("setJournalSummary throws for an unknown id", async () => {
    await expect(journalService.setJournalSummary("does-not-exist", "x", "manual")).rejects.toThrow();
  });

  it("generateJournalSummary calls the given summarizer and stores its result", async () => {
    const entry = await journalService.addJournalEntry({ title: "Day one", content: "Some content." });
    const summarizer = fakeSummarizer();

    const updated = await journalService.generateJournalSummary(entry.id, summarizer);

    expect(summarizer.summarize).toHaveBeenCalledWith("Some content.");
    expect(updated.summary).toBe("A fake summary.");
    expect(updated.summaryBackend).toBe("fake");
    expect(updated.summaryGeneratedAt).toBeTruthy();
  });

  it("generateJournalSummary overwrites an existing summary", async () => {
    const entry = await journalService.addJournalEntry({
      title: "Day one",
      content: "Some content.",
      summary: "Old summary.",
    });

    const updated = await journalService.generateJournalSummary(entry.id, fakeSummarizer());

    expect(updated.summary).toBe("A fake summary.");
    expect(updated.summaryBackend).toBe("fake");
  });

  it("backfillJournalSummaries only processes entries missing a summary", async () => {
    const withSummary = await journalService.addJournalEntry({
      title: "Has one",
      content: "Already summarized.",
      summary: "Existing.",
    });
    const withoutSummary = await journalService.addJournalEntry({
      title: "Missing one",
      content: "Needs a summary.",
    });

    const result = await journalService.backfillJournalSummaries(fakeSummarizer());

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);

    const untouched = await journalService.searchJournal({ limit: 10 });
    const stillHasOriginal = untouched.find((e) => e.id === withSummary.id);
    const nowSummarized = untouched.find((e) => e.id === withoutSummary.id);
    expect(stillHasOriginal?.summary).toBe("Existing.");
    expect(nowSummarized?.summary).toBe("A fake summary.");
  });

  it("backfillJournalSummaries collects per-entry errors without stopping the rest", async () => {
    await journalService.addJournalEntry({ title: "Will fail", content: "First." });
    const willSucceed = await journalService.addJournalEntry({ title: "Will succeed", content: "Second." });

    let call = 0;
    const summarizer = fakeSummarizer({
      summarize: vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) throw new Error("Ollama unreachable");
        return "A fake summary.";
      }),
    });

    const result = await journalService.backfillJournalSummaries(summarizer);

    expect(result.processed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Ollama unreachable");

    const entries = await journalService.searchJournal({ limit: 10 });
    expect(entries.find((e) => e.id === willSucceed.id)?.summary).toBe("A fake summary.");
  });
});

describe("searchJournal date range", () => {
  it("accepts plain dates and includes both whole days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (const [at, title] of [
        ["2024-01-31T23:59:59.999Z", "Day before"],
        ["2024-02-01T00:00:00.000Z", "First moment"],
        ["2024-02-28T23:59:59.999Z", "Last moment"],
        ["2024-02-29T00:00:00.000Z", "Day after"],
      ] as const) {
        vi.setSystemTime(new Date(at));
        await journalService.addJournalEntry({ title, content: "entry", tags: [] });
      }

      const results = await journalService.searchJournal({ from: "2024-02-01", to: "2024-02-28", limit: 50 });
      expect(results.map((entry) => entry.title)).toEqual(["Last moment", "First moment"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("date range schemas used by search_journal and list_thoughts", () => {
  it.each(["2026-09-06", "2026-09-06T10:00:00Z", "2026-09-06T10:00:00.000-04:00"])("accepts %s", (value) => {
    expect(SearchJournalSchema.safeParse({ from: value, to: value }).success).toBe(true);
    expect(ListThoughtsSchema.safeParse({ from: value, to: value }).success).toBe(true);
  });

  it.each(["09/06/2026", "2026-9-6", "yesterday"])("rejects %s", (value) => {
    expect(SearchJournalSchema.safeParse({ from: value }).success).toBe(false);
    expect(ListThoughtsSchema.safeParse({ from: value }).success).toBe(false);
  });
});

