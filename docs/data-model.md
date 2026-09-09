# Data model

Everything lives in `~/.mycontext/`, or wherever `MYCONTEXT_DATA_DIR` points. The files are plain formatted JSON.

## Files

| File | Contents |
|---|---|
| `profile.json` | Name, age, location, occupation, bio, goals, challenges |
| `profile-questions.json` | Custom questions (free-text or multiple-choice) and their answers |
| `habits.json` | Habits, each with a daily/weekly/monthly frequency and an archived flag |
| `habit-logs.json` | Per-period `Y` (completed) / `N` (not completed) / `NA` (not applicable) entries |
| `journal.json` | Entries with tags, mood, entry type, and an optional summary |
| `thoughts.json` | Short free-form notes |
| `files.json` | File metadata: title, description, filename, size, MIME type, linked journal entry |
| `uploads/` | The uploaded files themselves, under server-generated names |

Streaks and completion rates aren't stored. They're computed from the logs on every read.

## Habit periods

A habit's period depends on its frequency:

| Frequency | Period |
|---|---|
| `daily` | A calendar day |
| `weekly` | An ISO week, starting Monday |
| `monthly` | A calendar month |

Rules:

- Multiple check-ins in one period collapse to a single `Y`/`N`/`NA` entry. Logging twice on Tuesday doesn't create two records.
- Dates come from the machine's local timezone, not UTC. Under UTC, an evening check-in would land on the wrong day for anyone west of it.
- Streaks count completed periods only, so the current period is excluded until it's over. Logging today doesn't increment the streak.
- `N` breaks a streak. `NA` means the habit didn't apply that period, and neither extends nor breaks it.

Because of the third rule, the [web UI](web-ui.md) shows each habit's frequency rather than its streak on the Home page — tapping `Y` wouldn't move the number.

## Schema versions

Every data file is written with a `schemaVersion`:

```json
{
  "schemaVersion": 1,
  "items": [ ... ]
}
```

On read:

- A file older than the current version runs through its migrations and is written back upgraded.
- A file with no `schemaVersion` predates this and is treated as version 0.
- A file newer than the build understands is left alone and an error is raised. Update the app instead.
- A version gap with no registered migration raises an error rather than guessing.

Each data type declares its version as a `*_SCHEMA_VERSION` constant next to its schema in `src/schemas/`. All are at version 1.

Implementation is in `src/storage/jsonFileStore.ts`, with tests in `test/storage/jsonFileStore.test.ts`.

## Configuration

Configuration is environment variables only. Copy `.env.example` to `.env` to start.

| Variable | Default | Purpose |
|---|---|---|
| `MYCONTEXT_DATA_DIR` | `~/.mycontext` | Where your data lives |
| `MYCONTEXT_WEB_PORT` | `4823` | Web UI port |
| `MYCONTEXT_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint for [summaries](journal-summaries.md) |
| `MYCONTEXT_OLLAMA_MODEL` | `llama3.2` | Model used for summaries |

Pointing `MYCONTEXT_DATA_DIR` somewhere else is how you keep separate data sets, such as a real one and a demo one.
