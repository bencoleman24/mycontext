# Contributing

Issues and small, focused pull requests are the easiest to review.

## Setup

```bash
git clone https://github.com/bencoleman24/mycontext.git
cd mycontext
npm install
npm run build
```

Run the MCP server with `npm run dev` or the web UI with `npm run web`. Point `MYCONTEXT_DATA_DIR` at a scratch folder so development doesn't touch your real data:

```bash
MYCONTEXT_DATA_DIR=/tmp/mycontext-dev npm run web
```

[Architecture](docs/architecture.md) explains how the code is organized.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same checks on Node 20, 22, and 24.

## Project rules

These are easy to miss:

- **No new network calls.** Only the files listed in the README's [privacy section](README.md#privacy) may make network calls, and `test/noExternalNetworkCalls.test.ts` fails the build otherwise. If you think one is needed, open an issue first.
- **Treat AI apps equally.** mycontext isn't tied to one provider. List apps alphabetically, give each the same level of instructions, and don't make `npm run setup` change any app's settings.
- **Changing a data file's shape needs a migration.** Bump that file's `*_SCHEMA_VERSION` and add a migration, so existing data upgrades instead of breaking. See [schema versions](docs/data-model.md#schema-versions).
- **Write data through the stores.** Use a store's `update()` for anything that reads and then writes, so overlapping writes can't lose data.
- **Add tests** for behavior changes, and update the docs when users will notice the change.

## Personal data

Don't put real journal entries, habits, or profile data in issues, pull requests, tests, or screenshots. Use made-up examples.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.
