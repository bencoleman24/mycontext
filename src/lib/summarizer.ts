import { getOllamaBaseUrl, getOllamaModel } from "../config.js";

export interface Summarizer {
  id: string;
  summarize(text: string): Promise<string>;
}

const SUMMARY_PROMPT_PREFIX =
  "Summarize the following journal entry in 2-3 concise sentences, capturing the key events, decisions, and feelings. Respond with only the summary, no preamble:\n\n";

export class OllamaSummarizer implements Summarizer {
  readonly id = "ollama";

  constructor(
    private readonly baseUrl = getOllamaBaseUrl(),
    private readonly model = getOllamaModel(),
  ) {}

  async summarize(text: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: `${SUMMARY_PROMPT_PREFIX}${text}`,
          stream: false,
        }),
      });
    } catch (err) {
      throw new Error(
        `Couldn't reach Ollama at ${this.baseUrl}. Is Ollama running? (${(err as Error).message})`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 404) {
        throw new Error(
          `Ollama model "${this.model}" isn't available. Pull it first with \`ollama pull ${this.model}\`, or set MYCONTEXT_OLLAMA_MODEL to a model you have.`,
        );
      }
      throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    const summary = data.response?.trim();
    if (!summary) {
      throw new Error("Ollama returned an empty response.");
    }
    return summary;
  }
}

export function getSummarizer(): Summarizer {
  return new OllamaSummarizer();
}
