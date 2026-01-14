"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOperationProvider = void 0;
const fs = require("fs");
const path_1 = require("path");
const vscode_1 = require("vscode");
const lake_1 = require("./utils/lake");
const leanEditorProvider_1 = require("./utils/leanEditorProvider");
const manifest_1 = require("./utils/manifest");
const notifs_1 = require("./utils/notifs");
class ProjectOperationProvider {
    constructor(channel, clientProvider) {
        this.channel = channel;
        this.clientProvider = clientProvider;
        this.subscriptions = [];
        this.isRunningOperation = false; // Used to synchronize project operations
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.project.build', () => this.buildProject()), vscode_1.commands.registerCommand('lean4.project.clean', () => this.cleanProject()), vscode_1.commands.registerCommand('lean4.project.updateDependency', () => this.updateDependency()), vscode_1.commands.registerCommand('lean4.project.fetchCache', () => this.fetchMathlibCache()), vscode_1.commands.registerCommand('lean4.project.fetchFileCache', () => this.fetchMathlibCacheForCurrentImports()));
    }
    async buildProject() {
        await this.runOperation('Build Project', async (lakeRunner) => {
            const fetchResult = await lakeRunner.tryFetchMathlibCacheWithError();
            if (fetchResult !== 'Success') {
                return;
            }
            const result = await lakeRunner.build();
            if (result.kind === 'Cancelled') {
                return;
            }
            if (result.kind !== 'Success') {
                (0, lake_1.displayLakeRunnerError)(result, 'Cannot build project.');
                return;
            }
            (0, notifs_1.displayNotification)('Information', 'Project built successfully.');
            return;
        });
    }
    async cleanProject() {
        const deleteInput = 'Proceed';
        const deleteChoice = await (0, notifs_1.displayNotificationWithInput)('Information', 'Delete all build artifacts?', [deleteInput]);
        if (deleteChoice !== deleteInput) {
            return;
        }
        await this.runOperation('Clean Project', async (lakeRunner) => {
            const cleanResult = await lakeRunner.clean();
            if (cleanResult.kind === 'Cancelled') {
                return;
            }
            if (cleanResult.kind !== 'Success') {
                (0, lake_1.displayLakeRunnerError)(cleanResult, 'Cannot delete build artifacts.');
                return;
            }
            const checkResult = await lakeRunner.isMathlibCacheGetAvailable();
            if (checkResult.kind === 'Cancelled') {
                return;
            }
            if (checkResult.kind === 'CacheUnavailable') {
                (0, notifs_1.displayNotification)('Information', 'Project cleaned successfully.');
                return;
            }
            if (checkResult.kind !== 'CacheAvailable') {
                (0, lake_1.displayLakeRunnerError)(checkResult, 'Cannot check availability of Mathlib cache.');
                return;
            }
            const fetchMessage = "Project cleaned successfully. Do you wish to fetch Mathlib's build artifact cache?";
            const fetchInput = 'Fetch Cache';
            const fetchChoice = await (0, notifs_1.displayNotificationWithInput)('Information', fetchMessage, [fetchInput], 'Do Not Fetch Cache');
            if (fetchChoice !== fetchInput) {
                return;
            }
            const fetchResult = await lakeRunner.tryFetchMathlibCacheWithError();
            if (fetchResult !== 'Success') {
                return;
            }
            (0, notifs_1.displayNotification)('Information', 'Mathlib build artifact cache fetched successfully.');
        });
    }
    async fetchMathlibCache() {
        await this.runOperation('Fetch Mathlib Build Cache', async (lakeRunner) => {
            const fetchResult = await lakeRunner.fetchMathlibCache();
            if (fetchResult.kind === 'Cancelled') {
                return;
            }
            if (fetchResult.kind === 'CacheUnavailable') {
                (0, notifs_1.displayNotification)('Error', 'This command cannot be used in non-Mathlib projects.');
                return;
            }
            if (fetchResult.kind !== 'Success') {
                (0, lake_1.displayLakeRunnerError)(fetchResult, 'Cannot fetch Mathlib build artifact cache.');
                return;
            }
            (0, notifs_1.displayNotification)('Information', 'Mathlib build artifact cache fetched successfully.');
        });
    }
    async fetchMathlibCacheForCurrentImports() {
        await this.runOperation('Fetch Mathlib Build Cache For Current Imports', async (lakeRunner) => {
            const projectUri = lakeRunner.options.cwdUri;
            const doc = leanEditorProvider_1.lean.lastActiveLeanDocument;
            if (doc === undefined) {
                (0, notifs_1.displayNotification)('Error', 'No active Lean editor tab. Make sure to focus the Lean editor tab for which you wish to fetch the cache.');
                return;
            }
            const docUri = doc.extUri;
            if (docUri.scheme === 'untitled') {
                (0, notifs_1.displayNotification)('Error', 'Cannot fetch cache of untitled files.');
                return;
            }
            const manifestResult = await (0, manifest_1.parseManifestInFolder)(projectUri);
            if (typeof manifestResult === 'string') {
                (0, notifs_1.displayNotification)('Error', manifestResult);
                return;
            }
            const projectName = manifestResult.name;
            if (projectName === undefined) {
                (0, notifs_1.displayNotification)('Error', `Cannot determine project name from manifest. This is likely caused by the fact that the manifest version (${manifestResult.version}) is too outdated to contain the name of the project.`);
                return;
            }
            if (projectName !== 'mathlib') {
                (0, notifs_1.displayNotification)('Error', "Cache for current imports can only be fetched in Mathlib itself. Use the 'Project: Fetch Mathlib Build Cache' command for fetching the full Mathlib build cache in projects depending on Mathlib.");
                return;
            }
            const relativeDocUri = docUri.relativeTo(projectUri);
            if (relativeDocUri === undefined) {
                (0, notifs_1.displayNotification)('Error', `Cannot fetch cache for current imports: active file (${docUri.fsPath}) is not contained in active project folder (${projectUri.fsPath}).`);
                return;
            }
            const fetchResult = await lakeRunner.fetchMathlibCacheForFile(relativeDocUri);
            if (fetchResult.kind === 'Cancelled') {
                return;
            }
            if (fetchResult.kind === 'CacheUnavailable') {
                (0, notifs_1.displayNotification)('Error', 'This command cannot be used in non-Mathlib projects.');
                return;
            }
            if (fetchResult.kind !== 'Success') {
                (0, lake_1.displayLakeRunnerError)(fetchResult, `Cannot fetch Mathlib build artifact cache for '${relativeDocUri.fsPath}'.`);
                return;
            }
            (0, notifs_1.displayNotificationWithOptionalInput)('Information', `Mathlib build artifact cache for '${relativeDocUri.fsPath}' fetched successfully.`, [{ input: 'Restart File', action: () => this.clientProvider.restartFile(relativeDocUri) }]);
        });
    }
    async updateDependency() {
        const activeClient = this.clientProvider.getActiveClient();
        if (!activeClient) {
            (0, notifs_1.displayNotification)('Error', 'No active client.');
            return;
        }
        const activeFolderUri = activeClient.folderUri;
        if (activeFolderUri.scheme === 'untitled') {
            (0, notifs_1.displayNotification)('Error', 'Cannot update dependency of untitled file.');
            return;
        }
        const manifestResult = await (0, manifest_1.parseManifestInFolder)(activeFolderUri);
        if (typeof manifestResult === 'string') {
            (0, notifs_1.displayNotification)('Error', manifestResult);
            return;
        }
        const items = manifestResult.directGitDependencies.map(gitDep => ({
            label: gitDep.name,
            description: gitDep.uri.toString(),
            ...gitDep,
        }));
        const dependencyChoice = await vscode_1.window.showQuickPick(items, {
            title: 'Choose a dependency to update',
            canPickMany: false,
        });
        if (!dependencyChoice) {
            return;
        }
        const warningMessage = `This command will update ${dependencyChoice.name} to its most recent version. It is only intended to be used by maintainers of this project. If the updated version of ${dependencyChoice.name} is incompatible with any other dependency or the code in this project, this project may not successfully build anymore. Are you sure you want to proceed?`;
        const warningInput = 'Proceed';
        const warningChoice = await (0, notifs_1.displayNotificationWithInput)('Warning', warningMessage, [warningInput]);
        if (warningChoice !== warningInput) {
            return;
        }
        await this.runOperation('Update Dependency', async (lakeRunner) => {
            const result = await lakeRunner.updateDependency(dependencyChoice.name);
            if (result.kind === 'Cancelled') {
                return;
            }
            if (result.kind !== 'Success') {
                (0, lake_1.displayLakeRunnerError)(result, 'Cannot update dependency.');
                return;
            }
            const fetchResult = await lakeRunner.tryFetchMathlibCacheWithError();
            if (fetchResult !== 'Success') {
                return;
            }
            const localToolchainPath = (0, path_1.join)(activeFolderUri.fsPath, 'lean-toolchain');
            const dependencyToolchainPath = (0, path_1.join)(activeFolderUri.fsPath, manifestResult.packagesDir, dependencyChoice.name, 'lean-toolchain');
            const dependencyToolchainResult = await this.determineDependencyToolchain(localToolchainPath, dependencyToolchainPath, dependencyChoice.name);
            if (dependencyToolchainResult.kind === 'Cancelled') {
                return;
            }
            if (dependencyToolchainResult.kind !== 'DoNotUpdate') {
                try {
                    fs.writeFileSync(localToolchainPath, dependencyToolchainResult.dependencyToolchain);
                }
                catch {
                    (0, notifs_1.displayNotification)('Error', 'Cannot update Lean version.');
                    return;
                }
            }
        });
    }
    async determineDependencyToolchain(localToolchainPath, dependencyToolchainPath, dependencyName) {
        const toolchainResult = await this.readToolchains(localToolchainPath, dependencyToolchainPath);
        if (!(toolchainResult instanceof Array)) {
            const errorFlavor = toolchainResult === 'CannotReadLocalToolchain'
                ? `Could not read Lean version of open project at '${localToolchainPath}'`
                : `Could not read Lean version of ${dependencyName} at ${dependencyToolchainPath}`;
            const message = `${errorFlavor}. Do you wish to update ${dependencyName} without updating the Lean version of the open project to that of ${dependencyName} regardless?`;
            const input = 'Proceed';
            const choice = await (0, notifs_1.displayNotificationWithInput)('Information', message, [input]);
            return choice === 'input' ? { kind: 'DoNotUpdate' } : { kind: 'Cancelled' };
        }
        const [localToolchain, dependencyToolchain] = toolchainResult;
        if (localToolchain === dependencyToolchain) {
            return { kind: 'DoNotUpdate' };
        }
        const message = `The Lean version '${localToolchain}' of the open project differs from the Lean version '${dependencyToolchain}' of ${dependencyName}. Do you wish to update the Lean version of the open project to the Lean version of ${dependencyName}?`;
        const updateInput = 'Update Lean Version';
        const keepInput = 'Keep Lean Version';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', message, [keepInput, updateInput]);
        if (choice === undefined) {
            return { kind: 'Cancelled' };
        }
        if (choice !== updateInput) {
            return { kind: 'DoNotUpdate' };
        }
        return { kind: 'Success', dependencyToolchain };
    }
    async readToolchains(localToolchainPath, dependencyToolchainPath) {
        let localToolchain;
        try {
            localToolchain = fs.readFileSync(localToolchainPath, 'utf8').trim();
        }
        catch (e) {
            return 'CannotReadLocalToolchain';
        }
        let dependencyToolchain;
        try {
            dependencyToolchain = fs.readFileSync(dependencyToolchainPath, 'utf8').trim();
        }
        catch (e) {
            return 'CannotReadDependencyToolchain';
        }
        return [localToolchain, dependencyToolchain];
    }
    async runOperation(context, command) {
        if (this.isRunningOperation) {
            (0, notifs_1.displayNotification)('Error', 'Another project action is already being executed. Please wait for its completion.');
            return;
        }
        this.isRunningOperation = true;
        try {
            if (!this.clientProvider) {
                (0, notifs_1.displayNotification)('Error', 'Lean client has not loaded yet.');
                return;
            }
            const activeClient = this.clientProvider.getActiveClient();
            if (!activeClient) {
                (0, notifs_1.displayNotification)('Error', 'No active client.');
                return;
            }
            if (activeClient.folderUri.scheme === 'untitled') {
                (0, notifs_1.displayNotification)('Error', 'Cannot run project action for untitled files.');
                return;
            }
            const lakeRunner = (0, lake_1.lake)({
                channel: this.channel,
                cwdUri: activeClient.folderUri,
                context,
                toolchainUpdateMode: 'DoNotUpdate',
            });
            const result = await activeClient.withStoppedClient(() => command(lakeRunner));
            if (result.kind === 'IsRestarting') {
                (0, notifs_1.displayNotification)('Error', 'Cannot run project action while restarting the server.');
            }
        }
        finally {
            this.isRunningOperation = false;
        }
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.ProjectOperationProvider = ProjectOperationProvider;
//# sourceMappingURL=projectoperations.js.map