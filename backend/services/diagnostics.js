import os from "node:os";
import { run } from "../utils/shell.js";
import { lookup } from "node:dns/promises";

// ==========================================
// NODE VERSION
// ==========================================

async function checkNodeVersion() {

    const { stdout = "" } = await run("node -v", {
        timeoutMs: 5000
    });

    const version = stdout.trim().replace(/^v/, "");
    const major = Number(version.split(".")[0]);
    const ok = Number.isFinite(major) && major >= 20;

    return {
        id: "node_version",
        ok,
        current: version || "unknown",
        required: ">=20",
        impact: ok ? "none" : "Node.js 20 or newer is recommended",
        fix: ok ? null : "Install a supported Node.js version"
    };
}


// ==========================================
// PORT STATUS
// ==========================================

function parseWindowsListeners(stdout, expectedPort) {

    const listeners = [];

    for (const line of String(stdout || "").split(/\r?\n/)) {

        const parts = line.trim().split(/\s+/);

        if (
            parts.length < 5 ||
            parts[0].toUpperCase() !== "TCP" ||
            parts[3].toUpperCase() !== "LISTENING"
        ) {
            continue;
        }

        const localAddress = parts[1];

        const localPort = Number(
            localAddress.slice(
                localAddress.lastIndexOf(":") + 1
            )
        );

        const pid = Number(parts[4]);

        if (
            localPort === expectedPort &&
            Number.isInteger(pid)
        ) {

            listeners.push({
                localAddress,
                pid
            });
        }
    }

    return listeners;
}


async function checkPortConflict(port) {

    const expectedPort = Number(port);

    if (
        !Number.isInteger(expectedPort) ||
        expectedPort < 1 ||
        expectedPort > 65535
    ) {

        return {
            id: "port_status",
            ok: false,
            port,
            impact: "The configured port number is invalid",
            fix: "Set PORT to a number between 1 and 65535"
        };
    }

    let listeners = [];

    if (process.platform === "win32") {

        const { stdout = "" } = await run(
            "netstat -ano -p tcp",
            {
                shell: true,
                timeoutMs: 5000,
                ignoreExitCode: true
            }
        );

        listeners = parseWindowsListeners(
            stdout,
            expectedPort
        );

    } else {

        const { stdout = "" } = await run(
            `lsof -nP -iTCP:${expectedPort} -sTCP:LISTEN`,
            {
                shell: true,
                timeoutMs: 5000,
                ignoreExitCode: true
            }
        );

        listeners = String(stdout)
            .split(/\r?\n/)
            .slice(1)
            .map(line => line.trim().split(/\s+/))
            .filter(parts =>
                parts.length >= 2 &&
                /^\d+$/.test(parts[1])
            )
            .map(parts => ({
                localAddress: parts.at(-1),
                pid: Number(parts[1])
            }));
    }

    const otherPids = [
        ...new Set(
            listeners
                .map(listener => listener.pid)
                .filter(pid => pid !== process.pid)
        )
    ];

    const hasCurrentProcessListener = listeners.some(
        listener => listener.pid === process.pid
    );

    if (otherPids.length > 0) {

        return {
            id: "port_status",
            ok: false,
            port: expectedPort,
            listening: true,
            ownedByTechFix: hasCurrentProcessListener,
            otherProcessIds: otherPids,
            impact:
                `Another process is also listening on port ${expectedPort}`,
            fix:
                "Review the process before stopping it; do not terminate it automatically"
        };
    }

    if (hasCurrentProcessListener) {

        return {
            id: "port_status",
            ok: true,
            port: expectedPort,
            listening: true,
            ownedByTechFix: true,
            impact: "none",
            fix: null
        };
    }

    return {
        id: "port_status",
        ok: false,
        port: expectedPort,
        listening: listeners.length > 0,
        impact: listeners.length > 0
            ? "A listener exists, but it could not be confirmed as the TechFix process"
            : `No listener was detected on port ${expectedPort}`,
        fix:
            "Confirm the backend is running and check the configured PORT"
    };
}


// ==========================================
// BACKEND HEALTH
// ==========================================

