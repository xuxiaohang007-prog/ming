export class ZiweiEngineError extends Error {
  constructor(public code: "ENGINE_VERSION_MISMATCH" | "ENGINE_CONFIG_CHANGED" | "ENGINE_COMPUTATION_FAILED" | "ENGINE_OUTPUT_INVALID" | "RESPONSE_CONTRACT_INVALID") {
    super(code);
    this.name = "ZiweiEngineError";
  }
}

export class ZiweiRequestError extends Error {
  constructor(public code: "UNSUPPORTED_RULE_OVERRIDE" | "INVALID_RULE_HASH" | "RULES_CHANGED" | "INVALID_CHART_ID" | "CHART_MISMATCH" | "INVALID_PERIOD_INPUT" | "PERIOD_OUT_OF_RANGE" | "PERIOD_REQUEST_TOO_LARGE" | "INVALID_PERIOD_REPORT_INPUT" | "PERIOD_MISMATCH", message: string, public status: 400 | 409 | 413 = 400) {
    super(message);
    this.name = "ZiweiRequestError";
  }
}
