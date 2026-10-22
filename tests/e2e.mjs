import { MongoMemoryServer } from "mongodb-memory-server";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const project = fileURLToPath(new URL("../", import.meta.url));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const screenshotDir = new URL("../test-results/", import.meta.url);
fs.mkdirSync(screenshotDir, { recursive: true });
const screenshotPath = (name) => fileURLToPath(new URL(name, screenshotDir));
const date = new Date();
const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
let mongo, server, browser, activePage;
(async () => {
  mongo = await MongoMemoryServer.create();
  const password = randomBytes(20).toString("hex");
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      cwd: project,
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_ORIGIN: origin,
        AUTH_USERNAME: "test-owner",
        AUTH_PASSWORD: password,
        SESSION_SECRET: randomBytes(32).toString("hex"),
        MONGODB_URI: mongo.getUri(),
        MONGODB_DB: "budgetly_qa",
        BUDGET_CURRENCY: "PKR",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  server.stdout.on("data", (d) => {
    logs += d.toString();
  });
  server.stderr.on("data", (d) => {
    logs += d.toString();
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, logs);
  assert.equal((await fetch(origin + "/api/budget")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://wrong.example",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/api/auth", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test-owner", password: "incorrect" }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + "/api/budget", {
        headers: { Cookie: "budgetly_session=invalid.signature" },
      })
    ).status,
    401,
  );
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() =>
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    }),
  );
  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "Make yourself at home." }).waitFor();
  await page.screenshot({
    path: screenshotPath("login-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel("Username", { exact: true }).fill("test-owner");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Let’s get you settled" }).click();
  await page.getByText("Your first step to a clearer picture").waitFor();
  async function openTab(name) {
    await page
      .locator(".bottom-nav")
      .getByRole("button", { name, exact: true })
      .click();
  }
  async function save() {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.locator("dialog").waitFor({ state: "hidden" });
  }
  async function read() {
    const r = await context.request.get(origin + "/api/budget");
    assert.equal(r.status(), 200);
    return (await r.json()).budget;
  }
  await page
    .getByRole("button", { name: "Add an account", exact: true })
    .click();
  await page.getByLabel("Account name", { exact: true }).fill("Everyday bank");
  await page.getByLabel("Current balance (PKR)", { exact: true }).fill("1000");
  await save();
  await openTab("Accounts");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Account name", { exact: true }).fill("Pocket cash");
  await page.getByLabel("Account type", { exact: true }).selectOption("cash");
  await page.getByLabel("Current balance (PKR)", { exact: true }).fill("100");
  await save();
  await openTab("Savings");
  await page.getByRole("button", { name: "New goal", exact: true }).click();
  await page
    .getByLabel("What are you saving for?", { exact: true })
    .fill("A little getaway");
  await page.getByLabel("Target amount (PKR)", { exact: true }).fill("500");
  await save();
  for (const [action, amount] of [
    ["Add money", "200"],
    ["Spend", "50"],
    ["Release", "25"],
  ]) {
    await page
      .getByRole("button", { name: "Manage savings", exact: true })
      .click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByLabel("Amount (PKR)", { exact: true }).fill(amount);
    await save();
  }
  let b = await read();
  assert.equal(b.accounts[0].balance, 95000);
  assert.equal(b.goals[0].allocations[0].amount, 12500);
  await openTab("Home");
  for (const [type, title, amount] of [
    ["Expense", "Coffee & lunch", "10.25"],
    ["Income", "Monthly salary", "300"],
    ["Transfer", "Cash withdrawal", "100"],
  ]) {
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    await page.getByRole("button", { name: type, exact: true }).click();
    await page.getByLabel("Amount (PKR)", { exact: true }).fill(amount);
    await page.getByLabel("What was it for?", { exact: true }).fill(title);
    await save();
  }
  b = await read();
  assert.equal(b.accounts[0].balance, 113975);
  assert.equal(b.accounts[1].balance, 20000);
  await openTab("More");
  await page
    .getByRole("button", { name: "Recurring expenses", exact: true })
    .click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByLabel("Expense name", { exact: true })
    .fill("Music subscription");
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("20");
  await save();
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "hidden" });
  b = await read();
  assert.equal(b.accounts[0].balance, 111975);
  await openTab("More");
  await page.getByRole("button", { name: "Debts & dues", exact: true }).click();
  await page
    .getByRole("button", { name: "Record a debt", exact: true })
    .first()
    .click();
  await page.getByLabel("Person’s name", { exact: true }).fill("Sam");
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("50");
  await save();
  await page
    .getByRole("button", { name: "Record money received", exact: true })
    .click();
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("20");
  await save();
  b = await read();
  assert.equal(b.accounts[0].balance, 113975);
  assert.equal(b.debts[0].paid, 2000);
  await page
    .getByRole("button", { name: "Record a debt", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "I owe someone", exact: true })
    .click();
  await page.getByLabel("Person’s name", { exact: true }).fill("Alex");
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("40");
  await page.getByRole("checkbox").check();
  await save();
  await page
    .getByRole("button", { name: "Record a repayment", exact: true })
    .click();
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("10");
  await save();
  b = await read();
  assert.equal(b.accounts[0].balance, 116975);
  assert.equal(b.debts[1].paid, 1000);
  // Actual MongoDB concurrency and duplicate-request protection.
  const command = {
    action: "transaction.add",
    type: "income",
    title: "Concurrent test",
    amount: "1",
    category: "Other",
    date: dateKey,
    accountId: b.accounts[0].id,
    requestId: randomUUID(),
  };
  const responses = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      context.request.post(origin + "/api/budget", {
        headers: { Origin: origin },
        data: {
          ...command,
          requestId: i < 2 ? command.requestId : randomUUID(),
        },
      }),
    ),
  );
  for (const response of responses) assert.equal(response.status(), 200);
  b = await read();
  assert.equal(b.accounts[0].balance, 117275);
  await page.reload();
  await page.getByRole("heading", { name: "Hey, test-owner." }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow at ${width}px`,
    );
    await page.screenshot({
      path: screenshotPath(`dashboard-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["Activity", "Accounts", "Savings", "More"]) {
    await openTab(tab);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow in ${tab}`,
    );
    await page.screenshot({
      path: screenshotPath(`${tab.toLowerCase()}.png`),
      fullPage: true,
    });
  }
  await openTab("Accounts");
  await page.getByRole("button", { name: /bank.*Everyday bank/ }).click();
  await page
    .getByRole("button", { name: "Correct balance", exact: true })
    .click();
  await page.getByLabel("Actual balance (PKR)", { exact: true }).fill("1200");
  await save();
  b = await read();
  assert.equal(b.accounts[0].balance, 120000);

  // Correct a real expense, preserve its history, and then undo the correction.
  await openTab("Activity");
  await page
    .locator(".transaction-button")
    .filter({ hasText: "Coffee & lunch" })
    .click();
  await page
    .getByRole("button", { name: "Edit transaction", exact: true })
    .click();
  await page.getByLabel("Amount (PKR)", { exact: true }).fill("12.25");
  await page
    .getByLabel("Note (optional)", { exact: true })
    .fill("Receipt corrected");
  await save();
  b = await read();
  assert.equal(b.accounts[0].balance, 119800);
  assert.equal(
    b.transactions.filter((t) => t.title === "Coffee & lunch" && t.voidedAt)
      .length,
    1,
  );
  async function undo(title) {
    await page
      .locator(".transaction-button")
      .filter({ hasText: title })
      .click();
    await page
      .getByRole("button", { name: "Undo transaction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm undo", exact: true })
      .click();
    await page.locator("dialog").waitFor({ state: "hidden" });
  }
  await undo("Coffee & lunch");
  b = await read();
  assert.equal(b.accounts[0].balance, 121025);
  await page.getByRole("button", { name: "Voided", exact: true }).click();
  assert.equal(await page.locator(".transaction-button").count(), 2);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await csvDownload;
  assert.ok(csv.suggestedFilename().endsWith(".csv"));
  const exported = fs.readFileSync(await csv.path(), "utf8");
  assert.ok(exported.includes("Monthly salary"));
  assert.ok(!exported.includes("Coffee & lunch"));
  // Monthly budgets and category totals react to actual and undone spending.
  await openTab("More");
  await page
    .getByRole("button", { name: "Monthly budget", exact: true })
    .click();
  await page.getByRole("button", { name: "Set a limit", exact: true }).click();
  await page.getByLabel("Monthly limit (PKR)", { exact: true }).fill("60");
  await save();
  await page.getByText(/over budget/).waitFor();
  b = await read();
  assert.equal(b.spendingLimits[0].amount, 6000);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Budget overflow ${width}`,
    );
  }
  await page.screenshot({
    path: screenshotPath("monthly-budget.png"),
    fullPage: true,
  });
  await openTab("Activity");
  await undo("Music subscription");
  b = await read();
  assert.equal(b.recurring[0].due, dateKey);
  assert.equal(b.accounts[0].balance, 123025);
  await undo("Repaid Alex");
  await undo("Borrowed from Alex");
  b = await read();
  assert.equal(b.debts.length, 1);
  assert.equal(b.accounts[0].balance, 120025);
  // Existing debts can be renamed without changing their balances or repayments.
  await openTab("More");
  await page.getByRole("button", { name: "Debts & dues", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit debt with Sam", exact: true })
    .click();
  await page.getByLabel("Person’s name", { exact: true }).fill("Sam Jones");
  await page
    .getByLabel("Note (optional)", { exact: true })
    .fill("Lunch shared");
  await save();
  b = await read();
  assert.equal(b.debts[0].person, "Sam Jones");
  assert.equal(b.debts[0].paid, 2000);
  assert.equal(b.debts[0].note, "Lunch shared");
  await page
    .getByRole("button", { name: "Edit debt with Sam Jones", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Note (optional)", { exact: true }).inputValue(),
    "Lunch shared",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  // A concurrent account change must not be overwritten by reconciliation.
  await openTab("Accounts");
  await page.getByRole("button", { name: /bank.*Everyday bank/ }).click();
  await page
    .getByRole("button", { name: "Correct balance", exact: true })
    .click();
  const external = await context.request.post(origin + "/api/budget", {
    headers: { Origin: origin },
    data: { ...command, requestId: randomUUID() },
  });
  assert.equal(external.status(), 200);
  await page.getByLabel("Actual balance (PKR)", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /changed/ })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  b = await read();
  assert.equal(b.accounts[0].balance, 120125);
  const bad = await context.request.post(origin + "/api/budget", {
    headers: { Origin: origin },
    data: {
      ...command,
      amount: "999999",
      type: "expense",
      requestId: randomUUID(),
    },
  });
  assert.equal(bad.status(), 400);
  assert.equal((await read()).accounts[0].balance, 120125);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "budgetly_session",
  );
  assert.ok(cookie.httpOnly && cookie.secure && cookie.sameSite === "Strict");
  await openTab("More");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Make yourself at home." }).waitFor();
  assert.equal(
    (await context.request.get(origin + "/api/budget")).status(),
    401,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: audit regressions (transaction corrections/undo, linked undo, monthly budgets, CSV, debt editing, stale reconciliation, LAN request IDs), plus login/logout, API authorization and origin checks, accounts, income, expenses, transfers, savings reserve/spend/release, recurring payments, loans and partial repayments, MongoDB concurrency/idempotency, balance corrections, persistence after reload, and responsive widths 320/390/768/1440.",
  );
})()
  .catch(async (error) => {
    if (activePage)
      await activePage
        .screenshot({ path: screenshotPath("failure.png"), fullPage: true })
        .catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill("SIGTERM");
      });
    }
    if (mongo) await mongo.stop();
  });