async function checkBackendHealth(port) {

    const expectedPort = Number(port);

    const url =
        `http://127.0.0.1:${expectedPort}/health`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(4000)
    });

    let body = {};

    try {

        body = await response.json();

    } catch {
        // Non-JSON response.
    }

    const ok = response.ok && body.ok === true;

    return {
        id: "backend_health",
        ok,
        status: response.status,
        endpoint: url,
        impact: ok
            ? "none"
            : "The local TechFix health endpoint did not return ok: true",
        fix: ok
            ? null
            : "Check backend startup logs and the /health route"
    };
}


// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================

async function checkEnvVars(
    required = ["GEMINI_API_KEY"]
) {

    const missing = required.filter(
        key => !String(process.env[key] || "").trim()
    );

    return {
        id: "env_vars",
        ok: missing.length === 0,
        required,
        missing,
        configuredModel:
            process.env.GEMINI_MODEL || "application default",
        impact: missing.length
            ? "The Gemini integration cannot authenticate without its API key"
            : "none",
        fix: missing.length
            ? "Add the missing key to backend/.env and restart the backend"
            : null
    };
}


// ==========================================
// CPU INFORMATION
// ==========================================

async function checkCPU() {

    const cpus = os.cpus();

    return {
        id: "cpu_stats",
        ok: cpus.length > 0,
        cores: cpus.length,
        model: cpus[0]?.model || "unknown",
        speedMHz: cpus[0]?.speed || null,

        note: process.platform === "win32"
            ? "CPU load average is not reported by Node.js on Windows"
            : undefined
    };
}


// ==========================================
// MEMORY INFORMATION
// ==========================================

async function checkMemory() {

    const total = os.totalmem();
    const free = os.freemem();

    const usagePercent = total > 0
        ? Math.round(((total - free) / total) * 100)
        : null;

    return {
        id: "memory_stats",
        ok: total > 0,

        totalMB: Math.round(total / 1024 / 1024),

        freeMB: Math.round(free / 1024 / 1024),

        usedMB: Math.round((total - free) / 1024 / 1024),

        usagePercent,

        warning:
            usagePercent !== null && usagePercent >= 85
                ? "Memory utilization is high; consider closing unused applications"
                : null
    };
}


// ==========================================
// NETWORK INFORMATION
// ==========================================

async function checkNetwork() {

    const allInterfaces = os.networkInterfaces();

    const interfaces = {};

    for (const [name, addresses] of Object.entries(allInterfaces)) {

        const safeAddresses = (addresses || [])

            .filter(item =>
                !item.internal &&
                item.family === "IPv4"
            )

            .map(({
                address,
                netmask,
                family,
                cidr
            }) => ({
                address,
                netmask,
                family,
                cidr
            }));

        if (safeAddresses.length > 0) {
            interfaces[name] = safeAddresses;
        }
    }

    return {
        id: "network_stats",

        ok: Object.keys(interfaces).length > 0,

        interfaces,

        impact: Object.keys(interfaces).length > 0
            ? "Active non-loopback IPv4 interfaces were found"
            : "No non-loopback IPv4 interface was found"
    };
}


// ==========================================
// DHCP CONFIGURATION - READ ONLY
// ==========================================

