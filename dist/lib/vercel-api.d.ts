export interface VercelEnvVar {
    id: string;
    key: string;
    value: string;
    target: string[];
    type: "plain" | "encrypted" | "secret";
    createdAt?: number;
    updatedAt?: number;
}
export interface VercelEnvVarList {
    envs: VercelEnvVar[];
    pagination?: {
        next?: number;
    };
}
export interface VercelDeployment {
    uid: string;
    url: string;
    name: string;
    readyState?: string;
    status?: string;
}
export declare class VercelClient {
    private token;
    private projectId;
    private teamId?;
    private baseUrl;
    constructor(token: string, projectId: string, teamId?: string | undefined);
    private buildUrl;
    request<T>(path: string, method?: string, body?: unknown): Promise<T>;
    listEnvVars(): Promise<VercelEnvVarList>;
    getEnvVarValue(envId: string): Promise<string>;
    createEnvVar(key: string, value: string, target: string, type?: "plain" | "encrypted"): Promise<VercelEnvVar>;
    updateEnvVar(envId: string, value: string): Promise<void>;
    deleteEnvVar(envId: string): Promise<void>;
    findEnvVar(envs: VercelEnvVar[], key: string, target: string): VercelEnvVar | undefined;
    setEnvForTarget(key: string, value: string, target: string, allEnvs: VercelEnvVar[], type?: "plain" | "encrypted"): Promise<string>;
    getLatestDeployment(target: "production" | "staging"): Promise<VercelDeployment | null>;
    triggerRedeployment(deploymentId: string, name: string, target?: string): Promise<string>;
    listPreviewDeployments(): Promise<VercelDeployment[]>;
    pollDeploymentStatus(deploymentId: string, maxAttempts?: number, intervalMs?: number): Promise<void>;
}
//# sourceMappingURL=vercel-api.d.ts.map