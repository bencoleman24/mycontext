import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let dataDir: string;
let fileService: typeof import("../../src/services/fileService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  dataDir = temp.dataDir;
  cleanup = temp.cleanup;
  fileService = await import("../../src/services/fileService.js");
});

afterEach(async () => {
  await cleanup();
});

function base64Of(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

describe("fileService", () => {
  it("uploads a file, writing bytes to disk and metadata that round-trips", async () => {
    const content = "hello from a test file";
    const uploaded = await fileService.uploadFile({
      title: "Test note",
      description: "A small text file",
      filename: "note.txt",
      mimeType: "text/plain",
      contentBase64: base64Of(content),
    });

    expect(uploaded.size).toBe(Buffer.byteLength(content));
    expect(uploaded.storedName).toMatch(/\.txt$/);

    const onDisk = await readFile(path.join(dataDir, "uploads", uploaded.storedName), "utf-8");
    expect(onDisk).toBe(content);

    const fetched = await fileService.getFile(uploaded.id);
    expect(fetched).toEqual(uploaded);

    const listed = await fileService.listFiles();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(uploaded.id);
  });

  it("rejects a payload over the size cap", async () => {
    const oversized = Buffer.alloc(26 * 1024 * 1024, "a").toString("base64");
    await expect(
      fileService.uploadFile({
        title: "Too big",
        filename: "big.bin",
        mimeType: "application/octet-stream",
        contentBase64: oversized,
      }),
    ).rejects.toThrow(/too large/i);
  });

  it("deletes both the metadata entry and the on-disk file", async () => {
    const uploaded = await fileService.uploadFile({
      title: "Deletable",
      filename: "gone.txt",
      mimeType: "text/plain",
      contentBase64: base64Of("bye"),
    });

    const storedPath = path.join(dataDir, "uploads", uploaded.storedName);
    await expect(access(storedPath)).resolves.toBeUndefined();

    const deleted = await fileService.deleteFile(uploaded.id);
    expect(deleted).toBe(true);

    await expect(access(storedPath)).rejects.toThrow();
    expect(await fileService.getFile(uploaded.id)).toBeUndefined();
  });

  it("filters listFiles by journalEntryId", async () => {
    const journalEntryId = "11111111-1111-4111-8111-111111111111";
    const attached = await fileService.uploadFile({
      title: "Attached",
      filename: "a.txt",
      mimeType: "text/plain",
      contentBase64: base64Of("a"),
      journalEntryId,
    });
    await fileService.uploadFile({
      title: "Standalone",
      filename: "b.txt",
      mimeType: "text/plain",
      contentBase64: base64Of("b"),
    });

    const filtered = await fileService.listFiles(journalEntryId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(attached.id);
  });

  it("classifies text-like vs binary mime types", () => {
    expect(fileService.isTextLike("text/plain")).toBe(true);
    expect(fileService.isTextLike("application/json")).toBe(true);
    expect(fileService.isTextLike("application/xml")).toBe(true);
    expect(fileService.isTextLike("image/svg+xml")).toBe(true);
    expect(fileService.isTextLike("image/png")).toBe(false);
    expect(fileService.isTextLike("application/pdf")).toBe(false);
  });
});