async function checkDhcpConfiguration() {

    if (process.platform !== "win32") {

        return {
            id: "dhcp_status",
            ok: false,
            supported: false,
            recommendationEligible: false,
            state: "unsupported",
            message:
                "DHCP configuration inspection is currently Windows-only."
        };
    }

    const {
        stdout = "",
        code = 0
    } = await run("ipconfig /all", {
        timeoutMs: 10000,
        ignoreExitCode: true
    });

    const output = String(stdout || "");

    if (code !== 0 || !output.trim()) {

        return {
            id: "dhcp_status",
            ok: false,
            supported: false,
            recommendationEligible: false,
            state: "unavailable",
            message:
                "Windows DHCP configuration could not be read."
        };
    }

    const adapterBlocks = [];

    let currentBlock = null;

    for (const line of output.split(/\r?\n/)) {

        const trimmed = line.trim();

        if (
            trimmed &&
            !/^\s/.test(line) &&
            /\badapter\b/i.test(trimmed) &&
            /:\s*$/.test(trimmed)
        ) {

            currentBlock = [];

            adapterBlocks.push(currentBlock);

            continue;
        }

        if (currentBlock) {
            currentBlock.push(line);
        }
    }

    if (adapterBlocks.length === 0) {

        return {
            id: "dhcp_status",
            ok: false,
            supported: false,
            recommendationEligible: false,
            state: "unavailable",
            message:
                "The Windows adapter configuration could not be parsed. No recovery recommendation will be generated."
        };
    }

    const adapters = adapterBlocks.map(lines => {

        const block = lines.join("\n");

        const dhcpEnabled =
            /DHCP Enabled[^:\r\n]*:\s*Yes\b/i.test(block);

        const mediaDisconnected =
            /Media State[^:\r\n]*:\s*Media disconnected\b/i.test(block);

        const ipv4Addresses = [

            ...block.matchAll(
                /IPv4 Address[^:\r\n]*:\s*([0-9]{1,3}(?:\.[0-9]{1,3}){3})/gi
            )

        ].map(match => match[1]);

        const hasApipaAddress = ipv4Addresses.some(
            address => address.startsWith("169.254.")
        );

        const hasUsableIpv4 = ipv4Addresses.some(
            address =>
                !address.startsWith("169.254.") &&
                address !== "0.0.0.0"
        );

        const defaultGatewayConfigured =
            /Default Gateway[^:\r\n]*:\s*[0-9]{1,3}(?:\.[0-9]{1,3}){3}/i.test(block);

        const dhcpServerConfigured =
            /DHCP Server[^:\r\n]*:\s*[0-9]{1,3}(?:\.[0-9]{1,3}){3}/i.test(block);

        return {
            dhcpEnabled,
            mediaDisconnected,
            hasUsableIpv4,
            hasApipaAddress,
            defaultGatewayConfigured,
            dhcpServerConfigured
        };

    });

    const connectedDhcpAdapters = adapters.filter(
        adapter =>
            adapter.dhcpEnabled &&
            !adapter.mediaDisconnected
    );

    const apipaAdapterCount = connectedDhcpAdapters.filter(
        adapter => adapter.hasApipaAddress
    ).length;

    const missingIpv4AdapterCount = connectedDhcpAdapters.filter(
        adapter => !adapter.hasUsableIpv4
    ).length;

    const recommendationEligible =
        connectedDhcpAdapters.some(
            adapter =>
                adapter.hasApipaAddress ||
                !adapter.hasUsableIpv4
        );

    let state = "healthy";

    if (connectedDhcpAdapters.length === 0) {

        state = "no_active_dhcp_adapter";

    } else if (recommendationEligible) {

        state = "needs_renewal";

    }

    return {

        id: "dhcp_status",

        ok: !recommendationEligible,

        supported: true,

        state,

        adapterCount: adapters.length,

        dhcpEnabledAdapterCount: adapters.filter(
            adapter => adapter.dhcpEnabled
        ).length,

        connectedDhcpAdapterCount:
            connectedDhcpAdapters.length,

        apipaAdapterCount,

        missingIpv4AdapterCount,

        recommendationEligible,

        evidence: recommendationEligible
            ? "A connected DHCP-enabled adapter has an APIPA address or no usable IPv4 address."
            : connectedDhcpAdapters.length > 0
                ? "Connected DHCP-enabled adapters have usable IPv4 addresses."
                : "No connected DHCP-enabled adapter was detected.",

        message: recommendationEligible
            ? "A DHCP lease problem may be present. A lease renewal can be considered after user approval."
            : connectedDhcpAdapters.length > 0
                ? "The inspected DHCP-enabled adapters have usable IPv4 addresses."
                : "No active DHCP-enabled adapter is available for lease renewal.",

        note:
            "Only sanitized adapter status is returned. IP addresses, adapter names, and MAC addresses are not included."
    };
}


// ==========================================
// NETWORK ADAPTER HEALTH - READ ONLY
// ==========================================

