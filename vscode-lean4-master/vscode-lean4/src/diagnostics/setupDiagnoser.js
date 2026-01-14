"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupDiagnoser = void 0;
exports.versionQueryResult = versionQueryResult;
exports.checkElanVersion = checkElanVersion;
exports.checkLeanVersion = checkLeanVersion;
exports.diagnose = diagnose;
const os = require("os");
const s = require("semver");
const semver_1 = require("semver");
const vscode_1 = require("vscode");
const batch_1 = require("../utils/batch");
const elan_1 = require("../utils/elan");
const leanCmdRunner_1 = require("../utils/leanCmdRunner");
const projectInfo_1 = require("../utils/projectInfo");
const minimumSupportedMacOSVersion = new semver_1.SemVer('19.0.0');
const minimumSupportedWindowsVersion = new semver_1.SemVer('10.0.18362');
function diagnoseOSVersion() {
    // When in doubt, we consider an OS version as not being unsupported.
    const release = os.release();
    if (!s.valid(release)) {
        return { kind: 'NotUnsupported' };
    }
    const currentVersion = new semver_1.SemVer(release);
    switch (os.type()) {
        case 'Darwin':
            if (currentVersion.compare(minimumSupportedMacOSVersion) >= 0) {
                return { kind: 'NotUnsupported' };
            }
            return { kind: 'Unsupported', currentVersion, recommendedVersion: minimumSupportedMacOSVersion };
        case 'Windows_NT':
            if (currentVersion.compare(minimumSupportedWindowsVersion) >= 0) {
                return { kind: 'NotUnsupported' };
            }
            return { kind: 'Unsupported', currentVersion, recommendedVersion: minimumSupportedMacOSVersion };
    }
    return { kind: 'NotUnsupported' };
}
const recommendedElanVersion = new semver_1.SemVer('4.0.0');
// Should be bumped in a release *before* we bump the version requirement of the VS Code extension so that
// users know that they need to update and do not get stuck on an old VS Code version.
const recommendedVSCodeVersion = new semver_1.SemVer('1.75.0');
function versionQueryResult(executionResult, versionRegex) {
    if (executionResult.exitCode === batch_1.ExecutionExitCode.CannotLaunch) {
        return { kind: 'CommandNotFound' };
    }
    if (executionResult.exitCode === batch_1.ExecutionExitCode.ExecutionError) {
        return { kind: 'CommandError', message: executionResult.combined };
    }
    if (executionResult.exitCode === batch_1.ExecutionExitCode.Cancelled) {
        return { kind: 'Cancelled' };
    }
    const match = versionRegex.exec(executionResult.stdout);
    if (!match) {
        return { kind: 'InvalidVersion', versionResult: executionResult.stdout };
    }
    return { kind: 'Success', version: new semver_1.SemVer(match[1]) };
}
function checkElanVersion(elanVersionResult) {
    switch (elanVersionResult.kind) {
        case 'CommandNotFound':
            return { kind: 'NotInstalled' };
        case 'CommandError':
            return { kind: 'ExecutionError', message: elanVersionResult.message };
        case 'InvalidVersion':
            return {
                kind: 'ExecutionError',
                message: `Invalid Elan version format: '${elanVersionResult.versionResult}'`,
            };
        case 'Cancelled':
            throw new Error('Unexpected cancellation of `elan --version` query.');
        case 'Success':
            if (elanVersionResult.version.compare(recommendedElanVersion) < 0) {
                return {
                    kind: 'Outdated',
                    currentVersion: elanVersionResult.version,
                    recommendedVersion: recommendedElanVersion,
                };
            }
            return { kind: 'UpToDate', version: elanVersionResult.version };
    }
}
function checkLeanVersion(leanVersionResult) {
    if (leanVersionResult.kind === 'CommandNotFound') {
        return { kind: 'NotInstalled' };
    }
    if (leanVersionResult.kind === 'CommandError') {
        return {
            kind: 'ExecutionError',
            message: leanVersionResult.message,
        };
    }
    if (leanVersionResult.kind === 'InvalidVersion') {
        return {
            kind: 'ExecutionError',
            message: `Invalid Lean version format: '${leanVersionResult.versionResult}'`,
        };
    }
    if (leanVersionResult.kind === 'Cancelled') {
        return { kind: 'Cancelled' };
    }
    const leanVersion = leanVersionResult.version;
    if (leanVersion.major === 3) {
        return { kind: 'IsLean3Version', version: leanVersion };
    }
    if (leanVersion.major === 4 && leanVersion.minor === 0 && leanVersion.prerelease.length > 0) {
        return { kind: 'IsAncientLean4Version', version: leanVersion };
    }
    return { kind: 'UpToDate', version: leanVersion };
}
class SetupDiagnoser {
    constructor(options) {
        this.channel = options.channel;
        this.cwdUri = options.cwdUri;
        this.context = options.context;
        this.toolchain = options.toolchain;
        this.toolchainUpdateMode = options.toolchainUpdateMode;
    }
    async checkCurlAvailable() {
        const curlVersionResult = await this.runSilently('curl', ['--version']);
        return curlVersionResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkGitAvailable() {
        if (os.type() === 'Darwin') {
            // On macOS, if Git isn't installed, `git --version` creates a GUI dialog for installing Apple Command Line Tools.
            // To avoid this, we check the installation location to determine which of the following two states the system is in:
            // 1. Git has been installed from somewhere that isn't Apple Command Line Tools (e.g. `brew`)
            // 2. Git has not been installed or Git has been installed through Apple Command Line Tools
            // Then, in the second case, we also check whether Apple Command Line Tools is installed via `xcode-select --print-path` to decide
            // whether Git has not been installed or whether Git has been installed through Apple Command Line Tools.
            const whichResult = await this.runSilently('which', ['git']);
            if (whichResult.exitCode !== batch_1.ExecutionExitCode.Success) {
                return false;
            }
            const gitPath = whichResult.stdout;
            const isNonACLTInstall = gitPath !== '/usr/bin/git';
            if (isNonACLTInstall) {
                return true;
            }
            const xcodeSelectPrintPathResult = await this.runSilently('xcode-select', ['--print-path']);
            return xcodeSelectPrintPathResult.exitCode === batch_1.ExecutionExitCode.Success;
        }
        const gitVersionResult = await this.runSilently('git', ['--version']);
        return gitVersionResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkDnfAvailable() {
        const dnfResult = await this.runSilently('dnf', ['--version']);
        return dnfResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkAptGetAvailable() {
        const aptResult = await this.runSilently('apt-get', ['--version']);
        return aptResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkPkExecAvailable() {
        const pkExecVersionResult = await this.runSilently('pkexec', ['--version']);
        return pkExecVersionResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkWinGetAvailable() {
        const winGetVersionResult = await this.runSilently('winget', ['--version']);
        return winGetVersionResult.exitCode === batch_1.ExecutionExitCode.Success;
    }
    async checkLakeAvailable() {
        const lakeVersionResult = await this.runLeanCommand('lake', ['--version'], 'Checking Lake version');
        switch (lakeVersionResult.exitCode) {
            case batch_1.ExecutionExitCode.Success:
                return { kind: 'Available' };
            case batch_1.ExecutionExitCode.CannotLaunch:
                return { kind: 'NotAvailable' };
            case batch_1.ExecutionExitCode.ExecutionError:
                return { kind: 'Error', message: lakeVersionResult.combined };
            case batch_1.ExecutionExitCode.Cancelled:
                return { kind: 'Cancelled' };
        }
    }
    querySystemInformation() {
        const cpuModels = os.cpus().map(cpu => cpu.model);
        const groupedCpuModels = new Map();
        for (const cpuModel of cpuModels) {
            const counter = groupedCpuModels.get(cpuModel);
            if (counter === undefined) {
                groupedCpuModels.set(cpuModel, 1);
            }
            else {
                groupedCpuModels.set(cpuModel, counter + 1);
            }
        }
        const formattedCpuModels = Array.from(groupedCpuModels.entries())
            .map(([cpuModel, amount]) => `${amount} x ${cpuModel}`)
            .join(', ');
        const totalMemory = (os.totalmem() / 1000000000).toFixed(2);
        return {
            operatingSystem: `${os.type()} (release: ${os.release()})`,
            osType: os.type(),
            osRelease: os.release(),
            osVersionDiagnosis: diagnoseOSVersion(),
            cpuArchitecture: os.arch(),
            cpuModels: formattedCpuModels,
            totalMemory: `${totalMemory} GB`,
        };
    }
    queryExtensionVersion() {
        return new semver_1.SemVer(vscode_1.extensions.getExtension('leanprover.lean4').packageJSON.version);
    }
    queryVSCodeVersion() {
        const currentVSCodeVersion = new semver_1.SemVer(vscode_1.version);
        if (currentVSCodeVersion.compare(recommendedVSCodeVersion) < 0) {
            return {
                kind: 'Outdated',
                currentVersion: currentVSCodeVersion,
                recommendedVersion: recommendedVSCodeVersion,
            };
        }
        return { kind: 'UpToDate', version: currentVSCodeVersion };
    }
    async queryLeanVersion() {
        const leanVersionResult = await this.runLeanCommand('lean', ['--version'], 'Checking Lean version');
        return versionQueryResult(leanVersionResult, /version (\d+\.\d+\.\d+(\w|-)*)/);
    }
    async queryElanVersion() {
        const elanVersionResult = await this.runSilently('elan', ['--version']);
        return versionQueryResult(elanVersionResult, /elan (\d+\.\d+\.\d+)/);
    }
    async queryElanShow() {
        return await this.runSilently('elan', ['show']);
    }
    async queryElanStateDumpWithoutNet() {
        const dumpStateResult = await (0, elan_1.elanDumpStateWithoutNet)(this.cwdUri, this.toolchain);
        if (dumpStateResult.kind === 'ExecutionError') {
            const versionResult = await this.queryElanVersion();
            if (versionResult.kind === 'Success' && !(0, elan_1.isElanEagerResolutionVersion)(versionResult.version)) {
                return { kind: 'PreEagerResolutionVersion' };
            }
        }
        return dumpStateResult;
    }
    async queryElanStateDumpWithNet() {
        const dumpStateResult = await (0, elan_1.elanDumpStateWithNet)(this.cwdUri, this.toolchain);
        if (dumpStateResult.kind === 'ExecutionError') {
            const versionResult = await this.queryElanVersion();
            if (versionResult.kind === 'Success' && !(0, elan_1.isElanEagerResolutionVersion)(versionResult.version)) {
                return { kind: 'PreEagerResolutionVersion' };
            }
        }
        return dumpStateResult;
    }
    async elanVersion() {
        const elanVersionResult = await this.queryElanVersion();
        return checkElanVersion(elanVersionResult);
    }
    async projectSetup() {
        if (this.cwdUri === undefined) {
            return { kind: 'SingleFile' };
        }
        if (!(await (0, projectInfo_1.isValidLeanProject)(this.cwdUri))) {
            const parentProjectFolder = await (0, projectInfo_1.checkParentFoldersForLeanProject)(this.cwdUri);
            return { kind: 'MissingLeanToolchain', folder: this.cwdUri, parentProjectFolder };
        }
        return { kind: 'ValidProjectSetup', projectFolder: this.cwdUri };
    }
    async leanVersion() {
        const leanVersionResult = await this.queryLeanVersion();
        return checkLeanVersion(leanVersionResult);
    }
    async runSilently(executablePath, args) {
        return (0, batch_1.batchExecute)(executablePath, args, this.cwdUri?.fsPath, { combined: this.channel });
    }
    async runLeanCommand(executablePath, args, title) {
        return await leanCmdRunner_1.leanRunner.runLeanCommand(executablePath, args, {
            channel: this.channel,
            context: this.context,
            cwdUri: this.cwdUri,
            waitingPrompt: title,
            toolchain: this.toolchain,
            toolchainUpdateMode: this.toolchainUpdateMode ?? 'UpdateAutomatically',
        });
    }
}
exports.SetupDiagnoser = SetupDiagnoser;
function diagnose(options) {
    return new SetupDiagnoser(options);
}
//# sourceMappingURL=setupDiagnoser.js.map