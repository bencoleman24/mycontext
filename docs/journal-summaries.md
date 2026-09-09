# Journal summaries

Journal entries drive most of the size of an export. A year of daily entries can run to hundreds of thousands of tokens, which is too large to hand an AI assistant as context.

Each entry can carry a `summary`. When exporting, you choose whether entries come through in full or as summaries.

## Writing a summary

Written directly, by you or an AI client:

- the "Write summary" control on any entry in the web UI
- `PUT /api/journal/:id/summary`
- `add_journal_entry`, which takes an optional `summary` when creating an entry
- `set_journal_summary`, afterward

Or generated with [Ollama](https://ollama.com), running locally:

- "Generate summary" on a single entry
- "Backfill summaries" for every entry missing one. Existing summaries are left alone, and each entry is handled separately, so one failure doesn't stop the run.

This needs Ollama running locally. Either `ollama pull llama3.2`, or point `MYCONTEXT_OLLAMA_MODEL` at a model you already have.

Nothing summarizes on its own — every summary comes from an explicit action.

## Using summaries in an export

In the Data tab, or with `export_context`'s `journalDetail` parameter, choose `"summary"` to replace each entry's content with its summary.

Entries without a summary render as `[no summary generated]` rather than falling back to full text, which keeps the export size predictable.

Editing an entry doesn't invalidate its summary. The generated-at date is shown next to it; regenerate manually if it matters.

## Scope

Entry-level summaries only. Weekly and monthly digests are deferred. See [`plans/journal-summarization.md`](plans/journal-summarization.md) for the design discussion and open questions.
