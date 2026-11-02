(() => {

    function mountRecoveryCenter() {

        if (document.getElementById("techfix-recovery-center")) return;

        const host =
            document.querySelector("main") ||
            document.querySelector("#app") ||
            document.body;

        const section = document.createElement("section");

        section.id = "techfix-recovery-center";
        section.className = "recovery-center";

        section.innerHTML = `

            <div class="recovery-header">

                <div>
                    <span class="recovery-eyebrow">
                        SYSTEM RECOVERY
                    </span>

                    <h2>Recovery Center</h2>

                    <p>
                        Diagnose problems and perform approved recovery actions.
                    </p>
                </div>

                <span class="recovery-badge">
                    Approval Required
                </span>

            </div>


            <!-- AI RECOVERY ASSISTANT -->

            <div class="recovery-ai-section">

                <h3>AI Recovery Assistant</h3>

                <p>
                    Describe your computer problem.
                    TechFix AI will investigate and recommend a suitable action.
                </p>

                <textarea
                    id="recovery-problem"
                    rows="4"
                    maxlength="1500"
                    placeholder="Example: My computer is connected to Wi-Fi, but Windows cannot obtain an IP address."
                ></textarea>

                <button id="recovery-recommend">
                    Analyze Problem with AI
                </button>

            </div>


            <!-- AI DIAGNOSIS -->

            <div id="recovery-ai-panel" hidden>

                <h3>AI Diagnosis</h3>

                <pre id="recovery-ai-diagnosis"></pre>

            </div>


            <div class="recovery-divider"></div>


            <!-- MANUAL RECOVERY -->

            <div class="recovery-controls">

                <h3>Manual Recovery</h3>

                <label for="recovery-action">
                    Available recovery action
                </label>

                <select id="recovery-action">

                    <option value="flush_dns_cache">
                        Flush Windows DNS Cache
                    </option>

                    <option value="renew_dhcp_lease">
                        Renew Windows DHCP Lease
                    </option>

                </select>

                <button id="recovery-create">
                    Create Recovery Plan
                </button>

            </div>


            <!-- STATUS -->

            <div
                id="recovery-status"
                class="recovery-status"
                role="status"
                aria-live="polite"
            >
                Ready.
            </div>


            <!-- RECOVERY PLAN -->

            <div
                id="recovery-plan"
                class="recovery-plan"
                hidden
            >

                <h3>Recovery Plan Details</h3>

                <div class="recovery-detail">
                    <span>Action</span>
                    <strong data-plan-title></strong>
                </div>

                <div class="recovery-detail">
                    <span>Risk Level</span>
                    <strong data-plan-risk></strong>
                </div>

                <div class="recovery-detail">
                    <span>Description</span>
                    <strong data-plan-description></strong>
                </div>

                <div class="recovery-detail">
                    <span>Expected Changes</span>
                    <strong data-plan-changes></strong>
                </div>

                <div class="recovery-detail">
                    <span>Execution Method</span>
                    <strong data-plan-execution></strong>
                </div>

                <div class="recovery-detail">
                    <span>Expires At</span>
                    <strong data-plan-expiry></strong>
                </div>

                <div class="recovery-approval">

                    <label>

                        <input
                            type="checkbox"
                            id="recovery-confirm"
                        >

                        I have reviewed the recovery plan,
                        understand its possible effects,
                        and approve its execution.

                    </label>

                    <button
                        id="recovery-execute"
                        disabled
                    >
                        Approve & Execute
                    </button>

                </div>

            </div>


            <!-- EXECUTION RESULT -->

            <div
                id="recovery-result"
                class="recovery-result"
                hidden
            >

                <h3>Execution Result</h3>

                <p id="recovery-result-message"></p>

                <pre id="recovery-result-output"></pre>

                <p id="recovery-result-note"></p>

            </div>
            <!-- RECOVERY HISTORY -->

<div class="recovery-history">

    <div class="recovery-history-header">
        <h3>Recovery History</h3>

        <button id="recovery-history-refresh">
            Load History
        </button>
    </div>

    <div id="recovery-history-list">
        <p>Click Load History to view previous operations.</p>
    </div>

</div>

        `;

        host.appendChild(section);


        // ==================================
        // ELEMENT REFERENCES
        // ==================================

        const createButton =
            section.querySelector("#recovery-create");

        const recommendButton =
            section.querySelector("#recovery-recommend");

        const executeButton =
            section.querySelector("#recovery-execute");

        const confirmation =
            section.querySelector("#recovery-confirm");

        const planPanel =
            section.querySelector("#recovery-plan");

        const resultPanel =
            section.querySelector("#recovery-result");

        const aiPanel =
            section.querySelector("#recovery-ai-panel");

        const status =
            section.querySelector("#recovery-status");
        const problemInput =
            section.querySelector("#recovery-problem");

        let currentPlan = null;


        // ==================================
        // STATUS MESSAGE
        // ==================================

        function setStatus(message, type = "info") {

            status.textContent = message;

            status.className =
                `recovery-status ${type}`;

        }


        // ==================================
        // API REQUEST
        // ==================================

        async function postJSON(endpoint, payload) {

            const response = await fetch(
                `${window.location.origin}/api/recovery/${endpoint}`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify(payload)
                }
            );

            const data = await response.json();

            if (!response.ok || data.success === false) {

                throw new Error(
                    data.error || "Request failed."
                );

            }

            return data;

        }


        // ==================================
        // DISPLAY RECOVERY PLAN
        // ==================================

        function displayPlan(plan) {

            section.querySelector(
                "[data-plan-title]"
            ).textContent =
                plan.title || plan.action;

            section.querySelector(
                "[data-plan-risk]"
            ).textContent =
                plan.risk || "Not specified";

            section.querySelector(
                "[data-plan-description]"
            ).textContent =
                plan.description || "No description provided.";

            section.querySelector(
                "[data-plan-changes]"
            ).textContent =
                plan.changes || "Not specified.";

            section.querySelector(
                "[data-plan-execution]"
            ).textContent =
                plan.execution || "Not specified.";

            section.querySelector(
                "[data-plan-expiry]"
            ).textContent =
                plan.expiresAt
                    ? new Date(plan.expiresAt).toLocaleString()
                    : "Not specified.";

        }


        // ==================================
        // RESET CURRENT PLAN
        // ==================================

        function resetCurrentPlan() {

            currentPlan = null;

            planPanel.hidden = true;

            confirmation.checked = false;

            executeButton.disabled = true;

        }

        // ==================================
// RECEIVE NETWORK HEALTH FINDINGS
// ==================================

document.addEventListener(
    "techfix:network-finding",
    (event) => {

        const finding = event.detail;

        if (!finding || !finding.componentId) {
            return;
        }

        const diagnostic =
            finding.diagnostic || {};

        const analysis =
            String(finding.analysis || "");

        // Build a focused problem description.
        // Keep it within the existing 1500-character limit.

        const importedProblem = [

            "Investigate this network component using the supplied findings.",

            `Component: ${String(finding.componentTitle || "Unknown").slice(0, 80)}`,

            `Component ID: ${String(finding.componentId).slice(0, 60)}`,

            `Diagnostic state: ${String(diagnostic.state || "Unknown").slice(0, 60)}`,

            `Diagnostic message: ${String(
                diagnostic.message || diagnostic.error || "Not available"
            ).slice(0, 180)}`,

            `Diagnostic evidence: ${String(
                diagnostic.evidence || "Not available"
            ).slice(0, 180)}`,

            "Previous focused AI analysis:",

            analysis.slice(0, 450),

            "Recheck the available system evidence. Recommend a recovery action only when a real problem is established. Do not execute any action automatically."

        ].join("\n\n");


        // Import findings into the Recovery Center

        problemInput.value =
            importedProblem.slice(0, 1500);


        // Clear an older recovery plan and result

        resetCurrentPlan();

        resultPanel.hidden = true;

        aiPanel.hidden = true;


        // Inform the user

        setStatus(
            "Network Health findings imported. Review the description and click Analyze Problem with AI.",
            "success"
        );


        // Bring Recovery Center into view

        section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        problemInput.focus();

       }
    );


        // ==================================
        // SHOW PLAN
        // ==================================

        function showPlan(plan) {

            if (!plan || !plan.planId) {

                throw new Error(
                    "Invalid recovery plan received."
                );

            }

            currentPlan = plan;

            displayPlan(plan);

            confirmation.checked = false;

            executeButton.disabled = true;

            planPanel.hidden = false;

            planPanel.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });

        }


        // ==================================
        // AI RECOVERY RECOMMENDATION
        // ==================================

        recommendButton.addEventListener(
            "click",
            async () => {

                const problem =
                    section.querySelector(
                        "#recovery-problem"
                    ).value.trim();

                if (problem.length < 8) {

                    setStatus(
                        "Please describe your computer problem in more detail.",
                        "error"
                    );

                    return;

                }

                resetCurrentPlan();

                resultPanel.hidden = true;

                aiPanel.hidden = true;

                recommendButton.disabled = true;

                createButton.disabled = true;

                setStatus(
                    "TechFix AI is investigating your problem..."
                );


                try {

                    const data = await postJSON(
                        "recommend",
                        { problem }
                    );


                    // Display AI diagnosis.

                    const diagnosis =
                        section.querySelector(
                            "#recovery-ai-diagnosis"
                        );

                    diagnosis.textContent =
                        data.diagnosis ||
                        "No diagnosis was returned.";

                    aiPanel.hidden = false;


                    // Display recommendation.

                    if (data.plan) {

                        showPlan(data.plan);

                        setStatus(
                            "AI investigation completed. Review the recommended recovery plan before approval.",
                            "success"
                        );

                    } else {

                        setStatus(
                            data.message ||
                            "Investigation completed. No recovery action was recommended.",
                            "info"
                        );

                    }

                } catch (error) {

                    setStatus(
                        error.message,
                        "error"
                    );

                } finally {

                    recommendButton.disabled = false;

                    createButton.disabled = false;

                }

            }
        );


        // ==================================
        // MANUAL RECOVERY PLAN CREATION
        // ==================================

        createButton.addEventListener(
            "click",
            async () => {

                resetCurrentPlan();

                resultPanel.hidden = true;

                createButton.disabled = true;

                recommendButton.disabled = true;

                setStatus(
                    "Creating recovery plan..."
                );


                try {

                    const action =
                        section.querySelector(
                            "#recovery-action"
                        ).value;

                    const data = await postJSON(
                        "plan",
                        { action }
                    );

                    showPlan(data.plan);

                    setStatus(
                        "Recovery plan created. Review the details before approving.",
                        "success"
                    );

                } catch (error) {

                    setStatus(
                        error.message,
                        "error"
                    );

                } finally {

                    createButton.disabled = false;

                    recommendButton.disabled = false;

                }

            }
        );


        // ==================================
        // USER APPROVAL
        // ==================================

        confirmation.addEventListener(
            "change",
            () => {

                executeButton.disabled =
                    !confirmation.checked ||
                    !currentPlan;

            }
        );


        // ==================================
