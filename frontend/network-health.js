(() => {

    function initializeNetworkHealth() {

        if (document.getElementById("techfix-network-health")) {
            return;
        }

        const host =
            document.querySelector("main") ||
            document.querySelector("#app") ||
            document.body;

        const section = document.createElement("section");

        section.id = "techfix-network-health";
        section.className = "network-health";

        section.innerHTML = `

            <div class="network-health-header">

                <div>
                    <span class="network-eyebrow">
                        NETWORK MONITORING
                    </span>

                    <h2>Network Health Report</h2>

                    <p>
                        Monitor your network connection and identify
                        potential connectivity problems.
                    </p>
                </div>

                <button id="network-refresh">
                    ↻ Refresh Diagnostics
                </button>

            </div>

            <!-- OVERALL NETWORK STATUS -->

            <div
                id="network-overall"
                class="network-overall"
                aria-live="polite"
            >

                <div>
                    <span class="network-overall-label">
                        OVERALL NETWORK STATUS
                    </span>

                    <h3 id="network-overall-title">
                        Waiting for diagnostics
                    </h3>

                    <p id="network-overall-description">
                        Run diagnostics to check your network.
                    </p>
                </div>

                <div class="network-score">
                    <strong id="network-healthy-count">0/5</strong>
                    <span>Healthy</span>
                </div>

            </div>

            <!-- FIVE NETWORK COMPONENTS -->

            <div class="network-section-title">

                <h3>Connection Health</h3>

                <span id="network-last-updated">
                    Not checked yet
                </span>

            </div>

            <div
                id="network-checks"
                class="network-checks"
            ></div>

            <!-- DIAGNOSTIC SUMMARY -->

            <div class="network-summary">

                <h3>Diagnostic Summary</h3>

                <div class="network-summary-counts">

                    <div>
                        <strong id="network-healthy">0</strong>
                        <span>Healthy</span>
                    </div>

                    <div>
                        <strong id="network-attention">0</strong>
                        <span>Attention</span>
                    </div>

                    <div>
                        <strong id="network-unknown">0</strong>
                        <span>Unconfirmed</span>
                    </div>

                </div>

                <p id="network-summary-message">
                    Waiting for diagnostic results.
                </p>

            </div>

            <!-- OVERALL GEMINI AI ANALYSIS -->

            <div class="network-ai-report">

                <h3>AI Network Analysis</h3>

                <p id="network-ai-status">
                    Waiting for AI analysis.
                </p>

                <pre
                    id="network-ai-analysis"
                    class="network-focused-analysis"
                >AI analysis will appear here.</pre>

                <small id="network-ai-meta"></small>

            </div>

            <!-- FOCUSED AI INVESTIGATION PANEL -->

            <div
                id="network-focused-panel"
                class="network-focused-panel"
                hidden
                aria-live="polite"
            >

                <div class="network-focused-header">

                    <div>
                        <h2 id="network-focused-title">
                            AI Investigation
                        </h2>

                        <p id="network-focused-status">
                            Select a component to investigate.
                        </p>
                    </div>

                    <button
                        type="button"
                        id="network-focused-close"
                        aria-label="Close investigation"
                    >
                    </button>

                </div>

                <!-- ACTUAL DIAGNOSTIC EVIDENCE -->

                <div class="network-focused-evidence">

                    <h3>Diagnostic Evidence</h3>

                    <p id="network-focused-evidence-message">
                        Diagnostic information will appear here.
                    </p>

                    <pre
                        id="network-focused-evidence-details"
                        class="network-focused-analysis"
                    ></pre>

                </div>

                <!-- GEMINI FOCUSED ANALYSIS -->

                <div class="network-focused-ai">

                    <h3>Gemini AI Analysis</h3>

                    <pre
                        id="network-focused-analysis"
                        class="network-focused-analysis"
                    >Investigation results will appear here.</pre>

                </div>

                <button
                    type="button"
                    id="network-focused-copy"
                    class="network-copy-report-btn"
                >
                    Copy Investigation Report
                </button>
                <button
                      type="button"
                      id="network-send-to-recovery"
                      class="network-send-recovery-btn"
                     disabled
                      >
                     Send Findings to Recovery Center
                    </button>

                <small
                    id="network-focused-meta"
                    class="network-focused-model"
                ></small>

            </div>

        `;

        host.appendChild(section);


        // ==================================
        // ELEMENT REFERENCES
        // ==================================

        const refreshButton =
            section.querySelector("#network-refresh");

        const checksContainer =
            section.querySelector("#network-checks");

        const overall =
            section.querySelector("#network-overall");

        const overallTitle =
            section.querySelector("#network-overall-title");

        const overallDescription =
            section.querySelector("#network-overall-description");

        const aiAnalysis =
            section.querySelector("#network-ai-analysis");

        const aiStatus =
            section.querySelector("#network-ai-status");

        const aiMeta =
            section.querySelector("#network-ai-meta");

        const focusedPanel =
            section.querySelector("#network-focused-panel");

        const focusedTitle =
            section.querySelector("#network-focused-title");

        const focusedStatus =
            section.querySelector("#network-focused-status");

        const focusedEvidenceMessage =
            section.querySelector("#network-focused-evidence-message");

        const focusedEvidenceDetails =
            section.querySelector("#network-focused-evidence-details");

        const focusedAnalysis =
            section.querySelector("#network-focused-analysis");

        const focusedMeta =
            section.querySelector("#network-focused-meta");

        const copyButton =
            section.querySelector("#network-focused-copy");
        const sendToRecoveryButton =
            section.querySelector("#network-send-to-recovery");

        let currentFocusedReport = null;


        // ==================================
        // NETWORK COMPONENTS
        // ==================================

        const components = [

            {
                id: "network_adapter_status",
                title: "Network Adapter",
                description: "Windows Wi-Fi and Ethernet adapters."
            },

            {
                id: "dhcp_status",
                title: "DHCP Configuration",
                description: "IP address and DHCP lease configuration."
            },

            {
                id: "gateway_connectivity",
                title: "Default Gateway",
                description: "Connectivity with your local router."
            },

            {
                id: "dns_resolution",
                title: "DNS Resolution",
                description: "Domain name resolution."
            },

            {
                id: "internet_connectivity",
                title: "Internet Connectivity",
                description: "External HTTPS connectivity."
            }

        ];


        // ==================================
        // CLASSIFY DIAGNOSTIC RESULTS
        // ==================================

        function classifyResult(result) {

            if (!result) {

                return {
                    label: "Not Available",
                    type: "unknown"
                };

            }

            if (result.supported === false) {

                return {
                    label: "Unsupported",
                    type: "unknown"
                };

            }

            switch (result.id) {

                case "network_adapter_status":

                    return result.connectedAdapters > 0

                        ? {
                            label: "Healthy",
                            type: "healthy"
                        }

                        : {
                            label: "Needs Attention",
                            type: "attention"
                        };


                case "dhcp_status":

                    if (
                        result.state ===
                        "no_active_dhcp_adapter"
                    ) {

                        return {
                            label: "Unconfirmed",
                            type: "unknown"
                        };

                    }

                    if (result.state === "needs_renewal") {

                        return {
                            label: "Needs Attention",
                            type: "attention"
                        };

                    }

                    return result.state === "healthy"

                        ? {
                            label: "Healthy",
                            type: "healthy"
                        }

                        : {
                            label: "Unconfirmed",
                            type: "unknown"
                        };


                case "gateway_connectivity":

                    if (result.state === "no_default_gateway") {

                        return {
                            label: "Needs Attention",
                            type: "attention"
                        };

                    }

                    if (result.state === "no_ping_response") {

                        return {
                            label: "Unconfirmed",
                            type: "unknown"
                        };

                    }

                    return result.state === "responding"

                        ? {
                            label: "Healthy",
                            type: "healthy"
                        }

                        : {
                            label: "Unconfirmed",
                            type: "unknown"
                        };


                case "dns_resolution":

                    return result.state === "resolved"

                        ? {
                            label: "Healthy",
                            type: "healthy"
                        }

                        : {
                            label: "Needs Attention",
                            type: "attention"
                        };


                case "internet_connectivity":

                    if (result.state === "reachable") {

                        return {
                            label: "Healthy",
                            type: "healthy"
                        };

                    }

                    if (
                        result.state === "partially_reachable"
                    ) {

                        return {
                            label: "Unconfirmed",
                            type: "unknown"
                        };

                    }

                    return {
                        label: "Needs Attention",
                        type: "attention"
                    };


                default:

                    return {
                        label: "Unconfirmed",
                        type: "unknown"
                    };

            }

        }


        // ==================================
        // BUILD DIAGNOSTIC DETAILS
        // ==================================

        function getDetails(result) {

            if (!result) {
                return "No diagnostic result was returned.";
            }

            switch (result.id) {

                case "network_adapter_status":

                    return `
                        Connected: ${result.connectedAdapters ?? 0}
                        · Disconnected: ${result.disconnectedAdapters ?? 0}
                        · Disabled: ${result.disabledAdapters ?? 0}
                    `;

                case "dhcp_status":

                    return `
                        DHCP adapters: ${result.connectedDhcpAdapterCount ?? 0}
                        · APIPA: ${result.apipaAdapterCount ?? 0}
                        · Missing IPv4: ${result.missingIpv4AdapterCount ?? 0}
                    `;

                case "gateway_connectivity":

                    return `
                        Responding: ${result.respondingCount ?? 0}
                        / ${result.gatewayCount ?? 0} gateways
                    `;

                case "dns_resolution":

                    return `
                        DNS answers: ${result.totalAnswers ?? 0}
                        · IPv4: ${result.ipv4Answers ?? 0}
                        · IPv6: ${result.ipv6Answers ?? 0}
                    `;

                case "internet_connectivity":

                    return `
                        HTTPS endpoints: ${result.reachedEndpoints ?? 0}
                        / ${result.testedEndpoints ?? 0}
                    `;

                default:

                    return result.message ||
                        "No additional information.";

            }

        }


        // ==================================
        // CREATE COMPONENT CARD
        // ==================================

        function createCard(component, result) {

            const status = classifyResult(result);

            const card = document.createElement("article");

            card.className =
                `network-card ${status.type}`;

            const heading = document.createElement("div");

            heading.className =
                "network-card-heading";

            const title = document.createElement("h4");

            title.textContent =
                component.title;

            const badge = document.createElement("span");

            badge.className =
                `network-status-badge ${status.type}`;

            badge.textContent =
                status.label;

            heading.append(title, badge);


            const description = document.createElement("p");

            description.className =
                "network-card-description";

            description.textContent =
                component.description;


            const message = document.createElement("p");

            message.className =
                "network-card-message";

            message.textContent =
                result?.message ||
                result?.error ||
                "Diagnostic unavailable.";


            const details = document.createElement("div");

            details.className =
                "network-card-details";

            details.textContent =
                getDetails(result).trim();


            // AI Investigation Button

            const investigateButton =
                document.createElement("button");

            investigateButton.type = "button";

            investigateButton.className =
                "network-investigate-btn";

            investigateButton.textContent =
                "Investigate with AI";

            investigateButton.dataset.investigate =
                component.id;


            card.append(
                heading,
                description,
                message,
                details,
                investigateButton
            );

            return card;

        }


        // ==================================
        // UPDATE NETWORK REPORT
        // ==================================

        function updateReport(results) {

            const resultMap = new Map(
                results.map(result => [
                    result.id,
                    result
                ])
            );

            checksContainer.replaceChildren();

            const classifications = [];

            for (const component of components) {

                const result =
                    resultMap.get(component.id);

                const status =
                    classifyResult(result);

                classifications.push(status.type);

                checksContainer.appendChild(
                    createCard(component, result)
                );

            }


            const healthy =
                classifications.filter(
                    item => item === "healthy"
                ).length;

            const attention =
                classifications.filter(
                    item => item === "attention"
                ).length;

            const unknown =
                classifications.filter(
                    item => item === "unknown"
                ).length;


            // Update counters

            section.querySelector(
                "#network-healthy-count"
            ).textContent = `${healthy}/5`;

            section.querySelector(
                "#network-healthy"
            ).textContent = healthy;

            section.querySelector(
                "#network-attention"
            ).textContent = attention;

            section.querySelector(
                "#network-unknown"
            ).textContent = unknown;


            // Update overall status

            overall.className =
                "network-overall";

            if (attention > 0) {

                overall.classList.add("attention");

                overallTitle.textContent =
                    "Network Attention Required";

                overallDescription.textContent =
                    `${attention} network component(s) need further investigation.`;

            } else if (unknown > 0) {

                overall.classList.add("unknown");

                overallTitle.textContent =
                    "Partial Network Assessment";

                overallDescription.textContent =
                    "Some network checks could not be confirmed.";

            } else {

                overall.classList.add("healthy");

                overallTitle.textContent =
                    "Network Operating Normally";

                overallDescription.textContent =
                    "All five network components passed their checks.";

            }


            // Update timestamp

            section.querySelector(
                "#network-last-updated"
            ).textContent =
                `Last checked: ${new Date().toLocaleTimeString()}`;


            // Summary message

            let summaryMessage;

            if (attention > 0) {

                summaryMessage =
                    "TechFix detected potential network issues. Review the affected components before taking recovery actions.";

            } else if (unknown > 0) {

                summaryMessage =
                    "Some checks were inconclusive. An inconclusive result does not necessarily indicate a network failure.";

            } else {

                summaryMessage =
                    "All five network checks were successful. No network recovery action is currently indicated.";

            }

            section.querySelector(
                "#network-summary-message"
            ).textContent =
                summaryMessage;

        }


        // ==================================
        // FOCUSED AI INVESTIGATION
        // ==================================

        checksContainer.addEventListener(
            "click",
            async (event) => {

                const button =
                    event.target.closest(
                        "[data-investigate]"
                    );

                if (!button) {
                    return;
                }

                const componentId =
                    button.dataset.investigate;

                const component =
                    components.find(
                        item => item.id === componentId
                    );

                if (!component) {
                    return;
                }


                // Display investigation panel

                focusedPanel.hidden = false;
                sendToRecoveryButton.disabled = true;

                focusedPanel.style.display = "block";

                focusedTitle.textContent =
                    `${component.title} Investigation`;

                focusedStatus.textContent =
                    "TechFix is running a focused diagnostic and consulting Gemini AI.";

                focusedEvidenceMessage.textContent =
                    "Running diagnostic...";

                focusedEvidenceDetails.textContent = "";

                focusedAnalysis.textContent =
                    "Please wait while the AI investigates this component.";
                // Save the investigation for Recovery Center

               currentFocusedReport = {
                 componentId: componentId,
                  componentTitle: component.title,
                    diagnostic: diagnostic,
                   analysis: analysisText,
                model: data.model || null,
                  analyzedAt: data.analyzedAt || null
             };

            sendToRecoveryButton.disabled = false;

                focusedMeta.textContent = "";

                button.disabled = true;

                button.textContent =
                    "Investigating...";

                focusedPanel.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });


                try {

                    const response = await fetch(
                        `${window.location.origin}/api/network/investigate`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type": "application/json"
                            },

                            body: JSON.stringify({
                                componentId: componentId
                            })
                        }
                    );


                    const data =
                        await response.json();

                    if (!response.ok || !data.success) {

                        throw new Error(
                            data.error ||
                            "Focused investigation failed."
                        );

                    }


                    // Get actual diagnostic evidence

                    const diagnostic =
                        data.diagnostic || {};

                    focusedEvidenceMessage.textContent =
                        diagnostic.message ||
                        diagnostic.error ||
                        "Diagnostic completed. See the returned details below.";

                    focusedEvidenceDetails.textContent =
                        JSON.stringify(
                            diagnostic,
                            null,
                            2
                        );


                    // Display Gemini analysis

                    const analysisText =
                        typeof data.analysis === "string"

                            ? data.analysis

                            : data.analysis != null

                                ? JSON.stringify(
                                    data.analysis,
                                    null,
                                    2
                                )

                                : "Gemini did not return an analysis.";

                    focusedAnalysis.textContent =
                        analysisText;


                    focusedStatus.textContent =
                        "Investigation completed successfully.";


                    // Report metadata

                    const dateText =
                        data.analyzedAt
                            ? new Date(data.analyzedAt).toLocaleString()
                            : "Not provided";

                    focusedMeta.textContent =
                        `AI Model: ${data.model || "Not provided"} | Date: ${dateText}`;


                    // Prepare report for copy button

                    const reportText = [

                        "TECHFIX NETWORK INVESTIGATION REPORT",

                        "====================================",

                        "",

                        `Component: ${component.title}`,

                        "",

                        "DIAGNOSTIC EVIDENCE",

                        "-------------------",

                        JSON.stringify(
                            diagnostic,
                            null,
                            2
                        ),

                        "",

                        "GEMINI AI ANALYSIS",

                        "-----------------",

                        analysisText,

                        "",

                        `AI Model: ${data.model || "Not provided"}`,

                        `Investigation Date: ${dateText}`

                    ].join("\n");


                    // Save report text for copy action

                    copyButton.dataset.report =
                        reportText;

                    copyButton.textContent =
                        "Copy Investigation Report";

                } catch (error) {

                    console.error(
                        "Focused investigation error:",
                        error
                    );

                    focusedStatus.textContent =
                        "Investigation could not be completed.";

                    focusedEvidenceMessage.textContent =
                        error.message;

                    focusedAnalysis.textContent =
                        "No AI analysis was generated.";

                } finally {

                    button.disabled = false;

                    button.textContent =
                        "Investigate with AI";

                }

            }
        );


        // ==================================
        // COPY INVESTIGATION REPORT
        // ==================================

        copyButton.addEventListener(
            "click",
            async () => {

                const report =
                    copyButton.dataset.report;

                if (!report) {

                    copyButton.textContent =
                        "No report available";

                    return;

                }

                try {

                    if (
                        navigator.clipboard &&
                        window.isSecureContext
                    ) {

                        await navigator.clipboard.writeText(
                            report
                        );

                    } else {

                        const textarea =
                            document.createElement("textarea");

                        textarea.value = report;

                        textarea.style.position = "fixed";
                        textarea.style.opacity = "0";

                        document.body.appendChild(textarea);

                        textarea.select();

                        const copied =
                            document.execCommand("copy");

                        textarea.remove();

                        if (!copied) {
                            throw new Error("Clipboard copy was unsuccessful.");
                        }

                    }

                    copyButton.textContent =
                        "Report Copied!";

                    setTimeout(() => {

                        copyButton.textContent =
                            "Copy Investigation Report";

                    }, 2000);

                } catch (error) {

                    console.error(
                        "Report copy error:",
                        error
                    );

                    copyButton.textContent =
                        "Copy Failed";

                }

            }
        );
        
        // ==================================
    // SEND FINDINGS TO RECOVERY CENTER
    // ==================================

      sendToRecoveryButton.addEventListener(
      "click",
     () => {

        if (!currentFocusedReport) {
            return;
        }

        const recoveryInput =
            document.getElementById("recovery-problem");

        const recoverySection =
            document.getElementById("techfix-recovery-center");

        if (!recoveryInput || !recoverySection) {

            focusedStatus.textContent =
                "Recovery Center is unavailable.";

            return;
        }

        // Transfer the investigation to Recovery Center

        document.dispatchEvent(
            new CustomEvent("techfix:network-finding", {
                detail: currentFocusedReport
            })
        );

        focusedStatus.textContent =
            "Findings successfully transferred to Recovery Center.";

        recoverySection.scrollIntoView({
            behavior: "smooth",
            block: "start"
                 });

          }
 );

        // ==================================
        // CLOSE INVESTIGATION PANEL
        // ==================================

        section.querySelector(
            "#network-focused-close"
        ).addEventListener(
            "click",
            () => {

                focusedPanel.hidden = true;

                focusedPanel.style.display = "none";

            }
        );


        // ==================================
        // LOAD NETWORK DIAGNOSTICS
        // ==================================

        async function loadNetworkHealth() {

            refreshButton.disabled = true;

            refreshButton.textContent =
                "Checking Network...";

            overallTitle.textContent =
                "Running Diagnostics";

            overallDescription.textContent =
                "TechFix is checking your network connection.";

            overall.className =
                "network-overall loading";

            aiStatus.textContent =
                "Gemini AI analysis is running...";

            aiAnalysis.textContent =
                "Please wait...";

            try {

                const response = await fetch(
                    `${window.location.origin}/api/network/analyze`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            port: Number(
                                window.location.port || 5000
                            )
                        })
                    }
                );


                const data =
                    await response.json();

                if (!response.ok || data.success === false) {

                    throw new Error(
                        data.error ||
                        "Network diagnostics request failed."
                    );

                }

                if (!Array.isArray(data.results)) {

                    throw new Error(
                        "Invalid diagnostic response received."
                    );

                }


                // Update five network cards and summary

                updateReport(data.results);


                // Display overall Gemini AI analysis

                if (data.analysis) {

                    aiAnalysis.textContent =
                        data.analysis;

                    aiStatus.textContent =
                        "AI analysis completed successfully.";

                    aiStatus.className =
                        "network-ai-status success";

                } else {

                    aiAnalysis.textContent =
                        "Diagnostic results are available, but Gemini could not generate an explanation.";

                    aiStatus.textContent =
                        data.aiWarning ||
                        "AI analysis unavailable.";

                    aiStatus.className =
                        "network-ai-status warning";

                }


                // Display AI metadata

                aiMeta.textContent = data.model

                    ? `Model: ${data.model} | Analyzed: ${
                        data.analyzedAt
                            ? new Date(data.analyzedAt).toLocaleString()
                            : "Not provided"
                    }`

                    : "";

            } catch (error) {

                console.error(
                    "Network diagnostics error:",
                    error
                );

                overall.className =
                    "network-overall attention";

                overallTitle.textContent =
                    "Diagnostic Failed";

                overallDescription.textContent =
                    error.message;

                aiStatus.textContent =
                    "Network AI analysis could not be completed.";

                aiAnalysis.textContent =
                    error.message;

            } finally {

                refreshButton.disabled = false;

                refreshButton.textContent =
                    "↻ Refresh Diagnostics";

            }

        }


        // ==================================
        // REFRESH BUTTON
        // ==================================

        refreshButton.addEventListener(
            "click",
            loadNetworkHealth
        );


        // ==================================
        // FIRST AUTOMATIC DIAGNOSTIC SCAN
        // ==================================

        loadNetworkHealth();

    }


    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            initializeNetworkHealth,
            { once: true }
        );

    } else {

        initializeNetworkHealth();

    }

})();
