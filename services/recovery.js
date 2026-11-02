import { randomUUID } from "node:crypto";
import { getPool } from "./database.js";
import { flushDnsCache } from "./executor.js";


// ==========================================
// ALLOWED RECOVERY ACTIONS
// ==========================================

const RECOVERY_ACTIONS = {

    flush_dns_cache: {

        title: "Flush Windows DNS Cache",

        description:
            "Clear temporarily cached DNS records so Windows can request fresh DNS information.",

        risk: "Low",

        changes:
            "Clears the local Windows DNS resolver cache.",

        reversible: false,

        execution:
            "Uses the fixed Windows command ipconfig /flushdns."
    }

};


const APPROVAL_EXPIRY = 2 * 60 * 1000;


// ==========================================
// CREATE RECOVERY PLAN
// ==========================================

export async function createRecoveryPlan(action) {

    const selectedAction =
        RECOVERY_ACTIONS[action];

    if (!selectedAction) {

        throw new Error(
            "This recovery action is not permitted."
        );
    }

    const db = getPool();

    const planId = randomUUID();

    const expiresAt =
        new Date(Date.now() + APPROVAL_EXPIRY);


    await db.query(
        `
        INSERT INTO recovery_approvals (
            id,
            action,
            expires_at
        )
        VALUES ($1, $2, $3)
        `,
        [
            planId,
            action,
            expiresAt
        ]
    );


    console.log(
        "[Recovery] Persistent approval created:",
        planId
    );


    return {

        planId,

        action,

        title: selectedAction.title,

        description:
            selectedAction.description,

        risk: selectedAction.risk,

        changes:
            selectedAction.changes,

        reversible:
            selectedAction.reversible,

        execution:
            selectedAction.execution,

        approvalRequired: true,

        expiresAt:
            expiresAt.toISOString()
    };
}


// ==========================================
// EXECUTE APPROVED RECOVERY
// ==========================================

export async function executeApprovedRecovery(
    planId,
    confirmed
) {

    if (confirmed !== true) {

        throw new Error(
            "Explicit user approval is required."
        );
    }

    if (
        typeof planId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(planId)
    ) {

        throw new Error(
            "Invalid recovery plan ID."
        );
    }

    const db = getPool();


    // --------------------------------------
    // CLAIM APPROVAL ATOMICALLY
    // --------------------------------------

    // Only one request can successfully change
    // a pending plan into executing.

    const claim = await db.query(
        `
        UPDATE recovery_approvals

        SET
            status = 'executing',
            used_at = NOW()

        WHERE
            id = $1
            AND status = 'pending'
            AND expires_at > NOW()

        RETURNING action;
        `,
        [planId]
    );


    if (claim.rowCount === 0) {

        throw new Error(
            "Recovery plan does not exist, has expired, or has already been used."
        );
    }


    const action = claim.rows[0].action;


    // --------------------------------------
    // EXECUTE FIXED ALLOWLISTED ACTION
    // --------------------------------------

    try {

        let result;

        switch (action) {

            case "flush_dns_cache":

                result = await flushDnsCache();

                break;

            default:

                throw new Error(
                    "Recovery action is not permitted."
                );
        }


        // ----------------------------------
        // RECORD SUCCESS
        // ----------------------------------

        await db.query(
            `
            UPDATE recovery_approvals

            SET
                status = 'completed',
                execution_result = $2::jsonb

            WHERE id = $1
            `,
            [
                planId,
                JSON.stringify(result)
            ]
        );


        console.log(
            "[Recovery] Action completed:",
            action
        );


        return {

            success: true,

            planId,

            action,

            result,

            completedAt:
                new Date().toISOString()
        };


    } catch (error) {


        // ----------------------------------
        // RECORD FAILURE
        // ----------------------------------

        await db.query(
            `
            UPDATE recovery_approvals

            SET
                status = 'failed',
                execution_result = $2::jsonb

            WHERE id = $1
            `,
            [
                planId,
                JSON.stringify({
                    error: error.message
                })
            ]
        );


        throw error;
    }
}