// RECOVERY EXECUTION
// ==================================

executeButton.addEventListener(
    "click",
    async () => {

        if (
            !currentPlan ||
            !confirmation.checked
        ) {

            setStatus(
                "Review and approve the recovery plan first.",
                "error"
            );

            return;

        }


        // Check approval expiry.

        if (
            currentPlan.expiresAt &&
            Date.now() >=
            new Date(currentPlan.expiresAt).getTime()
        ) {

            resetCurrentPlan();

            setStatus(
                "This recovery plan has expired. Create a new plan.",
                "error"
            );

            return;

        }


        // Preserve approved plan information.

        const approvedPlanId =
            currentPlan.planId;

        const executedAction =
            currentPlan.action;


        executeButton.disabled = true;
        createButton.disabled = true;
        recommendButton.disabled = true;

        setStatus(
            "Executing approved recovery action..."
        );
        try {

            // ==================================
            // EXECUTE APPROVED RECOVERY
            // ==================================

            const data = await postJSON(
                "execute",
                {
                    planId: approvedPlanId,
                    confirmed: true
                }
            );


            const result =
                data.result || {};


            // Check whether execution explicitly failed.

            const executionFailed =
                result.success === false ||
                result.ok === false ||
                result.status === "failed" ||
                result.completed === false;


            // ==================================
            // EXECUTION MESSAGE
            // ==================================

            section.querySelector(
                "#recovery-result-message"
            ).textContent =
                result.message ||
                "Recovery execution completed.";


            // ==================================
            // EXECUTION OUTPUT
            // ==================================

            const outputParts = [];

            if (result.output) {

                outputParts.push(
                    typeof result.output === "string"
                        ? result.output
                        : JSON.stringify(result.output, null, 2)
                );

            }


            if (result.verification?.stdout) {

                outputParts.push(
                    "Original Verification Output:\n" +
                    result.verification.stdout
                );

            }


            if (result.verification?.stderr) {

                outputParts.push(
                    "Verification Errors:\n" +
                    result.verification.stderr
                );

            }


            // ==================================
            // POST-RECOVERY VERIFICATION
            // ==================================

            let verificationPassed = false;

            let verificationAttempted = false;

            let verificationMessage =
                "Post-recovery verification was not completed.";


            if (!executionFailed) {

                const supportedActions = [
                    "flush_dns_cache",
                    "renew_dhcp_lease"
                ];

                if (supportedActions.includes(executedAction)) {

                    try {

                        verificationAttempted = true;

                        setStatus(
                            "Recovery executed. Running a fresh diagnostic..."
                        );


                        const verificationData =
                               await postJSON(
                                             "verify",
                                    {
                                       action: executedAction,
                                       planId: approvedPlanId
                                   }
                        );


                        const verification =
                            verificationData.verification || {};


                        verificationPassed =
                            verificationData.passed === true;


                        verificationMessage =
                            verificationData.message ||
                            "Verification completed.";


                        outputParts.push(
                            "POST-RECOVERY DIAGNOSTIC",
                            "========================",
                            JSON.stringify(
                                verification,
                                null,
                                2
                            )
                        );


                    } catch (verificationError) {

                        console.error(
                            "Post-recovery verification error:",
                            verificationError
                        );

                        verificationMessage =
                            "Recovery execution finished, but follow-up verification failed: " +
                            verificationError.message;

                    }

                }

            } else {

                verificationMessage =
                    "The recovery action reported an execution failure. Verification was skipped.";

            }


            // ==================================
            // DISPLAY RESULTS
            // ==================================

            section.querySelector(
                "#recovery-result-output"
            ).textContent =
                outputParts.join("\n\n") ||
                "No additional execution output returned.";


            section.querySelector(
                "#recovery-result-note"
            ).textContent = [

                result.note || "",

                verificationMessage

            ].filter(Boolean).join("\n\n");


            resultPanel.hidden = false;


            // ==================================
            // FINAL STATUS
            // ==================================

            if (executionFailed) {

                setStatus(
                    "Recovery execution reported a failure. Review the execution output.",
                    "error"
                );

            } else if (verificationPassed) {

                setStatus(
                    "Recovery completed and the follow-up diagnostic passed.",
                    "success"
                );

            } else if (verificationAttempted) {

                setStatus(
                    "Recovery execution finished, but the component has not been confirmed healthy.",
                    "info"
                );

            } else {

                setStatus(
                    "Recovery execution finished. No separate verification was performed.",
                    "info"
                );

            }


        } catch (error) {

            console.error(
                "Recovery execution error:",
                error
            );

            setStatus(
                error.message,
                "error"
            );

        } finally {

            // Recovery approvals are one-time only.

            resetCurrentPlan();

            createButton.disabled = false;

            recommendButton.disabled = false;

        }

    }
);

    // ==========================================
    // LOAD RECOVERY HISTORY
    // ==========================================

    const historyButton =
        section.querySelector("#recovery-history-refresh");

    const historyContainer =
        section.querySelector("#recovery-history-list");

    async function loadRecoveryHistory() {

        historyButton.disabled = true;
        historyButton.textContent = "Loading...";

        historyContainer.textContent =
            "Loading recovery records...";

        try {

           const response = await fetch(
                   `${window.location.origin}/api/recovery/history?limit=20`,
       {
           method: "GET",
           cache: "no-store",
           headers: {
            "Accept": "application/json"
           }
        }
    );
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "History request failed.");
            }

            historyContainer.replaceChildren();

            if (!data.records.length) {

                historyContainer.textContent =
                    "No recovery history available yet.";

                return;
            }

            data.records.forEach(record => {

                const card = document.createElement("article");
                card.className = "recovery-history-card";

                const title = document.createElement("h4");

                title.textContent =
                    record.action === "flush_dns_cache"
                        ? "DNS Cache Flush"
                        : "DHCP Lease Renewal";

                const status = document.createElement("span");

                status.className =
                    `history-status ${record.status}`;

                status.textContent = record.status;

                const date = document.createElement("p");

                date.textContent =
                    `Created: ${new Date(record.createdAt).toLocaleString()}`;

                const verification = document.createElement("p");

                const verificationResult =
                    record.verificationResult;

                verification.textContent =
                    verificationResult
                        ? `Verification: ${
                            verificationResult.passed
                                ? "Passed"
                                : "Needs Attention"
                          }`
                        : "Verification: Not recorded";

                const problem = document.createElement("p");

                problem.textContent =
                    record.problemDescription ||
                    "Manual recovery operation.";

                card.append(
                    title,
                    status,
                    date,
                    problem,
                    verification
                );

                historyContainer.appendChild(card);

            });

        } catch (error) {

            historyContainer.textContent =
                error.message;

            console.error(
                "[Recovery History]",
                error
            );

        } finally {

            historyButton.disabled = false;
            historyButton.textContent = "Refresh History";

        }

    }

    historyButton.addEventListener(
        "click",
        loadRecoveryHistory
    );

    }

    // ======================================
    // INITIALIZE
    // ======================================

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            mountRecoveryCenter,
            { once: true }
        );

    } else {

        mountRecoveryCenter();

    }

})();