   TechFix

Autonomous AI Troubleshooting Agent

Investigate Windows and network issues with AI-guided diagnostics, evidence-based recommendations, and user-approved recovery.


<img width="1366" height="639" alt="mm" src="https://github.com/user-attachments/assets/25ec0ea7-a2ee-4c0c-bb59-2de338c98588" />


Overview

TechFix is an AI-assisted troubleshooting application for investigating Windows and network problems. A user describes an issue in plain language; the agent develops an investigation approach, selects from a controlled set of diagnostic tools, examines their results, and explains what the evidence suggests.

When a recovery action may be appropriate, TechFix prepares a proposal for the user to review. Recovery is a separate, approval-gated step. After an approved action, the application can run a follow-up diagnostic and store the result in its recovery history.

The guiding principle is simple: diagnose first, explain the evidence, and require human approval before changing the system.

Key capabilities

Capability

Description

AI-guided investigation

Converts a natural-language problem description into a structured troubleshooting investigation.

Autonomous tool selection

Selects from predefined diagnostic tools and uses their actual outputs as evidence.

Network health checks

Checks adapter status, DHCP configuration, gateway reachability, DNS resolution, and external HTTPS connectivity.

Focused investigation

Runs a targeted check for a selected network component and asks Gemini to interpret the result.

Bounded self-correction

Detects unsuccessful or inconclusive diagnostic attempts, avoids identical repeated calls, and can reconsider the next step within configured limits.

Recovery recommendations

Evaluates supported DNS-cache and DHCP-lease recovery actions against diagnostic evidence.

Approval-gated recovery

Requires explicit user confirmation before a recovery operation is executed.

Post-action verification

Runs a follow-up read-only diagnostic and reports whether the check passed.

Persistent history

Stores investigation and recovery records in Neon PostgreSQL.

Autonomous investigation workflow

The investigation loop is bounded by configured tool-call and round limits. Recovery is kept separate from diagnosis.

flowchart TD
    A[User describes a problem] --> B[Understand the goal]
    B --> C[Plan the investigation]
    C --> D[Select an approved diagnostic tool]
    D --> E[Execute the tool]
    E --> F[Observe actual results]
    F --> G{More evidence needed?}
    G -- Yes --> H[Assess failure or uncertainty]
    H --> C
    G -- No --> I[Prepare evidence-based findings]
    I --> J{Recovery justified?}
    J -- No --> K[Explain findings and next steps]
    J -- Yes --> L[Create recovery proposal]
    L --> M{User explicitly approves?}
    M -- No --> N[Leave system unchanged]
    M -- Yes --> O[Execute supported recovery]
    O --> P[Run follow-up verification]
    P --> Q[Save recovery outcome]
    K --> R[Complete]
    N --> R
    Q --> R

Architecture

TechFix combines a browser-based frontend, an Express API, Gemini-based reasoning and tool selection, a controlled diagnostic/recovery layer, and Neon PostgreSQL for persistent records.

