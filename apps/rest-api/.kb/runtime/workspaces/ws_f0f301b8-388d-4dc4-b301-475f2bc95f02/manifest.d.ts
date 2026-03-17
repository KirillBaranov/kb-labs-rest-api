import * as _kb_labs_perm_presets from '@kb-labs/perm-presets';

/**
 * KB Labs Workflow CLI - Manifest V3
 *
 * Provides CLI commands for interacting with Workflow Daemon via HTTP API.
 */
declare const manifest: {
    schema: string;
    id: string;
    version: string;
    display: {
        name: string;
        description: string;
        tags: string[];
    };
    platform: {
        requires: never[];
        optional: never[];
    };
    cli: {
        commands: {
            id: string;
            group: string;
            describe: string;
            longDescription: string;
            handler: string;
            handlerPath: string;
            flags: {
                name: string;
                type: "string" | "boolean" | "number" | "array";
                alias?: string;
                default?: unknown;
                description?: string;
                choices?: string[];
                required?: boolean;
            }[];
            examples: string[];
        }[];
    };
    rest: {
        basePath: string;
        routes: ({
            method: string;
            path: "/stats";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/workflows";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/workflows/:id";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/workflows/:id/run";
            handler: string;
            describe: string;
            input: {
                zod: string;
            };
            output?: undefined;
        } | {
            method: string;
            path: "/workflows/:id/runs";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/workflows/runs/:runId/cancel";
            handler: string;
            describe: string;
            output?: undefined;
            input?: undefined;
        } | {
            method: string;
            path: "/runs";
            handler: string;
            describe: string;
            output?: undefined;
            input?: undefined;
        } | {
            method: string;
            path: "/runs/:runId";
            handler: string;
            describe: string;
            output?: undefined;
            input?: undefined;
        } | {
            method: string;
            path: "/jobs";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/jobs/:jobId";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/jobs/:jobId/logs";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/jobs/:jobId/steps";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/jobs/:jobId/cancel";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/cron";
            handler: string;
            describe: string;
            output: {
                zod: string;
            };
            input?: undefined;
        } | {
            method: string;
            path: "/runs/:runId/pending-approvals";
            handler: string;
            describe: string;
            output?: undefined;
            input?: undefined;
        } | {
            method: string;
            path: "/runs/:runId/approve";
            handler: string;
            describe: string;
            output?: undefined;
            input?: undefined;
        })[];
    };
    ws: {
        basePath: string;
        defaults: {
            timeoutMs: number;
            maxMessageSize: number;
            auth: string;
            idleTimeoutMs: number;
        };
        channels: {
            path: string;
            handler: string;
            description: string;
        }[];
    };
    permissions: _kb_labs_perm_presets.RuntimePermissionSpec;
};

export { manifest };
