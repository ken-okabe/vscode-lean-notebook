"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElanToolchains = exports.ElanUnresolvedToolchain = exports.elanEagerResolutionMajorVersion = exports.elanNightlyChannel = exports.elanStableChannel = void 0;
exports.isElanEagerResolutionVersion = isElanEagerResolutionVersion;
exports.elanVersion = elanVersion;
exports.elanSelfUpdate = elanSelfUpdate;
exports.elanDumpStateWithoutNet = elanDumpStateWithoutNet;
exports.elanDumpStateWithNet = elanDumpStateWithNet;
exports.elanInstalledToolchains = elanInstalledToolchains;
exports.elanActiveToolchain = elanActiveToolchain;
exports.toolchainVersion = toolchainVersion;
exports.elanInstallToolchain = elanInstallToolchain;
exports.elanUninstallToolchains = elanUninstallToolchains;
exports.elanSelfUninstall = elanSelfUninstall;
exports.elanSetDefaultToolchain = elanSetDefaultToolchain;
exports.elanQueryGc = elanQueryGc;
exports.elanGC = elanGC;
const semver_1 = require("semver");
const zod_1 = require("zod");
const batch_1 = require("./batch");
const exturi_1 = require("./exturi");
const groupBy_1 = require("./groupBy");
const semverRegex_1 = require("./semverRegex");
exports.elanStableChannel = 'leanprover/lean4:stable';
exports.elanNightlyChannel = 'leanprover/lean4:nightly';
exports.elanEagerResolutionMajorVersion = 4;
function isElanEagerResolutionVersion(version) {
    return version.major >= exports.elanEagerResolutionMajorVersion;
}
const elanVersionRegex = /^elan ((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)/;
async function elanVersion() {
    const r = await (0, batch_1.batchExecute)('elan', ['--version']);
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            const match = elanVersionRegex.exec(r.stdout);
            if (match === null) {
                return { kind: 'ExecutionError', message: 'Cannot parse output of `elan --version`: ' + r.stdout };
            }
            return { kind: 'Success', version: new semver_1.SemVer(match[1]) };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotInstalled' };
        case batch_1.ExecutionExitCode.ExecutionError:
            return { kind: 'ExecutionError', message: r.combined };
        case batch_1.ExecutionExitCode.Cancelled:
            throw new Error('Unexpected cancellation of `elan --version`');
    }
}
async function elanSelfUpdate(channel, context) {
    return await (0, batch_1.batchExecuteWithProgress)('elan', ['self', 'update'], context, 'Updating Elan', { channel });
}
var ElanUnresolvedToolchain;
(function (ElanUnresolvedToolchain) {
    function toolchainName(unresolved) {
        switch (unresolved.kind) {
            case 'Local':
                return unresolved.toolchain;
            case 'Remote':
                return unresolved.githubRepoOrigin + ':' + unresolved.release;
        }
    }
    ElanUnresolvedToolchain.toolchainName = toolchainName;
})(ElanUnresolvedToolchain || (exports.ElanUnresolvedToolchain = ElanUnresolvedToolchain = {}));
var ElanToolchains;
(function (ElanToolchains) {
    function unresolvedToolchain(toolchains) {
        return toolchains.activeOverride?.unresolved ?? toolchains.default?.unresolved;
    }
    ElanToolchains.unresolvedToolchain = unresolvedToolchain;
    function unresolvedToolchainName(toolchains) {
        const unresolvedToolchain = ElanToolchains.unresolvedToolchain(toolchains);
        if (unresolvedToolchain === undefined) {
            return undefined;
        }
        return ElanUnresolvedToolchain.toolchainName(unresolvedToolchain);
    }
    ElanToolchains.unresolvedToolchainName = unresolvedToolchainName;
})(ElanToolchains || (exports.ElanToolchains = ElanToolchains = {}));
function zodElanResult(zodValue) {
    return zod_1.z.union([
        zod_1.z.object({
            Ok: zodValue,
        }),
        zod_1.z.object({
            Err: zod_1.z.string(),
        }),
    ]);
}
function zodElanUnresolvedToolchain() {
    return zod_1.z.union([
        zod_1.z.object({
            Local: zod_1.z.object({
                name: zod_1.z.string(),
            }),
        }),
        zod_1.z.object({
            Remote: zod_1.z.object({
                origin: zod_1.z.string(),
                release: zod_1.z.string(),
                from_channel: zod_1.z.nullable(zod_1.z.string()),
            }),
        }),
    ]);
}
function zodElanToolchainResolution() {
    return zod_1.z.object({
        live: zodElanResult(zod_1.z.string()),
        cached: zod_1.z.nullable(zod_1.z.string()),
    });
}
function convertElanResult(zodResult, f) {
    if ('Ok' in zodResult) {
        return { kind: 'Ok', value: f(zodResult.Ok) };
    }
    zodResult;
    return { kind: 'Error', message: zodResult.Err };
}
function convertElanOption(zodNullable, f) {
    if (zodNullable === null) {
        return undefined;
    }
    return f(zodNullable);
}
function convertElanUnresolvedToolchain(zodElanUnresolvedToolchain) {
    if ('Local' in zodElanUnresolvedToolchain) {
        return { kind: 'Local', toolchain: zodElanUnresolvedToolchain.Local.name };
    }
    zodElanUnresolvedToolchain;
    return {
        kind: 'Remote',
        githubRepoOrigin: zodElanUnresolvedToolchain.Remote.origin,
        release: zodElanUnresolvedToolchain.Remote.release,
        fromChannel: convertElanOption(zodElanUnresolvedToolchain.Remote.from_channel, c => c),
    };
}
function covertElanToolchainResolution(installed, zodElanToolchainResolution) {
    let cachedToolchain = convertElanOption(zodElanToolchainResolution.cached, t => t);
    if (cachedToolchain !== undefined && !installed.has(cachedToolchain)) {
        cachedToolchain = undefined;
    }
    return {
        resolvedToolchain: convertElanResult(zodElanToolchainResolution.live, t => t),
        cachedToolchain,
    };
}
function convertElanOverrideReason(zodElanOverrideReason) {
    if (zodElanOverrideReason === 'Environment') {
        return { kind: 'Environment' };
    }
    if ('OverrideDB' in zodElanOverrideReason) {
        return { kind: 'Manual', directoryPath: new exturi_1.FileUri(zodElanOverrideReason.OverrideDB) };
    }
    if ('ToolchainFile' in zodElanOverrideReason) {
        return { kind: 'ToolchainFile', toolchainPath: new exturi_1.FileUri(zodElanOverrideReason.ToolchainFile) };
    }
    if ('LeanpkgFile' in zodElanOverrideReason) {
        return { kind: 'LeanpkgFile', leanpkgPath: new exturi_1.FileUri(zodElanOverrideReason.LeanpkgFile) };
    }
    zodElanOverrideReason;
    return { kind: 'ToolchainDirectory', directoryPath: new exturi_1.FileUri(zodElanOverrideReason.InToolchainDirectory) };
}
function parseElanStateDump(elanDumpStateOutput) {
    let parsedJson;
    try {
        parsedJson = JSON.parse(elanDumpStateOutput);
    }
    catch (e) {
        return undefined;
    }
    const stateDumpSchema = zod_1.z.object({
        elan_version: zod_1.z.object({
            current: zod_1.z.string().regex(semverRegex_1.semVerRegex),
            newest: zodElanResult(zod_1.z.string().regex(semverRegex_1.semVerRegex)),
        }),
        toolchains: zod_1.z.object({
            installed: zod_1.z.array(zod_1.z.object({
                resolved_name: zod_1.z.string(),
                path: zod_1.z.string(),
            })),
            default: zod_1.z.nullable(zod_1.z.object({
                unresolved: zodElanUnresolvedToolchain(),
                resolved: zodElanToolchainResolution(),
            })),
            active_override: zod_1.z.nullable(zod_1.z.object({
                unresolved: zodElanUnresolvedToolchain(),
                reason: zod_1.z.union([
                    zod_1.z.literal('Environment'),
                    zod_1.z.object({ OverrideDB: zod_1.z.string() }),
                    zod_1.z.object({ ToolchainFile: zod_1.z.string() }),
                    zod_1.z.object({ LeanpkgFile: zod_1.z.string() }),
                    zod_1.z.object({ InToolchainDirectory: zod_1.z.string() }),
                ]),
            })),
            resolved_active: zod_1.z.nullable(zodElanToolchainResolution()),
        }),
    });
    const stateDumpResult = stateDumpSchema.safeParse(parsedJson);
    if (!stateDumpResult.success) {
        return undefined;
    }
    const s = stateDumpResult.data;
    const installed = (0, groupBy_1.groupByUniqueKey)(s.toolchains.installed.map(i => ({ resolvedName: i.resolved_name, path: new exturi_1.FileUri(i.path) })), i => i.resolvedName);
    const stateDump = {
        elanVersion: {
            current: new semver_1.SemVer(s.elan_version.current),
            newest: convertElanResult(s.elan_version.newest, version => new semver_1.SemVer(version)),
        },
        toolchains: {
            installed,
            default: convertElanOption(s.toolchains.default, d => ({
                unresolved: convertElanUnresolvedToolchain(d.unresolved),
                resolved: covertElanToolchainResolution(installed, d.resolved),
            })),
            activeOverride: convertElanOption(s.toolchains.active_override, r => ({
                reason: convertElanOverrideReason(r.reason),
                unresolved: convertElanUnresolvedToolchain(r.unresolved),
            })),
            resolvedActive: convertElanOption(s.toolchains.resolved_active, r => covertElanToolchainResolution(installed, r)),
        },
    };
    return stateDump;
}
function toolchainEnvExtensions(toolchain) {
    if (toolchain === undefined) {
        return undefined;
    }
    return {
        ELAN_TOOLCHAIN: toolchain,
    };
}
async function elanDumpStateWithoutNet(cwdUri, toolchain) {
    const r = await (0, batch_1.batchExecute)('elan', ['dump-state', '--no-net'], cwdUri?.fsPath, undefined, toolchainEnvExtensions(toolchain));
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            const state = parseElanStateDump(r.stdout);
            if (state === undefined) {
                return { kind: 'ExecutionError', message: 'Cannot parse output of `elan dump-state --no-net`.' };
            }
            return { kind: 'Success', state };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotFound' };
        case batch_1.ExecutionExitCode.ExecutionError:
            return { kind: 'ExecutionError', message: r.combined };
        case batch_1.ExecutionExitCode.Cancelled:
            throw new Error('Unexpected cancellation of `elan dump-state --no-net`');
    }
}
async function elanDumpStateWithNet(cwdUri, context, toolchain, prompt = 'Fetching Lean version information') {
    const r = await (0, batch_1.batchExecuteWithProgress)('elan', ['dump-state'], context, prompt, {
        cwd: cwdUri?.fsPath,
        allowCancellation: true,
        envExtensions: toolchainEnvExtensions(toolchain),
    });
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            const state = parseElanStateDump(r.stdout);
            if (state === undefined) {
                return { kind: 'ExecutionError', message: 'Cannot parse output of `elan dump-state`.' };
            }
            return { kind: 'Success', state };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotFound' };
        case batch_1.ExecutionExitCode.ExecutionError:
            return { kind: 'ExecutionError', message: r.combined };
        case batch_1.ExecutionExitCode.Cancelled:
            return { kind: 'Cancelled' };
    }
}
async function elanInstalledToolchains() {
    const stateDumpResult = await elanDumpStateWithoutNet(undefined);
    if (stateDumpResult.kind === 'ExecutionError') {
        // User is probably on a pre-eager toolchain resolution elan version which did not yet support
        // `elan dump-state`. Fall back to parsing the toolchain with `elan toolchain list`.
        const r = await (0, batch_1.batchExecute)('elan', ['toolchain', 'list']);
        switch (r.exitCode) {
            case batch_1.ExecutionExitCode.Success:
                const lines = r.stdout
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                const toolchainInfo = lines.map(line => [
                    line.replace(/\(default\)$/, '').trim(),
                    line.endsWith('(default)'),
                ]);
                const toolchains = toolchainInfo.map(([toolchain, _]) => toolchain);
                const defaultToolchain = toolchainInfo.find(([_, isDefault]) => isDefault)?.[0];
                return { kind: 'Success', toolchains, defaultToolchain };
            case batch_1.ExecutionExitCode.CannotLaunch:
                return { kind: 'ElanNotFound' };
            case batch_1.ExecutionExitCode.ExecutionError:
                return { kind: 'ExecutionError', message: r.combined };
            case batch_1.ExecutionExitCode.Cancelled:
                throw new Error('Unexpected cancellation of `elan toolchain list`');
        }
    }
    if (stateDumpResult.kind === 'ElanNotFound') {
        return stateDumpResult;
    }
    stateDumpResult.kind;
    const installedToolchains = [...stateDumpResult.state.toolchains.installed.values()].map(t => t.resolvedName);
    const defaultToolchain = stateDumpResult.state.toolchains.default;
    if (defaultToolchain === undefined) {
        return { kind: 'Success', toolchains: installedToolchains, defaultToolchain: undefined };
    }
    return {
        kind: 'Success',
        toolchains: installedToolchains,
        defaultToolchain: ElanUnresolvedToolchain.toolchainName(defaultToolchain.unresolved),
    };
}
async function elanActiveToolchain(cwdUri, context, toolchain) {
    const stateDumpResult = await elanDumpStateWithNet(cwdUri, context, toolchain);
    if (stateDumpResult.kind !== 'Success') {
        return stateDumpResult;
    }
    const unresolvedToolchain = ElanToolchains.unresolvedToolchainName(stateDumpResult.state.toolchains);
    if (unresolvedToolchain === undefined) {
        return { kind: 'NoActiveToolchain' };
    }
    const toolchainResolution = stateDumpResult.state.toolchains.resolvedActive;
    if (toolchainResolution === undefined) {
        return { kind: 'NoActiveToolchain' };
    }
    const cachedToolchain = toolchainResolution.cachedToolchain;
    const resolvedToolchainResult = toolchainResolution.resolvedToolchain;
    if (resolvedToolchainResult.kind === 'Error') {
        return { kind: 'ExecutionError', message: resolvedToolchainResult.message };
    }
    const resolvedToolchain = resolvedToolchainResult.value;
    const overrideReason = stateDumpResult.state.toolchains.activeOverride?.reason;
    const origin = overrideReason !== undefined ? overrideReason : { kind: 'Default' };
    return { kind: 'Success', info: { unresolvedToolchain, cachedToolchain, resolvedToolchain, origin } };
}
function toolchainVersion(toolchain) {
    const toolchainRegex = /(.+)\/(.+):(.+)/;
    const match = toolchainRegex.exec(toolchain);
    if (match === null) {
        return toolchain;
    }
    return match[3];
}
async function elanInstallToolchain(channel, context, toolchain) {
    const r = await (0, batch_1.batchExecuteWithProgress)('elan', ['toolchain', 'install', toolchain], context, `Installing ${toolchain}`, {
        channel,
        allowCancellation: true,
    });
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            return { kind: 'Success' };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotFound' };
        case batch_1.ExecutionExitCode.ExecutionError:
            if (r.stderr.match(/error: '.*' is already installed/) !== null) {
                return { kind: 'ToolchainAlreadyInstalled' };
            }
            else {
                return { kind: 'Error', message: r.combined };
            }
        case batch_1.ExecutionExitCode.Cancelled:
            return { kind: 'Cancelled' };
    }
}
async function elanUninstallToolchains(channel, context, toolchains) {
    if (toolchains.length === 0) {
        throw new Error('Cannot uninstall zero toolchains.');
    }
    const waitingPrompt = toolchains.length === 1
        ? `Uninstalling '${toolchains[0]}'`
        : `Uninstalling Lean versions ${toolchains.map(t => `'${t}'`).join(', ')}`;
    return await (0, batch_1.batchExecuteWithProgress)('elan', ['toolchain', 'uninstall', ...toolchains], context, waitingPrompt, {
        channel,
        allowCancellation: true,
    });
}
async function elanSelfUninstall(channel, context) {
    return await (0, batch_1.batchExecuteWithProgress)('elan', ['self', 'uninstall', '-y'], context, 'Uninstalling Elan', {
        channel,
        allowCancellation: true,
    });
}
async function elanSetDefaultToolchain(channel, toolchain) {
    const r = await (0, batch_1.batchExecute)('elan', ['default', toolchain], undefined, { combined: channel });
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            return { kind: 'Success' };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotFound' };
        case batch_1.ExecutionExitCode.ExecutionError:
            return { kind: 'Error', message: r.combined };
        case batch_1.ExecutionExitCode.Cancelled:
            throw new Error('Unexpected cancellation of `elan default <toolchain>`');
    }
}
function parseElanGcJson(jsonOutput) {
    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonOutput);
    }
    catch (e) {
        return undefined;
    }
    const elanGcJsonSchema = zod_1.z.object({
        unused_toolchains: zod_1.z.array(zod_1.z.string()),
        used_toolchains: zod_1.z.array(zod_1.z.object({
            user: zod_1.z.string(),
            toolchain: zod_1.z.string(),
        })),
    });
    const elanGcJsonResult = elanGcJsonSchema.safeParse(parsedJson);
    if (!elanGcJsonResult.success) {
        return undefined;
    }
    const elanGcJson = elanGcJsonResult.data;
    return {
        unusedToolchains: elanGcJson.unused_toolchains,
        usedToolchains: elanGcJson.used_toolchains,
    };
}
async function elanQueryGc() {
    const r = await (0, batch_1.batchExecute)('elan', ['toolchain', 'gc', '--json']);
    switch (r.exitCode) {
        case batch_1.ExecutionExitCode.Success:
            const info = parseElanGcJson(r.stdout);
            if (info === undefined) {
                return { kind: 'ExecutionError', message: 'Cannot parse output of `elan toolchain gc --json`' };
            }
            return { kind: 'Success', info };
        case batch_1.ExecutionExitCode.CannotLaunch:
            return { kind: 'ElanNotFound' };
        case batch_1.ExecutionExitCode.ExecutionError:
            return { kind: 'ExecutionError', message: r.combined };
        case batch_1.ExecutionExitCode.Cancelled:
            throw new Error('Unexpected cancellation of `elan toolchain gc --json`.');
    }
}
async function elanGC(channel, context) {
    return await (0, batch_1.batchExecuteWithProgress)('elan', ['toolchain', 'gc', '--delete'], context, 'Removing unused Lean versions', {
        channel,
        allowCancellation: true,
    });
}
//# sourceMappingURL=elan.js.map