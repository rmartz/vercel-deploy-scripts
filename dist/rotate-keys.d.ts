#!/usr/bin/env node
import { VercelClient, VercelEnvVar } from "./lib/vercel-api";
interface Options {
  targetEnv: string;
  invalidateKeys: boolean;
  init: "all" | "firebase" | "sentry" | null;
}
export declare function parseArgs(argv: string[]): Options;
export declare function createGcpKey(
  outputFile: string,
  saEmail: string,
  gcpProject: string,
): void;
export declare function listUserManagedGcpKeys(
  saEmail: string,
  gcpProject: string,
): string[];
export declare function deleteGcpKey(
  keyId: string,
  saEmail: string,
  gcpProject: string,
): void;
interface FirebasePattern {
  pattern: "json" | "split";
  saEmail: string;
  gcpProject: string;
}
export declare function detectFirebasePattern(
  envs: VercelEnvVar[],
  client: VercelClient,
): Promise<FirebasePattern>;
export declare function run(opts: Options): Promise<void>;
export {};
//# sourceMappingURL=rotate-keys.d.ts.map
