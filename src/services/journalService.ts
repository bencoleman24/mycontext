import { nowIso, rangeEndIso, rangeStartIso } from "../lib/dates.js";
import { newId } from "../lib/ids.js";
import { getSummarizer } from "../lib/summarizer.js";
import type { Summarizer } from "../lib/summarizer.js";
import { AddJournalEntrySchema, SearchJournalSchema, UpdateJournalEntrySchema } from "../schemas/journal.js";
import type { JournalEntry } from "../schemas/journal.js";
import { journalStore } from "../storage/stores.js";
import type { z } from "zod";

export async function addJournalEntry(
  input: z.infer<typeof AddJournalEntrySchema>,
): Promise<JournalEntry> {
  const now = nowIso();
  const entry: JournalEntry = {
    id: newId(),
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    mood: input.mood,
    entryType: input.entryType,
    summary: input.summary,
    summaryBackend: input.summary ? "manual" : undefined,
    summaryGeneratedAt: input.summary ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };
  return journalStore.upsert(entry);
}

export async function updateJournalEntry(
  input: z.infer<typeof UpdateJournalEntrySchema>,
): Promise<JournalEntry> {
  return journalStore.update((entries) => {
    const index = entries.findIndex((entry) => entry.id === input.id);
    if (index < 0) {
      throw new Error(`No journal entry found with id ${input.id}`);
    }
    const existing = entries[index];
    entries[index] = {
      ...existing,
      title: input.title ?? existing.title,
      content: input.content ?? existing.content,
      tags: input.tags ?? existing.tags,
      mood: input.mood ?? existing.mood,
      entryType: input.entryType ?? existing.entryType,
      updatedAt: nowIso(),
    };
    return entries[index];
  });
}

export async function deleteJournalEntry(id: string): Promise<boolean> {
  return journalStore.delete(id);
}

export async function searchJournal(
  input: z.infer<typeof SearchJournalSchema>,
): Promise<JournalEntry[]> {
  const entries = await journalStore.list();
  const query = input.query?.toLowerCase();
  const from = input.from ? rangeStartIso(input.from) : undefined;
  const to = input.to ? rangeEndIso(input.to) : undefined;

  const matches = entries.filter((entry) => {
    if (from && entry.createdAt < from) return false;
    if (to && entry.createdAt > to) return false;
    if (input.mood && entry.mood !== input.mood) return false;
    if (input.tags && input.tags.length > 0) {
      const hasAllTags = input.tags.every((tag) => entry.tags.includes(tag));
      if (!hasAllTags) return false;
    }
    if (query) {
      const haystack = `${entry.title} ${entry.content} ${entry.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return matches
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit);
}

export async function setJournalSummary(
  id: string,
  summary: string,
  backend: string,
): Promise<JournalEntry> {
  return journalStore.update((entries) => {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw new Error(`No journal entry found with id ${id}`);
    }
    entries[index] = {
      ...entries[index],
      summary,
      summaryBackend: backend,
      summaryGeneratedAt: nowIso(),
    };
    return entries[index];
  });
}

export async function generateJournalSummary(
  id: string,
  summarizer: Summarizer = getSummarizer(),
): Promise<JournalEntry> {
  const existing = await journalStore.get(id);
  if (!existing) {
    throw new Error(`No journal entry found with id ${id}`);
  }

  const summary = await summarizer.summarize(existing.content);
  return setJournalSummary(id, summary, summarizer.id);
}

export interface BackfillJournalSummariesResult {
  processed: number;
  skipped: number;
  errors: { id: string; message: string }[];
}

export async function backfillJournalSummaries(
  summarizer: Summarizer = getSummarizer(),
): Promise<BackfillJournalSummariesResult> {
  const entries = await journalStore.list();
  const result: BackfillJournalSummariesResult = { processed: 0, skipped: 0, errors: [] };

  for (const entry of entries) {
    if (entry.summary) {
      result.skipped += 1;
      continue;
    }
    try {
      await generateJournalSummary(entry.id, summarizer);
      result.processed += 1;
    } catch (err) {
      result.errors.push({ id: entry.id, message: (err as Error).message });
    }
  }

  return result;
}
