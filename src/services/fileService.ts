import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { nowIso } from "../lib/dates.js";
import { newId } from "../lib/ids.js";
import { MAX_FILE_BYTES, UploadFileSchema } from "../schemas/file.js";
import type { FileAttachment } from "../schemas/file.js";
import { fileStore, uploadsDir } from "../storage/stores.js";
import type { z } from "zod";

function sanitizeExtension(filename: string): string {
  const ext = path.extname(filename).slice(1).replace(/[^a-zA-Z0-9]/g, "");
  return ext.slice(0, 10);
}

export async function uploadFile(input: z.infer<typeof UploadFileSchema>): Promise<FileAttachment> {
  const buffer = Buffer.from(input.contentBase64, "base64");
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${buffer.length} bytes). The limit is ${MAX_FILE_BYTES} bytes (25MB).`,
    );
  }

  const ext = sanitizeExtension(input.filename);
  const storedName = ext ? `${newId()}.${ext}` : newId();

  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, storedName), buffer);

  const file: FileAttachment = {
    id: newId(),
    title: input.title,
    description: input.description,
    filename: input.filename,
    storedName,
    mimeType: input.mimeType,
    size: buffer.length,
    journalEntryId: input.journalEntryId,
    createdAt: nowIso(),
  };

  return fileStore.upsert(file);
}

export async function listFiles(journalEntryId?: string): Promise<FileAttachment[]> {
  const files = await fileStore.list();
  return files
    .filter((f) => (journalEntryId ? f.journalEntryId === journalEntryId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getFile(id: string): Promise<FileAttachment | undefined> {
  return fileStore.get(id);
}

export async function getFileContent(
  id: string,
): Promise<{ meta: FileAttachment; buffer: Buffer } | undefined> {
  const meta = await fileStore.get(id);
  if (!meta) return undefined;
  const buffer = await readFile(path.join(uploadsDir, meta.storedName));
  return { meta, buffer };
}

export async function deleteFile(id: string): Promise<boolean> {
  const meta = await fileStore.get(id);
  if (!meta) return false;

  try {
    await unlink(path.join(uploadsDir, meta.storedName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return fileStore.delete(id);
}

const TEXT_LIKE_MIME_PATTERN = /^text\/|^application\/(json|xml)$|\+(json|xml)$/;

export function isTextLike(mimeType: string): boolean {
  return TEXT_LIKE_MIME_PATTERN.test(mimeType);
}
