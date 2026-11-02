import { run } from "../utils/shell.js";
import { log } from "./audit.js";
import { checkDhcpConfiguration } from "./diagnostics.js";


// ==========================================
// DNS CACHE RECOVERY
// ==========================================

export async function flushDnsCache() {

    if (process.platform !== "win32") {

        throw new Error(
            "DNS cache flushing is currently supported only on Windows."
        );
    }

    console.log("[Recovery] Starting DNS cache flush.");

    const execution = await run(
        "ipconfig /flushdns",
        {
            timeoutMs: 10000
        }
    );

    const success = execution?.code === 0;

    if (!success) {

        throw new Error(
            execution?.stderr ||
            execution?.stdout ||
            "Windows DNS cache flushing failed."
        );
    }

    // Verify DNS lookup after flushing.
    let verification;

    try {

        verification = await run(
            "nslookup example.com",
            {
                timeoutMs: 10000,
                ignoreExitCode: true
            }
        );

    } catch (error) {

        verification = {
            attempted: true,
            error: error.message
        };
    }

    // Record the recovery action.
    try {

        await log("recovery:dns_cache_flush", {
            success: true,
            verificationAttempted: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {

        console.error(
            "[Recovery] Audit logging failed:",
            error.message
        );
    }

    console.log(
        "[Recovery] DNS cache flushed successfully."
    );

    return {

        success: true,

        action: "flush_dns_cache",

        message: "Windows DNS resolver cache was flushed.",

        output: execution.stdout || "",

        verification,

        note:
            "A DNS lookup was attempted after the flush. " +
            "Successful DNS resolution does not by itself prove " +
            "that the original network problem is completely fixed."
    };
}


// ==========================================
// DHCP LEASE RENEWAL
// ==========================================

export async function renewDhcpLease() {

    if (process.platform !== "win32") {

        throw new Error(
            "DHCP lease renewal is currently supported only on Windows."
        );
    }

    console.log(
        "[Recovery] Starting approved DHCP lease renewal."
    );

    // Fixed command only.
    // No user or AI supplied arguments are accepted.
    // The existing lease is not released first.

    const execution = await run(
        "ipconfig /renew",
        {
            timeoutMs: 45000,
            ignoreExitCode: true
        }
    );

    if (execution?.code !== 0) {

        throw new Error(
            execution?.stderr ||
            execution?.stdout ||
            "Windows DHCP lease renewal failed."
        );
    }

    // Verify DHCP configuration after renewal.

    let verification;

    try {

        verification = await checkDhcpConfiguration();

    } catch (error) {

        verification = {
            supported: false,
            state: "verification_failed",
            error: error.message
        };
    }

    // Record sanitized verification information.

    try {

        await log("recovery:dhcp_lease_renewal", {

            commandCompleted: true,

            verificationSupported:
                Boolean(verification?.supported),

            state:
                verification?.state || "unknown",

            recommendationEligible:
                Boolean(
                    verification?.recommendationEligible
                ),

            timestamp: new Date().toISOString()

        });

    } catch (error) {

        console.error(
            "[Recovery] Audit logging failed:",
            error.message
        );
    }

    const verifiedHealthy =
        verification?.supported === true &&
        verification?.state === "healthy";

    const stillNeedsRenewal =
        verification?.supported === true &&
        verification?.recommendationEligible === true;

    let note;

    if (verifiedHealthy) {

        note =
            "The post-renewal check found usable IPv4 configuration " +
            "on connected DHCP-enabled adapters. This does not guarantee " +
            "that every website or application is reachable.";

    } else if (stillNeedsRenewal) {

        note =
            "The renewal command completed, but a connected DHCP-enabled " +
            "adapter still appears to lack a usable IPv4 address. " +
            "The network may require further investigation.";

    } else {

        note =
            "The renewal command completed, but the DHCP state could not " +
            "be fully verified. Check the network connection if the issue remains.";
    }

    console.log(
        "[Recovery] DHCP lease renewal command completed."
    );

    return {

        success: true,

        action: "renew_dhcp_lease",

        message:
            "Windows DHCP lease renewal command completed.",

        output: execution.stdout || "",

        verification: {

            supported:
                Boolean(verification?.supported),

            state:
                verification?.state || "unknown",

            dhcpEnabledAdapterCount:
                verification?.dhcpEnabledAdapterCount ?? null,

            connectedDhcpAdapterCount:
                verification?.connectedDhcpAdapterCount ?? null,

            apipaAdapterCount:
                verification?.apipaAdapterCount ?? null,

            missingIpv4AdapterCount:
                verification?.missingIpv4AdapterCount ?? null,

            recommendationEligible:
                verification?.recommendationEligible ?? null,

            verifiedHealthy
        },

        note
    };
}


// ==========================================
// DISABLED SYSTEM-CHANGING ACTIONS
// ==========================================

async function upgradeNode() {

    throw new Error(
        "Node.js upgrades are disabled pending a secure recovery workflow."
    );
}


async function freePort() {

    throw new Error(
        "Automatic process termination is disabled for security."
    );
}


async function openFirewall() {

    throw new Error(
        "Automatic firewall modification is disabled for security."
    );
}


async function setEnv() {

    throw new Error(
        "Automatic environment-variable modification is disabled."
    );
}


// ==========================================
// EXPORTS
// ==========================================

export {
    upgradeNode,
    freePort,
    openFirewall,
    setEnv
};