export interface Options {
    targetEnv: string;
    deploymentDir: string;
    dryRun: boolean;
    rotateKeys: boolean;
    invalidateKeys: boolean;
    refreshPreviews?: boolean;
    init?: "all" | "auto" | "firebase" | "sentry";
}
export declare function parseArgs(argv: string[]): Options;
//# sourceMappingURL=sync-env-args.d.ts.map