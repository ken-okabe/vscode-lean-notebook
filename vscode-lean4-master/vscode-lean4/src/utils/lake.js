"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LakeRunner = void 0;
exports.displayLakeRunnerError = displayLakeRunnerError;
exports.lake = lake;
const os = require("os");
const zod_1 = require("zod");
const batch_1 = require("./batch");
const leanCmdRunner_1 = require("./leanCmdRunner");
function displayLakeRunnerError(error, message) {
    if (error.diagnosis === undefined) {
        (0, batch_1.displayOutputError)(error.output, message);
        return;
    }
    (0, batch_1.displayOutputError)(error.output, `${message} ${error.diagnosis.details}`);
}
class LakeRunner {
    constructor(options) {
        this.options = options;
    }
    async initProject(name, kind) {
        const args = kind ? [name, kind] : [name];
        return this.runLakeCommandWithProgress('init', args, 'Initializing project');
    }
    async updateDependencies() {
        return this.runLakeCommandWithProgress('update', [], 'Updating dependencies');
    }
    async updateDependency(dependencyName) {
        return this.runLakeCommandWithProgress('update', [dependencyName], `Updating '${dependencyName}' dependency`);
    }
    async build() {
        return this.runLakeCommandWithProgress('build', [], 'Building Lean project');
    }
    async clean() {
        return this.runLakeCommandWithProgress('clean', [], 'Cleaning Lean project');
    }
    async queryDeps() {
        const queryResult = await this.runLakeCommandWithProgress('query', [':deps', '--json'], 'Querying project dependencies');
        switch (queryResult.kind) {
            case 'Success':
                let parsedJson;
                try {
                    parsedJson = JSON.parse(queryResult.output);
                }
                catch (e) {
                    return { kind: 'InvalidOutput', output: queryResult.output };
                }
                const r = zod_1.z.array(zod_1.z.string()).safeParse(parsedJson);
                if (!r.success) {
                    return { kind: 'InvalidOutput', output: queryResult.output };
                }
                return { kind: 'Success', deps: r.data };
            case 'Cancelled':
                return { kind: 'Cancelled' };
            case 'Error':
                if (queryResult.diagnosis?.kind === 'SubCommandNotFound') {
                    return { kind: 'QueryUnavailable' };
                }
                return queryResult;
        }
    }
    async runFetchMathlibCacheCommand(args, prompt) {
        const availabilityResult = await this.isMathlibCacheGetAvailable();
        if (availabilityResult.kind !== 'CacheAvailable') {
            return availabilityResult;
        }
        return await this.runLakeCommandWithProgress('exe', ['cache', 'get'].concat(args), prompt);
    }
    async tryRunFetchMathlibCacheCommand(args, prompt) {
        const fetchResult = await this.runFetchMathlibCacheCommand(args, prompt);
        if (fetchResult.kind === 'CacheUnavailable') {
            return { kind: 'Success', output: '' };
        }
        return fetchResult;
    }
    async fetchMathlibCache() {
        return this.runFetchMathlibCacheCommand([], 'Fetching Mathlib build artifact cache');
    }
    async tryFetchMathlibCache() {
        return this.tryRunFetchMathlibCacheCommand([], 'Fetching Mathlib build artifact cache');
    }
    async tryFetchMathlibCacheWithError() {
        const fetchResult = await this.tryFetchMathlibCache();
        if (fetchResult.kind === 'Cancelled') {
            return 'Failure';
        }
        if (fetchResult.kind !== 'Success') {
            displayLakeRunnerError(fetchResult, 'Cannot fetch Mathlib build artifact cache.');
            return 'Failure';
        }
        return 'Success';
    }
    async fetchMathlibCacheForFile(projectRelativeFileUri) {
        return this.runFetchMathlibCacheCommand([projectRelativeFileUri.fsPath], `Fetching Mathlib build artifact cache for ${projectRelativeFileUri.baseName()}`);
    }
    async isMathlibCacheGetAvailable() {
        const result = await this.runLakeCommandWithProgress('exe', ['cache'], 'Checking whether this is a Mathlib project', 
        // Filter the `lake exe cache` help string.
        _line => undefined);
        switch (result.kind) {
            case 'Success':
                return { kind: 'CacheAvailable' };
            case 'Cancelled':
                return { kind: 'Cancelled' };
            case 'Error':
                if (result.diagnosis !== undefined) {
                    return result;
                }
                return { kind: 'CacheUnavailable' };
        }
    }
    async runLakeCommandWithProgress(subCommand, args, waitingPrompt, translator) {
        const r = await leanCmdRunner_1.leanRunner.runLeanCommand('lake', [subCommand, ...args], {
            channel: this.options.channel,
            context: this.options.context,
            cwdUri: this.options.cwdUri,
            waitingPrompt,
            toolchain: this.options.toolchain,
            toolchainUpdateMode: this.options.toolchainUpdateMode,
            translator,
        });
        switch (r.exitCode) {
            case batch_1.ExecutionExitCode.Success:
                return { kind: 'Success', output: r.stdout };
            case batch_1.ExecutionExitCode.CannotLaunch:
                return {
                    kind: 'Error',
                    diagnosis: { kind: 'CommandNotFound', details: "'lake' command was not found." },
                    output: r.combined,
                };
            case batch_1.ExecutionExitCode.ExecutionError:
                let diagnosis;
                if (r.combined.includes(`error: unknown command '${subCommand}'`)) {
                    diagnosis = {
                        kind: 'SubCommandNotFound',
                        details: `Lake sub-command '${subCommand}' is not available.`,
                    };
                }
                if (os.platform() === 'win32' &&
                    (r.combined.includes('failed to fetch GitHub release') ||
                        r.combined.includes('failed to fetch Reservoir build'))) {
                    diagnosis = {
                        kind: 'WindowsFetchError',
                        details: 'Lake could not fetch a build cache artifact. On Windows, this can sometimes occur when third-party antiviruses interfere with the secure connection through which Lake downloads build artifacts. Click [here](command:lean4.troubleshooting.showTroubleshootingGuide) for more details.',
                    };
                }
                return {
                    kind: 'Error',
                    diagnosis,
                    output: r.combined,
                };
            case batch_1.ExecutionExitCode.Cancelled:
                return {
                    kind: 'Cancelled',
                };
        }
    }
}
exports.LakeRunner = LakeRunner;
function lake(options) {
    return new LakeRunner(options);
}
//# sourceMappingURL=lake.js.map