async function checkNetworkAdapterStatus() {

    if (process.platform !== "win32") {

        return {
            id: "network_adapter_status",
            ok: false,
            supported: false,
            message: "Network adapter inspection is currently Windows-only."
        };
    }

    let execution;

    try {

        const command =
            'powershell.exe -NoProfile -NonInteractive -Command "Get-NetAdapter -ErrorAction Stop | Select-Object -Property Status,LinkSpeed | ConvertTo-Json -Compress"';

        execution = await run(command, {
            timeoutMs: 12000,
            ignoreExitCode: true
        });

    } catch (error) {

        return {
            id: "network_adapter_status",
            ok: false,
            supported: false,
            error: error.message,
            message: "Could not inspect Windows network adapters."
        };
    }

    const output = String(
        execution?.stdout || ""
    ).trim();

    if (
        execution?.code !== 0 ||
        !output
    ) {

        return {
            id: "network_adapter_status",
            ok: false,
            supported: false,
            message: "Windows did not return network adapter information.",
            error: execution?.stderr || null
        };
    }

    let parsed;

    try {

        parsed = JSON.parse(output);

    } catch {

        return {
            id: "network_adapter_status",
            ok: false,
            supported: false,
            message: "Network adapter information could not be parsed."
        };
    }

    const adapters = Array.isArray(parsed)
        ? parsed
        : [parsed];

    const validAdapters = adapters.filter(
        adapter =>
            adapter &&
            typeof adapter.Status === "string"
    );

    if (validAdapters.length === 0) {

        return {
            id: "network_adapter_status",
            ok: false,
            supported: false,
            message: "No readable network adapter information was found."
        };
    }

    const counts = {
        up: 0,
        disconnected: 0,
        disabled: 0,
        other: 0
    };

    for (const adapter of validAdapters) {

        const state = adapter.Status.toLowerCase();

        if (state === "up") {

            counts.up++;

        } else if (state === "disconnected") {

            counts.disconnected++;

        } else if (state === "disabled") {

            counts.disabled++;

        } else {

            counts.other++;

        }
    }

    const healthy = counts.up > 0;

    return {

        id: "network_adapter_status",

        ok: healthy,

        supported: true,

        adapterCount: validAdapters.length,

        connectedAdapters: counts.up,

        disconnectedAdapters: counts.disconnected,

        disabledAdapters: counts.disabled,

        otherAdapters: counts.other,

        evidence: healthy
            ? "At least one network adapter is active."
            : "No active network adapter was detected.",

        message: healthy
            ? "At least one Windows network adapter is operational."
            : "No operational Windows network adapter was detected.",

        note:
            "Only adapter status and link speed were inspected. Adapter names, IP addresses, and MAC addresses are not returned."
    };
}


// ==========================================
// DEFAULT GATEWAY CONNECTIVITY
// READ-ONLY
// ==========================================

