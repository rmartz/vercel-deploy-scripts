import { VercelClient, VercelEnvVar } from "./vercel-api";
export interface FirebasePattern {
    pattern: "json" | "split";
    saEmail: string;
    gcpProject: string;
}
export interface OldFirebaseKey {
    vercelEnv: string;
    keyId: string;
    saEmail: string;
    gcpProject: string;
}
export declare function detectFirebasePattern(envs: VercelEnvVar[], client: VercelClient): Promise<FirebasePattern>;
export declare function rotateFirebase(targetEnv: string, client: VercelClient, tempDir: string): Promise<{
    oldKeys: OldFirebaseKey[];
    fp: FirebasePattern;
}>;
export declare function initFirebase(targetEnv: string, client: VercelClient, tempDir: string, saEmailOverride?: string, gcpProjectOverride?: string): Promise<void>;
export declare function invalidateFirebaseKeys(client: VercelClient, fp: FirebasePattern): Promise<void>;
//# sourceMappingURL=firebase.d.ts.map