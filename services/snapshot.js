import fs from "node:fs";
import path from "node:path";


// ==========================================
// SNAPSHOT DIRECTORY
// ==========================================

function getSnapshotDirectory() {

    return path.join(
        process.cwd(),
        "data",
        "snapshots"
    );
}


// ==========================================
// ENSURE DIRECTORY EXISTS
// ==========================================

function ensureDir(directory) {

    if (!fs.existsSync(directory)) {

        fs.mkdirSync(
            directory,
            {
                recursive: true
            }
        );
    }
}


// ==========================================
// CAPTURE SNAPSHOT METADATA
// ==========================================

async function capture(kind, meta = {}) {

    const id =
        `${kind}-${Date.now()}`;

    const baseDirectory =
        getSnapshotDirectory();

    const directory =
        path.join(baseDirectory, id);

    ensureDir(directory);

    const payload = {

        id,

        kind,

        meta,

        timestamp: new Date().toISOString(),

        type: "metadata_only",

        restoreSupported: false
    };

    fs.writeFileSync(

        path.join(
            directory,
            "snapshot.json"
        ),

        JSON.stringify(
            payload,
            null,
            2
        ),

        "utf8"
    );

    return id;
}


// ==========================================
// ROLLBACK
// ==========================================

async function rollback(id) {

    if (
        typeof id !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(id)
    ) {

        throw new Error(
            "Invalid snapshot ID."
        );
    }

    const directory = path.join(
        getSnapshotDirectory(),
        id
    );

    const snapshotFile = path.join(
        directory,
        "snapshot.json"
    );

    if (!fs.existsSync(snapshotFile)) {

        throw new Error(
            `Snapshot not found: ${id}`
        );
    }

    const payload = JSON.parse(
        fs.readFileSync(
            snapshotFile,
            "utf8"
        )
    );

    // This implementation stores metadata only.
    // It does not restore actual Windows settings or files.

    return {

        restored: false,

        supported: false,

        message:
            "This snapshot contains metadata only. " +
            "No system settings or files were restored.",

        payload
    };
}


// ==========================================
// EXPORTS
// ==========================================

export {
    capture,
    rollback
};