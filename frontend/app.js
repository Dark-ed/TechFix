// --------------------------------------------------
// TECHFIX FRONTEND CONFIGURATION
// --------------------------------------------------

const API_BASE = window.location.origin;

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");

const resultsBox = document.getElementById("resultsBox");
const resultStatus = document.getElementById("resultStatus");
const clearResultsButton = document.getElementById("clearResults");


// --------------------------------------------------
// SAFE DIRECT DIAGNOSTIC TOOLS
// --------------------------------------------------

const SAFE_TOOLS = new Set([
    "ping",
    "tasklist",
    "nslookup",
    "diagnostics"
]);


const TOOL_INFO = {

    ping: {
        title: "Network Ping",
        description: "Test connectivity to a network host.",
        args: {
            host: "8.8.8.8",
            count: 4
        }
    },

    tasklist: {
        title: "Process Monitor",
        description: "List running processes on Windows.",
        args: {}
    },

    nslookup: {
        title: "DNS Lookup",
        description: "Look up the domain example.com.",
        args: {
            domain: "example.com"
        }
    },

    diagnostics: {
        title: "System Diagnostics",
        description: "Run the system diagnostic checks.",
        args: {
            port: 5000
        }
    }

};


// --------------------------------------------------
// AI TOOL LABELS
// --------------------------------------------------

const AGENT_TOOL_LABELS = {

    run_diagnostics: "System Diagnostics",

    ping_host: "Network Ping",

    lookup_dns: "DNS Lookup",

    list_windows_processes: "Process Monitor"

};


let requestInProgress = false;


// --------------------------------------------------
// BACKEND HEALTH
// --------------------------------------------------

async function checkBackend() {

    const headerStatus =
        document.getElementById("headerStatus");

    const sidebarStatus =
        document.getElementById("sidebarStatus");

    const headerDot =
        document.getElementById("headerDot");

    const sidebarDot =
        document.getElementById("sidebarDot");

    try {

        const response = await fetch(
            `${API_BASE}/health`
        );

        if (!response.ok) {
            throw new Error(
                `Health check failed with HTTP ${response.status}`
            );
        }

        const data = await response.json();

        if (!data.ok) {
            throw new Error(
                "Backend health endpoint did not return ok: true"
            );
        }

        if (headerStatus) {
            headerStatus.textContent = "Backend connected";
        }

        if (sidebarStatus) {
            sidebarStatus.textContent = "Backend online";
        }

        if (headerDot) {
            headerDot.className = "status-dot online";
        }

        if (sidebarDot) {
            sidebarDot.className = "status-dot online";
        }

    } catch (error) {

        if (headerStatus) {
            headerStatus.textContent = "Backend offline";
        }

        if (sidebarStatus) {
            sidebarStatus.textContent = "Backend offline";
        }

        if (headerDot) {
            headerDot.className = "status-dot offline";
        }

        if (sidebarDot) {
            sidebarDot.className = "status-dot offline";
        }

        console.error(
            "Health check error:",
            error
        );
    }
}


// --------------------------------------------------
// CHAT MESSAGES
// --------------------------------------------------

function addMessage(text, sender = "assistant") {

    const message = document.createElement("div");

    message.className =
        sender === "user"
            ? "message user-message"
            : "message assistant-message";

    const avatar = document.createElement("div");

    avatar.className = "message-avatar";

    avatar.textContent =
        sender === "user" ? "U" : "T";


    const content = document.createElement("div");

    content.className = "message-content";


    const author = document.createElement("div");

    author.className = "message-author";

    author.textContent =
        sender === "user" ? "You" : "TechFix AI";


    const bubble = document.createElement("div");

    bubble.className = "message-bubble";

    bubble.textContent = text;


    const time = document.createElement("div");

    time.className = "message-time";

    time.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });


    content.append(
        author,
        bubble,
        time
    );

    message.append(
        avatar,
        content
    );

    chatBox.appendChild(message);

    chatBox.scrollTop = chatBox.scrollHeight;

    return content;
}


// --------------------------------------------------
// RESULTS PANEL
// --------------------------------------------------

