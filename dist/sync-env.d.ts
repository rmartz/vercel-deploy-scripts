#!/usr/bin/env node
interface Options {
    targetEnv: string;
    deploymentDir: string;
    dryRun: boolean;
}
export declare function parseArgs(argv: string[]): Options;
export declare function run(opts: Options): Promise<void>;
export {};
//# sourceMappingURL=sync-env.d.ts.map