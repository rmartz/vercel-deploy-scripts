"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVercelToken = resolveVercelToken;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
function vercelCliAuthPath() {
    if (process.env.__VERCEL_CLI_AUTH_PATH)
        return process.env.__VERCEL_CLI_AUTH_PATH;
    switch (process.platform) {
        case "darwin":
            return path.join(os.homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json");
        case "win32":
            return path.join(process.env.APPDATA ?? os.homedir(), "com.vercel.cli", "auth.json");
        default:
            return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "com.vercel.cli", "auth.json");
    }
}
function readCliToken() {
    const authPath = vercelCliAuthPath();
    let raw;
    try {
        raw = fs.readFileSync(authPath, "utf-8");
    }
    catch {
        return undefined;
    }
    let auth;
    try {
        auth = JSON.parse(raw);
    }
    catch {
        return undefined;
    }
    if (!auth.token)
        return undefined;
    if (auth.expiresAt !== undefined && Date.now() / 1000 > auth.expiresAt) {
        return undefined;
    }
    return auth.token;
}
/**
 * Returns the Vercel API token to use, preferring VERCEL_TOKEN env var and
 * falling back to the token stored by the Vercel CLI (vercel login).
 *
 * Returns undefined if no token is available.
 */
function resolveVercelToken() {
    return process.env.VERCEL_TOKEN || readCliToken() || undefined;
}
//# sourceMappingURL=auth.js.map