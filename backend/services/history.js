import { randomUUID } from "node:crypto";
import { getPool } from "./database.js";


// --------------------------------------------------
// SECRET REDACTION
// --------------------------------------------------

function redactSecrets(value) {

    return String(value ?? "")

        .replace(
            /\bAIza[0-9A-Za-z_-]{20,}\b/g,
            "[REDACTED_API_KEY]"
        )

        .replace(
            /\bhf_[A-Za-z0-9]{10,}\b/gi,
            "[REDACTED_TOKEN]"
        )

        .replace(
            /\bsk-[A-Za-z0-9_-]{10,}\b/g,
            "[REDACTED_TOKEN]"
        )

        .replace(
            /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
            "Bearer [REDACTED]"
        )

        .replace(
            /(api[_-]?key|token|password)\s*([=:])\s*["']?[^"'\s,;]+/gi,
            "$1$2[REDACTED]"
        );
}


// --------------------------------------------------
// PREPARE DIAGNOSTIC RESULTS
// --------------------------------------------------

function prepareSteps(steps) {

    if (!Array.isArray(steps)) {
        return [];
    }

    return steps.slice(0, 4).map(step => {

        let result;

        try {

            const serialized = redactSecrets(
                JSON.stringify(step.result ?? null)
            );

            result = serialized.length > 7000
                ? {
                    truncated: true,
                    preview: serialized.slice(0, 6500)
                }
                : JSON.parse(serialized);

        } catch {

            result = {
                error: "Result could not be serialized."
            };
        }

        return {
            tool: String(step.tool || "unknown"),
            result
        };
    });
}


// --------------------------------------------------
// SAVE INVESTIGATION
// --------------------------------------------------

export async function saveInvestigation(data) {

    const db = getPool();

    const id = randomUUID();

    const userMessage = redactSecrets(
        data.userMessage
    ).slice(0, 1500);

    const reply = redactSecrets(
        data.reply
    ).slice(0, 8000);

    const model = String(
        data.model || "unknown"
    );

    const steps = prepareSteps(data.steps);

    const partial = Boolean(data.partial);

    const warning = data.warning
        ? redactSecrets(data.warning).slice(0, 1000)
        : null;


    const query = `
        INSERT INTO investigations (
            id,
            user_message,
            reply,
            model,
            steps,
            partial,
            warning
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        RETURNING id, created_at;
    `;

    const values = [
        id,
        userMessage,
        reply,
        model,
        JSON.stringify(steps),
        partial,
        warning
    ];

    const result = await db.query(
        query,
        values
    );

    console.log(
        "[History] Saved investigation:",
        id
    );

    return {
        id: result.rows[0].id,
        createdAt: result.rows[0].created_at
    };
}


// --------------------------------------------------
// LIST INVESTIGATIONS
// --------------------------------------------------

export async function listInvestigations(limit = 10) {

    const db = getPool();

    const safeLimit = Math.min(
        50,
        Math.max(1, Number(limit) || 10)
    );

    const result = await db.query(
        `
        SELECT
            id,
            created_at AS "createdAt",
            user_message AS "userMessage",
            reply,
            model,
            steps,
            partial
        FROM investigations
        ORDER BY created_at DESC
        LIMIT $1;
        `,
        [safeLimit]
    );

    return result.rows.map(record => ({

        id: record.id,

        createdAt: record.createdAt,

        userMessage: record.userMessage,

        replyPreview: String(
            record.reply || ""
        ).slice(0, 220),

        model: record.model,

        toolNames: (record.steps || []).map(
            step => step.tool
        ),

        partial: record.partial
    }));
}


// --------------------------------------------------
// GET ONE INVESTIGATION
// --------------------------------------------------

export async function getInvestigation(id) {

    const db = getPool();

    const result = await db.query(
        `
        SELECT
            id,
            created_at AS "createdAt",
            user_message AS "userMessage",
            reply,
            model,
            steps,
            partial,
            warning
        FROM investigations
        WHERE id = $1;
        `,
        [id]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}


// --------------------------------------------------
// DELETE ONE INVESTIGATION
// --------------------------------------------------

export async function deleteInvestigation(id) {

    const db = getPool();

    const result = await db.query(
        `
        DELETE FROM investigations
        WHERE id = $1;
        `,
        [id]
    );

    return result.rowCount > 0;
}


// --------------------------------------------------
// CLEAR ALL INVESTIGATIONS
// --------------------------------------------------

export async function clearInvestigations() {

    const db = getPool();

    await db.query(
        "DELETE FROM investigations"
    );

    return true;
}


// --------------------------------------------------
// BUILD MEMORY CONTEXT
// --------------------------------------------------

export async function buildMemoryContext(limit = 3) {

    const db = getPool();

    const safeLimit = Math.min(
        3,
        Math.max(0, Number(limit) || 0)
    );

    if (safeLimit === 0) {
        return "";
    }

    const result = await db.query(
        `
        SELECT
            created_at,
            user_message,
            reply,
            steps,
            partial
        FROM investigations
        ORDER BY created_at DESC
        LIMIT $1;
        `,
        [safeLimit]
    );

    if (result.rows.length === 0) {
        return "";
    }

    return result.rows.map((record, index) => {

        const tools = (record.steps || [])
            .map(step => step.tool)
            .join(", ") || "No tools executed";

        return `
Previous investigation ${index + 1}

Date: ${record.created_at}

User issue:
${record.user_message}

Previous AI findings:
${String(record.reply || "").slice(0, 500)}

Tools used:
${tools}

Partial result:
${record.partial}

Remember: These are historical findings.
Verify everything with current diagnostic tests.
        `.trim();

    }).join("\n\n--------------------\n\n");
}