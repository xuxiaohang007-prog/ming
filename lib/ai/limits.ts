import { AIServiceError } from "./errors";

const key = Symbol.for("fortune.ai-limits");
const globals = globalThis as typeof globalThis & { [key]?: { active: Set<string>; starts: number[] } };
const state = globals[key] ??= { active: new Set<string>(), starts: [] };
export function createAIRequestLimiter(shared = { active: new Set<string>(), starts: [] as number[] }, clock = Date.now) {
  return (chartId: string) => {
    const now = clock(); shared.starts = shared.starts.filter((start) => now - start < 60000);
    if (shared.active.has(chartId) || shared.active.size >= 2) throw new AIServiceError("AI_BUSY", 429);
    if (shared.starts.length >= 10) throw new AIServiceError("AI_RATE_LIMITED", 429);
    shared.starts.push(now); shared.active.add(chartId);
    let released = false;
    return () => { if (!released) { shared.active.delete(chartId); released = true; } };
  };
}
export const acquireAIRequest = createAIRequestLimiter(state);
