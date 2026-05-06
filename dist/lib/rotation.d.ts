export interface RotationOptions {
    targetEnv: string;
    invalidateKeys: boolean;
    init?: "all" | "firebase" | "sentry";
    /** SA email for --init firebase. Falls back to FIREBASE_SA_EMAIL env var. */
    firebaseSaEmail?: string;
    /** GCP project ID for --init firebase. Falls back to GCLOUD_PROJECT env var. */
    gcpProject?: string;
    /** Sentry org slug. Falls back to SENTRY_ORG env var. */
    sentryOrg?: string;
    /** Sentry project slug. Falls back to SENTRY_PROJECT env var. */
    sentryProject?: string;
}
export declare function run(opts: RotationOptions): Promise<void>;
//# sourceMappingURL=rotation.d.ts.map