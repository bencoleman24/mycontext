import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let exportService: typeof import("../../src/services/exportService.js");
let profileService: typeof import("../../src/services/profileService.js");
let journalService: typeof import("../../src/services/journalService.js");
let habitService: typeof import("../../src/services/habitService.js");
let thoughtService: typeof import("../../src/services/thoughtService.js");
let fileService: typeof import("../../src/services/fileService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  cleanup = temp.cleanup;
  exportService = await import("../../src/services/exportService.js");
  profileService = await import("../../src/services/profileService.js");
  journalService = await import("../../src/services/journalService.js");
  habitService = await import("../../src/services/habitService.js");
  thoughtService = await import("../../src/services/thoughtService.js");
  fileService = await import("../../src/services/fileService.js");
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanup();
});

describe("exportContext", () => {
  it("produces a markdown bundle with the personal-context framing and privacy note", async () => {
    await profileService.updateProfile({ name: "Ada", goals: ["Ship the MCP server"] });
    await journalService.addJournalEntry({ title: "Day one", content: "Started the rewrite." });

    const result = await exportService.exportContext({ format: "markdown" });

    expect(result.format).toBe("markdown");
    expect(result.content).toContain("# Personal Context Export");
    expect(result.content).toContain("privacy considerations");
    expect(result.content).toContain("**Name:** Ada");
    expect(result.content).toContain("Ship the MCP server");
    expect(result.content).toContain("Started the rewrite.");
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it("omits sections that aren't requested", async () => {
    await profileService.updateProfile({ name: "Ada" });
    await journalService.addJournalEntry({ title: "Day one", content: "Should not appear." });

    const result = await exportService.exportContext({ format: "markdown", sections: ["profile"] });

    expect(result.content).toContain("**Name:** Ada");
    expect(result.content).not.toContain("Should not appear.");
  });

  it("produces valid JSON containing the same data", async () => {
    await profileService.updateProfile({ name: "Ada" });

    const result = await exportService.exportContext({ format: "json" });
    const parsed = JSON.parse(result.content);

    expect(parsed.profile.name).toBe("Ada");
    expect(parsed.fileDescription).toContain("personalized data profile");
  });

  it("produces a CSV with one row per habit log", async () => {
    const habit = await habitService.createHabit({ name: "Read" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-01", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-02", status: "N" });

    const result = await exportService.exportContext({ format: "csv" });
    const lines = result.content.trim().split("\n");

    expect(lines[0]).toBe("habitName,date,status,note");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Read",2024-01-01,Y');
  });
});

describe("exportContext date range", () => {
  it("excludes journal entries outside the range and includes ones inside it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-05T12:00:00.000Z"));
    await journalService.addJournalEntry({ title: "Old entry", content: "Before the range." });

    vi.setSystemTime(new Date("2024-02-15T12:00:00.000Z"));
    await journalService.addJournalEntry({ title: "New entry", content: "Inside the range." });

    const result = await exportService.exportContext({
      format: "markdown",
      sections: ["journal"],
      from: "2024-02-01",
      to: "2024-02-28",
    });

    expect(result.content).toContain("Inside the range.");
    expect(result.content).not.toContain("Before the range.");
  });

  it("excludes thoughts outside the range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-05T12:00:00.000Z"));
    await thoughtService.addThought({ content: "Old thought." });

    vi.setSystemTime(new Date("2024-02-15T12:00:00.000Z"));
    await thoughtService.addThought({ content: "New thought." });

    const result = await exportService.exportContext({
      format: "markdown",
      sections: ["thoughts"],
      from: "2024-02-01",
      to: "2024-02-28",
    });

    expect(result.content).toContain("New thought.");
    expect(result.content).not.toContain("Old thought.");
  });

  it("excludes files outside the range", async () => {
    const base64 = Buffer.from("hello", "utf-8").toString("base64");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-05T12:00:00.000Z"));
    await fileService.uploadFile({
      title: "Old file",
      filename: "old.txt",
      mimeType: "text/plain",
      contentBase64: base64,
    });

    vi.setSystemTime(new Date("2024-02-15T12:00:00.000Z"));
    await fileService.uploadFile({
      title: "New file",
      filename: "new.txt",
      mimeType: "text/plain",
      contentBase64: base64,
    });

    const result = await exportService.exportContext({
      format: "markdown",
      sections: ["files"],
      from: "2024-02-01",
      to: "2024-02-28",
    });

    expect(result.content).toContain("New file");
    expect(result.content).not.toContain("Old file");
  });

  it("excludes CSV habit log rows outside the range", async () => {
    const habit = await habitService.createHabit({ name: "Read" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-01", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-02-15", status: "Y" });

    const result = await exportService.exportContext({
      format: "csv",
      from: "2024-02-01",
      to: "2024-02-28",
    });
    const lines = result.content.trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("2024-02-15");
  });

  it("leaves all-time habit summary stats unaffected by a date range that excludes all logged history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T12:00:00.000Z"));
    const habit = await habitService.createHabit({ name: "Read" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });

    // A range that excludes all of the above -- summary stats should still reflect full history.
    const result = await exportService.exportContext({
      format: "markdown",
      sections: ["habits"],
      from: "2024-03-01",
      to: "2024-03-31",
    });

    expect(result.content).toContain("current streak 2 days");
  });
});

describe("exportContext journalDetail", () => {
  it("uses full entry content by default", async () => {
    await journalService.addJournalEntry({
      title: "Day one",
      content: "The full, unabridged story.",
      summary: "A short summary.",
    });

    const result = await exportService.exportContext({ format: "markdown", sections: ["journal"] });

    expect(result.content).toContain("The full, unabridged story.");
    expect(result.content).not.toContain("A short summary.");
  });

  it("uses the saved summary in markdown and json when journalDetail is 'summary'", async () => {
    await journalService.addJournalEntry({
      title: "Day one",
      content: "The full, unabridged story.",
      summary: "A short summary.",
    });

    const markdown = await exportService.exportContext({
      format: "markdown",
      sections: ["journal"],
      journalDetail: "summary",
    });
    expect(markdown.content).toContain("A short summary.");
    expect(markdown.content).not.toContain("The full, unabridged story.");

    const json = await exportService.exportContext({
      format: "json",
      sections: ["journal"],
      journalDetail: "summary",
    });
    const parsed = JSON.parse(json.content);
    expect(parsed.journalEntries[0].content).toBe("A short summary.");
  });

  it("renders a placeholder for entries with no summary yet under journalDetail 'summary'", async () => {
    await journalService.addJournalEntry({ title: "Day one", content: "No summary written yet." });

    const result = await exportService.exportContext({
      format: "markdown",
      sections: ["journal"],
      journalDetail: "summary",
    });

    expect(result.content).toContain("[no summary generated]");
    expect(result.content).not.toContain("No summary written yet.");
  });
});
