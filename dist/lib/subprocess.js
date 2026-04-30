"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
exports.commandExists = commandExists;
const child_process_1 = require("child_process");
function run(cmd, args, opts) {
    const result = (0, child_process_1.spawnSync)(cmd, args, { encoding: "utf-8", ...opts });
    if (result.error)
        throw new Error(`Failed to run ${cmd}: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`${cmd} exited with code ${result.status}: ${String(result.stderr ?? "")}`);
    }
    return String(result.stdout ?? "");
}
function commandExists(cmd) {
    const result = (0, child_process_1.spawnSync)("command", ["-v", cmd], { shell: true });
    return result.status === 0;
}
//# sourceMappingURL=subprocess.js.map