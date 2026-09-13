# MCP tools and resources

30 tools and 6 resources, operating on the same `~/.mycontext/` files as the [web UI](web-ui.md).

## Tools

### Profile

| Tool | Description |
|---|---|
| `get_profile` | Read the profile |
| `update_profile` | Update profile fields |
| `list_profile_questions` | List custom questions and their answers |
| `create_profile_question` | Add a free-text or multiple-choice question |
| `answer_profile_question` | Answer a question |
| `delete_profile_question` | Delete a question and its answer |
| `add_profile_question_option` | Add an option to a multiple-choice question |
| `remove_profile_question_option` | Remove an option |

### Habits

| Tool | Description |
|---|---|
| `list_habits` | Active habits with streaks, completion rates, and current-period status |
| `create_habit` | Create a habit with a daily/weekly/monthly frequency |
| `log_habit_completion` | Log `Y`/`N`/`NA` for a date, with an optional note |
| `get_habit_history` | Full log history for one habit |
| `archive_habit` | Hide a habit without losing its history |
| `unarchive_habit` | Restore an archived habit |
| `delete_habit` | Permanently delete a habit and its entire log |

Streak and completion rules are in [habit periods](data-model.md#habit-periods).

### Journal

| Tool | Description |
|---|---|
| `add_journal_entry` | Add an entry (accepts an optional `summary` at creation time) |
| `update_journal_entry` | Edit an existing entry |
| `delete_journal_entry` | Delete an entry |
| `search_journal` | Search by free text, tags, mood, and date range |
| `set_journal_summary` | Write a summary directly |
| `generate_journal_summary` | Generate one locally via Ollama |
| `backfill_journal_summaries` | Generate summaries for every entry missing one |

See [journal summaries](journal-summaries.md) for how the summary field works.

### Thoughts

| Tool | Description |
|---|---|
| `add_thought` | Save a quick note |
| `list_thoughts` | List thoughts, optionally by date range |
| `delete_thought` | Delete a thought |

### Files

| Tool | Description |
|---|---|
| `upload_file` | Upload a file (base64), optionally linked to a journal entry. 25MB cap. |
| `list_files` | List file metadata, optionally filtered by linked entry |
| `get_file` | Fetch one file's metadata and contents |
| `delete_file` | Delete a file and its metadata |

### Export

| Tool | Description |
|---|---|
| `export_context` | Generate the full Personal Context Export |

Parameters:

- `format` — `"markdown"`, `"json"`, or `"csv"` (CSV is habit logs only)
- `sections` — any of `profile`, `journal`, `thoughts`, `habits`, `files`
- `from` / `to` — inclusive `YYYY-MM-DD` bounds. Scopes journal, thoughts, files, and habit-log rows. The profile section and habit summary stats are always all-time.
- `journalDetail` — `"full"` or `"summary"`

## Resources

Resources are read-only and return Markdown.

| URI | Contents |
|---|---|
| `context://profile` | Profile as Markdown |
| `context://habits` | Active habits, streaks, and completion rates |
| `context://journal/recent` | Recent journal entries |
| `context://thoughts/recent` | Recent thoughts |
| `context://files` | Uploaded file list (title, description, filename, size, linked entry) |
| `context://export` | The full context bundle, same content as `export_context` |

## Testing without a chat client

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) runs the server directly:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Or in CLI mode, for scripting:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

## Connect an app

mycontext is a local MCP server: your AI app starts it on your computer. Any app that supports local (stdio) MCP servers can use it, and `npm run setup` prints these instructions with your path filled in.

Every app needs the same two things: the command `node`, and the path to `dist/index.js` in your clone. Replace `/absolute/path/to/mycontext` below with yours. Apps are listed alphabetically.

### ChatGPT desktop app and Codex CLI

Add this to `~/.codex/config.toml`, which the desktop app and CLI share:

```toml
[mcp_servers.mycontext]
command = "node"
args = ["/absolute/path/to/mycontext/dist/index.js"]
```

Or, with the Codex CLI installed:

```bash
codex mcp add mycontext -- node /absolute/path/to/mycontext/dist/index.js
```

Then restart the ChatGPT desktop app. MCP servers need a recent version of the app.

### Claude Code

```bash
claude mcp add --transport stdio mycontext -- node /absolute/path/to/mycontext/dist/index.js
```

### Claude Desktop

Quit the app, then add this to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "mycontext": {
      "command": "node",
      "args": ["/absolute/path/to/mycontext/dist/index.js"]
    }
  }
}
```

The app rewrites that file while it's running, so edit it only while the app is closed. Then reopen it.

### Cursor

Add this to `~/.cursor/mcp.json`, then restart Cursor:

```json
{
  "mcpServers": {
    "mycontext": {
      "command": "node",
      "args": ["/absolute/path/to/mycontext/dist/index.js"]
    }
  }
}
```

### Gemini CLI

```bash
gemini mcp add --scope user mycontext node /absolute/path/to/mycontext/dist/index.js
```

### VS Code (GitHub Copilot)

```bash
code --add-mcp '{"name":"mycontext","command":"node","args":["/absolute/path/to/mycontext/dist/index.js"]}'
```

Or run **MCP: Open User Configuration** in VS Code and add this under `"servers"`:

```json
{
  "servers": {
    "mycontext": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mycontext/dist/index.js"]
    }
  }
}
```

VS Code asks you to confirm you trust the server before it starts.

### Web and mobile chat apps

ChatGPT, Claude, and Gemini on the web or on a phone only connect to MCP servers hosted on the internet, if at all, so they can't reach mycontext. Export your data from the web UI's Data page and paste it into the chat instead.

### If the app shows mycontext as disconnected

- The app may not find `node`. Use the full path from `which node` (macOS and Linux) or `where node` (Windows) as the command.
- On macOS, don't keep the clone in a Desktop or Documents folder synced with iCloud. macOS can move those files to iCloud to save space, and the server fails to start when it can't read them.
