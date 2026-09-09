import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UploadFileSchema } from "../schemas/file.js";
import { deleteFile, getFileContent, isTextLike, listFiles, uploadFile } from "../services/fileService.js";
import { jsonResult } from "./toolResult.js";

export function registerFileTools(server: McpServer): void {
  server.registerTool(
    "upload_file",
    {
      title: "Upload file",
      description:
        "Save a file (base64-encoded content) with a title and optional description. Optionally link it to a journal entry via journalEntryId. Capped at 25MB.",
      inputSchema: UploadFileSchema.shape,
    },
    async (input) => jsonResult(await uploadFile(input)),
  );

  server.registerTool(
    "list_files",
    {
      title: "List files",
      description: "List uploaded files (metadata only), optionally filtered to those attached to one journal entry.",
      inputSchema: {
        journalEntryId: z.uuid().optional(),
      },
    },
    async ({ journalEntryId }) => jsonResult(await listFiles(journalEntryId)),
  );

  server.registerTool(
    "get_file",
    {
      title: "Get file",
      description:
        "Get a file's metadata. For text-like files (text/*, JSON, XML) the decoded content is included inline; other file types return metadata only, since binary content can't be usefully returned as text.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => {
      const result = await getFileContent(id);
      if (!result) return jsonResult(null);

      if (isTextLike(result.meta.mimeType)) {
        return jsonResult({ ...result.meta, content: result.buffer.toString("utf-8") });
      }
      return jsonResult({
        ...result.meta,
        content: null,
        note: `Binary file (${result.meta.mimeType}, ${result.meta.size} bytes) — download it from the web UI to view it.`,
      });
    },
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete file",
      description: "Delete an uploaded file and its metadata by id.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult({ deleted: await deleteFile(id) }),
  );
}
