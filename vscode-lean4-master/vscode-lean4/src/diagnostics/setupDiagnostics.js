"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupDiagnostics = void 0;
exports.checkAll = checkAll;
const vscode_1 = require("vscode");
const exturi_1 = require("../utils/exturi");
const internalErrors_1 = require("../utils/internalErrors");
const setupDiagnoser_1 = require("./setupDiagnoser");
const setupNotifs_1 = require("./setupNotifs");
const singleFileWarningMessage = `Lean 4 server is operating in restricted single file mode.
Please open a valid Lean 4 project containing a \'lean-toolchain\' file for full functionality.
Click the following link to learn how to set up or open Lean projects: [(Show Setup Guide)](command:lean4.docs.showSetupGuide)`;
const missingLeanToolchainWarningMessage = `Opened folder does not contain a valid Lean 4 project.
Please open a valid Lean 4 project containing a \'lean-toolchain\' file for full functionality.
Click the following link to learn how to set up or open Lean projects: [(Show Setup Guide)](command:lean4.docs.showSetupGuide)`;
const missingLeanToolchainWithParentProjectWarningMessage = (parentProjectFolder) => `Opened folder does not contain a valid Lean 4 project folder because it does not contain a 'lean-toolchain' file.
However, a valid Lean 4 project folder was found in one of the parent directories at '${parentProjectFolder.fsPath}'.
Open this project instead?`;
const lean3ProjectErrorMessage = (origin, projectVersion) => `${origin} is using Lean 3 (version: ${projectVersion.toString()}).
If you wish to use Lean 3, disable this extension ('Extensions' in the left sidebar > Cog icon on 'lean4' > 'Disable') and install the 'lean' extension for Lean 3 support.`;
const ancientLean4ProjectWarningMessage = (origin, projectVersion) => `${origin} is using a Lean 4 version (${projectVersion.toString()}) from before the first Lean 4 stable release (4.0.0).
Pre-stable Lean 4 versions are increasingly less supported, so please consider updating to a newer Lean 4 version.`;
const oldServerFolderContainsNewServerFolderErrorMessage = (folderUri, fileUri, clientFolderUri) => `Error while starting language server: The project at '${folderUri.fsPath}' of the file '${fileUri.baseName()}' is contained inside of another project at '${clientFolderUri.fsPath}', for which a language server is already running.
The Lean 4 VS Code extension does not support nested Lean projects.`;
const newServerFolderContainsOldServerFolderErrorMessage = (folderUri, fileUri, clientFolderUri) => `Error while starting language server: The project at '${folderUri.fsPath}' of the file '${fileUri.baseName()}' contains another project at '${clientFolderUri.fsPath}', for which a language server is already running.
The Lean 4 VS Code extension does not support nested Lean projects.`;
class SetupDiagnostics {
    constructor(o) {
        this.n = new setupNotifs_1.SetupNotifier(o);
    }
    async checkAreDependenciesInstalled(installer, channel, cwdUri) {
        const missingDeps = [];
        if (!(await (0, setupDiagnoser_1.diagnose)({ channel, cwdUri }).checkCurlAvailable())) {
            missingDeps.push('curl');
        }
        if (!(await (0, setupDiagnoser_1.diagnose)({ channel, cwdUri }).checkGitAvailable())) {
            missingDeps.push('git');
        }
        if (missingDeps.length === 0) {
            return 'Fulfilled';
        }
        let missingDepMessage;
        if (missingDeps.length === 1) {
            missingDepMessage = `One of Lean's dependencies (\`${missingDeps.at(0)}\`) is missing.`;
        }
        else {
            missingDepMessage = `Multiple of Lean's dependencies (${missingDeps.map(dep => `\`${dep}\``).join(', ')}) are missing.`;
        }
        return await this.n.displayDependencySetupError(installer, missingDepMessage);
    }
    async checkIsLean4Installed(installer, context, cwdUri, toolchainUpdateMode) {
        const leanVersionResult = await (0, setupDiagnoser_1.diagnose)({
            channel: installer.getOutputChannel(),
            cwdUri,
            context,
            toolchainUpdateMode,
        }).queryLeanVersion();
        switch (leanVersionResult.kind) {
            case 'Success':
                return 'Fulfilled';
            case 'CommandError':
                return this.n.displaySetupErrorWithOutput(`Error while checking Lean version: ${leanVersionResult.message}`);
            case 'Cancelled':
                return this.n.displaySetupErrorWithOutput('Error while checking Lean version: Operation cancelled.');
            case 'InvalidVersion':
                return this.n.displaySetupErrorWithOutput(`Error while checking Lean version: 'lean --version' returned a version that could not be parsed: '${leanVersionResult.versionResult}'`);
            case 'CommandNotFound':
                return await this.n.displayElanSetupError(installer, 'Lean is not installed.');
        }
    }
    async checkIsElanUpToDate(installer, cwdUri, options) {
        const elanDiagnosis = await (0, setupDiagnoser_1.diagnose)({ channel: installer.getOutputChannel(), cwdUri }).elanVersion();
        switch (elanDiagnosis.kind) {
            case 'NotInstalled':
                if (options.elanMustBeInstalled) {
                    return await this.n.displayElanSetupError(installer, "Lean's version manager Elan is not installed.");
                }
                return await this.n.displayElanSetupWarning(installer, "Lean's version manager Elan is not installed. This means that the correct Lean 4 toolchain version of Lean 4 projects will not be selected or installed automatically.");
            case 'ExecutionError':
                return await this.n.displaySetupWarningWithOutput('Cannot determine Elan version: ' + elanDiagnosis.message);
            case 'Outdated':
                return await this.n.displayElanOutdatedSetupWarning(installer, elanDiagnosis.currentVersion, elanDiagnosis.recommendedVersion);
            case 'UpToDate':
                return 'Fulfilled';
        }
    }
    async checkIsValidProjectFolder(channel, folderUri) {
        const projectSetupDiagnosis = await (0, setupDiagnoser_1.diagnose)({ channel, cwdUri: (0, exturi_1.extUriToCwdUri)(folderUri) }).projectSetup();
        switch (projectSetupDiagnosis.kind) {
            case 'SingleFile':
                return await this.n.displaySetupWarning(singleFileWarningMessage);
            case 'MissingLeanToolchain':
                const parentProjectFolder = projectSetupDiagnosis.parentProjectFolder;
                if (parentProjectFolder === undefined) {
                    return await this.n.displaySetupWarning(missingLeanToolchainWarningMessage);
                }
                else {
                    return this.n.displaySetupWarningWithInput(missingLeanToolchainWithParentProjectWarningMessage(parentProjectFolder), [
                        {
                            input: 'Open Parent Directory Project',
                            // this kills the extension host
                            action: () => vscode_1.commands.executeCommand('vscode.openFolder', parentProjectFolder),
                        },
                    ]);
                }
            case 'ValidProjectSetup':
                return 'Fulfilled';
        }
    }
    async checkIsNestedProjectFolder(existingFolderUris, folderUri, fileUri, stopOtherServer) {
        if (folderUri.scheme === 'untitled' || fileUri.scheme === 'untitled') {
            if (existingFolderUris.some(existingFolderUri => existingFolderUri.scheme === 'untitled')) {
                await (0, internalErrors_1.displayInternalError)('starting language server', 'Attempting to start new untitled language server while one already exists.');
                return 'Fatal';
            }
            return 'Fulfilled';
        }
        for (const existingFolderUri of existingFolderUris) {
            if (existingFolderUri.scheme !== 'file') {
                continue;
            }
            if (existingFolderUri.isInFolder(folderUri)) {
                return await this.n.displaySetupErrorWithInput(newServerFolderContainsOldServerFolderErrorMessage(folderUri, fileUri, existingFolderUri), [
                    {
                        input: 'Stop Other Server',
                        continueDisplaying: false,
                        action: () => stopOtherServer(existingFolderUri),
                    },
                ]);
            }
            if (folderUri.isInFolder(existingFolderUri)) {
                return await this.n.displaySetupErrorWithInput(oldServerFolderContainsNewServerFolderErrorMessage(folderUri, fileUri, existingFolderUri), [
                    {
                        input: 'Stop Other Server',
                        continueDisplaying: false,
                        action: () => stopOtherServer(existingFolderUri),
                    },
                ]);
            }
        }
        return 'Fulfilled';
    }
    async checkIsLeanVersionUpToDate(channel, context, folderUri, options) {
        let origin;
        if (options.toolchainOverride !== undefined) {
            origin = `Project toolchain '${options.toolchainOverride}'`;
        }
        else if (folderUri.scheme === 'untitled') {
            origin = 'Opened file';
        }
        else {
            origin = 'Opened project';
        }
        const projectLeanVersionDiagnosis = await (0, setupDiagnoser_1.diagnose)({
            channel,
            cwdUri: (0, exturi_1.extUriToCwdUri)(folderUri),
            toolchain: options.toolchainOverride,
            context,
            toolchainUpdateMode: options.toolchainUpdateMode,
        }).leanVersion();
        switch (projectLeanVersionDiagnosis.kind) {
            case 'NotInstalled':
                return this.n.displaySetupErrorWithOutput("Error while checking Lean version: 'lean' command was not found.");
            case 'ExecutionError':
                return this.n.displaySetupErrorWithOutput(`Error while checking Lean version: ${projectLeanVersionDiagnosis.message}`);
            case 'Cancelled':
                return this.n.displaySetupErrorWithOutput('Error while checking Lean version: Operation cancelled.');
            case 'IsLean3Version':
                return this.n.displaySetupError(lean3ProjectErrorMessage(origin, projectLeanVersionDiagnosis.version));
            case 'IsAncientLean4Version':
                return await this.n.displaySetupWarning(ancientLean4ProjectWarningMessage(origin, projectLeanVersionDiagnosis.version));
            case 'UpToDate':
                return 'Fulfilled';
        }
    }
    async checkIsLakeInstalledCorrectly(channel, context, folderUri, options) {
        const lakeAvailabilityResult = await (0, setupDiagnoser_1.diagnose)({
            channel,
            cwdUri: (0, exturi_1.extUriToCwdUri)(folderUri),
            toolchain: options.toolchainOverride,
            context,
            toolchainUpdateMode: options.toolchainUpdateMode,
        }).checkLakeAvailable();
        switch (lakeAvailabilityResult.kind) {
            case 'NotAvailable':
                return this.n.displaySetupErrorWithOutput("Error while checking Lake availability: 'lake' command was not found.");
            case 'Error':
                return this.n.displaySetupErrorWithOutput(`Error while checking Lake availability: ${lakeAvailabilityResult.message}`);
            case 'Cancelled':
                return this.n.displaySetupErrorWithOutput('Error while checking Lake availability: Operation cancelled.');
            case 'Available':
                return 'Fulfilled';
        }
    }
    async checkIsVSCodeUpToDate() {
        const vscodeVersionResult = (0, setupDiagnoser_1.diagnose)({ channel: undefined, cwdUri: undefined }).queryVSCodeVersion();
        switch (vscodeVersionResult.kind) {
            case 'Outdated':
                return await this.n.displaySetupWarning(`VS Code version is too out-of-date for new versions of the Lean 4 VS Code extension. The current VS Code version is ${vscodeVersionResult.currentVersion}, but a version of at least ${vscodeVersionResult.recommendedVersion} is recommended so that new versions of the Lean 4 VS Code extension can be installed.`);
            case 'UpToDate':
                return 'Fulfilled';
        }
    }
    async checkIsOperatingSystemSupported() {
        const systemInfo = (0, setupDiagnoser_1.diagnose)({ channel: undefined, cwdUri: undefined }).querySystemInformation();
        if (systemInfo.osVersionDiagnosis.kind === 'Unsupported') {
            return await this.n.displaySetupWarning(`Operating system version is unsupported. The current OS version is ${systemInfo.osType} (${systemInfo.osVersionDiagnosis.currentVersion}), but a version of at least ${systemInfo.osType} (${systemInfo.osVersionDiagnosis.recommendedVersion}) is recommended to run new Lean versions.`);
        }
        return 'Fulfilled';
    }
}
exports.SetupDiagnostics = SetupDiagnostics;
async function checkAll(...checks) {
    let worstViolation = 'Fulfilled';
    for (const check of checks) {
        const result = await check();
        worstViolation = (0, setupNotifs_1.worstPreconditionViolation)(worstViolation, result);
        if (worstViolation === 'Fatal') {
            return 'Fatal';
        }
    }
    return worstViolation;
}
//# sourceMappingURL=setupDiagnostics.js.map