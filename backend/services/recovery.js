import { randomUUID } from "node:crypto";

import { getPool } from "./database.js";

import {
    flushDnsCache,
    renewDhcpLease
} from "./executor.js";

import {
    checkDhcpConfiguration
} from "./diagnostics.js";


// ==========================================
// ALLOWED RECOVERY ACTIONS
// ==========================================

const RECOVERY_ACTIONS = {

    // --------------------------------------
    // DNS CACHE FLUSH
    // --------------------------------------

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
    },


    // --------------------------------------
    // DHCP LEASE RENEWAL
    // --------------------------------------

    renew_dhcp_lease: {

        title: "Renew Windows DHCP Lease",

        description:
            "Request a fresh IPv4 lease from the DHCP server when a connected DHCP-enabled adapter has no usable IPv4 address.",

        risk: "Medium",

        changes:
            "Requests renewed IPv4 network configuration from the DHCP server. Network connectivity may be briefly interrupted.",

        reversible: false,

        execution:
            "Uses the fixed Windows command ipconfig /renew."
    }

};


// ==========================================
// APPROVAL EXPIRY
// ==========================================

const APPROVAL_EXPIRY = 2 * 60 * 1000;


// ==========================================
// VALIDATE DHCP ELIGIBILITY
// ==========================================

async function validateDhcpEligibility() {

    if (process.platform !== "win32") {

        throw new Error(
            "DHCP lease renewal is currently supported only on Windows."
        );
    }

    const diagnostic =
        await checkDhcpConfiguration();

    if (diagnostic?.supported !== true) {

        throw new Error(
            "DHCP configuration could not be verified. Recovery plan creation is not permitted."
        );
    }

    if (diagnostic.recommendationEligible !== true) {

        throw new Error(
            "DHCP lease renewal is not recommended. No eligible DHCP configuration problem was detected."
        );
    }

    return diagnostic;
}


/// ==========================================
// CREATE RECOVERY PLAN
// ==========================================

