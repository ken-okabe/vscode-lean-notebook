"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeanClientProvider = void 0;
const vscode_1 = require("vscode");
const setupDiagnostics_1 = require("../diagnostics/setupDiagnostics");
const leanclient_1 = require("../leanclient");
const leanEditorProvider_1 = require("./leanEditorProvider");
const logger_1 = require("./logger");
const notifs_1 = require("./notifs");
const projectInfo_1 = require("./projectInfo");
async function checkLean4ProjectPreconditions(channel, context, existingFolderUris, folderUri, fileUri, stopOtherServer) {
    const options = {
        errorMode: { mode: 'NonModal' },
        warningMode: { modal: false, proceedByDefault: true },
    };
    const d = new setupDiagnostics_1.SetupDiagnostics(options);
    return await (0, setupDiagnostics_1.checkAll)(() => d.checkIsValidProjectFolder(channel, folderUri), () => d.checkIsLeanVersionUpToDate(channel, context, folderUri, { toolchainUpdateMode: 'PromptAboutUpdate' }), async () => {
        if (!(await (0, projectInfo_1.willUseLakeServer)(folderUri))) {
            return 'Fulfilled';
        }
        return await d.checkIsLakeInstalledCorrectly(channel, context, folderUri, {
            toolchainUpdateMode: 'PromptAboutUpdate',
        });
    }, () => d.checkIsNestedProjectFolder(existingFolderUris, folderUri, fileUri, stopOtherServer));
}
// This class ensures we have one LeanClient per folder.
class LeanClientProvider {
    constructor(outputChannel) {
        this.subscriptions = [];
        this.clients = new Map();
        this.pending = new Map();
        this.pendingInstallChanged = [];
        this.processingInstallChanged = false;
        this.activeClient = undefined;
        this.progressChangedEmitter = new vscode_1.EventEmitter();
        this.progressChanged = this.progressChangedEmitter.event;
        this.diagnosticsChangedEmitter = new vscode_1.EventEmitter();
        this.diagnosticsChanged = this.diagnosticsChangedEmitter.event;
        this.clientAddedEmitter = new vscode_1.EventEmitter();
        this.clientAdded = this.clientAddedEmitter.event;
        this.clientRemovedEmitter = new vscode_1.EventEmitter();
        this.clientRemoved = this.clientRemovedEmitter.event;
        this.clientStoppedEmitter = new vscode_1.EventEmitter();
        this.clientStopped = this.clientStoppedEmitter.event;
        this.outputChannel = outputChannel;
        leanEditorProvider_1.lean.visibleLeanEditors.forEach(e => this.ensureClient(e.documentExtUri));
        this.subscriptions.push(leanEditorProvider_1.lean.onDidChangeActiveLeanEditor(async (e) => {
            if (e === undefined) {
                return;
            }
            await this.ensureClient(e.documentExtUri);
        }));
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.restartFile', () => this.restartActiveFile()), vscode_1.commands.registerCommand('lean4.refreshFileDependencies', () => this.restartActiveFile()), vscode_1.commands.registerCommand('lean4.restartServer', () => this.restartActiveClient()), vscode_1.commands.registerCommand('lean4.stopServer', () => this.stopActiveClient()));
        this.subscriptions.push(leanEditorProvider_1.lean.onDidOpenLeanDocument(document => this.ensureClient(document.extUri)));
    }
    getActiveClient() {
        // TODO: Most callers of this function probably don't need an active client, just the folder URI.
        return this.activeClient;
    }
    async onInstallChanged(uri) {
        this.pendingInstallChanged.push(uri);
        if (this.processingInstallChanged) {
            // avoid re-entrancy.
            return;
        }
        this.processingInstallChanged = true;
        while (true) {
            const uri = this.pendingInstallChanged.pop();
            if (!uri) {
                break;
            }
            try {
                const [cached, client] = await this.ensureClient(uri);
                if (cached && client) {
                    await client.restart();
                }
            }
            catch (e) {
                logger_1.logger.log(`[ClientProvider] Exception checking lean version: ${e}`);
            }
        }
        this.processingInstallChanged = false;
    }
    restartFile(uri) {
        const fileName = uri.scheme === 'file' ? uri.baseName() : 'untitled file';
        const client = this.findClient(uri);
        if (!client || !client.isRunning()) {
            (0, notifs_1.displayNotification)('Error', `No active client for '${fileName}'.`);
            return;
        }
        const doc = leanEditorProvider_1.lean.getLeanDocumentByUri(uri);
        if (doc === undefined) {
            (0, notifs_1.displayNotification)('Error', `'${fileName}' was closed in the meantime.`);
            return;
        }
        void client.restartFile(doc);
    }
    restartActiveFile() {
        const doc = leanEditorProvider_1.lean.lastActiveLeanDocument;
        if (doc === undefined) {
            (0, notifs_1.displayNotification)('Error', 'No active Lean editor tab. Make sure to focus the Lean editor tab for which you wish to issue a restart.');
            return;
        }
        this.restartFile(doc.extUri);
    }
    async stopActiveClient() {
        const client = this.activeClient;
        if (client === undefined) {
            (0, notifs_1.displayNotification)('Error', 'Cannot stop language server: No active client.');
            return;
        }
        if (client.isStarted()) {
            await client.stop();
        }
    }
    async eraseClient(folderUri) {
        const client = this.getClientForFolder(folderUri);
        if (client === undefined) {
            (0, notifs_1.displayNotification)('Error', `Cannot stop language server: No client for project at '${folderUri.toString()}'.`);
            return;
        }
        if (client.isStarted()) {
            await client.stop();
        }
        const key = client.folderUri.toString();
        this.clients.delete(key);
        this.pending.delete(key);
        if (client === this.activeClient) {
            this.activeClient = undefined;
        }
    }
    async restartActiveClient() {
        if (this.activeClient === undefined) {
            const activeUri = leanEditorProvider_1.lean.lastActiveLeanDocument?.extUri;
            if (activeUri === undefined) {
                (0, notifs_1.displayNotification)('Error', 'Cannot restart server: No focused Lean tab. Please focus the Lean tab for which you wish to restart the server.');
                return;
            }
            const [cached, client] = await this.ensureClient(activeUri);
            if (cached) {
                await client?.restart();
            }
            return;
        }
        await this.activeClient?.restart();
    }
    // Find the client for a given document.
    findClient(path) {
        const candidates = this.getClients().filter(client => client.isInFolderManagedByThisClient(path));
        // All candidate folders are a prefix of `path`, so they must necessarily be prefixes of one another
        // => the best candidate (the most top-level client folder) is just the one with the shortest path
        let bestCandidate;
        for (const candidate of candidates) {
            if (!bestCandidate) {
                bestCandidate = candidate;
                continue;
            }
            const folder = candidate.getClientFolder();
            const bestFolder = bestCandidate.getClientFolder();
            if (folder.scheme === 'file' &&
                bestFolder.scheme === 'file' &&
                folder.fsPath.length < bestFolder.fsPath.length) {
                bestCandidate = candidate;
            }
        }
        return bestCandidate;
    }
    getClients() {
        return Array.from(this.clients.values());
    }
    withStoppedClients(action) {
        let combinedAction = async () => ({
            kind: 'Success',
            result: await action(),
        });
        for (const c of this.clients.values()) {
            const previousCombinedAction = combinedAction;
            combinedAction = async () => {
                const r = await c.withStoppedClient(previousCombinedAction);
                if (r.kind === 'IsRestarting' || r.result.kind === 'IsRestarting') {
                    return { kind: 'IsRestarting' };
                }
                return { kind: 'Success', result: r.result.result };
            };
        }
        return combinedAction();
    }
    getClientForFolder(folder) {
        return this.clients.get(folder.toString());
    }
    async ensureClient(uri) {
        const projectInfo = await (0, projectInfo_1.findLeanProjectRootInfo)(uri);
        if (projectInfo.kind === 'FileNotFound') {
            return [false, undefined];
        }
        if (projectInfo.kind === 'LakefileWithoutToolchain') {
            (0, notifs_1.displayNotification)('Error', `Project at ${projectInfo.projectRootUri} has a Lakefile, but lacks a 'lean-toolchain' file. Please create one with the Lean version that you would like the project to use.`);
            return [false, undefined];
        }
        const folderUri = projectInfo.projectRootUri;
        let client = this.getClientForFolder(folderUri);
        if (client) {
            this.activeClient = client;
            return [true, client];
        }
        const key = folderUri.toString();
        if (this.pending.has(key)) {
            return [false, undefined];
        }
        this.pending.set(key, true);
        const preconditionCheckResult = await checkLean4ProjectPreconditions(this.outputChannel, 'Client Startup', this.getClients().map(client => client.folderUri), folderUri, uri, async (folderUriToStop) => {
            await this.eraseClient(folderUriToStop);
            await this.ensureClient(uri);
        });
        if (preconditionCheckResult === 'Fatal') {
            this.pending.delete(key);
            this.activeClient = undefined;
            return [false, undefined];
        }
        logger_1.logger.log('[ClientProvider] Creating LeanClient for ' + folderUri.toString());
        client = await leanclient_1.LeanClient.init(folderUri, this.outputChannel);
        this.subscriptions.push(client);
        this.clients.set(key, client);
        client.serverFailed(err => {
            if (this.activeClient === client) {
                this.activeClient = undefined;
            }
            this.clients.delete(key);
            client.dispose();
            (0, notifs_1.displayNotification)('Error', err);
        });
        client.stopped(reason => {
            this.clientStoppedEmitter.fire([client, client === this.activeClient, reason]);
        });
        // aggregate progress changed events.
        client.progressChanged(arg => {
            this.progressChangedEmitter.fire(arg);
        });
        client.diagnostics(p => {
            this.diagnosticsChangedEmitter.fire(p);
        });
        // Fired before starting the client because the InfoView uses this to register
        // events on `client` that fire during `start`.
        this.clientAddedEmitter.fire(client);
        await client.start();
        this.pending.delete(key);
        this.activeClient = client;
        return [false, client];
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.LeanClientProvider = LeanClientProvider;
//# sourceMappingURL=clientProvider.js.map