async function checkGatewayConnectivity() {

    if (process.platform !== "win32") {

        return {
            id: "gateway_connectivity",
            ok: false,
            supported: false,
            message: "Gateway inspection is currently Windows-only."
        };
    }

    const script =
        "$items = @(Get-NetIPConfiguration -ErrorAction Stop | " +
        "Where-Object { $_.IPv4DefaultGateway } | " +
        "ForEach-Object { foreach ($g in $_.IPv4DefaultGateway) { " +
        "$ip = [string]$g.NextHop; " +
        "if ($ip -match '^\\d{1,3}(\\.\\d{1,3}){3}$') { " +
        "$ok = Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue; " +
        "[pscustomobject]@{ Responding = [bool]$ok } " +
        "} } }); " +
        "if ($items.Count -eq 0) { '[]' } " +
        "else { ConvertTo-Json -InputObject $items -Compress }";

    const command =
        `powershell.exe -NoProfile -NonInteractive -Command "${script}"`;

    let execution;

    try {

        execution = await run(command, {
            timeoutMs: 15000,
            ignoreExitCode: true
        });

    } catch (error) {

        return {
            id: "gateway_connectivity",
            ok: false,
            supported: false,
            error: error.message,
            message: "Could not inspect the default gateway."
        };
    }

    const output = String(
        execution?.stdout || ""
    ).trim();

    if (
        execution?.code !== 0 ||
        !output
    ) {

        return {
            id: "gateway_connectivity",
            ok: false,
            supported: false,
            message: "Windows did not return gateway information.",
            error: execution?.stderr || null
        };
    }

    let gateways;

    try {

        gateways = JSON.parse(output);

    } catch {

        return {
            id: "gateway_connectivity",
            ok: false,
            supported: false,
            message: "Gateway diagnostic output could not be parsed."
        };
    }

    if (!Array.isArray(gateways)) {
        gateways = [gateways];
    }

    const respondingCount = gateways.filter(
        gateway => gateway?.Responding === true
    ).length;

    const gatewayCount = gateways.length;

    if (gatewayCount === 0) {

        return {
            id: "gateway_connectivity",
            ok: false,
            supported: true,
            state: "no_default_gateway",
            gatewayCount: 0,
            respondingCount: 0,
            message: "No IPv4 default gateway was detected.",
            evidence: "Windows returned no configured IPv4 default gateway."
        };
    }

    const reachable = respondingCount > 0;

    return {

        id: "gateway_connectivity",

        ok: reachable,

        supported: true,

        state: reachable
            ? "responding"
            : "no_ping_response",

        gatewayCount,

        respondingCount,

        message: reachable
            ? "At least one default gateway responded to the connectivity test."
            : "No configured default gateway responded to the connectivity test.",

        evidence: reachable
            ? "At least one configured gateway responded to ICMP connectivity testing."
            : "Gateway addresses were found, but none responded to the ICMP connectivity test.",

        note:
            "A gateway that does not respond to ping is not necessarily offline. Some routers and firewalls block ICMP requests."
    };
}

// ==========================================
// DNS RESOLUTION DIAGNOSTIC
// USING NODE.JS SYSTEM DNS RESOLVER
// ==========================================

async function checkDnsResolution() {

    const domain = "example.com";

    const startedAt = Date.now();

    let timeout;

    try {

        const addresses = await Promise.race([

            lookup(domain, {
                all: true,
                verbatim: true
            }),

            new Promise((_, reject) => {

                timeout = setTimeout(() => {

                    reject(
                        new Error("DNS lookup timed out after 8 seconds.")
                    );

                }, 8000);

            })

        ]);

        const ipv4Answers = addresses.filter(
            item => item.family === 4
        ).length;

        const ipv6Answers = addresses.filter(
            item => item.family === 6
        ).length;

        const resolved =
            Array.isArray(addresses) &&
            addresses.length > 0;

        return {

            id: "dns_resolution",

            ok: resolved,

            supported: true,

            state: resolved
                ? "resolved"
                : "not_resolved",

            domain,

            totalAnswers: addresses.length,

            ipv4Answers,

            ipv6Answers,

            responseTimeMs:
                Date.now() - startedAt,

            message: resolved
                ? "DNS successfully resolved the test domain."
                : "DNS returned no usable addresses.",

            evidence:
                `${domain}: ${ipv4Answers} IPv4 and ${ipv6Answers} IPv6 answers received.`,

            note:
                "Uses Node.js system DNS resolution through the operating system's configured resolver. No network configuration is modified."

        };

    } catch (error) {

        return {

            id: "dns_resolution",

            ok: false,

            supported: true,

            state: "not_resolved",

            domain,

            errorCode: error.code || null,

            error: error.message,

            responseTimeMs:
                Date.now() - startedAt,

            message:
                "DNS resolution could not be completed.",

            note:
                "A failed lookup of one test domain does not establish that all DNS resolution is unavailable."

        };

    } finally {

        if (timeout) {
            clearTimeout(timeout);
        }

    }

}


// ==========================================
// INTERNET CONNECTIVITY
// READ-ONLY HTTPS TEST
// ==========================================

