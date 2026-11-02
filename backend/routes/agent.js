import express from "express";

import {
    runAutonomousAgent,
    analyzeNetworkHealth,
    analyzeFocusedNetworkIssue
} from "../services/aiAgent.js";

import {
    upgradeNode,
    openFirewall,
    setEnv
} from "../services/executor.js";

import { rollback } from "../services/snapshot.js";
import { log } from "../services/audit.js";
import {
    runAll,
    checkDhcpConfiguration,
    checkNetworkAdapterStatus,
    checkGatewayConnectivity,
    checkDnsResolution,
    checkInternetConnectivity
} from "../services/diagnostics.js";

import {
    createRecoveryPlan,
    executeApprovedRecovery,
    listRecoveryHistory,
    getRecoveryHistoryRecord,
    saveRecoveryVerification
} from "../services/recovery.js";

import {
    run,
    pingHost
} from "../utils/shell.js";

// MongoDB has been replaced with Neon PostgreSQL.
import {
    saveInvestigation,
    listInvestigations,
    getInvestigation,
    deleteInvestigation,
    clearInvestigations,
    buildMemoryContext
} from "../services/history.js";


const router = express.Router();

const AGENT_PORT = Number(process.env.PORT || 5000);

const MAX_MESSAGE_LENGTH = 1500;


// --------------------------------------------------
// VALIDATE USER MESSAGE
// --------------------------------------------------

function validateMessage(message) {

    if (
        typeof message !== "string" ||
        !message.trim()
    ) {
        return "Please provide a troubleshooting message.";
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
        return "Message is too long. Maximum length is 1500 characters.";
    }

    return null;
}


// --------------------------------------------------
// RUN AI AGENT AND SAVE RESULTS TO NEON
// --------------------------------------------------
// --------------------------------------------------
// RUN AI AGENT WITH PERSISTENT MEMORY
// --------------------------------------------------

async function runAndSaveInvestigation(
    message,
    onActivity = () => {}
) {

    let memoryContext = "";

    // ------------------------------------------
    // LOAD PREVIOUS INVESTIGATIONS FROM NEON
    // ------------------------------------------

    try {

        memoryContext = await buildMemoryContext(3);

        if (memoryContext) {

            console.log(
                "[Memory] Previous investigation context loaded."
            );

            onActivity({
                type: "memory_loaded",
                message: "Previous troubleshooting history loaded from Neon."
            });

        } else {

            console.log(
                "[Memory] No previous investigations found."
            );

            onActivity({
                type: "memory_empty",
                message: "No previous history. Starting a fresh investigation."
            });
        }

    } catch (error) {

        console.error(
            "[Memory] Could not load history:",
            error.message
        );

        onActivity({
            type: "warning",
            message: "Previous history could not be loaded. Continuing without memory."
        });
    }


    // ------------------------------------------
    // RUN AI WITH HISTORICAL CONTEXT
    // ------------------------------------------

    const result = await runAutonomousAgent(
        message,
        onActivity,
        memoryContext
    );


    // ------------------------------------------
    // SAVE NEW INVESTIGATION
    // ------------------------------------------

    let historyId = null;
    let historyWarning = null;

    try {

        const saved = await saveInvestigation({
            userMessage: message,
            ...result
        });

        historyId = saved.id;

        console.log(
            "[History] Investigation saved:",
            historyId
        );

        onActivity({
            type: "history_saved",
            message: "Investigation saved to Neon PostgreSQL."
        });

    } catch (error) {

        historyWarning = error.message;

        console.error(
            "[History] Save failed:",
            error.message
        );
    }


    return {
        ...result,
        historyId,
        historyWarning
    };
}


  

// --------------------------------------------------
// AUTONOMOUS AI AGENT
// POST /api/autonomous
// --------------------------------------------------

