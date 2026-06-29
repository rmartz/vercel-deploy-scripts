import type { Options } from "./sync-env-args";
export declare function findDevSource(activeEnvs: string[]): string | undefined;
export declare function validateInitConfig(opts: Options, envList: string[], devSource: string | undefined): void;
export declare function resolveAutoInit(deploymentDir: string, targetEnv: string, envList: string[], devSource: string | undefined): "all" | "firebase" | "sentry";
//# sourceMappingURL=sync-env-init.d.ts.map