function showResults(
    data,
    status = "Execution completed"
) {

    resultsBox.replaceChildren();

    const pre = document.createElement("pre");

    pre.textContent = JSON.stringify(
        data,
        null,
        2
    );

    resultsBox.appendChild(pre);

    resultStatus.textContent = status;
}


// --------------------------------------------------
// ERROR DISPLAY
// --------------------------------------------------

function showError(error) {

    showResults(
        {
            ok: false,

            error:
                error.message || String(error)
        },

        "Request failed"
    );
}


// --------------------------------------------------
// CLEAR RESULTS
// --------------------------------------------------

function clearResults() {

    resultsBox.replaceChildren();

    const empty = document.createElement("div");

    empty.className = "empty-state";


    const icon = document.createElement("div");

    icon.className = "empty-icon";

    icon.textContent = "{ }";


    const title = document.createElement("h3");

    title.textContent = "Awaiting execution";


    const description = document.createElement("p");

    description.textContent =
        "Diagnostic results and tool responses will appear here.";


    empty.append(
        icon,
        title,
        description
    );

    resultsBox.appendChild(empty);

    resultStatus.textContent = "No actions executed";
}


// --------------------------------------------------
// API REQUEST HELPER
// --------------------------------------------------

async function postJSON(endpoint, body) {

    const response = await fetch(
        `${API_BASE}${endpoint}`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(body)
        }
    );

    const text = await response.text();

    let data;

    try {

        data = text ? JSON.parse(text) : {};

    } catch {

        throw new Error(
            `The server returned an unexpected response: ${text.slice(0, 300)}`
        );
    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            `Request failed with HTTP ${response.status}`
        );
    }

    return data;
}


// --------------------------------------------------
// DISPLAY AI-SELECTED TOOLS AND RESULTS
// --------------------------------------------------

