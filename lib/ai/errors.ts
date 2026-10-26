export const AI_MESSAGES = {
  RULES_OUTPUT_INVALID: "本地报告未通过规则与盘面校验，请重新生成。",
  AI_NOT_CONFIGURED: "真实 AI 尚未配置服务端 API 密钥，请配置后重试；不会回退到示例。",
  AI_CONFIG_INVALID: "AI 服务配置不正确，请检查服务端配置。",
  AI_AUTH_FAILED: "AI 服务凭据不可用，请更换有效密钥。",
  AI_RATE_LIMITED: "AI 服务请求过于频繁，请稍后重试。",
  AI_BUSY: "当前命盘正在解读或服务繁忙，请稍后重试。",
  AI_TIMEOUT: "解读超时，命盘已保留，可以重试。",
  AI_CANCELLED: "解读已取消。",
  AI_UPSTREAM_FAILED: "AI 服务暂时不可用，命盘已保留，可以重试。",
  AI_REFUSED: "AI 未能提供本次解读，请调整问题后重试。",
  AI_OUTPUT_INVALID: "AI 返回的报告未通过完整性或引用校验，请重试。",
  INVALID_INTERPRET_REQUEST: "解读请求格式不正确，请刷新后重试。",
  REQUEST_TOO_LARGE: "解读请求过大，请精简内容。",
  STREAM_INVALID: "解读连接中断或数据不完整，请重试。"
} as const;
export type AIErrorCode = keyof typeof AI_MESSAGES;
export class AIServiceError extends Error {
  constructor(public code: AIErrorCode, public status = 502, public retryable = true) {
    super(AI_MESSAGES[code]); this.name = "AIServiceError";
  }
}
export function safeAIError(error: unknown): AIServiceError {
  return error instanceof AIServiceError ? error : new AIServiceError("AI_UPSTREAM_FAILED");
}
