# Web UI

```bash
npm run web
```

Serves at `http://127.0.0.1:4823`, bound to localhost only. Override the port with `MYCONTEXT_WEB_PORT`.

It reads and writes the same `~/.mycontext/*.json` files as the MCP server, so anything logged here is visible to your AI assistant, and anything the assistant writes shows up here on the next load.

Sections: Home, Profile, Habits, Journal, Thoughts, Files, and Data.

A few things that aren't obvious from the UI:

- Home shows each habit's frequency rather than its streak. Streaks only count completed periods, so tapping today wouldn't change the number. See [habit periods](data-model.md#habit-periods).
- Archiving a habit hides it but keeps its history. Deleting removes the habit and its entire log.
- Profile ships with a starting set of custom questions carried over from DataU. They're a starting point, not a fixed schema — delete any you don't want, or add your own.
- Files are capped at 25MB. They go to `~/.mycontext/uploads/` under a server-generated name.
- Data generates the Personal Context Export, the same output as the `export_context` MCP tool. Date ranges don't apply to the profile section or habit stats, which are always all-time.
- Profile and Habits have panels showing the raw JSON and CSV, with the on-disk path of each file.

## Implementation

A single static page in `src/web/public/` — plain HTML, CSS, and one `app.js`, with no build step or framework. It talks to a local JSON API, so anything the UI does can also be scripted. See [HTTP API](http-api.md).

Fonts are [IBM Plex Mono](https://github.com/IBM/plex), self-hosted under `src/web/public/fonts/` (SIL OFL 1.1). Nothing is fetched from a CDN.
