import { Pool } from "pg";

// Only ONE pool declaration is required.
let pool = null;


// --------------------------------------------------
// DATABASE CONNECTION
// --------------------------------------------------

export function getPool() {

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error(
            "DATABASE_URL is missing. Check backend/.env"
        );
    }

    // Create the connection pool only once.
    if (!pool) {

        pool = new Pool({

            connectionString,

            max: 5,

            idleTimeoutMillis: 30000,

            connectionTimeoutMillis: 10000

        });

        pool.on("error", (error) => {

            console.error(
                "[Database] Unexpected connection error:",
                error.message
            );

        });
    }

    return pool;
}


// --------------------------------------------------
// INITIALIZE DATABASE
// --------------------------------------------------

export async function initializeDatabase() {

    const db = getPool();

    // Create investigation history table.
   // Create persistent recovery approval table.
await db.query(`
    CREATE TABLE IF NOT EXISTS recovery_approvals (
        id UUID PRIMARY KEY,

        action TEXT NOT NULL
            CHECK (action IN ('flush_dns_cache')),

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        expires_at TIMESTAMPTZ NOT NULL,

        used_at TIMESTAMPTZ,

        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (
                status IN (
                    'pending',
                    'executing',
                    'completed',
                    'failed'
                )
            ),

        execution_result JSONB
    );
`);

await db.query(`
    CREATE INDEX IF NOT EXISTS recovery_approvals_expiry_idx
    ON recovery_approvals(expires_at);
`);

    // Verify database connectivity.
    const result = await db.query(
        "SELECT NOW() AS connected_at"
    );


    console.log(
        "[Database] Neon PostgreSQL connected successfully."
    );

    console.log(
        "[Database] Server time:",
        result.rows[0].connected_at
    );

    return true;
}


// --------------------------------------------------
// CLOSE DATABASE CONNECTION
// --------------------------------------------------

export async function closeDatabase() {

    if (pool) {

        await pool.end();

        pool = null;

        console.log(
            "[Database] Connection pool closed."
        );
    }
}