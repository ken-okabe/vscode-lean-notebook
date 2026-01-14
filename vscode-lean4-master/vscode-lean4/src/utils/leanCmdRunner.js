"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leanRunner = exports.LeanCommandRunner = void 0;
exports.registerLeanCommandRunner = registerLeanCommandRunner;
const path_1 = require("path");
const config_1 = require("../config");
const batch_1 = require("./batch");
const elan_1 = require("./elan");
const notifs_1 = require("./notifs");
function shouldUpdateToolchainAutomatically(mode) {
    return !(0, config_1.alwaysAskBeforeInstallingLeanVersions)() && mode === 'UpdateAutomatically';
}
function overrideReason(activeOverride) {
    switch (activeOverride?.kind) {
        case undefined:
            return undefined;
        case 'Environment':
            return undefined;
        case 'Manual':
            return `set by \`elan override\` in folder '${activeOverride.directoryPath.baseName()}'`;
        case 'ToolchainFile':
            return `of Lean project '${path_1.default.dirname(activeOverride.toolchainPath.fsPath)}'`;
        case 'LeanpkgFile':
            return `of Lean project '${path_1.default.dirname(activeOverride.leanpkgPath.fsPath)}'`;
        case 'ToolchainDirectory':
            return `of Lean project '${activeOverride.directoryPath.fsPath}'`;
    }
}
function leanNotInstalledError(activeOverride, unresolvedActiveToolchain) {
    const or = overrideReason(activeOverride);
    const formattedOverride = or !== undefined ? ' ' + or : '';
    if (unresolvedActiveToolchain.fromChannel !== undefined) {
        const prefix = activeOverride === undefined ? 'default ' : '';
        return `No Lean version for ${prefix}release channel '${elan_1.ElanUnresolvedToolchain.toolchainName(unresolvedActiveToolchain)}'${formattedOverride} is installed.`;
    }
    else {
        const prefix = activeOverride === undefined ? 'Default ' : '';
        return `${prefix}Lean version '${elan_1.ElanUnresolvedToolchain.toolchainName(unresolvedActiveToolchain)}'${formattedOverride} is not installed.`;
    }
}
function installationPrompt(activeOverride, unresolvedActiveToolchain) {
    const error = leanNotInstalledError(activeOverride, unresolvedActiveToolchain);
    if (unresolvedActiveToolchain.fromChannel !== undefined) {
        return `${error}\n\n` + 'Do you wish to install one?';
    }
    else {
        return `${error}\n\n` + 'Do you wish to install it?';
    }
}
function updatePrompt(activeOverride, releaseChannel, cachedActiveToolchain, resolvedActiveToolchain) {
    const prefix = activeOverride === undefined ? 'default ' : '';
    const reason = overrideReason(activeOverride);
    return (`Installed Lean version '${cachedActiveToolchain}' for ${prefix}release channel '${releaseChannel}'${reason !== undefined ? ' ' + reason : ''} is outdated.\n\n` +
        `Do you wish to install the new Lean version '${resolvedActiveToolchain}' or continue using the outdated Lean version?`);
}
function updateDecisionKey(cwdUri, cachedToolchain) {
    return JSON.stringify({
        cwdUri,
        cachedToolchain,
    });
}
class LeanCommandRunner {
    constructor() {
        this.stickyUpdateDecisions = new Map();
    }
    async runCmd(executablePath, args, options, toolchain) {
        const toolchainOverride = toolchain ?? options.toolchain;
        if (toolchainOverride !== undefined) {
            args = [`+${toolchainOverride}`, ...args];
        }
        return await (0, batch_1.batchExecuteWithProgress)(executablePath, args, options.context, options.waitingPrompt, {
            cwd: options.cwdUri?.fsPath,
            channel: options.channel,
            translator: options.translator,
            allowCancellation: true,
        });
    }
    async analyzeElanStateDumpWithoutNetResult(channel, context, r) {
        const runWithActiveToolchain = { kind: 'RunWithActiveToolchain' };
        let elanState;
        switch (r.kind) {
            case 'Success':
                elanState = r.state;
                break;
            case 'ElanNotFound':
                return runWithActiveToolchain;
            case 'ExecutionError':
                return runWithActiveToolchain;
        }
        const unresolvedToolchain = elan_1.ElanToolchains.unresolvedToolchain(elanState.toolchains);
        const toolchainResolutionResult = elanState.toolchains.resolvedActive;
        if (unresolvedToolchain === undefined || toolchainResolutionResult === undefined) {
            return runWithActiveToolchain;
        }
        if (unresolvedToolchain.kind === 'Local') {
            return runWithActiveToolchain;
        }
        const cachedToolchain = toolchainResolutionResult.cachedToolchain;
        if (cachedToolchain === undefined) {
            const installNewToolchain = async () => {
                const elanInstallToolchainResult = await (0, elan_1.elanInstallToolchain)(channel, context, elan_1.ElanUnresolvedToolchain.toolchainName(unresolvedToolchain));
                switch (elanInstallToolchainResult.kind) {
                    case 'Success':
                    case 'ElanNotFound':
                    case 'ToolchainAlreadyInstalled':
                        return runWithActiveToolchain;
                    case 'Error':
                        return {
                            kind: 'Error',
                            message: leanNotInstalledError(elanState.toolchains.activeOverride?.reason, unresolvedToolchain) + ` Reason: Installation failed. Error: ${elanInstallToolchainResult.message}`,
                        };
                    case 'Cancelled':
                        return {
                            kind: 'Error',
                            message: leanNotInstalledError(elanState.toolchains.activeOverride?.reason, unresolvedToolchain) + ' Reason: Installation was cancelled.',
                        };
                }
            };
            if (!(0, config_1.alwaysAskBeforeInstallingLeanVersions)()) {
                return await installNewToolchain();
            }
            const choice = await (0, notifs_1.displayNotificationWithInput)('Information', installationPrompt(elanState.toolchains.activeOverride?.reason, unresolvedToolchain), ['Install Version']);
            if (choice === undefined) {
                return {
                    kind: 'Error',
                    message: leanNotInstalledError(elanState.toolchains.activeOverride?.reason, unresolvedToolchain),
                };
            }
            choice;
            return await installNewToolchain();
        }
        if (unresolvedToolchain.fromChannel === undefined) {
            return runWithActiveToolchain;
        }
        return { kind: 'CheckForToolchainUpdate', cachedToolchain };
    }
    async analyzeElanDumpStateWithNetResult(channel, context, toolchainUpdateMode, cachedToolchain, r) {
        const runWithActiveToolchain = { kind: 'RunWithActiveToolchain' };
        const runWithCachedToolchain = warning => ({
            kind: 'RunWithCachedToolchain',
            warning,
        });
        let elanState;
        switch (r.kind) {
            case 'Success':
                elanState = r.state;
                break;
            case 'ElanNotFound':
                return runWithActiveToolchain;
            case 'ExecutionError':
                return runWithActiveToolchain;
            case 'Cancelled':
                return runWithCachedToolchain(`Lean version information query was cancelled, falling back to installed Lean version '${cachedToolchain}'.`);
        }
        const unresolvedToolchain = elan_1.ElanToolchains.unresolvedToolchain(elanState.toolchains);
        const toolchainResolutionResult = elanState.toolchains.resolvedActive;
        if (unresolvedToolchain === undefined || toolchainResolutionResult === undefined) {
            return runWithActiveToolchain;
        }
        if (unresolvedToolchain.kind === 'Local' || unresolvedToolchain.fromChannel === undefined) {
            return runWithActiveToolchain;
        }
        const resolvedToolchainResult = toolchainResolutionResult.resolvedToolchain;
        let resolvedToolchain;
        switch (resolvedToolchainResult.kind) {
            case 'Error':
                return runWithCachedToolchain(`Could not fetch Lean version information, falling back to installed Lean version '${cachedToolchain}'. Error: ${resolvedToolchainResult.message}`);
            case 'Ok':
                resolvedToolchain = resolvedToolchainResult.value;
                break;
        }
        const willActiveToolchainBeUpdated = cachedToolchain !== resolvedToolchain;
        if (!willActiveToolchainBeUpdated) {
            return runWithActiveToolchain;
        }
        const isResolvedToolchainAlreadyInstalled = elanState.toolchains.installed.has(resolvedToolchain);
        if (isResolvedToolchainAlreadyInstalled) {
            return runWithActiveToolchain;
        }
        const updateToolchain = async () => {
            const elanInstallToolchainResult = await (0, elan_1.elanInstallToolchain)(channel, context, elan_1.ElanUnresolvedToolchain.toolchainName(unresolvedToolchain));
            switch (elanInstallToolchainResult.kind) {
                case 'Success':
                case 'ElanNotFound':
                case 'ToolchainAlreadyInstalled':
                    return runWithActiveToolchain;
                case 'Error':
                    return runWithCachedToolchain(`Could not update Lean version, falling back to installed Lean version '${cachedToolchain}'. Error: ${elanInstallToolchainResult.message}`);
                case 'Cancelled':
                    return runWithCachedToolchain(`Lean version update was cancelled, falling back to installed Lean version '${cachedToolchain}'.`);
            }
        };
        if (shouldUpdateToolchainAutomatically(toolchainUpdateMode)) {
            return await updateToolchain();
        }
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', updatePrompt(elanState.toolchains.activeOverride?.reason, elan_1.ElanUnresolvedToolchain.toolchainName(unresolvedToolchain), cachedToolchain, resolvedToolchain), ['Update Lean Version'], 'Use Old Version');
        if (choice === undefined || choice === 'Use Old Version') {
            return runWithCachedToolchain(undefined);
        }
        choice;
        return await updateToolchain();
    }
    async decideToolchain(options) {
        const elanStateDumpWithoutNetResult = await (0, elan_1.elanDumpStateWithoutNet)(options.cwdUri, options.toolchain);
        const withoutNetAnalysisResult = await this.analyzeElanStateDumpWithoutNetResult(options.channel, options.context, elanStateDumpWithoutNetResult);
        if (withoutNetAnalysisResult.kind !== 'CheckForToolchainUpdate') {
            return withoutNetAnalysisResult;
        }
        const cachedToolchain = withoutNetAnalysisResult.cachedToolchain;
        const key = updateDecisionKey(options.cwdUri, cachedToolchain);
        if (options.toolchainUpdateMode === 'DoNotUpdate' ||
            (!shouldUpdateToolchainAutomatically(options.toolchainUpdateMode) &&
                this.stickyUpdateDecisions.get(key) === 'DoNotUpdate')) {
            return { kind: 'RunWithSpecificToolchain', toolchain: cachedToolchain };
        }
        const elanStateDumpWithNetResult = await (0, elan_1.elanDumpStateWithNet)(options.cwdUri, options.context, options.toolchain, options.waitingPrompt);
        const withNetAnalysisResult = await this.analyzeElanDumpStateWithNetResult(options.channel, options.context, options.toolchainUpdateMode, cachedToolchain, elanStateDumpWithNetResult);
        if (withNetAnalysisResult.kind === 'RunWithCachedToolchain') {
            this.stickyUpdateDecisions.set(key, 'DoNotUpdate');
            if (withNetAnalysisResult.warning !== undefined) {
                (0, notifs_1.displayNotification)('Warning', withNetAnalysisResult.warning);
            }
            return { kind: 'RunWithSpecificToolchain', toolchain: cachedToolchain };
        }
        return withNetAnalysisResult;
    }
    async runLeanCommand(executablePath, args, options) {
        const toolchainDecision = await this.decideToolchain(options);
        if (toolchainDecision.kind === 'Error') {
            return {
                exitCode: batch_1.ExecutionExitCode.ExecutionError,
                stdout: toolchainDecision.message,
                stderr: '',
                combined: toolchainDecision.message,
            };
        }
        if (toolchainDecision.kind === 'RunWithActiveToolchain') {
            return await this.runCmd(executablePath, args, options, undefined);
        }
        toolchainDecision.kind;
        return await this.runCmd(executablePath, args, options, toolchainDecision.toolchain);
    }
}
exports.LeanCommandRunner = LeanCommandRunner;
/** Must be called at the very start when the extension is activated so that `leanRunner` is defined. */
function registerLeanCommandRunner(context) {
    exports.leanRunner = new LeanCommandRunner();
    context.subscriptions.push({
        dispose: () => {
            const u = undefined;
            // Implicit invariant: When the extension deactivates, `leanRunner` is not called after this assignment.
            exports.leanRunner = u;
        },
    });
}
//# sourceMappingURL=leanCmdRunner.js.map