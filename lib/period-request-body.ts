import { ZiweiRequestError } from "./ziwei/errors";

export async function readPeriodRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  let size = 0, content = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) throw new ZiweiRequestError("PERIOD_REQUEST_TOO_LARGE", "请求内容过大，请重新选择分析日期。", 413);
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  request.signal.throwIfAborted();
  return JSON.parse(content);
}
