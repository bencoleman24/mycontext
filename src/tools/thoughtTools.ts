import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AddThoughtSchema, ListThoughtsSchema } from "../schemas/thought.js";
import { addThought, deleteThought, listThoughts } from "../services/thoughtService.js";
import { jsonResult } from "./toolResult.js";

export function registerThoughtTools(server: McpServer): void {
  server.registerTool(
    "add_thought",
    {
      title: "Add thought",
      description: "Save a quick, free-form thought or note.",
      inputSchema: AddThoughtSchema.shape,
    },
    async (input) => jsonResult(await addThought(input)),
  );

  server.registerTool(
    "list_thoughts",
    {
      title: "List thoughts",
      description: "List saved quick thoughts, newest first, optionally within a date range.",
      inputSchema: ListThoughtsSchema.shape,
    },
    async (input) => jsonResult(await listThoughts(input)),
  );

  server.registerTool(
    "delete_thought",
    {
      title: "Delete thought",
      description: "Delete a saved thought by id.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult({ deleted: await deleteThought(id) }),
  );
}
