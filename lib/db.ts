import { MongoClient } from "mongodb";
import { emptyBudget, applyCommand, ConflictError } from "./budget";
import type { Budget, Command } from "./types";
type BudgetDocument = Budget & { _id: string };
const globalDb = globalThis as typeof globalThis & {
  budgetlyMongo?: Promise<MongoClient>;
};
async function collection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");
  if (!globalDb.budgetlyMongo) {
    globalDb.budgetlyMongo = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 5,
    })
      .connect()
      .catch((error) => {
        globalDb.budgetlyMongo = undefined;
        throw error;
      });
  }
  const client = await globalDb.budgetlyMongo;
  return client
    .db(process.env.MONGODB_DB || "budgetly")
    .collection<BudgetDocument>("budgets");
}
export async function readBudget(): Promise<Budget> {
  const records = await collection();
  await records.updateOne(
    { _id: "personal" },
    { $setOnInsert: emptyBudget(process.env.BUDGET_CURRENCY || "PKR") },
    { upsert: true },
  );
  const document = await records.findOne({ _id: "personal" });
  if (!document) throw new Error("Budget could not be loaded.");
  const { _id, ...budget } = document;
  void _id;
  return budget;
}
export async function updateBudget(command: Command): Promise<Budget> {
  const records = await collection();
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readBudget();
    const next = applyCommand(current, command);
    if (next === current) return current;
    // One atomic document replacement keeps balances and the ledger consistent,
    // including on standalone MongoDB. Revision checks prevent lost updates.
    const result = await records.replaceOne(
      { _id: "personal", revision: current.revision },
      next,
    );
    if (result.modifiedCount === 1) return next;
  }
  throw new ConflictError(
    "Another update finished at the same time. Retry this save.",
  );
}
