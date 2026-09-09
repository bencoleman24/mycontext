import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_DATA_DIR = path.join(homedir(), ".mycontext");

export function getDataDir(): string {
  const fromEnv = process.env.MYCONTEXT_DATA_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return DEFAULT_DATA_DIR;
}

const DEFAULT_WEB_PORT = 4823;

export function getWebPort(): number {
  const fromEnv = process.env.MYCONTEXT_WEB_PORT;
  const parsed = fromEnv ? Number.parseInt(fromEnv, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEB_PORT;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

export function getOllamaBaseUrl(): string {
  const fromEnv = process.env.MYCONTEXT_OLLAMA_BASE_URL;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_OLLAMA_BASE_URL;
}

const DEFAULT_OLLAMA_MODEL = "llama3.2";

export function getOllamaModel(): string {
  const fromEnv = process.env.MYCONTEXT_OLLAMA_MODEL;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_OLLAMA_MODEL;
}
