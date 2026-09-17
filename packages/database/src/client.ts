import mongoose, { Connection } from "mongoose";
import { Db } from "mongodb";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var __mongooseGlobalCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.__mongooseGlobalCache || {
  conn: null,
  promise: null,
};

global.__mongooseGlobalCache = cache;

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    if (process.env.NODE_ENV === "test") {
      return "mongodb://localhost:27017/sigulon_test";
    }
    throw new Error("MONGODB_URI must be configured.");
  }
  return uri;
}

export function getDbName(): string {
  return process.env.MONGODB_DATABASE || process.env.MONGODB_DB_NAME || "sigulon";
}

/**
 * Connect to MongoDB Atlas / Local via Mongoose.
 * Reuses existing active connection across invocations (crucial for Cloud Run / serverless).
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    const uri = getMongoUri();
    const dbName = getDbName();

    const opts: mongoose.ConnectOptions = {
      dbName,
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      autoIndex: process.env.NODE_ENV !== "production",
      bufferCommands: false,
    };

    cache.promise = mongoose
      .connect(uri, opts)
      .then((m) => {
        return m;
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }

  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }

  return cache.conn;
}

/**
 * Get native Mongoose Connection instance.
 */
export function getMongooseConnection(): Connection {
  return mongoose.connection;
}

/**
 * Get native MongoDB Driver Db instance.
 */
export async function getNativeDb(): Promise<Db> {
  const m = await connectToDatabase();
  const db = m.connection.db;
  if (!db) {
    throw new Error("MongoDB connection active but Db instance unavailable.");
  }
  return db;
}

/**
 * Database health check verifying roundtrip ping.
 */
export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  database?: string;
  error?: string;
}> {
  const start = Date.now();
  try {
    const m = await connectToDatabase();
    if (m.connection.readyState !== 1) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Database in readyState ${m.connection.readyState}`,
      };
    }
    const admin = m.connection.db?.admin();
    if (admin) {
      await admin.ping();
    }
    return {
      ok: true,
      latencyMs: Date.now() - start,
      database: m.connection.db?.databaseName,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Gracefully disconnect from database.
 */
export async function disconnectDatabase(): Promise<void> {
  if (cache.conn) {
    await mongoose.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
