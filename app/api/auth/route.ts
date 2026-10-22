import { NextResponse } from "next/server";
import {
  authenticated,
  authConfigured,
  COOKIE,
  createSession,
  credentialsMatch,
  readJson,
  sameOrigin,
  SESSION_SECONDS,
} from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const authState = globalThis as typeof globalThis & {
  budgetlyAttempts?: { count: number; reset: number };
};
const response = (data: object, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const signedIn = await authenticated();
  return response({
    authenticated: signedIn,
    username: signedIn ? process.env.AUTH_USERNAME : undefined,
    configured: authConfigured(),
  });
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return response({ error: "Request origin is not allowed." }, 403);
  if (!authConfigured())
    return response(
      {
        error:
          "Login is not configured yet. Set AUTH_USERNAME, AUTH_PASSWORD, and a random SESSION_SECRET in .env.local, then restart the server.",
      },
      503,
    );
  const now = Date.now();
  if (!authState.budgetlyAttempts || authState.budgetlyAttempts.reset < now)
    authState.budgetlyAttempts = { count: 0, reset: now + 60000 };
  if (authState.budgetlyAttempts.count >= 10)
    return response(
      { error: "Too many login attempts. Please try again in one minute." },
      429,
    );
  authState.budgetlyAttempts.count++;
  let body;
  try {
    body = await readJson(request);
  } catch {
    return response({ error: "Invalid request." }, 400);
  }
  if (
    typeof body.username !== "string" ||
    typeof body.password !== "string" ||
    !credentialsMatch(body.username, body.password)
  )
    return response({ error: "The username or password is incorrect." }, 401);
  authState.budgetlyAttempts.count = 0;
  const result = response({
    authenticated: true,
    username: process.env.AUTH_USERNAME,
  });
  result.cookies.set(COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return result;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return response({ error: "Request origin is not allowed." }, 403);
  const result = response({ authenticated: false });
  result.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return result;
}
