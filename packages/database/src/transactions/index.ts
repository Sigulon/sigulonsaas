import { ClientSession } from "mongoose";
import { connectToDatabase } from "../client";

/**
 * Execute a unit of work inside a MongoDB transaction with automatic retries for transient failures.
 * If running against a standalone MongoDB without a replica set, executes with graceful fallback.
 */
export async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const m = await connectToDatabase();
  const session = await m.startSession();
  let sessionEnded = false;

  try {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        session.startTransaction({
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        });
      } catch (err: unknown) {
        // Standalone MongoDB (not in replica set) throws:
        // "Transaction numbers are only allowed on a replica set member or mongos"
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("replica set") ||
          msg.includes("standalone") ||
          msg.includes("Transaction numbers")
        ) {
          // One-time non-transactional fallback for standalone topologies.
          try {
            const result = await work(session);
            return result;
          } finally {
            if (!sessionEnded) {
              sessionEnded = true;
              await session.endSession();
            }
          }
        }
        throw err;
      }

      try {
        const result = await work(session);
        await session.commitTransaction();
        return result;
      } catch (error: unknown) {
        const err = error as { hasErrorLabel?: (label: string) => boolean };
        const isTransient =
          typeof err.hasErrorLabel === "function" &&
          (err.hasErrorLabel("TransientTransactionError") ||
            err.hasErrorLabel("UnknownTransactionCommitResult"));

        if (isTransient && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }

        try {
          await session.abortTransaction();
        } catch {
          // Ignored
        }
        throw error;
      } finally {
        if (session.inTransaction()) {
          try {
            await session.abortTransaction();
          } catch {
            // Ignored
          }
        }
      }
    }

    throw new Error("Transaction failed after maximum retries");
  } finally {
    if (!sessionEnded) {
      sessionEnded = true;
      await session.endSession();
    }
  }
}
