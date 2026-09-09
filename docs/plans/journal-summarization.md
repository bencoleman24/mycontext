# Feature plan: journal summarization

Status: **v1 implemented and verified working (2026-08-02)**, including a real end-to-end round-trip through Ollama. Captures the design discussion so it survives between sessions; see "What shipped" below for the as-built version and what's still deferred (digests, staleness handling, cloud backends, settings UI).

## Problem

Journal entries are the main driver of export bloat. Daily entries over months/years can push the "everything" export well past what's comfortable for an AI tool to ingest, undermining the export's actual purpose. Rough math: ~600 tokens/entry × a year of daily journaling ≈ 200K tokens from journal alone, before anything else in the export.

## Requirements

**Functional**
- Optional `summary` per journal entry. Feature is off by default, opt-in.
- Summarization backend is pluggable/interchangeable, not hardcoded to one provider or model.
- Backfill: generate summaries for historical entries that predate the feature.
- Export gains a detail-level control: full text vs. entry-summaries, likely with a hybrid mode (full text for the last N days, summarized beyond that).
- Nothing summarizes silently — every summary is the result of an explicit action (manual write, on-demand generate, or backfill run), never a background job the user didn't ask for.

**Non-functional**
- Zero new required dependency for users who never enable this — stays true to the project's current zero-runtime-dependency footprint until opted in.
- Local backend must not phone home — no network call unless the user explicitly configures a cloud backend.
- Same architectural pattern as everything else in this project: schema → storage → service → API route → MCP tool → web UI.
- Fully backward-compatible: existing entries with no `summary` field behave exactly as they do today.

## Architecture

**Two backend *shapes*, not one interface** — this is the trickiest part.
- **Push-based**: the calling AI (or the user, by hand) writes the summary directly — via an optional `summary` argument on `add_journal_entry`, or a dedicated `set_journal_summary(id, summary)` tool/route. Zero dependency, but can't be backfilled automatically — nothing to "call," a human/AI has to actually produce it.
- **Pull-based**: the server calls out itself to generate one — realistically a local model over Ollama's HTTP API (`localhost:11434`, no bundled weights, user installs Ollama and pulls a model themselves). This is what backfill and an on-demand "generate summary" action actually invoke. A cloud API backend could be added later as an explicitly opt-in extra, never a default.

A single `Summarizer` interface (`summarize(text) → string`) covers the pull-based backends (and can model "manual" as a no-op for UI consistency), but the push case doesn't fit that interface — it's just a field on the write call, not something the server invokes.

**Data model additions**
- `JournalEntry` gains: `summary?: string`, `summaryBackend?: string`, `summaryGeneratedAt?: string`. The backend/timestamp metadata matters because the backend is interchangeable — worth knowing what generated a given summary, especially after swapping models over time.
- New config surface (new `settings.json`, or extend existing config) for: enabled flag, selected backend, backend-specific config (e.g. Ollama base URL + model name). Never store API keys directly in the JSON store — reference an env var instead if a cloud backend is ever added.

**Export integration**: `exportContext` gains something like `journalDetail: "full" | "summary"`, plus optionally a `recentDaysFull` option for the hybrid mode.

## Decisions from discussion (2026-08-01)

1. **Trigger timing**: on-demand / lazy generation for v1 — not automatic on every journal save (avoids adding latency, e.g. an Ollama call, to every write).
2. **Scope**: journal entries only for v1. Thoughts are already short; files aren't really summarizable content in most cases.
3. **Digest generation trigger** (weekly/monthly rollups): out of scope for v1. This app has no scheduler/cron today, and adding one just for automatic digests is a bigger lift than anything else in this plan. If digests are built later, they should stay manual/on-demand ("generate this week's digest"), not automatic.
4. **Digest inputs** (summarize full entries vs. summarize entry-summaries): **still undecided.** Deferred along with digests themselves — not a v1 concern, but worth resolving before digests are built, since it affects quality vs. cost tradeoffs.
5. **Staleness** (summary going stale after an entry edit): not handled in v1. No auto-invalidation, no flagging — just show the summary's generated-at date next to the entry and let the user manually regenerate later if this becomes annoying in practice.
6. **Config UI location** (web UI settings panel vs. config-file/env-var only): not decided, low priority — can start config-file-only and move to the web UI later without much rework, since it's just where the same settings get edited.

## What shipped

- **Schema** (`src/schemas/journal.ts`): `JournalEntry` gains `summary?`, `summaryBackend?`, `summaryGeneratedAt?`. `AddJournalEntrySchema` gains an optional `summary` (the push path at creation time).
- **Summarizer interface** (`src/lib/summarizer.ts`): a `Summarizer { id, summarize(text) }` interface with one implementation, `OllamaSummarizer`, calling `POST {baseUrl}/api/generate` (`stream: false`) via the global `fetch`. `getSummarizer()` is the factory services call by default; it's an injectable param on every service function that needs one, so tests pass a fake and never hit the network.
- **Config** (`src/config.ts`): `MYCONTEXT_OLLAMA_BASE_URL` (default `http://localhost:11434`) and `MYCONTEXT_OLLAMA_MODEL` (default `llama3.2`), following the project's existing env-var-only config convention — no settings.json was added.
- **Service** (`src/services/journalService.ts`): `setJournalSummary` (push), `generateJournalSummary` (pull, always overwrites), `backfillJournalSummaries` (pull over every entry missing a summary; per-entry try/catch so one Ollama failure doesn't abort the run — returns `{ processed, skipped, errors }`).
- **MCP tools** (`src/tools/journalTools.ts`): `set_journal_summary`, `generate_journal_summary`, `backfill_journal_summaries`; `add_journal_entry` accepts the new `summary` field for free via the schema.
- **Web API** (`src/web/api.ts`): `PUT /api/journal/:id/summary`, `POST /api/journal/:id/summary/generate`, `POST /api/journal/summaries/backfill`.
- **Export** (`src/services/exportService.ts`, `src/tools/exportTools.ts`): `journalDetail: "full" | "summary"` on both `exportContext`/`ExportRequestSchema` and the `export_context` MCP tool. In summary mode, entries with no summary render `[no summary generated]` rather than silently falling back to full text.
- **Web UI**: each journal entry shows its summary (with generated-at date + backend) if present, a "Generate summary"/"Regenerate summary" button, and a "Write summary"/"Edit summary" disclosure for manual entry — same pattern as the existing "Attach file" disclosure. A page-level "Backfill summaries" button reports processed/skipped/error counts. The Data tab gained a "Journal detail" chip-select (Full text / Summaries), shown only when Journal is among the selected export sections.
- Verified with a real Ollama instance (not just the "Ollama unreachable" error path) — generate and backfill both round-trip correctly end-to-end.

Explicitly **not** in v1: digests/rollups, staleness handling, cloud backends, a settings UI (config stays env-var only for now).

## Resolved during implementation

- **`Summarizer` interface shape**: `{ id: string; summarize(text: string): Promise<string> }`, one method, no extra config baked into the interface itself — each implementation reads its own config (e.g. `OllamaSummarizer` reads the two env vars above).
- **Backend config location**: env vars, matching the project's existing `MYCONTEXT_*` convention. No settings.json was needed.
- **`summaryBackend`/`summaryGeneratedAt` surfaced in the UI**: yes — shown next to each entry's summary (e.g. "Summary (Aug 2, 2026, manual)"), since it's cheap to show and useful once more than one backend exists.

## Still open (for whenever digests get picked up)

- Digest inputs (full entries vs. summaries-of-summaries) — deferred along with digests themselves, not resolved by v1.