function renderAgentSteps(content, steps) {

    if (
        !Array.isArray(steps) ||
        steps.length === 0
    ) {

        const note = document.createElement("p");

        note.className = "message-bubble";

        note.textContent =
            "The AI did not need to execute a diagnostic tool for this response.";

        content.appendChild(note);

        return;
    }


    const heading = document.createElement("h4");

    heading.textContent = "Investigation activity";

    content.appendChild(heading);


    for (const step of steps) {

        const card = document.createElement("div");

        card.className = "plan-card";


        // Tool title
        const title = document.createElement("h4");

        const toolName = String(
            step?.tool || "unknown"
        );

        title.textContent =
            AGENT_TOOL_LABELS[toolName] || toolName;


        // Tool status
        const status = document.createElement("p");

        const result = step?.result;

        const hasError = Boolean(
            result &&
            typeof result === "object" &&
            result.error
        );

        status.textContent = hasError

            ? `Tool reported an error: ${String(result.error)}`

            : "Tool execution completed; actual output recorded below.";


        // Expandable result details
        const details = document.createElement("details");

        details.style.marginTop = "10px";


        const summary = document.createElement("summary");

        summary.textContent = "View actual tool output";


        const pre = document.createElement("pre");

        let output;

        try {

            output = JSON.stringify(
                result ?? null,
                null,
                2
            );

        } catch {

            output = String(result);
        }

        pre.textContent =
            output.length > 12000

                ? `${output.slice(0, 12000)}\n… output truncated in the dashboard`

                : output;

        pre.style.whiteSpace = "pre-wrap";

        pre.style.overflowX = "auto";

        pre.style.maxHeight = "320px";

        pre.style.overflowY = "auto";


        details.append(
            summary,
            pre
        );

        card.append(
            title,
            status,
            details
        );

        content.appendChild(card);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}



   // ------------------------------------------
// LIVE ACTIVITY PANEL
// ------------------------------------------

function createActivityPanel(content) {

    const panel = document.createElement("div");

    panel.className = "agent-activity-panel";


    const heading = document.createElement("h4");

    heading.className = "agent-activity-title";

    heading.textContent = "Live Agent Activity";


    const list = document.createElement("div");

    list.className = "agent-activity-list";


    panel.append(
        heading,
        list
    );

    content.appendChild(panel);

    return list;
}


// ------------------------------------------
// ADD LIVE ACTIVITY
// ------------------------------------------

function addActivityItem(list, activity) {

    const item = document.createElement("div");

    item.className = "agent-activity-item";


    const dot = document.createElement("span");

    dot.className = "agent-activity-dot";


    const text = document.createElement("span");

    text.className = "agent-activity-text";

    text.textContent =
        activity.message || "Processing...";


    if (activity.type === "tool_completed") {

        item.classList.add("is-done");

    } else if (
        activity.type === "warning"
    ) {

        item.classList.add("has-warning");

    } else {

        item.classList.add("is-running");
    }


    item.append(
        dot,
        text
    );

    list.appendChild(item);

    return item;
}


// ------------------------------------------
// READ SERVER-SENT EVENTS
// ------------------------------------------

async function readAgentStream(response, onActivity) {

    if (!response.ok) {

        const text = await response.text();

        let errorMessage = text;

        try {

            const data = JSON.parse(text);

            errorMessage =
                data.error || text;

        } catch {
            // Keep original response.
        }

        throw new Error(errorMessage);
    }

    if (!response.body) {

        throw new Error(
            "This browser does not support response streaming."
        );
    }


    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    let finalResult = null;

    let streamError = null;


    function processFrame(frame) {

        if (!frame.trim()) {
            return;
        }

        let eventName = "message";

        const dataLines = [];


        for (const line of frame.split(/\r?\n/)) {

            if (line.startsWith("event:")) {

                eventName = line
                    .slice(6)
                    .trim();

            } else if (line.startsWith("data:")) {

                dataLines.push(
                    line.slice(5).trim()
                );
            }
        }

        if (dataLines.length === 0) {
            return;
        }

        const rawData = dataLines.join("\n");

        let payload;

        try {

            payload = JSON.parse(rawData);

        } catch {

            console.error(
                "Invalid SSE event:",
                rawData
            );

            return;
        }


        switch (eventName) {

            case "activity":

                onActivity(payload);

                break;


            case "result":

                finalResult = payload;

                break;


            case "error":

                streamError =
                    payload.error ||
                    "The AI agent encountered an error.";

                break;

        }
    }


    // Continuously read events as they arrive.
    while (true) {

        const {
            value,
            done
        } = await reader.read();

        if (value) {

            buffer += decoder.decode(
                value,
                {
                    stream: !done
                }
            );
        }

        const frames = buffer.split(
            /\r?\n\r?\n/
        );

        buffer = frames.pop() || "";

        for (const frame of frames) {
            processFrame(frame);
        }

        if (done) {
            break;
        }
    }


    if (buffer.trim()) {
        processFrame(buffer);
    }


    if (streamError) {
        throw new Error(streamError);
    }

    if (!finalResult) {

        throw new Error(
            "The agent stream ended without a final result."
        );
    }

    return finalResult;
}


// ------------------------------------------
// LIVE AUTONOMOUS AGENT REQUEST
// ------------------------------------------

async function requestAutonomousAgent(message) {

    const content = addMessage(
        "TechFix is starting its investigation..."
    );


    const activityList =
        createActivityPanel(content);


    resultStatus.textContent =
        "Live AI investigation running...";


    try {

        // Send message to the streaming endpoint.
        const response = await fetch(
            `${API_BASE}/api/autonomous/stream`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    message
                })
            }
        );


        // Read live activities.
        const data = await readAgentStream(
            response,

            (activity) => {

                addActivityItem(
                    activityList,
                    activity
                );

                chatBox.scrollTop =
                    chatBox.scrollHeight;

                resultStatus.textContent =
                    activity.message ||
                    "Agent working...";
            }
        );


        // Update the original assistant message.
        const bubble =
            content.querySelector(".message-bubble");

        if (bubble) {

            bubble.textContent =
                data.reply ||
                "Investigation completed.";
        }


        // Display model information.
        const modelInfo =
            document.createElement("div");

        modelInfo.className = "message-time";

        modelInfo.textContent =
            `Model: ${data.model || "Unknown"} | ` +
            `${data.steps?.length || 0} tool call(s)`;


        content.appendChild(modelInfo);


        // Show partial-result warning.
        if (data.partial) {

            const warning =
                document.createElement("p");

            warning.className = "plan-card";

            warning.textContent =
                `Partial investigation: ${data.warning || "AI interpretation was incomplete."}`;

            content.appendChild(warning);
        }


        // Display actual diagnostic outputs.
        renderAgentSteps(
            content,
            data.steps
        );


        // Display full response in results panel.
        showResults(
            data,

            data.partial
                ? "Investigation completed with warning"
                : "AI investigation completed"
        );


        chatBox.scrollTop =
            chatBox.scrollHeight;


    } catch (error) {

        const bubble =
            content.querySelector(".message-bubble");

        if (bubble) {

            bubble.textContent =
                `TechFix could not complete the investigation: ${error.message}`;
        }

        addActivityItem(
            activityList,
            {
                type: "warning",
                message: error.message
            }
        );

        showError(error);

        console.error(
            "Autonomous agent failed:",
            error
        );
    }
}

