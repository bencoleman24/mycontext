import { z } from "zod";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const FileAttachmentSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  filename: z.string(),
  storedName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  journalEntryId: z.uuid().optional(),
  createdAt: z.iso.datetime(),
});

export type FileAttachment = z.infer<typeof FileAttachmentSchema>;

export const FILES_SCHEMA_VERSION = 1;

export const FilesFileSchema = z.object({
  items: z.array(FileAttachmentSchema).default([]),
});

export type FilesFile = z.infer<typeof FilesFileSchema>;

export const UploadFileSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
  journalEntryId: z.uuid().optional(),
});
