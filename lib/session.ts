import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const COOKIE = "budgetly_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export function authConfigured() {
  return !!(
    process.env.AUTH_USERNAME &&
    process.env.AUTH_PASSWORD &&
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32 &&
    !process.env.SESSION_SECRET.startsWith("replace-with")
  );
}
function digest(value: string) {
  return createHash("sha256").update(value).digest();
}
export function credentialsMatch(username: string, password: string) {
  const userMatch = timingSafeEqual(
    digest(username),
    digest(process.env.AUTH_USERNAME ?? ""),
  );
  const passMatch = timingSafeEqual(
    digest(password),
    digest(process.env.AUTH_PASSWORD ?? ""),
  );
  return userMatch && passMatch && authConfigured();
}
function signature(payload: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .update(
      JSON.stringify([process.env.AUTH_USERNAME, process.env.AUTH_PASSWORD]),
    )
    .digest("base64url");
}
export function createSession() {
  const payload = Buffer.from(
    JSON.stringify({ expires: Date.now() + SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifySession(token: string | undefined) {
  if (!authConfigured()) return false;
  if (!token || token.length > 512) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = signature(payload);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(sig) ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.expires === "number" && data.expires > Date.now();
  } catch {
    return false;
  }
}
