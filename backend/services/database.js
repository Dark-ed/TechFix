import { Pool } from "pg";

// ==========================================
// DATABASE CONNECTION POOL
// ==========================================

let pool = null;


export function getPool() {

    const connectionString =
        process.env.DATABASE_URL;

    if (!connectionString) {

        throw new Error(
            "DATABASE_URL is missing. Check backend/.env"
        );

    }

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


// ==========================================
// INITIALIZE DATABASE
// ==========================================

export async function initializeDatabase() {

    const db = getPool();


    // ======================================
    // RECOVERY APPROVALS TABLE
    // ======================================

    await db.query(`

        CREATE TABLE IF NOT EXISTS recovery_approvals (

            id UUID PRIMARY KEY,

            action TEXT NOT NULL,

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

            execution_result JSONB,

            investigation_id UUID,

            problem_description TEXT,

            ai_diagnosis TEXT,

            approved_at TIMESTAMPTZ,

            verification_result JSONB,

            verified_at TIMESTAMPTZ

        );

    `);


    // ======================================
    // MIGRATE EXISTING RECOVERY TABLE
    // ======================================

    await db.query(`

        ALTER TABLE recovery_approvals

        ADD COLUMN IF NOT EXISTS investigation_id UUID,

        ADD COLUMN IF NOT EXISTS problem_description TEXT,

        ADD COLUMN IF NOT EXISTS ai_diagnosis TEXT,

        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,

        ADD COLUMN IF NOT EXISTS verification_result JSONB,

        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

    `);


    // ======================================
    // CORRECT ALLOWED RECOVERY ACTIONS
    // ======================================

    await db.query(`

        ALTER TABLE recovery_approvals

        DROP CONSTRAINT IF EXISTS recovery_approvals_action_check;

    `);


    await db.query(`

        ALTER TABLE recovery_approvals

        ADD CONSTRAINT recovery_approvals_action_check

        CHECK (
            action IN (
                'flush_dns_cache',
                'renew_dhcp_lease'
            )
        );

    `);


    // ======================================
    // DATABASE INDEXES
    // ======================================

    await db.query(`

        CREATE INDEX IF NOT EXISTS
        recovery_approvals_expiry_idx

        ON recovery_approvals(expires_at);

    `);


    await db.query(`

        CREATE INDEX IF NOT EXISTS
        recovery_approvals_created_idx

        ON recovery_approvals(created_at DESC);

    `);


    // ======================================
    // TEST DATABASE CONNECTION
    // ======================================

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

    console.log(
        "[Database] Recovery history schema initialized."
    );


    return true;

}


// ==========================================
// CLOSE DATABASE CONNECTION
// ==========================================

export async function closeDatabase() {

    if (pool) {

        await pool.end();

        pool = null;

        console.log(
            "[Database] Connection pool closed."
        );

    }

}