export async function* utf8Lines(body: ReadableStream<Uint8Array>, maxBytes: number, maxLineLength: number) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error("STREAM_LIMIT");
      }
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        if (line.length > maxLineLength) throw new Error("STREAM_LIMIT");
        buffer = buffer.slice(newline + 1);
        yield line;
      }
      if (buffer.length > maxLineLength) throw new Error("STREAM_LIMIT");
      if (done) { if (buffer) yield buffer.replace(/\r$/, ""); break; }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
