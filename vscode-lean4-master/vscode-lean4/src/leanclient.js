"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeanClient = void 0;
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
// @ts-ignore
const fs = require("fs");
const semver_1 = require("semver");
const batch_1 = require("./utils/batch");
const converters_1 = require("./utils/converters");
const elan_1 = require("./utils/elan");
const exturi_1 = require("./utils/exturi");
const fsHelper_1 = require("./utils/fsHelper");
const leanCmdRunner_1 = require("./utils/leanCmdRunner");
const leanEditorProvider_1 = require("./utils/leanEditorProvider");
const notifs_1 = require("./utils/notifs");
const projectInfo_1 = require("./utils/projectInfo");
function logConfig() {
    if (!(0, config_1.isLoggingEnabled)()) {
        return undefined;
    }
    const allowedMethods = (0, config_1.allowedLoggingMethods)();
    const disallowedMethods = (0, config_1.disallowedLoggingMethods)();
    return {
        logDir: (0, config_1.loggingDir)(),
        allowedMethods: allowedMethods.length > 0 ? allowedMethods : undefined,
        disallowedMethods: disallowedMethods.length > 0 ? disallowedMethods : undefined,
    };
}
const leanClientCapabilities = {
    silentDiagnosticSupport: true,
};
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
class LeanClient {
    constructor() {
        this.subscriptions = [];
        this.noPrompt = false;
        this.showingRestartMessage = false;
        this.isRestarting = false;
        this.configFileContents = new Map();
        this.openServerDocuments = new Set();
        this.didChangeEmitter = new vscode_1.EventEmitter();
        this.didChange = this.didChangeEmitter.event;
        this.diagnosticsEmitter = new vscode_1.EventEmitter();
        this.diagnostics = this.diagnosticsEmitter.event;
        this.didSetLanguageEmitter = new vscode_1.EventEmitter();
        this.didSetLanguage = this.didSetLanguageEmitter.event;
        this.didCloseEmitter = new vscode_1.EventEmitter();
        this.didClose = this.didCloseEmitter.event;
        this.customNotificationEmitter = new vscode_1.EventEmitter();
        /** Fires whenever a custom notification (i.e. one not defined in LSP) is received. */
        this.customNotification = this.customNotificationEmitter.event;
        /** saved progress info in case infoview is opened, it needs to get all of it. */
        this.progress = new Map();
        this.progressChangedEmitter = new vscode_1.EventEmitter();
        this.progressChanged = this.progressChangedEmitter.event;
        this.stoppedEmitter = new vscode_1.EventEmitter();
        this.stopped = this.stoppedEmitter.event;
        this.restartedEmitter = new vscode_1.EventEmitter();
        this.restarted = this.restartedEmitter.event;
        this.restartingEmitter = new vscode_1.EventEmitter();
        this.restarting = this.restartingEmitter.event;
        this.restartedWorkerEmitter = new vscode_1.EventEmitter();
        this.restartedWorker = this.restartedWorkerEmitter.event;
        this.serverFailedEmitter = new vscode_1.EventEmitter();
        this.serverFailed = this.serverFailedEmitter.event;
    }
    static async init(folderUri, outputChannel) {
        const c = new LeanClient();
        c.outputChannel = outputChannel;
        c.folderUri = folderUri;
        c.subscriptions.push(new vscode_1.Disposable(() => c.staleDepNotifier?.dispose()));
        await c.registerRestartServerNotificationWatchers();
        return c;
    }
    async updateConfigFileContents(uri) {
        let contents;
        try {
            contents = (await fs.promises.readFile(uri.fsPath, { encoding: 'utf8' })).trim();
        }
        catch {
            return false;
        }
        const oldContents = this.configFileContents.get(uri.toString());
        const isFirstUpdate = oldContents === undefined;
        if (isFirstUpdate || oldContents !== contents) {
            this.configFileContents.set(uri.toString(), contents);
            return !isFirstUpdate;
        }
        return false;
    }
    async registerRestartServerNotificationWatchers() {
        const folderUri = this.folderUri;
        if (folderUri.scheme === 'untitled') {
            return;
        }
        const watchers = [];
        if (await (0, fsHelper_1.fileExists)((0, projectInfo_1.leanToolchainUri)(folderUri).fsPath)) {
            watchers.push({
                name: 'Project Lean version (`lean-toolchain`)',
                watcher: vscode_1.workspace.createFileSystemWatcher(
                // Hack: We want to avoid having to escape globs and an empty glob doesn't match the file,
                // so we instead watch for `*` relative to `leanToolchainUri(folderUri)`
                // (accepting some unlikely false-positives).
                new vscode_1.RelativePattern((0, projectInfo_1.leanToolchainUri)(folderUri).asUri(), '*'), true, false, true),
            });
            await this.updateConfigFileContents((0, projectInfo_1.leanToolchainUri)(folderUri));
        }
        if (await (0, fsHelper_1.fileExists)((0, projectInfo_1.lakefileLeanUri)(folderUri).fsPath)) {
            watchers.push({
                name: 'Project configuration (`lakefile.lean`)',
                watcher: vscode_1.workspace.createFileSystemWatcher(new vscode_1.RelativePattern((0, projectInfo_1.lakefileLeanUri)(folderUri).asUri(), '*'), true, false, true),
            });
            await this.updateConfigFileContents((0, projectInfo_1.lakefileLeanUri)(folderUri));
        }
        if (await (0, fsHelper_1.fileExists)((0, projectInfo_1.lakefileTomlUri)(folderUri).fsPath)) {
            watchers.push({
                name: 'Project configuration (`lakefile.toml`)',
                watcher: vscode_1.workspace.createFileSystemWatcher(new vscode_1.RelativePattern((0, projectInfo_1.lakefileTomlUri)(folderUri).asUri(), '*'), true, false, true),
            });
            await this.updateConfigFileContents((0, projectInfo_1.lakefileTomlUri)(folderUri));
        }
        this.subscriptions.push(...watchers.map(w => w.watcher));
        let isWatcherNotificationDisplayed = false;
        for (const w of watchers) {
            this.subscriptions.push(w.watcher.onDidChange(async (uri) => {
                const fileUri = exturi_1.FileUri.fromUri(uri);
                if (fileUri === undefined) {
                    return;
                }
                const didReallyChange = await this.updateConfigFileContents(fileUri);
                if (!didReallyChange) {
                    // In core on ext4, building touches the metadata of the file, which causes
                    // the change event to trigger.
                    // VS Code file watchers can't distinguish between "modify" and "change",
                    // so we use the file contents to distinguish the two post-hoc.
                    return;
                }
                if (isWatcherNotificationDisplayed) {
                    return;
                }
                isWatcherNotificationDisplayed = true;
                (0, notifs_1.displayNotificationWithOptionalInput)('Information', `${w.name} of '${folderUri.baseName()}' has changed. Do you wish to restart the Lean server?`, [
                    {
                        input: 'Restart Server',
                        action: async () => await this.restart(),
                    },
                ], () => {
                    isWatcherNotificationDisplayed = false;
                });
            }));
        }
    }
    dispose() {
        this.subscriptions.forEach(s => s.dispose());
        if (this.isStarted())
            void this.stop();
    }
    serverCapabilities() {
        return this.client?.initializeResult?.capabilities;
    }
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    leanServerCapabilities() {
        return this.serverCapabilities()?.experimental;
    }
    showRestartMessage(restartFile = false, uri) {
        if (this.showingRestartMessage) {
            return;
        }
        this.showingRestartMessage = true;
        const finalizer = () => {
            this.showingRestartMessage = false;
        };
        let restartItem;
        let messageTitle;
        if (!restartFile) {
            restartItem = 'Restart Lean Server';
            messageTitle = 'Lean Server has stopped unexpectedly.';
        }
        else {
            restartItem = 'Restart Lean Server on this file';
            messageTitle = 'The Lean Server has stopped processing this file.';
        }
        (0, notifs_1.displayNotificationWithOptionalInput)('Error', messageTitle, [
            {
                input: restartItem,
                action: () => {
                    if (restartFile && uri !== undefined) {
                        const document = leanEditorProvider_1.lean.getLeanDocumentByUri(uri);
                        if (document !== undefined) {
                            void this.restartFile(document);
                        }
                    }
                    else {
                        void this.start();
                    }
                },
            },
        ], finalizer);
    }
    async sendPrepareModuleHierarchy(uri) {
        const client = this.client;
        if (client === undefined || !client.isRunning) {
            return { kind: 'StoppedClient' };
        }
        if (this.leanServerCapabilities()?.moduleHierarchyProvider === undefined) {
            return { kind: 'Unsupported' };
        }
        const param = {
            textDocument: { uri: client.code2ProtocolConverter.asUri(uri.asUri()) },
        };
        const response = await client.sendRequest('$/lean/prepareModuleHierarchy', param);
        return { kind: 'Success', module: response };
    }
    async sendModuleHierarchyImports(module) {
        const client = this.client;
        if (client === undefined || !client.isRunning) {
            return { kind: 'StoppedClient' };
        }
        if (this.leanServerCapabilities()?.moduleHierarchyProvider === undefined) {
            return { kind: 'Unsupported' };
        }
        const param = { module };
        const response = await client.sendRequest('$/lean/moduleHierarchy/imports', param);
        return { kind: 'Success', imports: response };
    }
    async sendModuleHierarchyImportedBy(module) {
        const client = this.client;
        if (client === undefined || !client.isRunning) {
            return { kind: 'StoppedClient' };
        }
        if (this.leanServerCapabilities()?.moduleHierarchyProvider === undefined) {
            return { kind: 'Unsupported' };
        }
        const param = { module };
        const response = await client.sendRequest('$/lean/moduleHierarchy/importedBy', param);
        return { kind: 'Success', imports: response };
    }
    async restart() {
        if (this.isRestarting) {
            (0, notifs_1.displayNotification)('Error', 'Client is already being started.');
            return;
        }
        this.isRestarting = true;
        try {
            let defaultToolchain;
            if (this.folderUri.scheme === 'untitled') {
                const installedToolchainsResult = await (0, elan_1.elanInstalledToolchains)();
                switch (installedToolchainsResult.kind) {
                    case 'Success':
                        if (installedToolchainsResult.defaultToolchain === undefined) {
                            this.serverFailedEmitter.fire('No default Lean version set - cannot launch client for untitled file.');
                            return;
                        }
                        defaultToolchain = installedToolchainsResult.defaultToolchain;
                        break;
                    case 'ElanNotFound':
                        defaultToolchain = undefined;
                        break;
                    case 'ExecutionError':
                        this.serverFailedEmitter.fire(`Cannot determine Lean version information for launching a client for an untitled file: ${installedToolchainsResult.message}`);
                        return;
                }
            }
            logger_1.logger.log('[LeanClient] Restarting Lean Server');
            if (this.isStarted()) {
                await this.stop();
            }
            this.restartingEmitter.fire(undefined);
            const progressOptions = {
                location: vscode_1.ProgressLocation.Notification,
                title: '[Server Startup] Starting Lean language server and cloning missing packages [(Click for details)](command:lean4.troubleshooting.showOutput)',
                cancellable: false,
            };
            await vscode_1.window.withProgress(progressOptions, async (progress) => await this.startClient(progress, defaultToolchain));
        }
        finally {
            this.isRestarting = false;
        }
    }
    async determineToolchainOverride(defaultToolchain) {
        const cwdUri = this.folderUri.scheme === 'file' ? this.folderUri : undefined;
        const toolchainDecision = await leanCmdRunner_1.leanRunner.decideToolchain({
            channel: this.outputChannel,
            context: 'Server Startup',
            cwdUri,
            toolchainUpdateMode: 'PromptAboutUpdate',
            waitingPrompt: 'Fetching Lean version information',
        });
        if (toolchainDecision.kind === 'Error') {
            return toolchainDecision;
        }
        if (toolchainDecision.kind === 'RunWithSpecificToolchain') {
            return { kind: 'Override', toolchain: toolchainDecision.toolchain };
        }
        toolchainDecision.kind;
        if (this.folderUri.scheme === 'untitled' && defaultToolchain !== undefined) {
            // Fixes issue #227, for adhoc files it would pick up the cwd from the open folder
            // which is not what we want.  For adhoc files we want the (default) toolchain instead.
            return { kind: 'Override', toolchain: defaultToolchain };
        }
        return { kind: 'NoOverride' };
    }
    async startClient(progress, defaultToolchain) {
        // Should only be called from `restart`
        const startTime = Date.now();
        progress.report({});
        const toolchainOverrideResult = await this.determineToolchainOverride(defaultToolchain);
        if (toolchainOverrideResult.kind === 'Error') {
            this.serverFailedEmitter.fire(`Error while starting client: ${toolchainOverrideResult.message}`);
            return;
        }
        const toolchainOverride = toolchainOverrideResult.kind === 'Override' ? toolchainOverrideResult.toolchain : undefined;
        this.client = await this.setupClient(toolchainOverride);
        let insideRestart = true;
        try {
            this.client.onDidChangeState(async (s) => {
                // see https://github.com/microsoft/vscode-languageserver-node/issues/825
                if (s.newState === node_1.State.Starting) {
                    logger_1.logger.log('[LeanClient] starting');
                }
                else if (s.newState === node_1.State.Running) {
                    const end = Date.now();
                    logger_1.logger.log(`[LeanClient] running, started in ${end - startTime} ms`);
                    this.running = true; // may have been auto restarted after it failed.
                    if (!insideRestart) {
                        this.restartedEmitter.fire(undefined);
                    }
                }
                else if (s.newState === node_1.State.Stopped) {
                    this.running = false;
                    logger_1.logger.log('[LeanClient] has stopped or it failed to start');
                    if (!this.noPrompt) {
                        // only raise this event and show the message if we are not the ones
                        // who called the stop() method.
                        this.stoppedEmitter.fire({ message: 'Lean server has stopped.', reason: '' });
                        this.showRestartMessage();
                    }
                }
            });
            await this.client.start();
            const version = this.client.initializeResult?.serverInfo?.version;
            if (version && new semver_1.SemVer(version).compare('0.2.0') < 0) {
                if (this.staleDepNotifier) {
                    this.staleDepNotifier.dispose();
                }
                this.staleDepNotifier = this.diagnostics(params => this.checkForImportsOutdatedError(params));
            }
            // if we got this far then the client is happy so we are running!
            this.running = true;
        }
        catch (error) {
            const msg = '' + error;
            logger_1.logger.log(`[LeanClient] restart error ${msg}`);
            this.outputChannel.appendLine(msg);
            this.serverFailedEmitter.fire(msg);
            insideRestart = false;
        }
        // HACK(WN): Register a default notification handler to fire on custom notifications.
        // A mechanism to do this is provided in vscode-jsonrpc. One can register a `StarNotificationHandler`
        // here: https://github.com/microsoft/vscode-languageserver-node/blob/b2fc85d28a1a44c22896559ee5f4d3ba37a02ef5/jsonrpc/src/common/connection.ts#L497
        // which fires on any LSP notifications not in the standard, for example the `$/lean/..` ones.
        // However this mechanism is not exposed in vscode-languageclient, so we hack around its implementation.
        const starHandler = (method, params_) => {
            if (method === '$/lean/fileProgress' && this.client) {
                const params = params_;
                const uri = (0, exturi_1.toExtUri)(converters_1.p2cConverter.asUri(params.textDocument.uri));
                if (uri !== undefined) {
                    this.progressChangedEmitter.fire([uri.toString(), params.processing]);
                    // save the latest progress on this Uri in case infoview needs it later.
                    this.progress.set(uri, params.processing);
                }
            }
            this.customNotificationEmitter.fire({ method, params: params_ });
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.client.onNotification(starHandler, () => { });
        // Reveal the standard error output channel when the server prints something to stderr.
        // The vscode-languageclient library already takes care of writing it to the output channel.
        let stderrMsgBoxVisible = false;
        this.client._serverProcess.stderr.on('data', async (chunk) => {
            if ((0, config_1.shouldAutofocusOutput)()) {
                this.client?.outputChannel.show(true);
            }
            else if (!stderrMsgBoxVisible) {
                stderrMsgBoxVisible = true;
                const finalizer = () => {
                    stderrMsgBoxVisible = false;
                };
                (0, notifs_1.displayNotificationWithOutput)('Error', `Lean server printed an error:\n${chunk.toString()}`, [], finalizer);
            }
        });
        this.restartedEmitter.fire(undefined);
        insideRestart = false;
    }
    checkForImportsOutdatedError(params) {
        const fileUri = (0, exturi_1.parseExtUri)(params.uri);
        if (fileUri === undefined) {
            return;
        }
        const fileName = fileUri.scheme === 'file' ? fileUri.baseName() : 'untitled';
        const isImportsOutdatedError = params.diagnostics.some(d => d.severity === node_1.DiagnosticSeverity.Error &&
            d.message.includes('Imports are out of date and must be rebuilt') &&
            d.range.start.line === 0 &&
            d.range.start.character === 0 &&
            d.range.end.line === 0 &&
            d.range.end.character === 0);
        if (!isImportsOutdatedError) {
            return;
        }
        const message = `Imports of '${fileName}' are out of date and must be rebuilt. Restarting the file will rebuild them.`;
        const input = 'Restart File';
        (0, notifs_1.displayNotificationWithOptionalInput)('Information', message, [
            {
                input,
                action: () => {
                    const document = leanEditorProvider_1.lean.getLeanDocumentByUri(fileUri);
                    if (document === undefined) {
                        (0, notifs_1.displayNotification)('Error', `'${fileName}' was closed in the meantime. Imports will not be rebuilt.`);
                        return;
                    }
                    void this.restartFile(document);
                },
            },
        ]);
    }
    async withStoppedClient(action) {
        if (this.isRestarting) {
            return { kind: 'IsRestarting' };
        }
        this.isRestarting = true; // Ensure that client cannot be restarted in the mean-time
        let result;
        try {
            if (this.isStarted()) {
                await this.stop();
            }
            result = await action();
        }
        finally {
            this.isRestarting = false;
        }
        await this.restart();
        return { kind: 'Success', result };
    }
    isInFolderManagedByThisClient(uri) {
        if (this.folderUri.scheme === 'untitled' && uri.scheme === 'untitled') {
            return true;
        }
        if (this.folderUri.scheme === 'file' && uri.scheme === 'file') {
            return uri.isInFolder(this.folderUri);
        }
        return false;
    }
    getClientFolder() {
        return this.folderUri;
    }
    start() {
        return this.restart();
    }
    isStarted() {
        return this.client !== undefined;
    }
    isRunning() {
        if (this.client) {
            return this.running;
        }
        return false;
    }
    async stop() {
        if (this.client && this.running) {
            this.noPrompt = true;
            try {
                // some timing conditions can happen while running unit tests that cause
                // this to throw an exception which then causes those tests to fail.
                await this.client.stop();
            }
            catch (e) {
                logger_1.logger.log(`[LeanClient] Error stopping language client: ${e}`);
            }
        }
        this.noPrompt = false;
        this.progress = new Map();
        this.client = undefined;
        this.openServerDocuments = new Set();
        this.running = false;
    }
    async restartFile(leanDoc) {
        const extUri = leanDoc.extUri;
        const formattedFileName = extUri.scheme === 'file' ? extUri.baseName() : extUri.toString();
        const formattedProjectName = this.folderUri.scheme === 'file' ? this.folderUri.fsPath : this.folderUri.toString();
        if (this.client === undefined || !this.running) {
            (0, notifs_1.displayNotification)('Error', `Cannot restart '${formattedFileName}': The language server for the project at '${formattedProjectName}' is stopped.`);
            return;
        }
        if (!this.isInFolderManagedByThisClient(extUri)) {
            (0, notifs_1.displayNotification)('Error', `Cannot restart '${formattedFileName}': The project at '${formattedProjectName}' does not contain the file.`);
            return;
        }
        const uri = extUri.toString();
        if (!this.openServerDocuments.delete(uri)) {
            (0, notifs_1.displayNotification)('Error', `Cannot restart '${formattedFileName}': The file has never been opened in the language server for the project at '${formattedProjectName}'.`);
            return;
        }
        logger_1.logger.log(`[LeanClient] Restarting File: ${uri}`);
        await this.client.sendNotification('textDocument/didClose', this.client.code2ProtocolConverter.asCloseTextDocumentParams(leanDoc.doc));
        if (this.openServerDocuments.has(uri)) {
            (0, notifs_1.displayNotification)('Error', `Cannot restart '${formattedFileName}': The file has already been opened in the language server for the project at '${formattedProjectName}' since initiating the restart.`);
            return;
        }
        this.openServerDocuments.add(uri);
        await this.client.sendNotification('textDocument/didOpen', (0, converters_1.setDependencyBuildMode)(this.client.code2ProtocolConverter.asOpenTextDocumentParams(leanDoc.doc), 'once'));
        this.restartedWorkerEmitter.fire(uri);
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    sendRequest(method, params) {
        return this.running && this.client
            ? this.client.sendRequest(method, params)
            : new Promise((_, reject) => {
                reject('No connection to Lean');
            });
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    sendNotification(method, params) {
        return this.running && this.client ? this.client.sendNotification(method, params) : undefined;
    }
    getDiagnostics() {
        return this.running ? this.client?.diagnostics : undefined;
    }
    get initializeResult() {
        return this.running ? this.client?.initializeResult : undefined;
    }
    async determineServerOptions(toolchainOverride) {
        const env = Object.assign({}, process.env);
        const [serverExecutable, options] = await this.determineExecutable();
        if (toolchainOverride) {
            options.unshift('+' + toolchainOverride);
        }
        const cwd = this.folderUri.scheme === 'file' ? this.folderUri.fsPath : undefined;
        if (cwd) {
            // Add folder name to command-line so that it shows up in `ps aux`.
            options.push(cwd);
        }
        else {
            options.push('untitled');
        }
        return {
            command: serverExecutable,
            args: options.concat((0, config_1.serverArgs)()),
            options: {
                cwd,
                env,
            },
        };
    }
    async determineExecutable() {
        if (await (0, projectInfo_1.willUseLakeServer)(this.folderUri)) {
            return ['lake', ['serve', '--']];
        }
        else {
            return ['lean', ['--server']];
        }
    }
    obtainClientOptions() {
        const documentSelector = {
            language: 'lean4',
        };
        let workspaceFolder;
        documentSelector.scheme = this.folderUri.scheme;
        if (this.folderUri.scheme === 'file') {
            const escapedPath = this.folderUri.fsPath.replace(/[?*()[\]{}]/g, '[$&]');
            documentSelector.pattern = `${escapedPath}/**/*`;
            workspaceFolder = {
                uri: this.folderUri.asUri(),
                name: this.folderUri.baseName(),
                index: 0, // the language client library does not actually need this index
            };
        }
        return {
            outputChannel: this.outputChannel,
            revealOutputChannelOn: node_1.RevealOutputChannelOn.Never, // contrary to the name, this disables the message boxes
            documentSelector: [documentSelector],
            workspaceFolder,
            initializationOptions: {
                hasWidgets: true,
                logCfg: logConfig(),
            },
            connectionOptions: {
                maxRestartCount: 0,
                cancellationStrategy: undefined,
            },
            middleware: {
                handleDiagnostics: (uri, diagnostics, next) => {
                    const diagnosticsInVsCode = diagnostics.filter(d => !('isSilent' in d && d.isSilent));
                    next(uri, diagnosticsInVsCode);
                    const uri_ = converters_1.c2pConverter.asUri(uri);
                    const diagnostics_ = [];
                    for (const d of diagnostics) {
                        const d_ = {
                            ...converters_1.c2pConverter.asDiagnostic(d),
                        };
                        diagnostics_.push(d_);
                    }
                    this.diagnosticsEmitter.fire({ uri: uri_, diagnostics: diagnostics_ });
                },
                didOpen: async (doc, next) => {
                    const docUri = (0, exturi_1.toExtUri)(doc.uri);
                    if (!docUri) {
                        return; // This should never happen since the glob we launch the client for ensures that all uris are ext uris
                    }
                    // This will sometimes open invisible documents in the language server
                    // (e.g. holding `Ctrl` while hovering over an identifier will quickly emit a `didOpen` and then a `didClose` notification for the document the identifier is in).
                    // There is no good way to prevent this (c.f. https://github.com/microsoft/vscode-languageserver-node/issues/848#issuecomment-2185043021),
                    // but specifically in the case of `Ctrl`+Hover, the language server typically seems to not start expensive elaboration for the invisible document.
                    // We may however launch a new server instance if the document is in a different project (e.g. core).
                    if (this.openServerDocuments.has(docUri.toString())) {
                        return;
                    }
                    this.openServerDocuments.add(docUri.toString());
                    await next(doc);
                    // Opening the document may have set the language ID.
                    this.didSetLanguageEmitter.fire(doc.languageId);
                },
                didChange: async (data, next) => {
                    await next(data);
                    const params = converters_1.c2pConverter.asChangeTextDocumentParams(data, data.document.uri, data.document.version);
                    this.didChangeEmitter.fire(params);
                },
                didClose: async (doc, next) => {
                    const docUri = (0, exturi_1.toExtUri)(doc.uri);
                    if (!docUri) {
                        return; // This should never happen since the glob we launch the client for ensures that all uris are ext uris
                    }
                    if (!this.openServerDocuments.delete(docUri.toString())) {
                        // Do not send `didClose` if we filtered the corresponding `didOpen` (see comment in the `didOpen` middleware).
                        // The language server is only resilient against requests for closed files, not the `didClose` notification itself.
                        return;
                    }
                    await next(doc);
                    const params = converters_1.c2pConverter.asCloseTextDocumentParams(doc);
                    this.didCloseEmitter.fire(params);
                },
                provideDocumentHighlights: async (doc, pos, ctok, next) => {
                    const leanHighlights = await next(doc, pos, ctok);
                    if (leanHighlights?.length)
                        return leanHighlights;
                    // vscode doesn't fall back to textual highlights, so we
                    // need to do that manually if the user asked for it
                    if (!(0, config_1.getFallBackToStringOccurrenceHighlighting)()) {
                        return [];
                    }
                    await new Promise(res => setTimeout(res, 250));
                    if (ctok.isCancellationRequested)
                        return;
                    const wordRange = doc.getWordRangeAtPosition(pos);
                    if (!wordRange)
                        return;
                    const word = doc.getText(wordRange);
                    const highlights = [];
                    const text = doc.getText();
                    const nonWordPattern = '[`~@$%^&*()-=+\\[{\\]}⟨⟩⦃⦄⟦⟧⟮⟯‹›\\\\|;:",./\\s]|^|$';
                    const regexp = new RegExp(`(?<=${nonWordPattern})${escapeRegExp(word)}(?=${nonWordPattern})`, 'g');
                    for (const match of text.matchAll(regexp)) {
                        const start = doc.positionAt(match.index ?? 0);
                        highlights.push({
                            range: new vscode_1.Range(start, start.translate(0, match[0].length)),
                            kind: vscode_1.DocumentHighlightKind.Text,
                        });
                    }
                    return highlights;
                },
                provideRenameEdits: async (document, position, newName, token, next) => {
                    const edit = await next(document, position, newName, token);
                    if (!edit) {
                        return edit;
                    }
                    const entries = edit.entries();
                    const amountFiles = entries.length;
                    if (amountFiles <= 1) {
                        return edit;
                    }
                    const amountEdits = entries.map(([_, edits]) => edits.length).reduce((acc, n) => acc + n, 0);
                    const choice = await (0, notifs_1.displayNotificationWithInput)('Warning', `This rename operation will rename ${amountEdits} occurrences in ${amountFiles} files. Do you wish to proceed?`, ['Proceed']);
                    if (choice === undefined) {
                        return undefined;
                    }
                    return edit;
                },
            },
        };
    }
    async setupClient(toolchainOverride) {
        const serverOptions = await this.determineServerOptions(toolchainOverride);
        const clientOptions = this.obtainClientOptions();
        this.outputChannel.appendLine((0, batch_1.formatCommandExecutionOutput)(serverOptions.options?.cwd, serverOptions.command, serverOptions.args ?? []));
        const client = new node_1.LanguageClient('lean4', 'Lean 4', serverOptions, clientOptions);
        const leanCapabilityFeature = {
            initialize(_1, _2) { },
            getState() {
                return { kind: 'static' };
            },
            fillClientCapabilities(capabilities) {
                capabilities.lean = leanClientCapabilities;
            },
            dispose() { },
        };
        client.registerFeature(leanCapabilityFeature);
        (0, converters_1.patchConverters)(client.protocol2CodeConverter, client.code2ProtocolConverter);
        return client;
    }
}
exports.LeanClient = LeanClient;
//# sourceMappingURL=leanclient.js.map