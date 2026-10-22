import { cookies } from "next/headers";
import { COOKIE, verifySession } from "./session";
export {
  COOKIE,
  SESSION_SECONDS,
  authConfigured,
  credentialsMatch,
  createSession,
} from "./session";
export async function authenticated() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expected = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).origin
      : new URL(request.url).origin;
    return origin === expected;
  } catch {
    return false;
  }
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) {
      await reader.cancel();
      throw new Error("Request too large.");
    }
    chunks.push(value);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("Expected an object.");
  return value;
}