// --------------------------------------------------
// EXECUTE DASHBOARD DIAGNOSTIC CARD
// --------------------------------------------------

async function executeTool(
    tool,
    args = {}
) {

    if (!SAFE_TOOLS.has(tool)) {

        throw new Error(
            "This tool is not enabled in the interface."
        );
    }

    try {

        resultStatus.textContent =
            `Running ${tool}...`;


        const result = await postJSON(
            "/api/execute",
            {
                tool,
                args,
                permission: true
            }
        );


        showResults(
            result,
            `${tool} completed`
        );


        addMessage(
            `${TOOL_INFO[tool].title} finished. Its actual response is displayed in the Agent Results panel.`
        );

        return result;

    } catch (error) {

        showError(error);

        addMessage(
            `The diagnostic action failed: ${error.message}`
        );

        throw error;
    }
}


// --------------------------------------------------
// CHAT FORM
// --------------------------------------------------

chatForm.addEventListener(
    "submit",

    async (event) => {

        event.preventDefault();

        if (requestInProgress) {
            return;
        }

        const message = userInput.value.trim();

        if (!message) {
            return;
        }


        // Display user message.
        addMessage(
            message,
            "user"
        );

        userInput.value = "";


        // Prevent duplicate requests.
        requestInProgress = true;

        sendButton.disabled = true;


        const sendLabel =
            sendButton.querySelector("span:first-child");

        if (sendLabel) {
            sendLabel.textContent = "Working";
        }


        try {

            // Send directly to the AI autonomous agent.
            await requestAutonomousAgent(message);

        } finally {

            requestInProgress = false;

            sendButton.disabled = false;

            if (sendLabel) {
                sendLabel.textContent = "Send";
            }

            userInput.focus();
        }
    }
);


// --------------------------------------------------
// DIAGNOSTIC CARDS
// --------------------------------------------------

document.querySelectorAll("[data-action]").forEach(
    (button) => {

        button.addEventListener(
            "click",

            async () => {

                const action = button.dataset.action;

                if (!SAFE_TOOLS.has(action)) {
                    return;
                }

                const info = TOOL_INFO[action];

                if (!info) {
                    return;
                }


                // Ask the user before running a diagnostic.
                const confirmed = window.confirm(

                    `Run this diagnostic?\n\n${info.title}\n\n${info.description}`

                );

                if (!confirmed) {
                    return;
                }


                button.disabled = true;

                try {

                    await executeTool(
                        action,
                        info.args
                    );

                } catch (error) {

                    console.error(
                        "Diagnostic failed:",
                        error
                    );

                } finally {

                    button.disabled = false;
                }
            }
        );
    }
);


// --------------------------------------------------
// HOME BUTTON
// --------------------------------------------------

const homeButton =
    document.getElementById("homeButton");

if (homeButton) {

    homeButton.addEventListener(
        "click",

        () => {

            document
                .querySelector(".topbar")
                ?.scrollIntoView({
                    behavior: "smooth"
                });
        }
    );
}


// --------------------------------------------------
// CLEAR RESULTS BUTTON
// --------------------------------------------------

if (clearResultsButton) {

    clearResultsButton.addEventListener(
        "click",
        clearResults
    );
}


// --------------------------------------------------
// INITIALIZE INTERFACE
// --------------------------------------------------

checkBackend();

// Check backend status every 15 seconds.
setInterval(
    checkBackend,
    15000
);