router.post("/autonomous", async (req, res) => {

    try {

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        const validationError = validateMessage(message);

        if (validationError) {

            return res.status(400).json({
                success: false,
                error: validationError
            });
        }

        console.log(
            "[autonomous] Starting AI investigation."
        );

        const result = await runAndSaveInvestigation(
            message
        );

        await log("ai_agent:completed", {
            model: result.model,
            toolCount: result.steps?.length || 0,
            historyId: result.historyId
        });

        return res.json({
            success: true,
            ...result
        });

    } catch (error) {

        console.error(
            "[autonomous] error:",
            error.message || error
        );

        return res.status(502).json({
            success: false,
            error: error.message || "The AI agent failed."
        });
    }
});


// --------------------------------------------------
// PLAN GENERATION
// POST /api/plan
// --------------------------------------------------

router.post("/plan", async (req, res) => {

    try {

        const message =
            typeof req.body?.message === "string"
                ? req.body.message.trim()
                : "";

        if (!message) {

            return res.status(400).json({
                error: "Please describe your problem."
            });
        }

        const plan = [];

        const msg = message.toLowerCase();

        if (msg.includes("node")) {

            plan.push({
                action: "upgrade_node",
                args: {}
            });
        }

        if (msg.includes("firewall")) {

            plan.push({
                action: "open_firewall",
                args: {
                    port: AGENT_PORT
                }
            });
        }

        if (
            msg.includes("wifi") ||
            msg.includes("diagnostics") ||
            msg.includes("internet")
        ) {

            plan.push({
                action: "diagnostics",
                args: {
                    port: AGENT_PORT
                }
            });
        }

        await log("plan:proposed", {
            message,
            plan
        });

        return res.json({

            plan,

            needs_permission: plan.length > 0,

            permission_prompt: plan.length > 0
                ? "Do you approve running these actions?"
                : null

        });

    } catch (error) {

        console.error(
            "[plan] error:",
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});


// --------------------------------------------------
// EXECUTE DIAGNOSTIC TOOLS
// POST /api/execute
// --------------------------------------------------

router.post("/execute", async (req, res) => {

    try {

        const {
            tool,
            args = {},
            permission
        } = req.body;

        if (permission !== true) {

            return res.status(403).json({
                error: "Permission required."
            });
        }

        if (
            !args ||
            typeof args !== "object" ||
            Array.isArray(args)
        ) {

            return res.status(400).json({
                error: "Invalid tool arguments."
            });
        }

        let result;

        switch (tool) {

            // NETWORK PING
            case "ping": {

                const host = String(
                    args.host || "8.8.8.8"
                ).trim();

                const count = Number(
                    args.count || 4
                );

                const validHost =
                    /^(?=.{1,253}$)[a-zA-Z0-9.-]+$/;

                if (!validHost.test(host)) {

                    return res.status(400).json({
                        error: "Invalid hostname."
                    });
                }

                if (
                    !Number.isInteger(count) ||
                    count < 1 ||
                    count > 4
                ) {

                    return res.status(400).json({
                        error: "Ping count must be between 1 and 4."
                    });
                }

                result = await pingHost(
                    host,
                    count
                );

                break;
            }

            // WINDOWS PROCESS LIST
            case "tasklist": {

                if (process.platform !== "win32") {

                    return res.status(400).json({
                        error: "Tasklist is Windows-only."
                    });
                }

                result = await run("tasklist", {
                    timeoutMs: 5000
                });

                break;
            }

            // DNS LOOKUP
            case "nslookup": {

                const domain = String(
                    args.domain || "example.com"
                ).trim();

                const validDomain =
                    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*\.?$/;

                if (!validDomain.test(domain)) {

                    return res.status(400).json({
                        error: "Invalid DNS domain."
                    });
                }

                result = await run(
                    `nslookup ${domain}`,
                    {
                        timeoutMs: 8000,
                        ignoreExitCode: true
                    }
                );

                break;
            }

            // SYSTEM DIAGNOSTICS
            case "diagnostics": {

                const port = Number(
                    args.port || AGENT_PORT
                );

                const {
                    summary,
                    results
                } = await runAll({
                    port
                });

                result = {
                    summary,
                    results
                };

                break;
            }

            // SYSTEM-CHANGING ACTIONS
            // Keep these disabled until a proper server-side
            // approval mechanism is implemented.
            case "upgrade_node":
            case "open_firewall":
            case "set_env": {

                return res.status(403).json({
                    error:
                        "System-changing actions are disabled. " +
                        "A separate secure approval workflow is required."
                });
            }

            default: {

                return res.status(400).json({
                    error: `Unknown tool: ${tool}`
                });
            }
        }

        await log("execute:completed", {
            tool,
            args
        });

        console.log(
            "[execute] completed:",
            tool
        );

        return res.json({
            success: true,
            tool,
            result
        });

    } catch (error) {

        console.error(
            "[execute] error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// --------------------------------------------------
// ROLLBACK
// POST /api/rollback
// --------------------------------------------------

router.post("/rollback", async (req, res) => {

    try {

        const {
            snapshotId,
            permission
        } = req.body;

        if (permission !== true) {

            return res.status(403).json({
                error: "Permission required for rollback."
            });
        }

        if (!snapshotId) {

            return res.status(400).json({
                error: "Snapshot ID is required."
            });
        }

        const result = await rollback(snapshotId);

        await log("rollback:attempt", {
            snapshotId,
            result
        });

        return res.json(
            result || {
                error: "No rollback result."
            }
        );

    } catch (error) {

        console.error(
            "[rollback] error:",
            error
        );

        res.status(500).json({
            error: error.message
        });
    }
});


// --------------------------------------------------
// DIAGNOSTICS
// POST /api/diagnostics
// --------------------------------------------------

router.post("/diagnostics", async (req, res) => {

    try {

        const port = Number(
            req.body?.port || AGENT_PORT
        );

        const {
            summary,
            results
        } = await runAll({
            port
        });

        return res.json({
            success: true,
            summary,
            results
        });

    } catch (error) {

        console.error(
            "[diagnostics] error:",
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// ==========================================
// AI NETWORK HEALTH REPORT
// POST /api/network/analyze
// ==========================================

router.post("/network/analyze", async (req, res) => {

    try {

        const port = Number(
            req.body?.port || AGENT_PORT
        );

        if (
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535
        ) {

            return res.status(400).json({

                success: false,

                error: "Invalid diagnostic port."

            });

        }


        // ----------------------------------
        // RUN NETWORK DIAGNOSTICS ONCE
        // ----------------------------------

        console.log(
            "[Network Health] Running diagnostic suite."
        );

        const diagnosticReport = await runAll({
            port
        });


        // ----------------------------------
        // ASK GEMINI TO INTERPRET RESULTS
        // ----------------------------------

        let aiResult = null;

        let aiWarning = null;

        try {

            aiResult = await analyzeNetworkHealth(
                diagnosticReport
            );

        } catch (error) {

            aiWarning = error.message;

            console.error(
                "[Network Health] Gemini analysis failed:",
                error.message
            );

        }


        // ----------------------------------
        // RETURN COMPLETE REPORT
        // ----------------------------------

        return res.json({

            success: true,

            summary: diagnosticReport.summary,

            results: diagnosticReport.results,

            analysis: aiResult?.analysis || null,

            model: aiResult?.model || null,

            analyzedAt:
                aiResult?.analyzedAt || null,

            aiWarning

        });

    } catch (error) {

        console.error(
            "[Network Health] Report failed:",
            error.message
        );

        return res.status(500).json({

            success: false,

            error: "Network health analysis failed.",

            details: error.message

        });

    }

});
// Focused investigation of one network component
router.post("/network/investigate", async (req, res) => {
    try {
        const componentId = String(req.body?.componentId || "").trim();

        // Only allow these five diagnostic components
        const allowedChecks = {
            network_adapter_status: checkNetworkAdapterStatus,
            dhcp_status: checkDhcpConfiguration,
            gateway_connectivity: checkGatewayConnectivity,
            dns_resolution: checkDnsResolution,
            internet_connectivity: checkInternetConnectivity
        };

        const diagnosticCheck = allowedChecks[componentId];

        if (!diagnosticCheck) {
            return res.status(400).json({
                success: false,
                error: "Invalid network component ID."
            });
        }

        // Run only the selected diagnostic
        const rawResult = await diagnosticCheck();

        const diagnosticResult = {
            ...(rawResult && typeof rawResult === "object"
                ? rawResult
                : { message: String(rawResult ?? "No diagnostic data returned.") }),
            id: componentId
        };

        // Ask Gemini to investigate this specific result
        const focusedAnalysis = await analyzeFocusedNetworkIssue(
            componentId,
            diagnosticResult
        );

        return res.json({
            success: true,
            componentId,
            component: focusedAnalysis.component,
            diagnostic: diagnosticResult,
            analysis: focusedAnalysis.analysis,
            model: focusedAnalysis.model,
            analyzedAt: focusedAnalysis.analyzedAt
        });

    } catch (error) {
        console.error("Focused network investigation error:", error);

        return res.status(500).json({
            success: false,
            error: "Focused network investigation failed.",
            details: error.message
        });
    }
});
// --------------------------------------------------
// LIVE AUTONOMOUS AGENT - SSE
// POST /api/autonomous/stream
// --------------------------------------------------

router.post("/autonomous/stream", async (req, res) => {

    const message =
        typeof req.body?.message === "string"
            ? req.body.message.trim()
            : "";

    const validationError = validateMessage(message);

    if (validationError) {

        return res.status(400).json({
            success: false,
            error: validationError
        });
    }

    // SSE headers.
    res.status(200);

    res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    res.flushHeaders();

    let clientDisconnected = false;

    res.on("close", () => {

        if (!res.writableEnded) {
            clientDisconnected = true;
        }
    });


    function sendEvent(event, payload) {

        if (
            clientDisconnected ||
            res.writableEnded
        ) {
            return;
        }

        res.write(
            `event: ${event}\n` +
            `data: ${JSON.stringify(payload)}\n\n`
        );
    }


    sendEvent("activity", {
        type: "started",
        message: "TechFix autonomous investigation started."
    });

    console.log(
        "[autonomous stream] Started."
    );


    try {

        const result = await runAndSaveInvestigation(
            message,

            (activity) => {
                sendEvent("activity", activity);
            }
        );

        await log("ai_agent:stream_completed", {
            model: result.model,
            toolCount: result.steps?.length || 0,
            historyId: result.historyId,
            partial: Boolean(result.partial)
        });

        sendEvent("result", {
            success: true,
            ...result
        });

        console.log(
            "[autonomous stream] Completed."
        );

    } catch (error) {

        console.error(
            "[autonomous stream] Error:",
            error.message
        );

        sendEvent("error", {
            success: false,
            error: error.message ||
                "The AI investigation failed."
        });

    } finally {

        sendEvent("done", {});

        if (!res.writableEnded) {
            res.end();
        }
    }
});


// ==================================================
// NEON POSTGRESQL - INVESTIGATION HISTORY
// ==================================================


// --------------------------------------------------
// GET ALL INVESTIGATIONS
// GET /api/history
// --------------------------------------------------

router.get("/history", async (req, res) => {

    try {

        const limit = Number(
            req.query.limit || 10
        );

        const investigations =
            await listInvestigations(limit);

        return res.json({
            success: true,
            count: investigations.length,
            investigations
        });

    } catch (error) {

        console.error(
            "[History] List error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// --------------------------------------------------
// GET ONE INVESTIGATION
// GET /api/history/:id
// --------------------------------------------------

router.get("/history/:id", async (req, res) => {

    try {

        const investigation =
            await getInvestigation(req.params.id);

        if (!investigation) {

            return res.status(404).json({
                success: false,
                error: "Investigation not found."
            });
        }

        return res.json({
            success: true,
            investigation
        });

    } catch (error) {

        console.error(
            "[History] Read error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// --------------------------------------------------
// DELETE ONE INVESTIGATION
// DELETE /api/history/:id
// --------------------------------------------------

router.delete("/history/:id", async (req, res) => {

    try {

        const deleted =
            await deleteInvestigation(req.params.id);

        if (!deleted) {

            return res.status(404).json({
                success: false,
                error: "Investigation not found."
            });
        }

        return res.json({
            success: true,
            message: "Investigation deleted."
        });

    } catch (error) {

        console.error(
            "[History] Delete error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// --------------------------------------------------
// DELETE ALL INVESTIGATIONS
// DELETE /api/history
// --------------------------------------------------

router.delete("/history", async (req, res) => {

    try {

        await clearInvestigations();

        return res.json({
            success: true,
            message: "All investigation history cleared."
        });

    } catch (error) {

        console.error(
            "[History] Clear error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// AI-POWERED RECOVERY RECOMMENDATIONS
// ==========================================

router.post("/recovery/recommend", async (req, res) => {

    try {

        // ----------------------------------
        // VALIDATE USER PROBLEM
        // ----------------------------------

        const problem =
            typeof req.body?.problem === "string"
                ? req.body.problem.trim()
                : "";

        if (problem.length < 8) {

            return res.status(400).json({
                success: false,
                error: "Please describe your computer problem in more detail."
            });

        }

        if (problem.length > 1500) {

            return res.status(400).json({
                success: false,
                error: "Problem description must be under 1500 characters."
            });

        }


        // ==================================
        // AI INVESTIGATION INSTRUCTIONS
        // ==================================

        const investigationPrompt = `

You are TechFix AI, an intelligent Windows troubleshooting agent.

Investigate the following user-reported problem.

USER PROBLEM:
<user_problem>
${problem}
</user_problem>


YOUR INVESTIGATION TASKS:

1. Understand the reported problem.
2. Select appropriate READ-ONLY diagnostic tools.
3. Use actual tool results as evidence.
4. Explain the likely cause.
5. Recommend a recovery action only when diagnostic evidence supports it.


AVAILABLE DIAGNOSTIC TOOLS:

- lookup_dns
- ping_host
- run_diagnostics
- check_dhcp_configuration
- check_network_adapter_status
- list_windows_processes

COMPREHENSIVE NETWORK INVESTIGATION:

For a general network connectivity investigation, call run_diagnostics first.

The run_diagnostics tool already includes:

- Network adapter status
- DHCP configuration
- Default gateway connectivity
- External HTTPS connectivity
- General system diagnostics

Do not call individual network diagnostic tools again when the same results are already available.

Use lookup_dns for additional domain-specific DNS testing when necessary.

Use ping_host only when additional connectivity testing is justified.

Avoid redundant diagnostic calls.

NETWORK ADAPTER INVESTIGATION:

When a user reports Wi-Fi or Ethernet problems:

1. Use check_network_adapter_status.
2. Examine the actual adapter status counts.
3. Identify whether any adapters are connected, disconnected, or disabled.
4. Do not assume disconnected adapters are faulty.
5. The current diagnostic returns aggregate counts, not individual adapter identities.
6. Do not assume that an active adapter is necessarily the adapter used by the affected connection.
7. If adapter information is insufficient, explain the limitation.
8. Do not execute adapter modifications.
9. Do not recommend DNS flushing or DHCP renewal merely because an adapter is disconnected.

DNS INVESTIGATION:

If DNS resolution is relevant:

1. Use lookup_dns.
2. Examine the actual lookup result.
3. If resolution succeeds, report DNS as successful.
4. If the lookup genuinely fails, report DNS failure.
5. Do not assume DNS failure merely because a website does not open.


DHCP INVESTIGATION:

If the problem involves:

- Windows not obtaining an IP address.
- Connected Wi-Fi with no usable IPv4 address.
- An APIPA address.
- Possible DHCP server or lease problems.

Use check_dhcp_configuration.

Interpret its actual results.

DHCP RENEWAL may only be recommended when:

- The diagnostic is supported.
- A connected DHCP-enabled adapter exists.
- The diagnostic reports an APIPA address or no usable IPv4 address.

Do not recommend DHCP renewal when DHCP configuration is healthy.

Do not recommend DHCP renewal when no active DHCP-enabled adapter is detected.


AVAILABLE RECOVERY ACTIONS:

1. flush_dns_cache
   Clears the Windows DNS resolver cache.

2. renew_dhcp_lease
   Requests a renewed Windows DHCP lease.

3. none
   No recovery action is currently justified.


STRICT SAFETY RULES:

- All diagnostic tools are READ-ONLY.
- Never execute recovery commands.
- Never modify Windows settings.
- Never execute arbitrary shell commands.
- Never claim a diagnostic ran unless its actual result was received.
- Never invent diagnostic results.
- The backend independently validates every recommendation.
- The user must explicitly approve recovery execution.


FINAL RESPONSE FORMAT:

Explain:

- What you investigated.
- Which tools were used.
- What the actual results show.
- The most likely cause.
- The safest next step.

At the very end, include these exact markers:

DNS_LOOKUP_RESULT: failed | success | not_tested

DHCP_CHECK_RESULT: failed | healthy | not_tested | unsupported

RECOMMENDED_ACTION: flush_dns_cache | renew_dhcp_lease | none

Replace each line with exactly ONE appropriate value.

IMPORTANT:

Only recommend flush_dns_cache when an actual DNS lookup failed.
IMPORTANT DNS CLASSIFICATION:

- If hostname validation rejects the input before a DNS query,
  classify DNS_LOOKUP_RESULT as not_tested.
- If a valid DNS query executes but times out or returns
  a resolver failure, classify it as failed.
- If a valid DNS query resolves successfully, classify it as success.
- Never treat an invalid diagnostic input as proof of a DNS outage.

Only recommend renew_dhcp_lease when an actual DHCP diagnostic reports an eligible problem.

For all other situations, recommend none.

        `.trim();


        // ==================================
        // RUN AUTONOMOUS AI INVESTIGATION
        // ==================================

        const investigation =
            await runAndSaveInvestigation(
                investigationPrompt
            );


        // ==================================
        // EXTRACT AI DIAGNOSIS
        // ==================================

        const possibleReplies = [

            investigation?.reply,

            investigation?.response,

            investigation?.message,

            investigation?.result?.reply

        ];

        const diagnosis =
            possibleReplies.find(
                value => typeof value === "string"
            ) || JSON.stringify(
                investigation,
                null,
                2
            );


        // ==================================
        // PARSE AI RECOMMENDATIONS
        // ==================================

        const actionMatch = diagnosis.match(
            /RECOMMENDED_ACTION\s*:\s*(flush_dns_cache|renew_dhcp_lease|none)\b/i
        );

        const dnsFailed =
            /DNS_LOOKUP_RESULT\s*:\s*failed\b/i.test(
                diagnosis
            );

        const dhcpFailed =
            /DHCP_CHECK_RESULT\s*:\s*failed\b/i.test(
                diagnosis
            );

        const requestedAction = actionMatch
            ? actionMatch[1].toLowerCase()
            : "none";
        const recoveryContext = {

             investigationId: investigation?.historyId || null,

              problemDescription: problem || "",

            aiDiagnosis: diagnosis || ""

        };

        // ==================================
        // BACKEND RECOVERY VALIDATION
        // ==================================

        let plan = null;

        let validationMessage = null;


        // ----------------------------------
        // DNS RECOVERY
        // ----------------------------------

        // ==========================================
// DNS RECOVERY WITH INDEPENDENT VALIDATION
// ==========================================

if (
    requestedAction === "flush_dns_cache" &&
    dnsFailed
) {

    console.log(
        "[Recovery] AI reported DNS failure. Performing independent verification."
    );

    // First fresh DNS diagnostic.

    let dnsEvidence = await checkDnsResolution();

    let confirmedDnsFailure =
        dnsEvidence?.supported === true &&
        dnsEvidence?.ok === false &&
        dnsEvidence?.state === "not_resolved";


    // If the first check fails, repeat it.

    if (confirmedDnsFailure) {

        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );

        dnsEvidence = await checkDnsResolution();

        confirmedDnsFailure =
            dnsEvidence?.supported === true &&
            dnsEvidence?.ok === false &&
            dnsEvidence?.state === "not_resolved";

    }


    if (confirmedDnsFailure) {

        console.log(
            "[Recovery] DNS failure independently confirmed twice."
        );

        plan = await createRecoveryPlan(
            "flush_dns_cache",
            recoveryContext
        );

    } else {

        validationMessage =
            "Gemini detected a DNS lookup failure, but fresh backend diagnostics did not confirm a persistent DNS problem. No recovery plan was created.";

        console.warn(
            "[Recovery] DNS recovery recommendation rejected because current DNS failure was not independently confirmed."
        );

    }

}

        
        // ----------------------------------
        // DHCP RECOVERY
        // ----------------------------------

        else if (
            requestedAction === "renew_dhcp_lease" &&
            dhcpFailed
        ) {

            /*
             * Do not trust the AI recommendation alone.
             * Independently inspect DHCP configuration.
             */

            const dhcpEvidence =
                await checkDhcpConfiguration();


            if (
                dhcpEvidence?.supported === true &&
                dhcpEvidence?.recommendationEligible === true
            ) {

                plan =
                   await createRecoveryPlan(
                   "renew_dhcp_lease",
                    recoveryContext
            );
            
                        
                    

            } else {

                validationMessage =
                    "The AI suggested DHCP renewal, but the backend did not independently verify an eligible DHCP problem. No recovery plan was created.";

                console.warn(
                    "[Recovery] DHCP recommendation rejected by backend validation."
                );

            }

        }


        // ==================================
        // PREPARE RESPONSE
        // ==================================

        const actualAction = plan
            ? plan.action
            : "none";


        return res.json({

            success: true,

            diagnosis,

            recommendedAction: actualAction,

            plan,

            historyId:
                investigation?.historyId || null,

            validationMessage,

            message: plan

                ? `AI investigation completed. ${plan.title} is recommended. Explicit user approval is required.`

                : validationMessage ||
                  "AI investigation completed. No supported recovery action was recommended."

        });


    } catch (error) {

        console.error(
            "[Recovery Recommendation Error]",
            error.message
        );

        return res.status(500).json({

            success: false,

            error: "AI recovery recommendation failed.",

            details: error.message

        });

    }

});
// --------------------------------------------------
// EXPORT ROUTER
// --------------------------------------------------
// ==========================================
// CREATE RECOVERY PLAN
// POST /api/recovery/plan
// ==========================================

router.post("/recovery/plan", async (req, res) => {

    try {

        const {
            action
        } = req.body;

        if (!action) {

            return res.status(400).json({
                success: false,
                error: "Recovery action is required."
            });
        }

        const plan = await createRecoveryPlan(action);

        await log("recovery:plan_created", {
            action: plan.action,
            planId: plan.planId
        });

        res.json({

            success: true,

            plan
        });

    } catch (error) {

        console.error(
            "[Recovery] Plan error:",
            error.message
        );

        res.status(400).json({

            success: false,

            error: error.message
        });
    }
});


// ==========================================
// EXECUTE APPROVED RECOVERY
// POST /api/recovery/execute
// ==========================================

router.post("/recovery/execute", async (req, res) => {

    try {

        const {
            planId,
            confirmed
        } = req.body;

        const result =
            await executeApprovedRecovery(
                planId,
                confirmed
            );

        await log("recovery:executed", {

            action: result.action,

            completedAt: result.completedAt
        });

        res.json({

            success: true,

            ...result
        });

    } catch (error) {

        console.error(
            "[Recovery] Execution error:",
            error.message
        );

        res.status(400).json({

            success: false,

            error: error.message
        });
    }
});
// ==========================================
// POST-RECOVERY VERIFICATION
// ==========================================

router.post("/recovery/verify", async (req, res) => {

    try {

        const action = String(req.body?.action || "").trim();

        const verificationChecks = {
            flush_dns_cache: {
                componentId: "dns_resolution",
                check: checkDnsResolution,
                expectedState: "resolved"
            },

            renew_dhcp_lease: {
                componentId: "dhcp_status",
                check: checkDhcpConfiguration,
                expectedState: "healthy"
            }
        };

        const selectedCheck = verificationChecks[action];

        if (!selectedCheck) {
            return res.status(400).json({
                success: false,
                error: "Unsupported recovery verification action."
            });
        }

        const rawResult = await selectedCheck.check();

        const verification = {
            ...(rawResult && typeof rawResult === "object"
                ? rawResult
                : {}),

            id: selectedCheck.componentId
        };

        const passed =
            verification.state === selectedCheck.expectedState;

        const planId =
            typeof req.body?.planId === "string"
                ? req.body.planId.trim()
                : null;

        let historySaved = false;

        if (planId) {
            historySaved = await saveRecoveryVerification(
                planId,
                action,
                {
                    ...verification,
                    passed,
                    message: passed
                        ? "Post-recovery diagnostic passed."
                        : "Post-recovery diagnostic needs further investigation.",
                    verifiedAt: new Date().toISOString()
                }
            );

            if (!historySaved) {
                return res.status(409).json({
                    success: false,
                    error: "Verification completed, but it could not be linked to a matching completed recovery record.",
                    verification,
                    passed
                });
            }
        }

        return res.json({
            success: true,
            action,
            verification,
            passed,
            message: passed
                ? "Post-recovery diagnostic passed."
                : "The component still needs attention or its status is inconclusive.",
            verifiedAt: new Date().toISOString()
        });

    } catch (error) {

        console.error(
            "[Recovery Verification Error]",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Post-recovery verification failed.",
            details: error.message
        });
        

    }

});

// ==========================================
// LIST RECOVERY HISTORY
// GET /api/recovery/history
// ==========================================

router.get("/recovery/history", async (req, res) => {

    try {

        const limit = Number(req.query.limit || 20);

        const records = await listRecoveryHistory(limit);

        return res.json({

            success: true,

            count: records.length,

            records

        });
     } catch (error) {

        console.error(
            "[Recovery History] List error:",
            error.message
        );

        return res.status(500).json({

            success: false,

            error: "Could not retrieve recovery history."

        });

    }
    

});


// ==========================================
// GET ONE RECOVERY HISTORY RECORD
// GET /api/recovery/history/:id
// ==========================================

router.get("/recovery/history/:id", async (req, res) => {

    try {

        const record =
            await getRecoveryHistoryRecord(req.params.id);

        if (!record) {

            return res.status(404).json({

                success: false,

                error: "Recovery history record not found."

            });

        }

        return res.json({

            success: true,

            record

        });

    } catch (error) {

        console.error(
            "[Recovery History] Record error:",
            error.message
        );

        return res.status(500).json({

            success: false,

            error: "Could not retrieve recovery record."

        });

    }

});
export default router;