"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGcpKey = createGcpKey;
exports.listUserManagedGcpKeys = listUserManagedGcpKeys;
exports.deleteGcpKey = deleteGcpKey;
const subprocess_1 = require("./subprocess");
// ─── GCP helpers ──────────────────────────────────────────────────────────────
function createGcpKey(outputFile, saEmail, gcpProject) {
    (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "create",
        outputFile,
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--quiet",
    ]);
}
function listUserManagedGcpKeys(saEmail, gcpProject) {
    const output = (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "list",
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--managed-by",
        "user",
        "--format",
        "value(name.basename())",
    ]);
    return output.trim().split("\n").filter(Boolean);
}
function deleteGcpKey(keyId, saEmail, gcpProject) {
    (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "delete",
        keyId,
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--quiet",
    ]);
}
//# sourceMappingURL=gcp.js.map