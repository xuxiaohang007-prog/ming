import { AIServiceError } from "./errors";

export type AIConfig = { apiKey: string; model: string; timeoutMs: number; maxOutputTokens: number; maxRetries: number };
export function readAIConfig(env: Record<string, string | undefined> = process.env): AIConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AIServiceError("AI_NOT_CONFIGURED", 503, false);
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) throw new AIServiceError("AI_CONFIG_INVALID", 503, false);
    return value;
  };
  const model = env.OPENAI_MODEL?.trim() || "gpt-4.1-mini-2025-04-14";
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || /[\r\n]/.test(apiKey)) throw new AIServiceError("AI_CONFIG_INVALID", 503, false);
  return { apiKey, model, timeoutMs: number("FORTUNE_AI_TIMEOUT_MS", 90000, 1000, 120000),
    maxOutputTokens: number("FORTUNE_AI_MAX_OUTPUT_TOKENS", 6000, 512, 12000), maxRetries: number("FORTUNE_AI_MAX_RETRIES", 1, 0, 1) };
}
