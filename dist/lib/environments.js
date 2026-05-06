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
exports.listActiveEnvs = listActiveEnvs;
exports.parseDeploymentEnv = parseDeploymentEnv;
exports.vercelTarget = vercelTarget;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
function listActiveEnvs(deploymentDir) {
    const envFile = path.join(deploymentDir, "environments.yml");
    const data = yaml.load(fs.readFileSync(envFile, "utf-8"));
    return data?.active ?? [];
}
function parseDeploymentEnv(deploymentDir, envName) {
    const envFile = path.join(deploymentDir, `${envName}.yml`);
    if (!fs.existsSync(envFile))
        return {};
    const data = yaml.load(fs.readFileSync(envFile, "utf-8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
        return {};
    // Support nested `variables:` format ({ environment: "staging", variables: { KEY: val } })
    // as well as flat format ({ KEY: val }).
    const vars = data.variables !== null &&
        data.variables !== undefined &&
        typeof data.variables === "object" &&
        !Array.isArray(data.variables)
        ? data.variables
        : data;
    const result = {};
    for (const [key, value] of Object.entries(vars)) {
        if (value === null || value === undefined)
            continue;
        const strValue = typeof value === "boolean" ? String(value).toLowerCase() : String(value);
        if (strValue)
            result[key] = strValue;
    }
    return result;
}
const TARGET_MAP = {
    production: "production",
    staging: "preview",
    preview: "preview",
    development: "development",
};
function vercelTarget(envName) {
    return TARGET_MAP[envName] ?? envName;
}
//# sourceMappingURL=environments.js.map