flowchart TB
    U[User] --> UI[Frontend<br/>HTML · CSS · JavaScript     
    UI --> API[Node.js + Express API<br/>server.js]
    API --> AG[Autonomous agent<br/>planning · tool calls · analysis]
    AG <--> GM[Google Gemini API]
    AG --> TL[Allowlisted diagnostic tools]
    TL --> WIN[Local Windows host<br/>network and system checks]
    API --> RC[Recovery service<br/>validation and approval]
    RC --> WIN
    API --> DB[Neon PostgreSQL<br/>investigation and recovery history]

Repository structure

TechFix/
├── backend/
│   ├── routes/
│   │   └── agent.js             # API endpoints
│   └── services/
│       ├── aiAgent.js           # Gemini agent and tool orchestration
│       ├── database.js          # PostgreSQL initialization
│       ├── diagnostics.js       # Read-only diagnostic checks
│       ├── history.js           # Investigation history
│       └── recovery.js          # Recovery plans, execution, verification
├── frontend/
│   ├── index.html               # Application page
│   ├── app.js                   # Main workspace and agent interaction
│   ├── style.css                # Main interface styles
│   ├── network-health.js        # Network health interface
│   ├── network-health.css
│   ├── recovery.js              # Recovery Center and history interface
│   └── recovery.css
├── utils/
│   └── shell.js                 # Controlled system-command execution
├── server.js                    # Main application entry point
├── package.json
├── package-lock.json
└── .gitignore

Technology stack

Runtime: Node.js 20 or later

Backend: Express.js

AI reasoning: Google Gemini API

Database: PostgreSQL hosted on Neon

Frontend: HTML, CSS, and browser JavaScript

Configuration: Environment variables loaded with dotenv

Database client: Node.js pg package

The development configuration currently uses gemini-3.5-flash-lite. The model can be configured through the GEMINI_MODEL environment variable.

Local development setup

TechFix integrates with external AI and database services. For that reason, a developer running the project locally supplies their own Gemini API key and Neon PostgreSQL connection string. This is standard practice for API-backed applications: credentials are not bundled with source code or shared in the repository.

Prerequisites

Node.js 20 or later and npm

A Google Gemini API key

A Neon PostgreSQL database and connection string

Windows for the full local Windows diagnostic and recovery functionality

1. Clone the repository

git clone https://github.com/Dark-ed/TechFix.git
cd TechFix

2. Install dependencies

npm install

3. Configure local environment variables

Create backend/.env and add your own service configuration:

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL=your_neon_postgresql_connection_string
PORT=5000

Keep this file on your machine. Never commit API keys, database passwords, or connection strings. The repository's ignore rules exclude environment files.

4. Start the development server

Run these commands from the repository root:

npm run dev

For a standard start without the file watcher:

npm start

5. Open the application

Visit http://127.0.0.1:5000.

The health endpoint is available at http://127.0.0.1:5000/health. A successful response includes ok: true. Check the server terminal for the database initialization result.

API overview

The root Express server mounts the agent router under /api and retains /agent compatibility routes.

Method

Endpoint

Purpose

GET

/health

Check whether the server is responding.

POST

/api/autonomous

Run an autonomous investigation and return its result.

POST

/api/autonomous/stream

Run an investigation and stream activity events.

POST

/api/network/analyze

Run network diagnostics and request an AI analysis.

POST

/api/network/investigate

Investigate a supported network component.

POST

/api/recovery/recommend

Investigate a problem and evaluate whether a supported recovery is justified.

POST

/api/recovery/plan

Create a recovery plan.

POST

/api/recovery/execute

Execute an approved recovery plan; explicit confirmation is required.

POST

/api/recovery/verify

Run post-recovery verification.

GET

/api/recovery/history

List saved recovery records.

GET

/api/recovery/history/:id

Retrieve a recovery record.

Example: autonomous investigation

curl -X POST http://127.0.0.1:5000/api/autonomous \
  -H "Content-Type: application/json" \
  -d '{"message":"My computer is connected to Wi-Fi, but some websites are not opening. Investigate using read-only diagnostics and recommend safe next steps. Do not execute recovery."}'

The response includes the agent's explanation, the tools it used, their results, and a history reference when saving succeeds.

Diagnostics and recovery

Diagnostic tools

The controlled tool set includes Windows and network checks such as:

run_diagnostics — runs the diagnostic suite.

ping_host — tests reachability to a host.

lookup_dns — tests domain-name resolution.

check_network_adapter_status — summarizes network adapter status.

check_dhcp_configuration — checks DHCP-related configuration and recovery eligibility.

check_gateway_connectivity — checks default-gateway reachability.

check_internet_connectivity — tests external HTTPS reachability.

list_windows_processes — lists Windows processes.

The tools selected depend on the problem and the investigation evidence.

Supported recovery actions

The current recovery service supports:

DNS cache flush (flush_dns_cache)

DHCP lease renewal (renew_dhcp_lease)

A recommendation does not itself change the system. The backend independently validates relevant conditions, and the user must explicitly approve execution. A follow-up diagnostic can then verify the result, which is stored in recovery history.

Safety design

TechFix separates investigation from recovery:

Diagnostic tools are selected from a predefined allowlist.

Tool arguments are validated before execution.

Repeated identical diagnostic calls are blocked, and tool-call/round limits bound the investigation.

The agent is instructed not to run recovery actions during diagnosis.

The backend independently validates recovery recommendations rather than trusting the model alone.

Recovery execution requires explicit user confirmation.

Post-recovery verification uses a diagnostic check and does not itself modify network settings.

Run TechFix only on systems you own or are authorized to troubleshoot. Review each recovery proposal before approving it.

Limitations

The full diagnostic and recovery experience is intended for a local Windows environment. A cloud-hosted application cannot inspect or repair a visitor's personal Windows machine. System-command execution is intentionally blocked in the Vercel environment.

Network tests are point-in-time observations. A successful check does not prove that every website or service is reachable, and an individual timeout does not by itself prove a persistent outage.

AI-generated explanations are decision support, not a substitute for reviewing the underlying diagnostic evidence.

Available diagnostic results depend on operating-system permissions, network configuration, and the tools supported by the host environment.

Development status

The local MVP has been exercised with backend health checks, Gemini analysis, network diagnostics, autonomous investigation, recovery recommendation validation, rejection of unapproved execution, post-recovery verification, and PostgreSQL recovery-history retrieval. Results can vary with the live system and network.

Contributing

Issues and suggestions are welcome. Include reproducible steps, relevant sanitized logs, and environment details. Never include API keys, database connection strings, personal data, or unredacted network information in an issue.

License

No license has been specified in this repository yet. Unless a license is added, standard copyright restrictions apply; contact the repository owner before reusing or redistributing the code.
