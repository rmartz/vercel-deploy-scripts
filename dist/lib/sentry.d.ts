import { VercelClient } from "./vercel-api";
export declare function rotateSentry(targetEnv: string, client: VercelClient, sentryOrgOverride?: string, sentryProjectOverride?: string): Promise<string>;
export declare function initSentry(targetEnv: string, client: VercelClient, sentryOrgOverride?: string, sentryProjectOverride?: string): Promise<void>;
export declare function invalidateSentryKey(oldKeyId: string, org: string, project: string): Promise<void>;
//# sourceMappingURL=sentry.d.ts.map