"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VercelClient = void 0;
const logger_1 = require("./logger");
class VercelClient {
    token;
    projectId;
    teamId;
    baseUrl = "https://api.vercel.com";
    constructor(token, projectId, teamId) {
        this.token = token;
        this.projectId = projectId;
        this.teamId = teamId;
    }
    buildUrl(path) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (this.teamId)
            url.searchParams.set("teamId", this.teamId);
        return url.toString();
    }
    async request(path, method = "GET", body) {
        const url = this.buildUrl(path);
        const res = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const text = await res.text();
            throw new logger_1.FatalError(`Vercel API ${method} ${path} failed (${res.status}): ${text}`);
        }
        if (res.status === 204 || method === "DELETE")
            return undefined;
        return res.json();
    }
    async listEnvVars() {
        let result = await this.request(`/v9/projects/${this.projectId}/env?limit=100`);
        while (result.pagination?.next) {
            const page = await this.request(`/v9/projects/${this.projectId}/env?limit=100&since=${result.pagination.next}`);
            result = {
                envs: [...result.envs, ...page.envs],
                pagination: page.pagination,
            };
        }
        return result;
    }
    async getEnvVarValue(envId) {
        const record = await this.request(`/v1/projects/${this.projectId}/env/${envId}`);
        return record.value;
    }
    async createEnvVar(key, value, target, type = "plain") {
        return this.request(`/v10/projects/${this.projectId}/env`, "POST", {
            key,
            value,
            target: [target],
            type,
        });
    }
    async updateEnvVar(envId, value) {
        await this.request(`/v9/projects/${this.projectId}/env/${envId}`, "PATCH", {
            value,
        });
    }
    async deleteEnvVar(envId) {
        await this.request(`/v9/projects/${this.projectId}/env/${envId}`, "DELETE");
    }
    findEnvVar(envs, key, target) {
        return envs.find((e) => e.key === key && e.target.includes(target));
    }
    async setEnvForTarget(key, value, target, allEnvs, type = "encrypted") {
        const existing = this.findEnvVar(allEnvs, key, target);
        if (existing) {
            await this.deleteEnvVar(existing.id);
        }
        const created = await this.createEnvVar(key, value, target, type);
        if (!created.id) {
            const refetched = await this.listEnvVars();
            const confirmed = this.findEnvVar(refetched.envs, key, target);
            if (!confirmed?.id) {
                throw new Error(`Failed to confirm ${key} was saved for ${target} after write`);
            }
            return confirmed.id;
        }
        return created.id;
    }
    async getLatestDeployment(target) {
        const url = new URL(`${this.baseUrl}/v6/deployments`);
        url.searchParams.set("projectId", this.projectId);
        url.searchParams.set("target", target);
        url.searchParams.set("limit", "1");
        url.searchParams.set("state", "READY");
        if (this.teamId)
            url.searchParams.set("teamId", this.teamId);
        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!res.ok)
            return null;
        const text = await res.text();
        // eslint-disable-next-line no-control-regex
        const cleaned = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
        const data = JSON.parse(cleaned);
        return data.deployments[0] ?? null;
    }
    async triggerRedeployment(deploymentId, name, target) {
        const body = { deploymentId, name };
        if (target !== undefined)
            body.target = target;
        const result = await this.request("/v13/deployments", "POST", body);
        return result.id;
    }
    async listPreviewDeployments() {
        const url = new URL(`${this.baseUrl}/v6/deployments`);
        url.searchParams.set("projectId", this.projectId);
        url.searchParams.set("state", "READY");
        url.searchParams.set("limit", "50");
        if (this.teamId)
            url.searchParams.set("teamId", this.teamId);
        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!res.ok)
            return [];
        const data = (await res.json());
        // PR preview deployments have target === null; production and aliased
        // preview (staging) deployments have an explicit target string.
        return data.deployments.filter((d) => d.target === null);
    }
    async pollDeploymentStatus(deploymentId, maxAttempts = 60, intervalMs = 10_000) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result = await this.request(`/v13/deployments/${deploymentId}`);
            if (result.status === "READY")
                return;
            if (result.status === "ERROR" || result.status === "CANCELED") {
                throw new Error(`Deployment ${deploymentId} ended with status: ${result.status}`);
            }
            await new Promise((r) => setTimeout(r, intervalMs));
        }
        throw new Error(`Deployment ${deploymentId} timed out after ${maxAttempts} attempts`);
    }
}
exports.VercelClient = VercelClient;
//# sourceMappingURL=vercel-api.js.map