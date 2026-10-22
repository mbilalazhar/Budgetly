import { NextResponse } from "next/server";
import { authenticated, readJson, sameOrigin } from "@/lib/auth";
import { readBudget, updateBudget } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/budget";
import type { Command } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (data: object, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const unavailable = () =>
  response(
    {
      error:
        "Your database is unavailable. Check MONGODB_URI and your MongoDB network access, then try again. No changes were confirmed.",
    },
    503,
  );
export async function GET() {
  if (!(await authenticated()))
    return response({ error: "Please sign in to continue." }, 401);
  try {
    return response({ budget: await readBudget() });
  } catch {
    return unavailable();
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return response({ error: "Request origin is not allowed." }, 403);
  if (!(await authenticated()))
    return response(
      { error: "Your session expired. Please sign in again." },
      401,
    );
  let command;
  try {
    command = await readJson(request);
  } catch {
    return response({ error: "Invalid request." }, 400);
  }
  try {
    return response({ budget: await updateBudget(command as Command) });
  } catch (error) {
    if (error instanceof ConflictError)
      return response({ error: error.message }, 409);
    if (error instanceof ValidationError)
      return response({ error: error.message }, 400);
    return unavailable();
  }
}
