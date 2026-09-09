import { z } from "zod";

export const JournalEntrySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  tags: z.array(z.string()).default([]),
  mood: z.string().optional(),
  entryType: z.string().optional(),
  summary: z.string().optional(),
  summaryBackend: z.string().optional(),
  summaryGeneratedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JOURNAL_SCHEMA_VERSION = 1;

export const JournalFileSchema = z.object({
  items: z.array(JournalEntrySchema).default([]),
});

export type JournalFile = z.infer<typeof JournalFileSchema>;

export const AddJournalEntrySchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  tags: z.array(z.string()).optional(),
  mood: z.string().optional(),
  entryType: z.string().optional(),
  summary: z.string().optional(),
});

export const UpdateJournalEntrySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
  tags: z.array(z.string()).optional(),
  mood: z.string().optional(),
  entryType: z.string().optional(),
});

export const SetJournalSummarySchema = z.object({
  summary: z.string().min(1),
});

export const SearchJournalSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mood: z.string().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.number().int().positive().max(500).default(50),
});
