import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Points MYCONTEXT_DATA_DIR at a fresh temp directory and returns a
 * cleanup function. Must run before any module that reads config/storage is
 * imported, so callers should `await import(...)` their subject after calling this.
 */
export async function useTempDataDir(): Promise<{ dataDir: string; cleanup: () => Promise<void> }> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "mycontext-test-"));
  process.env.MYCONTEXT_DATA_DIR = dataDir;
  return {
    dataDir,
    cleanup: () => rm(dataDir, { recursive: true, force: true }),
  };
}
