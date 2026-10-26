import { utf8Lines } from "../stream-lines";
import { buildReadingMessages } from "../reading-prompt";
import type { ReadingMaterial } from "../reading-material";
import { MODEL_JSON_SCHEMA } from "./model-report";
import type { AIConfig } from "./config";
import { AIServiceError } from "./errors";

export type ProviderDependencies = { fetch?: typeof fetch; delay?: (ms: number, signal: AbortSignal) => Promise<void> };
async function delay(ms: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function requestOpenAI(material: ReadingMaterial, config: AIConfig, signal: AbortSignal, onProgress: (characters: number) => void, dependencies: ProviderDependencies = {}) {
  const call = dependencies.fetch ?? fetch;
  const messages = buildReadingMessages(material);
  const body = JSON.stringify({ model: config.model, input: messages, stream: true, store: false,
    max_output_tokens: config.maxOutputTokens, text: { format: { type: "json_schema", name: "ziwei_narrative", strict: true, schema: MODEL_JSON_SCHEMA } } });
  let response: Response | undefined;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    signal.throwIfAborted();
    response = await call("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body, signal, redirect: "error", cache: "no-store"
    });
    if (response.ok) break;
    // Never consume or expose provider error bodies; they may contain private details.
    await response.body?.cancel().catch(() => {});
    const retryable = [429, 502, 503].includes(response.status);
    if (retryable && attempt < config.maxRetries) { await (dependencies.delay ?? delay)(500 * (attempt + 1), signal); continue; }
    if ([401, 403].includes(response.status)) throw new AIServiceError("AI_AUTH_FAILED", 502, false);
    throw new AIServiceError(response.status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM_FAILED", response.status === 429 ? 429 : 502);
  }
  if (!response?.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    await response?.body?.cancel().catch(() => {});
    throw new AIServiceError("AI_OUTPUT_INVALID");
  }
  let text = "", data: string[] = [], completed = false, actualModel = config.model;
  function event() {
    if (!data.length) return;
    const raw = data.join("\n"); data = [];
    if (raw === "[DONE]") return;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.type === "response.refusal.delta" || value.type === "response.refusal.done") throw new AIServiceError("AI_REFUSED", 422, false);
    if (value.type === "response.failed" || value.type === "response.incomplete" || value.type === "error") throw new AIServiceError("AI_UPSTREAM_FAILED");
    if (value.type === "response.output_text.delta") {
      if (typeof value.delta !== "string" || completed) throw new AIServiceError("AI_OUTPUT_INVALID");
      text += value.delta;
      if (text.length > 120000) throw new AIServiceError("AI_OUTPUT_INVALID");
      onProgress(text.length);
    }
    if (value.type === "response.completed") {
      const result = value.response as { status?: unknown; model?: unknown } | undefined;
      if (completed || result?.status !== "completed" || !text) throw new AIServiceError("AI_OUTPUT_INVALID");
      if (typeof result.model === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(result.model)) actualModel = result.model;
      completed = true;
    }
  }
  try {
    for await (const line of utf8Lines(response.body, 1024 * 1024, 256000)) {
      signal.throwIfAborted();
      if (!line) event();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    event();
    if (!completed) throw new AIServiceError("AI_OUTPUT_INVALID");
    return { value: JSON.parse(text) as unknown, model: actualModel };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof AIServiceError) throw error;
    throw new AIServiceError("AI_OUTPUT_INVALID");
  }
}
