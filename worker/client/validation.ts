import type { z } from "zod";
import { AppError } from "../utils/errors";

const MAX_JSON_BYTES = 65_536;
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const tooLarge = () =>
    new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Os dados enviados são grandes demais.",
    );
  if (Number(request.headers.get("Content-Length")) > MAX_JSON_BYTES)
    throw tooLarge();
  if (!request.body)
    throw new AppError(400, "INVALID_JSON", "Envie dados JSON válidos.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AppError(400, "INVALID_JSON", "Envie dados JSON válidos.");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Revise os campos informados.",
      parsed.error.issues[0]?.path.join(".") || undefined,
    );
  return parsed.data;
}
