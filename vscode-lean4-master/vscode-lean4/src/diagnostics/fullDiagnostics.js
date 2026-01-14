"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullDiagnosticsProvider = void 0;
exports.formatFullDiagnostics = formatFullDiagnostics;
exports.performFullDiagnosis = performFullDiagnosis;
const vscode_1 = require("vscode");
const batch_1 = require("../utils/batch");
const elan_1 = require("../utils/elan");
const exturi_1 = require("../utils/exturi");
const leanEditorProvider_1 = require("../utils/leanEditorProvider");
const notifs_1 = require("../utils/notifs");
const projectInfo_1 = require("../utils/projectInfo");
const setupDiagnoser_1 = require("./setupDiagnoser");
function formatCommandOutput(cmdOutput) {
    return '\n```\n' + cmdOutput + '\n```';
}
function formatOperatingSystem(os, versionDiagnosis) {
    if (versionDiagnosis.kind === 'Unsupported') {
        return `${os} (Unsupported; recommended version: ${versionDiagnosis.recommendedVersion})`;
    }
    return os;
}
function formatVSCodeVersionDiagnosis(d) {
    switch (d.kind) {
        case 'UpToDate':
            return `Reasonably up-to-date (version: ${d.version.toString()})`;
        case 'Outdated':
            return `Outdated (version: ${d.currentVersion.toString()}, recommendedVersion: ${d.recommendedVersion.toString()})`;
    }
}
function formatElanVersionDiagnosis(d) {
    switch (d.kind) {
        case 'UpToDate':
            return `Reasonably up-to-date (version: ${d.version.toString()})`;
        case 'Outdated':
            return `Outdated (version: ${d.currentVersion.toString()}, recommended version: ${d.recommendedVersion.toString()})`;
        case 'ExecutionError':
            return 'Execution error: ' + formatCommandOutput(d.message);
        case 'NotInstalled':
            return 'Not installed';
    }
}
function formatLeanVersionDiagnosis(d) {
    switch (d.kind) {
        case 'UpToDate':
            return `Reasonably up-to-date (version: ${d.version})`;
        case 'IsLean3Version':
            return `Lean 3 version (version: ${d.version})`;
        case 'IsAncientLean4Version':
            return `Pre-stable-release Lean 4 version (version: ${d.version})`;
        case 'ExecutionError':
            return 'Execution error: ' + formatCommandOutput(d.message);
        case 'Cancelled':
            return 'Operation cancelled';
        case 'NotInstalled':
            return 'Not installed';
    }
}
function formatProjectSetupDiagnosis(d) {
    switch (d.kind) {
        case 'SingleFile':
            return 'No open project';
        case 'MissingLeanToolchain':
            const parentProjectFolder = d.parentProjectFolder === undefined
                ? ''
                : `(Valid Lean project in parent folder: ${d.parentProjectFolder.fsPath})`;
            return `Folder without lean-toolchain file (no valid Lean project) (path: ${d.folder.fsPath}) ${parentProjectFolder}`;
        case 'ValidProjectSetup':
            return `Valid Lean project (path: ${d.projectFolder.fsPath})`;
    }
}
function formatElanShowOutput(r) {
    if (r.exitCode === batch_1.ExecutionExitCode.CannotLaunch) {
        return 'Elan not installed';
    }
    if (r.exitCode === batch_1.ExecutionExitCode.ExecutionError) {
        return 'Execution error: ' + formatCommandOutput(r.combined);
    }
    return formatCommandOutput(r.stdout);
}
function formatElanActiveToolchain(r) {
    if (r.activeOverride !== undefined) {
        const toolchain = r.activeOverride.unresolved;
        const overrideReason = r.activeOverride.reason;
        let formattedOverrideReason;
        switch (overrideReason.kind) {
            case 'Environment':
                formattedOverrideReason = 'set by `ELAN_TOOLCHAIN`';
                break;
            case 'Manual':
                formattedOverrideReason = `set by \`elan override\` in \`${overrideReason.directoryPath}\``;
                break;
            case 'ToolchainFile':
                formattedOverrideReason = `set by \`${overrideReason.toolchainPath}\``;
                break;
            case 'LeanpkgFile':
                formattedOverrideReason = `set by Leanpkg file in \`${overrideReason.leanpkgPath}\``;
                break;
            case 'ToolchainDirectory':
                formattedOverrideReason = `of core toolchain directory at \`${overrideReason.directoryPath}\``;
                break;
        }
        return `${elan_1.ElanUnresolvedToolchain.toolchainName(toolchain)} (${formattedOverrideReason})`;
    }
    if (r.default !== undefined) {
        return `${elan_1.ElanUnresolvedToolchain.toolchainName(r.default.unresolved)} (default Lean version)`;
    }
    return 'No active Lean version';
}
function formatElanInstalledToolchains(toolchains) {
    const installed = [...toolchains.values()].map(t => t.resolvedName);
    if (installed.length > 20) {
        return `${installed.slice(0, 20).join(', ')} ...`;
    }
    return installed.join(', ');
}
function formatElanDumpState(r) {
    if (r.kind === 'ElanNotFound') {
        return '**Elan**: Elan not installed';
    }
    if (r.kind === 'ExecutionError') {
        return `**Elan**: Execution error: ${r.message}`;
    }
    if (r.kind === 'PreEagerResolutionVersion') {
        return '**Elan**: Pre-4.0.0 version';
    }
    r.kind;
    const stateDump = r.state;
    return [
        `**Active Lean version**: ${formatElanActiveToolchain(stateDump.toolchains)}`,
        `**Installed Lean versions**: ${formatElanInstalledToolchains(stateDump.toolchains.installed)}`,
    ].join('\n');
}
function formatElanInfo(d) {
    if (d.elanDumpStateOutput.kind === 'PreEagerResolutionVersion') {
        return [
            '',
            '-------------------------------------',
            '',
            `**Elan toolchains**: ${formatElanShowOutput(d.elanShowOutput)}`,
        ].join('\n');
    }
    return formatElanDumpState(d.elanDumpStateOutput);
}
function formatFullDiagnostics(d) {
    return [
        `**Operating system**: ${formatOperatingSystem(d.systemInfo.operatingSystem, d.systemInfo.osVersionDiagnosis)}`,
        `**CPU architecture**: ${d.systemInfo.cpuArchitecture}`,
        `**CPU model**: ${d.systemInfo.cpuModels}`,
        `**Available RAM**: ${d.systemInfo.totalMemory}`,
        '',
        `**VS Code version**: ${formatVSCodeVersionDiagnosis(d.vscodeVersionDiagnosis)}`,
        `**Lean 4 extension version**: ${d.extensionVersion}`,
        `**Curl installed**: ${d.isCurlAvailable}`,
        `**Git installed**: ${d.isGitAvailable}`,
        `**Elan**: ${formatElanVersionDiagnosis(d.elanVersionDiagnosis)}`,
        `**Lean**: ${formatLeanVersionDiagnosis(d.leanVersionDiagnosis)}`,
        `**Project**: ${formatProjectSetupDiagnosis(d.projectSetupDiagnosis)}`,
        formatElanInfo(d),
    ].join('\n');
}
async function performFullDiagnosis(channel, cwdUri) {
    const diagnose = new setupDiagnoser_1.SetupDiagnoser({
        channel,
        cwdUri,
        context: 'Show Setup Information',
        toolchainUpdateMode: 'DoNotUpdate',
    });
    return {
        systemInfo: diagnose.querySystemInformation(),
        vscodeVersionDiagnosis: diagnose.queryVSCodeVersion(),
        extensionVersion: diagnose.queryExtensionVersion(),
        isCurlAvailable: await diagnose.checkCurlAvailable(),
        isGitAvailable: await diagnose.checkGitAvailable(),
        elanVersionDiagnosis: await diagnose.elanVersion(),
        leanVersionDiagnosis: await diagnose.leanVersion(),
        projectSetupDiagnosis: await diagnose.projectSetup(),
        elanShowOutput: await diagnose.queryElanShow(),
        elanDumpStateOutput: await diagnose.queryElanStateDumpWithoutNet(),
    };
}
class FullDiagnosticsProvider {
    constructor(outputChannel) {
        this.subscriptions = [];
        this.outputChannel = outputChannel;
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.troubleshooting.showSetupInformation', () => this.performAndDisplayFullDiagnosis()));
    }
    async performAndDisplayFullDiagnosis() {
        // Under normal circumstances, we would use the last active `LeanClient` from `LeanClientProvider.getActiveClient()`
        // to determine the document that the user is currently working on.
        // However, when providing setup diagnostics, there might not be an active client due to errors in the user's setup,
        // in which case we still want to provide adequate diagnostics. Hence, we use the last active Lean document,
        // regardless of whether there is an actual `LeanClient` managing it.
        const lastActiveLeanDocumentUri = leanEditorProvider_1.lean.lastActiveLeanDocument?.extUri;
        const projectInfo = lastActiveLeanDocumentUri !== undefined
            ? await (0, projectInfo_1.findLeanProjectRootInfo)(lastActiveLeanDocumentUri)
            : undefined;
        if (projectInfo?.kind === 'FileNotFound') {
            (0, notifs_1.displayNotification)('Error', `Cannot display setup information for file that does not exist in the file system: ${lastActiveLeanDocumentUri}. Please choose a different file to display the setup information for.`);
            return;
        }
        if (projectInfo?.kind === 'LakefileWithoutToolchain') {
            (0, notifs_1.displayNotification)('Error', `Cannot display setup information for file in invalid project: Project at ${projectInfo.projectRootUri} has a Lakefile, but no 'lean-toolchain' file. Please create one with the Lean version that you would like the project to use.`);
            return;
        }
        const projectUri = projectInfo !== undefined ? (0, exturi_1.extUriToCwdUri)(projectInfo.projectRootUri) : undefined;
        const fullDiagnostics = await performFullDiagnosis(this.outputChannel, projectUri);
        const formattedFullDiagnostics = formatFullDiagnostics(fullDiagnostics);
        const copyToClipboardInput = 'Copy to Clipboard';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', formattedFullDiagnostics, [copyToClipboardInput], 'Close');
        if (choice === copyToClipboardInput) {
            await vscode_1.env.clipboard.writeText(formattedFullDiagnostics);
        }
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.FullDiagnosticsProvider = FullDiagnosticsProvider;
//# sourceMappingURL=fullDiagnostics.js.map