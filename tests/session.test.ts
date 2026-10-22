import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  verifySession,
  credentialsMatch,
  authConfigured,
} from "../lib/session";
import { readJson, sameOrigin } from "../lib/auth";
function config() {
  process.env.AUTH_USERNAME = "tester";
  process.env.AUTH_PASSWORD = "test-password";
  process.env.SESSION_SECRET = "a".repeat(64);
  delete process.env.APP_ORIGIN;
}
test("sessions verify, reject tampering, and expire", () => {
  config();
  const token = createSession();
  assert.equal(verifySession(token), true);
  assert.equal(verifySession(token + "x"), false);
  assert.equal(verifySession("garbage"), false);
  assert.equal(verifySession(undefined), false);
  assert.equal(
    verifySession(`${token.split(".")[0]}.${"é".repeat(43)}`),
    false,
  );
  const now = Date.now;
  try {
    Date.now = () => now() + 8 * 24 * 60 * 60 * 1000;
    assert.equal(verifySession(token), false);
  } finally {
    Date.now = now;
  }
});
test("credential rotation invalidates sessions, including equal concatenated strings", () => {
  config();
  process.env.AUTH_USERNAME = "ab";
  process.env.AUTH_PASSWORD = "c";
  const token = createSession();
  process.env.AUTH_USERNAME = "a";
  process.env.AUTH_PASSWORD = "bc";
  assert.equal(verifySession(token), false);
  config();
  const second = createSession();
  process.env.SESSION_SECRET = "b".repeat(64);
  assert.equal(verifySession(second), false);
});
test("credentials are case-sensitive and placeholder secrets cannot enable login", () => {
  config();
  assert.equal(credentialsMatch("tester", "test-password"), true);
  assert.equal(credentialsMatch("Tester", "test-password"), false);
  assert.equal(credentialsMatch("tester", "wrong"), false);
  process.env.SESSION_SECRET = "replace-with-at-least-32-random-characters";
  assert.equal(authConfigured(), false);
});
test("origin checks reject absent and forged origins and support explicit proxy configuration", () => {
  config();
  const request = (origin?: string) =>
    new Request("http://localhost:3000/api/auth", {
      headers: origin ? { Origin: origin } : {},
    });
  assert.equal(sameOrigin(request()), false);
  assert.equal(sameOrigin(request("null")), false);
  assert.equal(sameOrigin(request("https://attacker.example")), false);
  assert.equal(sameOrigin(request("http://localhost:3000")), true);
  process.env.APP_ORIGIN = "https://budget.example";
  assert.equal(sameOrigin(request("https://budget.example")), true);
  assert.equal(sameOrigin(request("http://localhost:3000")), false);
  delete process.env.APP_ORIGIN;
});
test("JSON request parsing rejects excessive, malformed, non-object, and non-JSON bodies", async () => {
  const request = (body: string, type = "application/json") =>
    new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  assert.deepEqual(await readJson(request('{"amount":"1"}')), { amount: "1" });
  for (const value of [
    "[]",
    "null",
    "1",
    "{broken",
    JSON.stringify({ note: "x".repeat(17000) }),
  ])
    await assert.rejects(readJson(request(value)));
  await assert.rejects(readJson(request("{}", "text/plain")));
});
