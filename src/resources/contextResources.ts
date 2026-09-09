import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportContext } from "../services/exportService.js";
import type { ExportSection } from "../services/exportService.js";

function registerMarkdownResource(
  server: McpServer,
  name: string,
  uri: string,
  title: string,
  description: string,
  sections: ExportSection[],
): void {
  server.registerResource(
    name,
    uri,
    { title, description, mimeType: "text/markdown" },
    async (url) => {
      const result = await exportContext({ format: "markdown", sections });
      return {
        contents: [{ uri: url.href, mimeType: "text/markdown", text: result.content }],
      };
    },
  );
}

export function registerContextResources(server: McpServer): void {
  registerMarkdownResource(
    server,
    "profile",
    "context://profile",
    "Profile",
    "The user's profile as Markdown.",
    ["profile"],
  );

  registerMarkdownResource(
    server,
    "habits",
    "context://habits",
    "Habits",
    "Summary of the user's active habits, streaks, and completion rates as Markdown.",
    ["habits"],
  );

  registerMarkdownResource(
    server,
    "journal-recent",
    "context://journal/recent",
    "Recent journal entries",
    "The user's most recent journal entries as Markdown.",
    ["journal"],
  );

  registerMarkdownResource(
    server,
    "thoughts-recent",
    "context://thoughts/recent",
    "Recent thoughts",
    "The user's most recent quick thoughts as Markdown.",
    ["thoughts"],
  );

  registerMarkdownResource(
    server,
    "files",
    "context://files",
    "Files",
    "List of uploaded files (title, description, filename, size, and any linked journal entry) as Markdown.",
    ["files"],
  );

  registerMarkdownResource(
    server,
    "export",
    "context://export",
    "Full personal context export",
    "The complete 'Personal Context Export': profile, journal, thoughts, habits, and files bundled as Markdown, intended as ambient context for AI tools. Contains personal information.",
    ["profile", "journal", "thoughts", "habits", "files"],
  );
}
