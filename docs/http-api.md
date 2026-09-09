# HTTP API

The [web UI](web-ui.md) runs on a local JSON API, so anything it can do can also be scripted.

Base URL: `http://127.0.0.1:4823` (override the port with `MYCONTEXT_WEB_PORT`). Bound to localhost only.

Requests and responses are JSON. The one exception is `GET /api/files/:id/download`, which returns raw bytes.

## Routes

### Profile

| Route | Methods | Notes |
|---|---|---|
| `/api/profile` | `GET`, `PUT` | |
| `/api/profile/path` | `GET` | Absolute path to `profile.json` on disk |
| `/api/profile-questions` | `GET`, `POST` | |
| `/api/profile-questions/:id` | `PATCH`, `DELETE` | `PATCH` sets the answer |
| `/api/profile-questions/:id/options` | `POST`, `DELETE` | `DELETE` takes `?option=` |

### Habits

| Route | Methods | Notes |
|---|---|---|
| `/api/habits` | `GET`, `POST` | `GET` takes `?includeArchived=true` |
| `/api/habits/csv` | `GET` | Raw `habitName,date,status,note` |
| `/api/habits/:id` | `PATCH`, `DELETE` | `PATCH` sets `archived` |
| `/api/habits/:id/log` | `POST` | |
| `/api/habits/:id/history` | `GET` | |

### Journal

| Route | Methods |
|---|---|
| `/api/journal` | `GET`, `POST` |
| `/api/journal/:id` | `PATCH`, `DELETE` |
| `/api/journal/:id/summary` | `PUT` |
| `/api/journal/:id/summary/generate` | `POST` |
| `/api/journal/summaries/backfill` | `POST` |

### Thoughts, files, export

| Route | Methods | Notes |
|---|---|---|
| `/api/thoughts` | `GET`, `POST` | |
| `/api/thoughts/:id` | `DELETE` | |
| `/api/files` | `GET`, `POST` | `GET` takes `?journalEntryId=` |
| `/api/files/:id` | `GET`, `DELETE` | |
| `/api/files/:id/download` | `GET` | Raw bytes, not JSON |
| `/api/export` | `POST` | Same options as the `export_context` tool |

## Examples

Log a habit:

```bash
curl -X POST http://127.0.0.1:4823/api/habits/HABIT_ID/log \
  -H 'Content-Type: application/json' \
  -d '{"status":"Y"}'
```

Generate a Markdown export for a date range:

```bash
curl -X POST http://127.0.0.1:4823/api/export \
  -H 'Content-Type: application/json' \
  -d '{"format":"markdown","from":"2026-07-01","to":"2026-07-31"}'
```

Writes go through the same schemas and service layer as the MCP tools, so a malformed request is rejected rather than saved.
