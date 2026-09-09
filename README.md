# mycontext

**Own the context your AI assistant reads.**

[![CI](https://github.com/bencoleman24/mycontext/actions/workflows/ci.yml/badge.svg)](https://github.com/bencoleman24/mycontext/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local environment to collect, manage, and own your personal data.

Includes:

- a local workflow for personal data management
- an MCP server, so your AI assistant reads and writes the data directly
- plain JSON files you can read without this app, and export as Markdown, JSON, or CSV

<!-- TODO: screenshot of the web UI goes here -->

## Why mycontext

Most AI assistants today keep their memory of you on their own servers. That makes it harder to switch providers, and gives them a lot of control over your data. I think this issue will be exacerbated as AI becomes more integrated with our day to day life. I think it's worth keeping/maintaining a personal collection of data that you fully own.

mycontext keeps that data in plain files on your machine and this project contains tools to help you manage and utilize this data.


## Quickstart

```bash
git clone https://github.com/bencoleman24/mycontext.git
cd mycontext
npm install
npm run setup
```

`npm run setup` builds the project and registers `mycontext` with the `claude` CLI (if it's on your `PATH`) and with Claude Desktop (if its config file exists). Existing config is kept and backed up first. If it finds no client, it prints the config for you to add by hand. See [manual registration](docs/mcp.md#registration).

Then start the web UI:

```bash
npm run web
```

It opens at `http://127.0.0.1:4823`.

## Documentation

| | |
|---|---|
| [Web UI](docs/web-ui.md) | The web app |
| [MCP tools and resources](docs/mcp.md) | What an AI client can read and write |
| [Data model](docs/data-model.md) | Files on disk, habit rules, schema versions, configuration |
| [Journal summaries](docs/journal-summaries.md) | Summarizing entries to keep exports small |
| [HTTP API](docs/http-api.md) | Routes for scripting |
| [Architecture](docs/architecture.md) | How the code is organized |

## Privacy

Your data stays on your machine. No telemetry, no cloud sync, no external network calls. The web UI binds to local host only.

Two files in the codebase can make network calls:

- [`src/lib/summarizer.ts`](src/lib/summarizer.ts) — calls Ollama on `localhost`, ONLY when you ask for a summary
- [`src/web/public/app.js`](src/web/public/app.js) — the web UI calling its own backend on `127.0.0.1`


## License

MIT