async function checkInternetConnectivity() {

    const endpoints = [

        {
            name: "Cloudflare",
            url: "https://www.cloudflare.com/cdn-cgi/trace"
        },

        {
            name: "Google",
            url: "https://www.google.com/generate_204"
        }

    ];

    const checks = await Promise.all(

        endpoints.map(async endpoint => {

            const startedAt = Date.now();

            try {

                const response = await fetch(
                    endpoint.url,
                    {
                        method: "GET",
                        redirect: "follow",
                        signal: AbortSignal.timeout(7000)
                    }
                );

                const result = {

                    endpoint: endpoint.name,

                    reached: true,

                    httpOk: response.ok,

                    status: response.status,

                    responseTimeMs:
                        Date.now() - startedAt
                };

                try {

                    await response.body?.cancel();

                } catch {
                    // Ignore body cleanup errors.
                }

                return result;

            } catch (error) {

                return {

                    endpoint: endpoint.name,

                    reached: false,

                    httpOk: false,

                    error:
                        error.name === "TimeoutError"
                            ? "Request timed out"
                            : "Connection failed",

                    responseTimeMs:
                        Date.now() - startedAt
                };
            }

        })

    );

    const reachedCount = checks.filter(
        check => check.reached
    ).length;

    const totalEndpoints = endpoints.length;

    let state;

    if (reachedCount === totalEndpoints) {

        state = "reachable";

    } else if (reachedCount > 0) {

        state = "partially_reachable";

    } else {

        state = "not_confirmed";

    }

    return {

        id: "internet_connectivity",

        ok: reachedCount > 0,

        supported: true,

        state,

        testedEndpoints: totalEndpoints,

        reachedEndpoints: reachedCount,

        failedEndpoints:
            totalEndpoints - reachedCount,

        checks,

        message: reachedCount > 0
            ? "At least one external HTTPS endpoint responded."
            : "External HTTPS connectivity could not be confirmed.",

        evidence:
            `${reachedCount} of ${totalEndpoints} external HTTPS endpoints responded.`,

        note:
            "This tests HTTPS connectivity from the TechFix backend. A failed endpoint does not by itself prove that the entire internet connection is unavailable."
    };
}


// ==========================================
// SAFE DIAGNOSTIC EXECUTION
// ==========================================

async function safe(checkFn, id, ...args) {

    try {

        return await checkFn(...args);

    } catch (error) {

        console.error(
            `[Diagnostics] ${id} failed:`,
            error.message
        );

        return {

            id,

            ok: false,

            supported: true,

            error: error.message || String(error),

            impact: "Diagnostic check could not be completed.",

            fix: null
        };
    }
}


// ==========================================
// RUN ALL DIAGNOSTICS
// ==========================================

async function runAll({

    port = Number(process.env.PORT || 5000)

} = {}) {

    const results = await Promise.all([

        safe(
            checkNodeVersion,
            "node_version"
        ),

        safe(
            checkPortConflict,
            "port_status",
            port
        ),

        safe(
            checkBackendHealth,
            "backend_health",
            port
        ),

        safe(
            checkEnvVars,
            "env_vars"
        ),

        safe(
            checkCPU,
            "cpu_stats"
        ),

        safe(
            checkMemory,
            "memory_stats"
        ),

        safe(
            checkNetwork,
            "network_stats"
        ),

        safe(
            checkNetworkAdapterStatus,
            "network_adapter_status"
        ),

        safe(
            checkDhcpConfiguration,
            "dhcp_status"
        ),

        safe(
            checkGatewayConnectivity,
            "gateway_connectivity"
        ),

        safe(
            checkDnsResolution,
            "dns_resolution"
        ),

        safe(
            checkInternetConnectivity,
            "internet_connectivity"
        )

    ]);

    const issues = results.filter(
        result => !result.ok
    );

    return {

        summary: {

            ok: issues.length === 0,

            issueCount: issues.length,

            issues,

            timestamp: new Date().toISOString()
        },

        results
    };
}


// ==========================================
// EXPORTS
// ==========================================

export {

    runAll,

    checkNodeVersion,

    checkPortConflict,

    checkBackendHealth,

    checkEnvVars,

    checkCPU,

    checkMemory,

    checkNetwork,

    checkDhcpConfiguration,

    checkNetworkAdapterStatus,

    checkGatewayConnectivity,

    checkDnsResolution,

    checkInternetConnectivity

};