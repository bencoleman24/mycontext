import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getDataDir } from "../config.js";
import { estimatedTokenCount } from "../lib/summarize.js";
import { getProfile } from "./profileService.js";
import { listProfileQuestions } from "./profileQuestionService.js";
import { listHabits } from "./habitService.js";
import { searchJournal } from "./journalService.js";
import type { JournalEntry } from "../schemas/journal.js";
import { listThoughts } from "./thoughtService.js";
import { listFiles } from "./fileService.js";
import { habitLogStore, journalStore } from "../storage/stores.js";

export type ExportFormat = "markdown" | "json" | "csv";
export type ExportSection = "profile" | "journal" | "thoughts" | "habits" | "files";
export type JournalDetail = "full" | "summary";

const ALL_SECTIONS: ExportSection[] = ["profile", "journal", "thoughts", "habits", "files"];
const NO_SUMMARY_PLACEHOLDER = "[no summary generated]";

export const ExportRequestSchema = z.object({
  format: z.enum(["markdown", "json", "csv"]),
  sections: z.array(z.enum(["profile", "journal", "thoughts", "habits", "files"])).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  journalDetail: z.enum(["full", "summary"]).optional(),
});

export interface ExportOptions {
  format: ExportFormat;
  sections?: ExportSection[];
  /** Inclusive start date, YYYY-MM-DD. Does not affect the profile section or habit summary stats. */
  from?: string;
  /** Inclusive end date, YYYY-MM-DD. Does not affect the profile section or habit summary stats. */
  to?: string;
  /** "summary" replaces each journal entry's content with its saved summary (or a placeholder, if it has none). Defaults to "full". */
  journalDetail?: JournalDetail;
}

/** Applies journalDetail: "summary" mode by swapping each entry's content for its summary (or a placeholder). */
function applyJournalDetail(entries: JournalEntry[], journalDetail: JournalDetail): JournalEntry[] {
  if (journalDetail === "full") return entries;
  return entries.map((entry) => ({ ...entry, content: entry.summary ?? NO_SUMMARY_PLACEHOLDER }));
}

export interface ExportResult {
  content: string;
  format: ExportFormat;
  estimatedTokens: number;
}

const FILE_DESCRIPTION =
  "This file is a personalized data profile containing comprehensive information about the user, including their profile details, journal entries, quick thoughts, and habit tracking data.";
const PRIVACY_NOTE =
  "This file contains personal information and should be handled with appropriate privacy considerations. It is intended for personal data analysis and AI tools.";

/** Converts inclusive YYYY-MM-DD bounds to the full ISO datetime bounds journal/thought filtering expects. */
function toDateTimeBounds(from?: string, to?: string): { fromIso?: string; toIso?: string } {
  return {
    fromIso: from ? `${from}T00:00:00.000Z` : undefined,
    toIso: to ? `${to}T23:59:59.999Z` : undefined,
  };
}

export async function exportContext(options: ExportOptions): Promise<ExportResult> {
  const sections = new Set(options.sections ?? ALL_SECTIONS);
  const { from, to } = options;
  const journalDetail = options.journalDetail ?? "full";

  const content =
    options.format === "markdown"
      ? await generateMarkdown(sections, from, to, journalDetail)
      : options.format === "json"
        ? await generateJson(sections, from, to, journalDetail)
        : await generateCsv(sections, from, to);

  return {
    content,
    format: options.format,
    estimatedTokens: estimatedTokenCount(content),
  };
}

