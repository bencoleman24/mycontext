import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AddJournalEntrySchema, SearchJournalSchema, UpdateJournalEntrySchema } from "../schemas/journal.js";
import {
  addJournalEntry,
  backfillJournalSummaries,
  deleteJournalEntry,
  generateJournalSummary,
  searchJournal,
  setJournalSummary,
  updateJournalEntry,
} from "../services/journalService.js";
import { jsonResult } from "./toolResult.js";

export function registerJournalTools(server: McpServer): void {
  server.registerTool(
    "add_journal_entry",
    {
      title: "Add journal entry",
      description:
        "Add a new journal entry (title, content, optional tags/mood/entry type). You can optionally include a `summary` you've written yourself, which will be used by exports in summary mode instead of the full content.",
      inputSchema: AddJournalEntrySchema.shape,
    },
    async (input) => jsonResult(await addJournalEntry(input)),
  );

  server.registerTool(
    "search_journal",
    {
      title: "Search journal",
      description:
        "Search journal entries by free-text query, tags, mood, and/or date range. Returns matches newest-first.",
      inputSchema: SearchJournalSchema.shape,
    },
    async (input) => jsonResult(await searchJournal(input)),
  );

  server.registerTool(
    "update_journal_entry",
    {
      title: "Update journal entry",
      description: "Update one or more fields of an existing journal entry by id.",
      inputSchema: UpdateJournalEntrySchema.shape,
    },
    async (input) => jsonResult(await updateJournalEntry(input)),
  );

  server.registerTool(
    "delete_journal_entry",
    {
      title: "Delete journal entry",
      description: "Delete a journal entry by id.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult({ deleted: await deleteJournalEntry(id) }),
  );

  server.registerTool(
    "set_journal_summary",
    {
      title: "Set journal entry summary",
      description:
        "Write or overwrite the summary for a journal entry yourself (e.g. after reading the full entry). Used by exports in summary mode instead of the full content.",
      inputSchema: { id: z.uuid(), summary: z.string().min(1) },
    },
    async ({ id, summary }) => jsonResult(await setJournalSummary(id, summary, "manual")),
  );

  server.registerTool(
    "generate_journal_summary",
    {
      title: "Generate journal entry summary",
      description:
        "Generate a summary for a journal entry using the configured local summarization backend (Ollama by default). Overwrites any existing summary. Requires Ollama to be running locally.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult(await generateJournalSummary(id)),
  );

  server.registerTool(
    "backfill_journal_summaries",
    {
      title: "Backfill journal summaries",
      description:
        "Generate summaries for every journal entry that doesn't have one yet, using the configured local summarization backend. Entries that already have a summary are left untouched. Returns counts of processed/skipped entries and any per-entry errors.",
      inputSchema: {},
    },
    async () => jsonResult(await backfillJournalSummaries()),
  );
}