export async function createRecoveryPlan(action, context = {}) {

    const selectedAction = RECOVERY_ACTIONS[action];

    if (!selectedAction) {
        throw new Error(
            "This recovery action is not permitted."
        );
    }

    // --------------------------------------
    // INDEPENDENT DHCP VALIDATION
    // --------------------------------------

    if (action === "renew_dhcp_lease") {

        const diagnostic =
            await validateDhcpEligibility();

        console.log(
            "[Recovery] DHCP eligibility verified:",
            diagnostic.state
        );
    }

    // --------------------------------------
    // PREPARE INVESTIGATION CONTEXT
    // --------------------------------------

    const validUuid =
        typeof context.investigationId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(context.investigationId);

    const investigationId =
        validUuid ? context.investigationId : null;

    const problemDescription =
        typeof context.problemDescription === "string"
            ? context.problemDescription.slice(0, 1500)
            : null;

    const aiDiagnosis =
        typeof context.aiDiagnosis === "string"
            ? context.aiDiagnosis.slice(0, 8000)
            : null;

    // --------------------------------------
    // CREATE PERSISTENT APPROVAL
    // --------------------------------------

    const db = getPool();

    const planId = randomUUID();

    const expiresAt =
        new Date(Date.now() + APPROVAL_EXPIRY);

    await db.query(
        `
        INSERT INTO recovery_approvals (
            id,
            action,
            expires_at,
            investigation_id,
            problem_description,
            ai_diagnosis
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            planId,
            action,
            expiresAt,
            investigationId,
            problemDescription,
            aiDiagnosis
        ]
    );

    console.log(
        "[Recovery] Persistent approval created:",
        planId,
        action
    );

    return {

        planId,

        action,

        title: selectedAction.title,

        description: selectedAction.description,

        risk: selectedAction.risk,

        changes: selectedAction.changes,

        reversible: selectedAction.reversible,

        execution: selectedAction.execution,

        approvalRequired: true,

        expiresAt: expiresAt.toISOString()

    };

}
// ==========================================
// EXECUTE APPROVED RECOVERY
// ==========================================

export async function executeApprovedRecovery(
    planId,
    confirmed
) {

    // --------------------------------------
    // VERIFY EXPLICIT APPROVAL
    // --------------------------------------

    if (confirmed !== true) {

        throw new Error(
            "Explicit user approval is required."
        );
    }


    // --------------------------------------
    // VALIDATE PLAN ID
    // --------------------------------------

    if (
        typeof planId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)
    ) {

        throw new Error(
            "Invalid recovery plan ID."
        );
    }


    const db = getPool();


    // ======================================
    // CLAIM APPROVAL ATOMICALLY
    // ======================================

    /*
     * Only one request can change a pending
     * recovery plan into the executing state.
     *
     * Expired or previously used approvals
     * cannot execute again.
     */

    const claim = await db.query(
        `
        UPDATE recovery_approvals

        SET
            status = 'executing',
            used_at = NOW(),
            approved_at = NOW()

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


    const action =
        claim.rows[0].action;


    // ======================================
    // EXECUTE ALLOWED RECOVERY ACTION
    // ======================================

    try {

        let result;


        switch (action) {


            // ----------------------------------
            // DNS CACHE FLUSH
            // ----------------------------------

            case "flush_dns_cache": {

                result =
                    await flushDnsCache();

                break;
            }


            // ----------------------------------
            // DHCP LEASE RENEWAL
            // ----------------------------------

            case "renew_dhcp_lease": {

                /*
                 * Check DHCP eligibility again
                 * immediately before execution.
                 *
                 * This prevents an old plan from
                 * blindly renewing a healthy adapter.
                 */

                const diagnostic =
                    await validateDhcpEligibility();

                console.log(
                    "[Recovery] DHCP eligibility confirmed before execution:",
                    diagnostic.state
                );


                result =
                    await renewDhcpLease();

                break;
            }


            // ----------------------------------
            // UNKNOWN ACTION
            // ----------------------------------

            default:

                throw new Error(
                    "Recovery action is not permitted."
                );

        }


        // ==================================
        // SAVE SUCCESS IN NEON
        // ==================================

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


        // ==================================
        // SAVE FAILURE IN NEON
        // ==================================

        try {

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

        } catch (databaseError) {

            console.error(
                "[Recovery] Failed to record execution failure:",
                databaseError.message
            );

        }


        console.error(
            "[Recovery] Execution failed:",
            error.message
        );


        throw error;
    }

}
// ==========================================
// LIST RECOVERY HISTORY
// ==========================================

export async function listRecoveryHistory(limit = 20) {

    const db = getPool();

    const safeLimit = Math.min(
        50,
        Math.max(1, Number(limit) || 20)
    );

    const result = await db.query(
        `
        SELECT
            id,
            action,
            status,
            created_at AS "createdAt",
            expires_at AS "expiresAt",
            used_at AS "usedAt",
            approved_at AS "approvedAt",
            investigation_id AS "investigationId",
            problem_description AS "problemDescription",
            LEFT(ai_diagnosis, 500) AS "diagnosisPreview",
            verification_result AS "verificationResult",
            verified_at AS "verifiedAt"

        FROM recovery_approvals

        ORDER BY created_at DESC

        LIMIT $1;
        `,
        [safeLimit]
    );

    return result.rows;

}


// ==========================================
// GET ONE RECOVERY HISTORY RECORD
// ==========================================

export async function getRecoveryHistoryRecord(id) {

    if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
        return null;
    }

    const db = getPool();

    const result = await db.query(
        `
        SELECT
            id,
            action,
            status,
            created_at AS "createdAt",
            expires_at AS "expiresAt",
            used_at AS "usedAt",
            approved_at AS "approvedAt",
            investigation_id AS "investigationId",
            problem_description AS "problemDescription",
            ai_diagnosis AS "aiDiagnosis",
            execution_result AS "executionResult",
            verification_result AS "verificationResult",
            verified_at AS "verifiedAt"

        FROM recovery_approvals

        WHERE id = $1;
        `,
        [id]
    );

    return result.rows[0] || null;

}


// ==========================================
// SAVE POST-RECOVERY VERIFICATION
// ==========================================

export async function saveRecoveryVerification(
    planId,
    action,
    verification
) {

    if (
        typeof planId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)
    ) {

        throw new Error("Invalid recovery plan ID.");

    }

    const allowedActions = [
        "flush_dns_cache",
        "renew_dhcp_lease"
    ];

    if (!allowedActions.includes(action)) {

        throw new Error("Unsupported verification action.");

    }

    if (
        !verification ||
        typeof verification !== "object" ||
        Array.isArray(verification)
    ) {

        throw new Error("Invalid verification result.");

    }

    const db = getPool();

    const result = await db.query(
        `
        UPDATE recovery_approvals

        SET
            verification_result = $3::jsonb,
            verified_at = NOW()

        WHERE
            id = $1
            AND action = $2
            AND status = 'completed'

        RETURNING id;
        `,
        [
            planId,
            action,
            JSON.stringify(verification)
        ]
    );

    return result.rowCount > 0;

}