async function generateMarkdown(
  sections: Set<ExportSection>,
  from: string | undefined,
  to: string | undefined,
  journalDetail: JournalDetail,
): Promise<string> {
  const { fromIso, toIso } = toDateTimeBounds(from, to);
  const lines: string[] = [];
  lines.push("# Personal Context Export", "");
  lines.push(`**File Description:** ${FILE_DESCRIPTION}`, "");
  lines.push(`Generated on ${new Date().toISOString()}`);
  lines.push(`**Note:** ${PRIVACY_NOTE}`, "");

  if (sections.has("profile")) {
    const profile = await getProfile();
    if (profile) {
      lines.push("## Profile Information", "");
      if (profile.name) lines.push(`**Name:** ${profile.name}`);
      if (profile.age) lines.push(`**Age:** ${profile.age}`);
      if (profile.location) lines.push(`**Location:** ${profile.location}`);
      if (profile.occupation) lines.push(`**Occupation:** ${profile.occupation}`);
      if (profile.bio) lines.push(`**Bio:** ${profile.bio}`);
      if (profile.goals.length > 0) lines.push(`**Goals:** ${profile.goals.join(", ")}`);
      if (profile.challenges.length > 0) lines.push(`**Challenges:** ${profile.challenges.join(", ")}`);

      const questions = await listProfileQuestions();
      for (const question of questions) {
        if (question.type === "text" && question.answer) {
          lines.push(`**${question.label}:** ${question.answer}`);
        } else if (question.type === "multiselect" && question.answer.length > 0) {
          lines.push(`**${question.label}:** ${question.answer.join(", ")}`);
        }
      }

      if (Object.keys(profile.preferences).length > 0) {
        lines.push("**Preferences:**");
        for (const [key, value] of Object.entries(profile.preferences)) {
          lines.push(`- ${key}: ${value}`);
        }
      }
      lines.push("");
    }
  }

  if (sections.has("journal")) {
    const entries = applyJournalDetail(
      await searchJournal({ limit: 500, from: fromIso, to: toIso }),
      journalDetail,
    );
    if (entries.length > 0) {
      lines.push("## Journal Entries", "");
      lines.push(`Total entries: ${entries.length}`, "");
      for (const entry of entries) {
        lines.push(`### ${entry.title} (${entry.createdAt})`);
        if (entry.mood) lines.push(`**Mood:** ${entry.mood}`);
        if (entry.tags.length > 0) lines.push(`**Tags:** ${entry.tags.join(", ")}`);
        lines.push("", entry.content, "");
      }
    }
  }

  if (sections.has("thoughts")) {
    const thoughts = await listThoughts({ limit: 500, from: fromIso, to: toIso });
    if (thoughts.length > 0) {
      lines.push("## Quick Thoughts", "");
      lines.push(`Total thoughts: ${thoughts.length}`, "");
      for (const thought of thoughts) {
        lines.push(`### ${thought.createdAt}`);
        lines.push("", thought.content, "");
      }
    }
  }

  if (sections.has("habits")) {
    // Streaks/completion-rate are always all-time aggregate stats, unaffected by date range.
    const habits = await listHabits(false);
    if (habits.length > 0) {
      lines.push("## Habit Tracker Data", "");
      lines.push(`Total habits: ${habits.length}`, "");
      for (const habit of habits) {
        const percentage = (habit.completionRate * 100).toFixed(1);
        lines.push(
          `- **${habit.name}:** ${percentage}% completion, current streak ${habit.currentStreak} days, longest streak ${habit.longestStreak} days`,
        );
      }
      lines.push("");
    }
  }

  if (sections.has("files")) {
    const files = filterByDateRange(await listFiles(), fromIso, toIso);
    if (files.length > 0) {
      lines.push("## Files", "");
      lines.push(`Total files: ${files.length}`, "");
      for (const file of files) {
        const linkedEntry = file.journalEntryId ? await journalStore.get(file.journalEntryId) : undefined;
        let line = `- **${file.title}** (${file.filename}, ${file.size} bytes)`;
        if (file.description) line += ` — ${file.description}`;
        if (linkedEntry) line += ` — attached to journal entry "${linkedEntry.title}"`;
        lines.push(line);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function generateJson(
  sections: Set<ExportSection>,
  from: string | undefined,
  to: string | undefined,
  journalDetail: JournalDetail,
): Promise<string> {
  const { fromIso, toIso } = toDateTimeBounds(from, to);
  const data: Record<string, unknown> = {
    fileDescription: FILE_DESCRIPTION,
    exportDate: new Date().toISOString(),
    privacyNote: PRIVACY_NOTE,
  };

  if (sections.has("profile")) {
    data.profile = await getProfile();
    data.profileQuestions = await listProfileQuestions();
  }
  if (sections.has("journal")) {
    data.journalEntries = applyJournalDetail(
      await searchJournal({ limit: 500, from: fromIso, to: toIso }),
      journalDetail,
    );
  }
  if (sections.has("thoughts")) {
    data.thoughts = await listThoughts({ limit: 500, from: fromIso, to: toIso });
  }
  if (sections.has("habits")) {
    data.habits = await listHabits(false);
  }
  if (sections.has("files")) {
    data.files = filterByDateRange(await listFiles(), fromIso, toIso);
  }

  return JSON.stringify(data, null, 2);
}

async function generateCsv(sections: Set<ExportSection>, from?: string, to?: string): Promise<string> {
  if (!sections.has("habits")) {
    return "habitName,date,status,note\n";
  }

  const habits = await listHabits(false);
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]));
  const logs = (await habitLogStore.list()).filter(
    (log) => (!from || log.date >= from) && (!to || log.date <= to),
  );

  const rows = ["habitName,date,status,note"];
  for (const log of logs.sort((a, b) => a.date.localeCompare(b.date))) {
    const habit = habitsById.get(log.habitId);
    if (!habit) continue;
    const note = (log.note ?? "").replace(/"/g, '""');
    rows.push(`"${habit.name}",${log.date},${log.status},"${note}"`);
  }

  return rows.join("\n");
}

function filterByDateRange<T extends { createdAt: string }>(items: T[], fromIso?: string, toIso?: string): T[] {
  return items.filter((item) => (!fromIso || item.createdAt >= fromIso) && (!toIso || item.createdAt <= toIso));
}

/** Absolute path where the habits CSV snapshot is written on disk. */
function getHabitsCsvPath(): string {
  return path.join(getDataDir(), "habits.csv");
}

/** Generates the habits CSV and writes it to disk, returning both the content and its path. */
export async function exportHabitsCsvToDisk(): Promise<{ content: string; path: string }> {
  const { content } = await exportContext({ format: "csv", sections: ["habits"] });
  const filePath = getHabitsCsvPath();
  await writeFile(filePath, content, "utf-8");
  return { content, path: filePath };
}
