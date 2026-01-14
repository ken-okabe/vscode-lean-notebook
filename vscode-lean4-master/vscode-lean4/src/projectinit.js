"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectInitializationProvider = void 0;
const vscode_1 = require("vscode");
const setupDiagnostics_1 = require("./diagnostics/setupDiagnostics");
const batch_1 = require("./utils/batch");
const elan_1 = require("./utils/elan");
const exturi_1 = require("./utils/exturi");
const lake_1 = require("./utils/lake");
const notifs_1 = require("./utils/notifs");
const projectInfo_1 = require("./utils/projectInfo");
const projectInitNotificationOptions = {
    errorMode: { mode: 'NonModal' },
    warningMode: { modal: true, proceedByDefault: false },
};
async function checkCreateLean4ProjectPreconditions(leanInstaller, depInstaller, context, folderUri, projectToolchain) {
    const channel = leanInstaller.getOutputChannel();
    const cwdUri = (0, exturi_1.extUriToCwdUri)(folderUri);
    const d = new setupDiagnostics_1.SetupDiagnostics(projectInitNotificationOptions);
    return await (0, setupDiagnostics_1.checkAll)(() => d.checkAreDependenciesInstalled(depInstaller, channel, cwdUri), () => d.checkIsElanUpToDate(leanInstaller, cwdUri, { elanMustBeInstalled: true }), () => d.checkIsLeanVersionUpToDate(channel, context, folderUri, {
        toolchainUpdateMode: 'UpdateAutomatically',
        toolchainOverride: projectToolchain,
    }), () => d.checkIsLakeInstalledCorrectly(channel, context, folderUri, {
        toolchainOverride: projectToolchain,
        toolchainUpdateMode: 'UpdateAutomatically',
    }));
}
async function checkPreCloneLean4ProjectPreconditions(depInstaller, channel, cwdUri) {
    const d = new setupDiagnostics_1.SetupDiagnostics(projectInitNotificationOptions);
    return await (0, setupDiagnostics_1.checkAll)(() => d.checkAreDependenciesInstalled(depInstaller, channel, cwdUri));
}
async function checkPostCloneLean4ProjectPreconditions(installer, context, folderUri) {
    const channel = installer.getOutputChannel();
    const cwdUri = (0, exturi_1.extUriToCwdUri)(folderUri);
    const d = new setupDiagnostics_1.SetupDiagnostics(projectInitNotificationOptions);
    return await (0, setupDiagnostics_1.checkAll)(() => d.checkIsElanUpToDate(installer, cwdUri, { elanMustBeInstalled: false }), () => d.checkIsLeanVersionUpToDate(channel, context, folderUri, { toolchainUpdateMode: 'UpdateAutomatically' }), () => d.checkIsLakeInstalledCorrectly(channel, context, folderUri, {
        toolchainUpdateMode: 'UpdateAutomatically',
    }));
}
class ProjectInitializationProvider {
    constructor(channel, leanInstaller, depInstaller) {
        this.channel = channel;
        this.leanInstaller = leanInstaller;
        this.depInstaller = depInstaller;
        this.subscriptions = [];
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.project.createStandaloneProject', () => this.createStandaloneProject()), vscode_1.commands.registerCommand('lean4.project.createMathlibProject', () => this.createMathlibProject()), vscode_1.commands.registerCommand('lean4.project.open', () => this.openProject()), vscode_1.commands.registerCommand('lean4.project.clone', () => this.cloneProject()));
    }
    async createStandaloneProject() {
        const createStandaloneProjectContext = 'Create Standalone Project';
        const toolchain = elan_1.elanStableChannel;
        const projectFolder = await this.createProject(createStandaloneProjectContext, undefined, toolchain);
        if (projectFolder === 'DidNotComplete') {
            return;
        }
        const buildResult = await (0, lake_1.lake)({
            channel: this.channel,
            cwdUri: projectFolder,
            context: createStandaloneProjectContext,
            toolchain,
            toolchainUpdateMode: 'UpdateAutomatically',
        }).build();
        if (buildResult.kind === 'Cancelled') {
            return;
        }
        if (buildResult.kind !== 'Success') {
            (0, lake_1.displayLakeRunnerError)(buildResult, 'Cannot build Lean project.');
            return;
        }
        const initialCommitResult = await this.createInitialCommit(projectFolder);
        if (initialCommitResult !== 'Success') {
            return;
        }
        await ProjectInitializationProvider.openNewFolder(projectFolder);
    }
    async createMathlibProject() {
        const createMathlibProjectContext = 'Create Project Using Mathlib';
        const mathlibToolchain = 'leanprover-community/mathlib4:lean-toolchain';
        const projectFolder = await this.createProject(createMathlibProjectContext, 'math', mathlibToolchain);
        if (projectFolder === 'DidNotComplete') {
            return;
        }
        const cacheGetResult = await (0, lake_1.lake)({
            channel: this.channel,
            cwdUri: projectFolder,
            context: createMathlibProjectContext,
            toolchain: mathlibToolchain,
            toolchainUpdateMode: 'UpdateAutomatically',
        }).fetchMathlibCache();
        if (cacheGetResult.kind === 'Cancelled') {
            return;
        }
        if (cacheGetResult.kind === 'CacheUnavailable') {
            (0, notifs_1.displayNotification)('Error', 'Cannot fetch Mathlib build artifact cache: `lake exe cache` is not available.');
            return;
        }
        if (cacheGetResult.kind !== 'Success') {
            (0, lake_1.displayLakeRunnerError)(cacheGetResult, 'Cannot fetch Mathlib build artifact cache.');
            return;
        }
        const buildResult = await (0, lake_1.lake)({
            channel: this.channel,
            cwdUri: projectFolder,
            context: createMathlibProjectContext,
            toolchain: mathlibToolchain,
            toolchainUpdateMode: 'UpdateAutomatically',
        }).build();
        if (buildResult.kind === 'Cancelled') {
            return;
        }
        if (buildResult.kind !== 'Success') {
            (0, lake_1.displayLakeRunnerError)(buildResult, 'Cannot build Lean project.');
            return;
        }
        const initialCommitResult = await this.createInitialCommit(projectFolder);
        if (initialCommitResult !== 'Success') {
            return;
        }
        await ProjectInitializationProvider.openNewFolder(projectFolder);
    }
    async createProject(context, kind, toolchain = elan_1.elanStableChannel) {
        const projectFolder = await ProjectInitializationProvider.askForNewProjectFolderLocation({
            saveLabel: 'Create project folder',
            title: 'Create a new project folder',
        });
        if (projectFolder === undefined) {
            return 'DidNotComplete';
        }
        await vscode_1.workspace.fs.createDirectory(projectFolder.asUri());
        const preconditionCheckResult = await checkCreateLean4ProjectPreconditions(this.leanInstaller, this.depInstaller, context, projectFolder, toolchain);
        if (preconditionCheckResult === 'Fatal') {
            return 'DidNotComplete';
        }
        const projectName = projectFolder.baseName();
        const result = await (0, lake_1.lake)({
            channel: this.channel,
            cwdUri: projectFolder,
            context,
            toolchain,
            toolchainUpdateMode: 'UpdateAutomatically',
        }).initProject(projectName, kind);
        if (result.kind === 'Cancelled') {
            return 'DidNotComplete';
        }
        if (result.kind !== 'Success') {
            (0, lake_1.displayLakeRunnerError)(result, 'Cannot initialize project.');
            return 'DidNotComplete';
        }
        const updateResult = await (0, lake_1.lake)({
            channel: this.channel,
            cwdUri: projectFolder,
            context,
            toolchain,
            toolchainUpdateMode: 'UpdateAutomatically',
        }).updateDependencies();
        if (updateResult.kind === 'Cancelled') {
            return 'DidNotComplete';
        }
        if (updateResult.kind !== 'Success') {
            (0, lake_1.displayLakeRunnerError)(updateResult, 'Cannot update dependencies.');
            return 'DidNotComplete';
        }
        return projectFolder;
    }
    async createInitialCommit(projectFolder) {
        const gitAddResult = await (0, batch_1.batchExecute)('git', ['add', '--all'], projectFolder.fsPath, {
            combined: this.channel,
        });
        if (gitAddResult.exitCode !== batch_1.ExecutionExitCode.Success) {
            (0, batch_1.displayResultError)(gitAddResult, 'Cannot add files to staging area of Git repository for project.');
            return 'GitAddFailed';
        }
        const author = 'Lean 4 VS Code Extension';
        const email = '<>';
        const gitCommitResult = await (0, batch_1.batchExecute)('git', ['-c', `user.name='${author}'`, '-c', `user.email='${email}'`, 'commit', '-m', 'Initial commit'], projectFolder.fsPath, { combined: this.channel });
        if (gitCommitResult.exitCode !== batch_1.ExecutionExitCode.Success) {
            (0, batch_1.displayResultError)(gitAddResult, 'Cannot commit files to Git repository for project.');
            return 'GitCommitFailed';
        }
        return 'Success';
    }
    async openProject() {
        const projectFolders = await vscode_1.window.showOpenDialog({
            title: "Open Lean 4 project folder containing a 'lean-toolchain' file",
            openLabel: 'Open project folder',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });
        if (projectFolders === undefined || projectFolders.length !== 1) {
            return;
        }
        const projectFolderUri = projectFolders[0];
        if (!(await ProjectInitializationProvider.checkIsFileUriOrShowError(projectFolderUri))) {
            return;
        }
        let projectFolder = new exturi_1.FileUri(projectFolderUri.fsPath);
        if (!(await (0, projectInfo_1.isValidLeanProject)(projectFolder))) {
            const parentProjectFolder = await ProjectInitializationProvider.attemptFindingLeanProjectInParentFolder(projectFolder);
            if (parentProjectFolder === undefined) {
                return;
            }
            projectFolder = parentProjectFolder;
        }
        // This kills the extension host, so it has to be the last command
        await vscode_1.commands.executeCommand('vscode.openFolder', projectFolder.asUri());
    }
    static async attemptFindingLeanProjectInParentFolder(projectFolder) {
        const parentProjectFolder = await (0, projectInfo_1.checkParentFoldersForLeanProject)(projectFolder);
        if (parentProjectFolder === undefined) {
            const message = `The selected folder is not a valid Lean 4 project folder.
Please make sure to select a folder containing a \'lean-toolchain\' file.
Click the following link to learn how to set up Lean projects: [(Show Setup Guide)](command:lean4.docs.showSetupGuide)`;
            (0, notifs_1.displayNotification)('Error', message);
            return undefined;
        }
        const message = `The selected folder is not a valid Lean 4 project folder because it does not contain a 'lean-toolchain' file.
However, a valid Lean 4 project folder was found in one of the parent directories at '${parentProjectFolder.fsPath}'.
Open this project instead?`;
        const input = 'Open parent directory project';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', message, [input]);
        if (choice !== input) {
            return undefined;
        }
        return parentProjectFolder;
    }
    async cloneProject() {
        const downloadProjectContext = 'Download Project';
        const quickPick = vscode_1.window.createQuickPick();
        quickPick.title = "Enter a Git repository URL or choose a preset project to download (Press 'Escape' to cancel)";
        quickPick.placeholder = 'URL of Git repository for existing Lean 4 project';
        quickPick.ignoreFocusOut = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        const presets = [
            {
                label: 'Mathlib',
                description: "Lean's math library",
                detail: 'https://github.com/leanprover-community/mathlib4',
                isPreset: true,
            },
            {
                label: 'Mathematics in Lean',
                description: 'Introduction to Lean for users with a mathematics background',
                detail: 'https://github.com/leanprover-community/mathematics_in_lean',
                isPreset: true,
            },
        ];
        quickPick.items = presets;
        quickPick.onDidChangeValue(_ => {
            if (quickPick.activeItems.length === 0 ||
                (quickPick.activeItems.length === 1 && !quickPick.activeItems[0].isPreset)) {
                quickPick.items = presets.concat({
                    label: 'Git repository URL',
                    detail: quickPick.value,
                    isPreset: false,
                });
            }
            else {
                quickPick.items = presets;
            }
        });
        quickPick.onDidAccept(async () => {
            const cloneChoices = quickPick.selectedItems;
            quickPick.dispose();
            if (cloneChoices.length === 0) {
                return;
            }
            const cloneChoice = cloneChoices[0];
            if (cloneChoice.detail === undefined) {
                return;
            }
            const projectUri = cloneChoice.detail;
            const projectFolder = await ProjectInitializationProvider.askForNewProjectFolderLocation({
                saveLabel: 'Create project folder',
                title: 'Create a new project folder to clone existing Lean 4 project into',
            });
            if (projectFolder === undefined) {
                return;
            }
            await vscode_1.workspace.fs.createDirectory(projectFolder.asUri());
            const preCloneCheckResult = await checkPreCloneLean4ProjectPreconditions(this.depInstaller, this.leanInstaller.getOutputChannel(), projectFolder);
            if (preCloneCheckResult === 'Fatal') {
                return;
            }
            const result = await (0, batch_1.batchExecuteWithProgress)('git', ['clone', projectUri, projectFolder.fsPath], downloadProjectContext, 'Cloning project', { channel: this.channel, allowCancellation: true });
            if (result.exitCode === batch_1.ExecutionExitCode.Cancelled) {
                return;
            }
            if (result.exitCode !== batch_1.ExecutionExitCode.Success) {
                (0, batch_1.displayResultError)(result, 'Cannot download project.');
                return;
            }
            const postCloneCheckResult = await checkPostCloneLean4ProjectPreconditions(this.leanInstaller, downloadProjectContext, projectFolder);
            if (postCloneCheckResult === 'Fatal') {
                return;
            }
            const fetchResult = await (0, lake_1.lake)({
                channel: this.channel,
                cwdUri: projectFolder,
                context: downloadProjectContext,
                toolchainUpdateMode: 'UpdateAutomatically',
            }).tryFetchMathlibCacheWithError();
            if (fetchResult !== 'Success') {
                return;
            }
            await ProjectInitializationProvider.openNewFolder(projectFolder);
        });
        quickPick.show();
    }
    static async askForNewProjectFolderLocation(options) {
        const projectFolder = await vscode_1.window.showSaveDialog(options);
        if (projectFolder === undefined || !(await this.checkIsFileUriOrShowError(projectFolder))) {
            return undefined;
        }
        return new exturi_1.FileUri(projectFolder.fsPath);
    }
    static async checkIsFileUriOrShowError(projectFolder) {
        if (projectFolder.scheme === 'file') {
            return true;
        }
        else {
            (0, notifs_1.displayNotification)('Error', 'Project folder must be created in a file system.');
            return false;
        }
    }
    static async openNewFolder(projectFolder) {
        const message = `Project initialized. Open new project folder '${projectFolder.baseName()}'?`;
        const input = 'Open project folder';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', message, [input]);
        if (choice === input) {
            // This kills the extension host, so it has to be the last command
            await vscode_1.commands.executeCommand('vscode.openFolder', projectFolder.asUri());
        }
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.ProjectInitializationProvider = ProjectInitializationProvider;
//# sourceMappingURL=projectinit.js.map