#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getWebPort } from "../config.js";
import { getFileContent } from "../services/fileService.js";
import { handleApi } from "./api.js";

const publicDir = join(fileURLToPath(new URL(".", import.meta.url)), "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

// 25MB file cap, base64-expanded (~4/3), plus headroom for the other JSON fields.
const MAX_REQUEST_BODY_BYTES = 34 * 1024 * 1024;

class RequestTooLargeError extends Error {}

async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new RequestTooLargeError("Request body exceeds the maximum allowed size.");
    }
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n"]/g, "");
}

async function serveStatic(pathname: string): Promise<{ contents: Buffer; mime: string } | null> {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = normalize(join(publicDir, relative));
  if (!filePath.startsWith(publicDir)) return null; // guard against path traversal

  try {
    const contents = await readFile(filePath);
    return { contents, mime: MIME_TYPES[extname(filePath)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    const segments = url.pathname.slice("/api/".length).split("/").filter(Boolean);

    // GET /api/files/:id/download — the one binary exception to the JSON-only API.
    if (segments.length === 3 && segments[0] === "files" && segments[2] === "download" && req.method === "GET") {
      const result = await getFileContent(segments[1]);
      if (!result) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": result.meta.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${sanitizeHeaderValue(result.meta.filename)}"`,
        "Content-Length": result.buffer.length,
      });
      res.end(result.buffer);
      return;
    }

    let body: unknown;
    try {
      body = ["POST", "PUT", "PATCH"].includes(req.method ?? "") ? await readJsonBody(req) : undefined;
    } catch (err) {
      const status = err instanceof RequestTooLargeError ? 413 : 400;
      const message = err instanceof RequestTooLargeError ? err.message : "Invalid JSON body";
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
      return;
    }

    const result = await handleApi({
      method: req.method ?? "GET",
      segments,
      searchParams: url.searchParams,
      body,
    });
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body));
    return;
  }

  const asset = await serveStatic(url.pathname);
  if (asset) {
    res.writeHead(200, { "Content-Type": asset.mime });
    res.end(asset.contents);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const port = getWebPort();
server.listen(port, "127.0.0.1", () => {
  console.log(`mycontext web UI running at http://127.0.0.1:${port}`);
});
