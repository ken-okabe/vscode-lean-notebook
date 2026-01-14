"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfoProvider = void 0;
const infoview_api_1 = require("@leanprover/infoview-api");
const path_1 = require("path");
const vscode_1 = require("vscode");
const config_1 = require("./config");
const rpc_1 = require("./rpc");
const converters_1 = require("./utils/converters");
const exturi_1 = require("./utils/exturi");
const leanEditorProvider_1 = require("./utils/leanEditorProvider");
const logger_1 = require("./utils/logger");
const notifs_1 = require("./utils/notifs");
const viewColumn_1 = require("./utils/viewColumn");
const keepAlivePeriodMs = 10000;
async function rpcConnect(client, uri) {
    const connParams = { uri };
    const result = await client.sendRequest('$/lean/rpc/connect', connParams);
    return result.sessionId;
}
class RpcSessionAtPos {
    constructor(client, sessionId, uri) {
        this.sessionId = sessionId;
        this.uri = uri;
        this.client = client;
        this.keepAliveInterval = setInterval(async () => {
            const params = { uri, sessionId };
            try {
                await client.sendNotification('$/lean/rpc/keepAlive', params);
            }
            catch (e) {
                logger_1.logger.log(`[InfoProvider] failed to send keepalive for ${uri}: ${e}`);
                if (this.keepAliveInterval)
                    clearInterval(this.keepAliveInterval);
            }
        }, keepAlivePeriodMs);
    }
    dispose() {
        if (this.keepAliveInterval)
            clearInterval(this.keepAliveInterval);
        // TODO: at this point we could close the session
    }
}
class InfoProvider {
    subscribeDidChangeNotification(client, method) {
        const h = client.didChange(params => {
            void this.webviewPanel?.api.sentClientNotification(method, params);
        });
        return h;
    }
    subscribeDidCloseNotification(client, method) {
        const h = client.didClose(params => {
            void this.webviewPanel?.api.sentClientNotification(method, params);
        });
        return h;
    }
    subscribeDiagnosticsNotification(client, method) {
        const h = client.diagnostics(params => {
            void this.webviewPanel?.api.gotServerNotification(method, params);
        });
        return h;
    }
    subscribeCustomNotification(client, method) {
        const h = client.customNotification(({ method: thisMethod, params }) => {
            if (thisMethod !== method)
                return;
            void this.webviewPanel?.api.gotServerNotification(method, params);
        });
        return h;
    }
    constructor(clientProvider, context) {
        this.clientProvider = clientProvider;
        this.context = context;
        this.subscriptions = [];
        this.clientSubscriptions = [];
        this.stylesheet = '';
        this.autoOpened = false;
        // Subscriptions are counted and only disposed of when count becomes 0.
        this.serverNotifSubscriptions = new Map();
        this.clientNotifSubscriptions = new Map();
        this.rpcSessions = new Map();
        // the key is the LeanClient.getClientFolder()
        this.clientsFailed = new Map();
        // the key is the uri of the file who's worker has failed.
        this.workersFailed = new Map();
        this.editorApi = {
            saveConfig: async (config) => {
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('allErrorsOnLine', config.allErrorsOnLine, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('autoOpenShowsGoal', config.autoOpenShowsGoal, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('debounceTime', config.debounceTime, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('expectedTypeVisibility', config.expectedTypeVisibility, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('showGoalNames', config.showGoalNames, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('emphasizeFirstGoal', config.emphasizeFirstGoal, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('reverseTacticState', config.reverseTacticState, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('hideTypeAssumptions', config.hideTypeAssumptions, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('hideInstanceAssumptions', config.hideInstanceAssumptions, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('hideInaccessibleAssumptions', config.hideInaccessibleAssumptions, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('hideLetValues', config.hideLetValues, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('showTooltipOnHover', config.showTooltipOnHover, vscode_1.ConfigurationTarget.Global);
                await vscode_1.workspace
                    .getConfiguration('lean4.infoview')
                    .update('messageOrder', config.messageOrder, vscode_1.ConfigurationTarget.Global);
            },
            sendClientRequest: async (uri, method, params) => {
                const extUri = (0, exturi_1.parseExtUri)(uri);
                if (extUri === undefined) {
                    throw Error(`Unexpected URI scheme: ${vscode_1.Uri.parse(uri).scheme}`);
                }
                const client = this.clientProvider.findClient(extUri);
                if (client) {
                    try {
                        const result = await client.sendRequest(method, params);
                        return result;
                    }
                    catch (ex) {
                        if (ex.code === infoview_api_1.RpcErrorCode.WorkerCrashed) {
                            // ex codes related with worker exited or crashed
                            logger_1.logger.log(`[InfoProvider]The Lean Server has stopped processing this file: ${ex.message}`);
                            await this.onWorkerStopped(uri, client, {
                                message: 'The Lean Server has stopped processing this file: ',
                                reason: ex.message,
                            });
                        }
                        throw ex;
                    }
                }
                throw Error('No active Lean client.');
            },
            sendClientNotification: async (uri, method, params) => {
                const extUri = (0, exturi_1.parseExtUri)(uri);
                if (extUri === undefined) {
                    return;
                }
                const client = this.clientProvider.findClient(extUri);
                if (client) {
                    await client.sendNotification(method, params);
                }
            },
            subscribeServerNotifications: async (method) => {
                const el = this.serverNotifSubscriptions.get(method);
                if (el) {
                    const [count, h] = el;
                    this.serverNotifSubscriptions.set(method, [count + 1, h]);
                    return;
                }
                // NOTE(WN): For non-custom notifications we cannot call LanguageClient.onNotification
                // here because that *overwrites* the notification handler rather than registers an extra one.
                // So we have to add a bunch of event emitters to `LeanClient.`
                if (method === 'textDocument/publishDiagnostics') {
                    const subscriptions = [];
                    for (const client of this.clientProvider.getClients()) {
                        subscriptions.push(this.subscribeDiagnosticsNotification(client, method));
                    }
                    this.serverNotifSubscriptions.set(method, [1, subscriptions]);
                }
                else if (method.startsWith('$')) {
                    const subscriptions = [];
                    for (const client of this.clientProvider.getClients()) {
                        subscriptions.push(this.subscribeCustomNotification(client, method));
                    }
                    this.serverNotifSubscriptions.set(method, [1, subscriptions]);
                }
                else {
                    throw new Error(`subscription to ${method} server notifications not implemented`);
                }
            },
            unsubscribeServerNotifications: async (method) => {
                const el = this.serverNotifSubscriptions.get(method);
                if (!el)
                    throw new Error(`trying to unsubscribe from '${method}' with no active subscriptions`);
                const [count, subscriptions] = el;
                if (count === 1) {
                    for (const h of subscriptions) {
                        h.dispose();
                    }
                    this.serverNotifSubscriptions.delete(method);
                }
                else {
                    this.serverNotifSubscriptions.set(method, [count - 1, subscriptions]);
                }
            },
            subscribeClientNotifications: async (method) => {
                const el = this.clientNotifSubscriptions.get(method);
                if (el) {
                    const [count, d] = el;
                    this.clientNotifSubscriptions.set(method, [count + 1, d]);
                    return;
                }
                if (method === 'textDocument/didChange') {
                    const subscriptions = [];
                    for (const client of this.clientProvider.getClients()) {
                        subscriptions.push(this.subscribeDidChangeNotification(client, method));
                    }
                    this.clientNotifSubscriptions.set(method, [1, subscriptions]);
                }
                else if (method === 'textDocument/didClose') {
                    const subscriptions = [];
                    for (const client of this.clientProvider.getClients()) {
                        subscriptions.push(this.subscribeDidCloseNotification(client, method));
                    }
                    this.clientNotifSubscriptions.set(method, [1, subscriptions]);
                }
                else {
                    throw new Error(`Subscription to '${method}' client notifications not implemented`);
                }
            },
            unsubscribeClientNotifications: async (method) => {
                const el = this.clientNotifSubscriptions.get(method);
                if (!el)
                    throw new Error(`trying to unsubscribe from '${method}' with no active subscriptions`);
                const [count, subscriptions] = el;
                if (count === 1) {
                    for (const d of subscriptions) {
                        d.dispose();
                    }
                    this.clientNotifSubscriptions.delete(method);
                }
                else {
                    this.clientNotifSubscriptions.set(method, [count - 1, subscriptions]);
                }
            },
            copyToClipboard: async (text) => {
                await vscode_1.env.clipboard.writeText(text);
                (0, notifs_1.displayNotification)('Information', `Copied to clipboard: ${text}`);
            },
            insertText: async (text, kind, tdpp) => {
                let uri;
                let pos;
                if (tdpp) {
                    uri = (0, exturi_1.toExtUri)(converters_1.p2cConverter.asUri(tdpp.textDocument.uri));
                    if (uri === undefined) {
                        return;
                    }
                    pos = converters_1.p2cConverter.asPosition(tdpp.position);
                }
                await this.handleInsertText(text, kind, uri, pos);
            },
            applyEdit: async (e) => {
                const we = await converters_1.p2cConverter.asWorkspaceEdit(e);
                await vscode_1.workspace.applyEdit(we);
            },
            showDocument: async (show) => {
                const uri = (0, exturi_1.parseExtUri)(show.uri);
                if (uri === undefined) {
                    return;
                }
                void this.revealEditorSelection(uri, converters_1.p2cConverter.asRange(show.selection));
            },
            restartFile: async (uri) => {
                const extUri = (0, exturi_1.parseExtUri)(uri);
                if (extUri === undefined) {
                    return;
                }
                this.clientProvider.restartFile(extUri);
            },
            createRpcSession: async (uri) => {
                const extUri = (0, exturi_1.parseExtUri)(uri);
                if (extUri === undefined) {
                    throw Error(`Unexpected URI scheme: ${vscode_1.Uri.parse(uri).scheme}`);
                }
                const client = this.clientProvider.findClient(extUri);
                if (client === undefined) {
                    throw Error('No active Lean client.');
                }
                const sessionId = await rpcConnect(client, uri);
                const session = new RpcSessionAtPos(client, sessionId, uri);
                if (!this.webviewPanel) {
                    session.dispose();
                    throw Error('InfoView disconnected while connecting to RPC session.');
                }
                else {
                    this.rpcSessions.set(sessionId, session);
                    return sessionId;
                }
            },
            closeRpcSession: async (sessionId) => {
                const session = this.rpcSessions.get(sessionId);
                if (session) {
                    this.rpcSessions.delete(sessionId);
                    session.dispose();
                }
            },
        };
        this.updateStylesheet();
        clientProvider.clientAdded(client => {
            void this.onClientAdded(client);
        });
        clientProvider.clientRemoved(client => {
            void this.onClientRemoved(client);
        });
        clientProvider.clientStopped(([client, activeClient, reason]) => {
            void this.onActiveClientStopped(client, activeClient, reason);
        });
        this.subscriptions.push(leanEditorProvider_1.lean.onDidChangeActiveLeanEditor(() => this.sendPosition()), leanEditorProvider_1.lean.onDidChangeLeanEditorSelection(() => this.sendPosition()), vscode_1.workspace.onDidChangeConfiguration(async (_e) => {
            // regression; changing the style needs a reload. :/
            this.updateStylesheet();
            await this.sendConfig();
        }), leanEditorProvider_1.lean.onDidChangeLeanDocument(() => this.sendPosition()), leanEditorProvider_1.lean.registerLeanEditorCommand('lean4.displayGoal', leanEditor => this.openPreview(leanEditor)), vscode_1.commands.registerCommand('lean4.toggleInfoview', () => this.toggleInfoview()), leanEditorProvider_1.lean.registerLeanEditorCommand('lean4.displayList', async (leanEditor) => {
            await this.openPreview(leanEditor);
            await this.webviewPanel?.api.requestedAction({ kind: 'toggleAllMessages' });
        }), leanEditorProvider_1.lean.registerLeanEditorCommand('lean4.infoView.copyToComment', () => this.webviewPanel?.api.requestedAction({ kind: 'copyToComment' })), vscode_1.commands.registerCommand('lean4.infoView.toggleUpdating', () => this.webviewPanel?.api.requestedAction({ kind: 'togglePaused' })), vscode_1.commands.registerCommand('lean4.infoView.toggleExpectedType', () => this.webviewPanel?.api.requestedAction({ kind: 'toggleExpectedType' })), leanEditorProvider_1.lean.registerLeanEditorCommand('lean4.infoView.toggleStickyPosition', () => this.webviewPanel?.api.requestedAction({ kind: 'togglePin' })), vscode_1.commands.registerCommand('lean4.infoview.goToDefinition', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'goToDefinition', id: args.interactiveCodeTagId })), vscode_1.commands.registerCommand('lean4.infoview.select', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'select', id: args.selectableLocationId })), vscode_1.commands.registerCommand('lean4.infoview.unselect', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'unselect', id: args.unselectableLocationId })), vscode_1.commands.registerCommand('lean4.infoview.unselectAll', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'unselectAll', id: args.selectedLocationsId })), vscode_1.commands.registerCommand('lean4.infoview.pause', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'pause', id: args.pauseId })), vscode_1.commands.registerCommand('lean4.infoview.unpause', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'unpause', id: args.unpauseId })), vscode_1.commands.registerCommand('lean4.infoview.pin', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'pin', id: args.pinId })), vscode_1.commands.registerCommand('lean4.infoview.unpin', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'unpin', id: args.unpinId })), vscode_1.commands.registerCommand('lean4.infoview.refresh', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'refresh', id: args.refreshId })), vscode_1.commands.registerCommand('lean4.infoview.pauseAllMessages', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'pauseAllMessages',
            id: args.pauseAllMessagesId,
        })), vscode_1.commands.registerCommand('lean4.infoview.unpauseAllMessages', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'unpauseAllMessages',
            id: args.unpauseAllMessagesId,
        })), vscode_1.commands.registerCommand('lean4.infoview.copyState', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'copyState',
            id: args.copyStateId,
        })), vscode_1.commands.registerCommand('lean4.infoview.copyMessage', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'copyMessage',
            id: args.copyMessageId,
        })), vscode_1.commands.registerCommand('lean4.infoview.goToPinnedLocation', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'goToPinnedLocation',
            id: args.goToPinnedLocationId,
        })), vscode_1.commands.registerCommand('lean4.infoview.goToMessageLocation', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'goToMessageLocation',
            id: args.goToMessageLocationId,
        })), vscode_1.commands.registerCommand('lean4.infoview.hideTraceSearch', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'hideTraceSearch',
            id: args.hideTraceSearchId,
        })), vscode_1.commands.registerCommand('lean4.infoview.showTraceSearch', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'showTraceSearch',
            id: args.showTraceSearchId,
        })), vscode_1.commands.registerCommand('lean4.infoview.displayTargetBeforeAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'displayTargetBeforeAssumptions',
            id: args.displayTargetBeforeAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.displayAssumptionsBeforeTarget', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'displayAssumptionsBeforeTarget',
            id: args.displayAssumptionsBeforeTargetId,
        })), vscode_1.commands.registerCommand('lean4.infoview.hideTypeAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'hideTypeAssumptions',
            id: args.hideTypeAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.showTypeAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'showTypeAssumptions',
            id: args.showTypeAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.hideInstanceAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'hideInstanceAssumptions',
            id: args.hideInstanceAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.showInstanceAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'showInstanceAssumptions',
            id: args.showInstanceAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.hideInaccessibleAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'hideInaccessibleAssumptions',
            id: args.hideInaccessibleAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.showInaccessibleAssumptions', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'showInaccessibleAssumptions',
            id: args.showInaccessibleAssumptionsId,
        })), vscode_1.commands.registerCommand('lean4.infoview.hideLetValues', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'hideLetValues', id: args.hideLetValuesId })), vscode_1.commands.registerCommand('lean4.infoview.showLetValues', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'showLetValues', id: args.showLetValuesId })), vscode_1.commands.registerCommand('lean4.infoview.hideGoalNames', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'hideGoalNames',
            id: args.hideGoalNamesId,
        })), vscode_1.commands.registerCommand('lean4.infoview.showGoalNames', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'showGoalNames',
            id: args.showGoalNamesId,
        })), vscode_1.commands.registerCommand('lean4.infoview.emphasizeFirstGoal', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'emphasizeFirstGoal',
            id: args.emphasizeFirstGoalId,
        })), vscode_1.commands.registerCommand('lean4.infoview.deemphasizeFirstGoal', args => this.webviewPanel?.api.clickedContextMenu({
            entry: 'deemphasizeFirstGoal',
            id: args.deemphasizeFirstGoalId,
        })), vscode_1.commands.registerCommand('lean4.infoview.saveSettings', args => this.webviewPanel?.api.clickedContextMenu({ entry: 'saveSettings', id: args.saveSettingsId })));
    }
    async onClientRestarted(client) {
        // if we already have subscriptions for a previous client, we need to also
        // subscribe to the same things on this new client.
        for (const [method, [count, subscriptions]] of this.clientNotifSubscriptions) {
            if (method === 'textDocument/didChange') {
                subscriptions.push(this.subscribeDidChangeNotification(client, method));
            }
            else if (method === 'textDocument/didClose') {
                subscriptions.push(this.subscribeDidCloseNotification(client, method));
            }
        }
        for (const [method, [count, subscriptions]] of this.serverNotifSubscriptions) {
            if (method === 'textDocument/publishDiagnostics') {
                subscriptions.push(this.subscribeDiagnosticsNotification(client, method));
            }
            else if (method.startsWith('$')) {
                subscriptions.push(this.subscribeCustomNotification(client, method));
            }
        }
        await this.webviewPanel?.api.serverStopped(undefined); // clear any server stopped state
        const folderUri = client.getClientFolder();
        for (const worker of this.workersFailed.keys()) {
            const workerUri = (0, exturi_1.parseExtUri)(worker);
            if (workerUri !== undefined && client.isInFolderManagedByThisClient(workerUri)) {
                this.workersFailed.delete(worker);
            }
        }
        if (this.clientsFailed.has(folderUri.toString())) {
            this.clientsFailed.delete(folderUri.toString());
        }
        await this.initInfoView(leanEditorProvider_1.lean.activeLeanEditor, client);
    }
    async onClientAdded(client) {
        logger_1.logger.log(`[InfoProvider] Adding client for workspace: ${client.getClientFolder()}`);
        this.clientSubscriptions.push(client.restarted(async () => {
            logger_1.logger.log('[InfoProvider] got client restarted event');
            // This event is triggered both the first time the server starts
            // as well as when the server restarts.
            this.clearRpcSessions(client);
            // Need to fully re-initialize this newly restarted client with all the
            // existing subscriptions and resend position info and so on so the
            // infoview updates properly.
            await this.onClientRestarted(client);
        }), client.restartedWorker(async (uri) => {
            logger_1.logger.log('[InfoProvider] got worker restarted event');
            await this.onWorkerRestarted(uri);
        }), client.didSetLanguage(() => this.onLanguageChanged()));
        // Note that when new client is first created it still fires client.restarted
        // event, so all onClientRestarted can happen there so we don't do it twice.
    }
    async onWorkerRestarted(uri) {
        await this.webviewPanel?.api.serverStopped(undefined); // clear any server stopped state
        if (this.workersFailed.has(uri)) {
            this.workersFailed.delete(uri);
            logger_1.logger.log('[InfoProvider] Restarting worker for file: ' + uri);
        }
        await this.sendPosition();
    }
    async onWorkerStopped(uri, client, reason) {
        await this.webviewPanel?.api.serverStopped(reason);
        const extUri = (0, exturi_1.parseExtUri)(uri);
        if (extUri === undefined) {
            return;
        }
        if (!this.workersFailed.has(uri)) {
            this.workersFailed.set(uri, reason);
        }
        logger_1.logger.log(`[InfoProvider]client crashed: ${uri}`);
        client.showRestartMessage(true, extUri);
    }
    onClientRemoved(client) {
        // todo: remove subscriptions for this client...
    }
    async onActiveClientStopped(client, activeClient, reason) {
        // Will show a message in case the active client stops
        // add failed client into a list (will be removed in case the client is restarted)
        if (activeClient) {
            // means that client and active client are the same and just show the error message
            await this.webviewPanel?.api.serverStopped(reason);
        }
        logger_1.logger.log(`[InfoProvider] client stopped: ${client.getClientFolder()}`);
        // remember this client is in a stopped state
        const key = client.getClientFolder();
        await this.sendPosition();
        if (!this.clientsFailed.has(key.toString())) {
            this.clientsFailed.set(key.toString(), reason);
        }
        logger_1.logger.log(`[InfoProvider] client stopped: ${key}`);
        client.showRestartMessage();
    }
    dispose() {
        // active client is changing.
        this.clearNotificationHandlers();
        this.clearRpcSessions(null);
        this.webviewPanel?.dispose();
        for (const s of this.clientSubscriptions) {
            s.dispose();
        }
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
    isOpen() {
        return this.webviewPanel?.visible === true;
    }
    async runTestScript(javaScript) {
        if (this.webviewPanel) {
            return this.webviewPanel.api.runTestScript(javaScript);
        }
        else {
            throw new Error('Cannot run test script, infoview is closed.');
        }
    }
    async getHtmlContents() {
        if (this.webviewPanel) {
            return this.webviewPanel.api.getInfoviewHtml();
        }
        else {
            throw new Error('Cannot retrieve infoview HTML, infoview is closed.');
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async toggleAllMessages() {
        if (this.webviewPanel) {
            await this.webviewPanel.api.requestedAction({ kind: 'toggleAllMessages' });
        }
    }
    updateStylesheet() {
        // Here we add extra CSS variables which depend on the editor configuration,
        // but are not exposed by default.
        // Ref: https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
        const extraCSS = `
            html {
                --vscode-editor-line-height: ${(0, config_1.getEditorLineHeight)()}px;
            }
        `;
        const configCSS = (0, config_1.getInfoViewStyle)();
        this.stylesheet = extraCSS + configCSS;
    }
    async autoOpen() {
        if (!this.webviewPanel && !this.autoOpened && (0, config_1.getInfoViewAutoOpen)() && leanEditorProvider_1.lean.activeLeanEditor !== undefined) {
            // remember we've auto opened during this session so if user closes it it remains closed.
            this.autoOpened = true;
            return await this.openPreview(leanEditorProvider_1.lean.activeLeanEditor);
        }
        return false;
    }
    clearNotificationHandlers() {
        for (const [, [, subscriptions]] of this.clientNotifSubscriptions)
            for (const h of subscriptions)
                h.dispose();
        this.clientNotifSubscriptions.clear();
        for (const [, [, subscriptions]] of this.serverNotifSubscriptions)
            for (const h of subscriptions)
                h.dispose();
        this.serverNotifSubscriptions.clear();
    }
    clearRpcSessions(client) {
        const remaining = new Map();
        for (const [sessionId, sess] of this.rpcSessions) {
            if (client === null || sess.client === client) {
                sess.dispose();
            }
            else {
                remaining.set(sessionId, sess);
            }
        }
        this.rpcSessions = remaining;
    }
    async toggleInfoview() {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
            // the onDispose handler sets this.webviewPanel = undefined
        }
        else if (leanEditorProvider_1.lean.activeLeanEditor !== undefined) {
            await this.openPreview(leanEditorProvider_1.lean.activeLeanEditor);
        }
        else {
            (0, notifs_1.displayNotification)('Error', 'No active Lean editor tab. Make sure to focus the Lean editor tab for which you wish to open the infoview.');
        }
    }
    async openPreview(leanEditor) {
        if (this.webviewPanel) {
            this.webviewPanel.reveal(undefined, true);
        }
        else {
            const webviewPanel = vscode_1.window.createWebviewPanel('lean4_infoview', 'Lean InfoView', { viewColumn: (0, viewColumn_1.viewColumnOfInfoView)(), preserveFocus: true }, {
                enableFindWidget: true,
                retainContextWhenHidden: true,
                enableScripts: true,
                enableCommandUris: true,
            });
            // Note that an extension can send data to its webviews using webview.postMessage().
            // This method sends any JSON serializable data to the webview. The message is received
            // inside the webview through the standard message event.
            // The receiving of these messages is done inside webview\index.ts where it
            // calls window.addEventListener('message',...
            webviewPanel.rpc = new rpc_1.Rpc(m => {
                try {
                    void webviewPanel.webview.postMessage(m);
                }
                catch (e) {
                    // ignore any disposed object exceptions
                }
            });
            webviewPanel.rpc.register(this.editorApi);
            // Similarly, we can received data from the webview by listening to onDidReceiveMessage.
            webviewPanel.webview.onDidReceiveMessage(m => {
                try {
                    webviewPanel.rpc.messageReceived(m);
                }
                catch {
                    // ignore any disposed object exceptions
                }
            });
            webviewPanel.api = webviewPanel.rpc.getApi();
            webviewPanel.onDidDispose(() => {
                this.webviewPanel = undefined;
                this.clearNotificationHandlers();
                this.clearRpcSessions(null); // should be after `webviewPanel = undefined`
            });
            this.webviewPanel = webviewPanel;
            webviewPanel.webview.html = this.initialHtml();
            const client = this.clientProvider.findClient(leanEditor.documentExtUri);
            await this.initInfoView(leanEditor, client);
        }
        return true;
    }
    async initInfoView(leanEditor, client) {
        if (leanEditor !== undefined) {
            const loc = this.getLocation(leanEditor);
            if (loc) {
                await this.webviewPanel?.api.initialize(loc);
            }
        }
        // The infoview gets information about file progress, diagnostics, etc.
        // by listening to notifications.  Send these notifications when the infoview starts
        // so that it has up-to-date information.
        if (client?.initializeResult) {
            logger_1.logger.log('[InfoProvider] initInfoView!');
            await this.sendConfig();
            await this.webviewPanel?.api.serverStopped(undefined); // clear any server stopped state
            await this.webviewPanel?.api.serverRestarted(client.initializeResult);
            await this.sendDiagnostics(client);
            await this.sendProgress(client);
            await this.sendPosition();
        }
        else if (client === undefined) {
            logger_1.logger.log('[InfoProvider] initInfoView got null client.');
        }
        else {
            logger_1.logger.log('[InfoProvider] initInfoView got undefined client.initializeResult');
        }
    }
    async sendConfig() {
        await this.webviewPanel?.api.changedInfoviewConfig({
            allErrorsOnLine: (0, config_1.getInfoViewAllErrorsOnLine)(),
            autoOpenShowsGoal: (0, config_1.getInfoViewAutoOpenShowsGoal)(),
            debounceTime: (0, config_1.getInfoViewDebounceTime)(),
            expectedTypeVisibility: (0, config_1.getInfoViewExpectedTypeVisibility)(),
            showGoalNames: (0, config_1.getInfoViewShowGoalNames)(),
            emphasizeFirstGoal: (0, config_1.getInfoViewEmphasizeFirstGoal)(),
            reverseTacticState: (0, config_1.getInfoViewReverseTacticState)(),
            hideTypeAssumptions: (0, config_1.getInfoViewHideTypeAssumptions)(),
            hideInstanceAssumptions: (0, config_1.getInfoViewHideInstanceAssumptions)(),
            hideInaccessibleAssumptions: (0, config_1.getInfoViewHideInaccessibleAssumptions)(),
            hideLetValues: (0, config_1.getInfoViewHideLetValues)(),
            showTooltipOnHover: (0, config_1.getInfoViewShowTooltipOnHover)(),
            messageOrder: (0, config_1.getInfoViewMessageOrder)(),
        });
    }
    static async getDiagnosticParams(uri, diagnostics) {
        const params = {
            uri: converters_1.c2pConverter.asUri(uri),
            diagnostics: await converters_1.c2pConverter.asDiagnostics(diagnostics),
        };
        return params;
    }
    async sendDiagnostics(client) {
        const panel = this.webviewPanel;
        if (panel) {
            client.getDiagnostics()?.forEach(async (uri, diags) => {
                const params = InfoProvider.getDiagnosticParams(uri, diags);
                await panel.api.gotServerNotification('textDocument/publishDiagnostics', params);
            });
        }
    }
    async sendProgress(client) {
        if (!this.webviewPanel)
            return;
        for (const [uri, processing] of client.progress) {
            const params = {
                textDocument: {
                    uri: converters_1.c2pConverter.asUri(uri.asUri()),
                    version: 0, // HACK: The infoview ignores this
                },
                processing,
            };
            await this.webviewPanel.api.gotServerNotification('$/lean/fileProgress', params);
        }
    }
    onLanguageChanged() {
        this.autoOpen()
            .then(async () => {
            await this.sendConfig();
            await this.sendPosition();
        })
            .catch(() => { });
    }
    getLocation(leanEditor) {
        const selection = leanEditor.editor.selection;
        return {
            uri: leanEditor.documentExtUri.toString(),
            range: {
                start: selection.start,
                end: selection.end,
            },
        };
    }
    async sendPosition() {
        const editor = leanEditorProvider_1.lean.activeLeanEditor;
        if (editor === undefined) {
            return;
        }
        const loc = this.getLocation(editor);
        const uri = editor.documentExtUri;
        if (this.clientsFailed.size > 0 || this.workersFailed.size > 0) {
            const client = this.clientProvider.findClient(uri);
            const uriKey = uri.toString();
            if (client) {
                const folder = client.getClientFolder().toString();
                let reason;
                if (this.clientsFailed.has(folder)) {
                    reason = this.clientsFailed.get(folder);
                }
                else if (this.workersFailed.has(uriKey)) {
                    reason = this.workersFailed.get(uriKey);
                }
                if (reason) {
                    // send stopped event
                    await this.webviewPanel?.api.serverStopped(reason);
                }
                else {
                    await this.updateStatus(loc);
                }
            }
            else {
                logger_1.logger.log('[InfoProvider] ### what does it mean to have sendPosition but no LeanClient for this document???');
            }
        }
        else {
            await this.updateStatus(loc);
        }
    }
    async updateStatus(loc) {
        await this.webviewPanel?.api.serverStopped(undefined); // clear any server stopped state
        await this.autoOpen();
        await this.webviewPanel?.api.changedCursorLocation(loc);
    }
    async revealEditorSelection(uri, selection) {
        let editor = leanEditorProvider_1.lean.getVisibleLeanEditorsByUri(uri).at(0)?.editor;
        if (editor === undefined) {
            editor = await vscode_1.window.showTextDocument(uri.asUri(), {
                viewColumn: (0, viewColumn_1.viewColumnOfActiveTextEditor)(),
                preserveFocus: false,
            });
        }
        if (selection !== undefined) {
            editor.revealRange(selection, vscode_1.TextEditorRevealType.InCenterIfOutsideViewport);
            editor.selection = new vscode_1.Selection(selection.start, selection.end);
            // ensure the text document has the keyboard focus.
            await vscode_1.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
        }
    }
    async handleInsertText(text, kind, uri, pos) {
        let leanEditor;
        if (uri) {
            leanEditor = leanEditorProvider_1.lean.getVisibleLeanEditorsByUri(uri).at(0);
        }
        else {
            leanEditor = leanEditorProvider_1.lean.activeLeanEditor;
        }
        if (leanEditor === undefined) {
            return;
        }
        const editor = leanEditor.editor;
        pos = pos ? pos : editor.selection.active;
        if (kind === 'above') {
            // in this case, assume that we actually want to insert at the same
            // indentation level as the neighboring text
            const current_line = editor.document.lineAt(pos.line);
            const spaces = current_line.firstNonWhitespaceCharacterIndex;
            const margin_str = [...Array(spaces).keys()].map(x => ' ').join('');
            let new_command = text.replace(/\n/g, '\n' + margin_str);
            new_command = `${margin_str}${new_command}\n`;
            const insertPosition = current_line.range.start;
            await editor.edit(builder => {
                builder.insert(insertPosition, new_command);
            });
        }
        else {
            await editor.edit(builder => {
                if (pos)
                    builder.insert(pos, text);
            });
            editor.selection = new vscode_1.Selection(pos, pos);
        }
        // ensure the text document has the keyboard focus.
        await vscode_1.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: false });
    }
    getLocalPath(path) {
        if (this.webviewPanel) {
            return this.webviewPanel.webview.asWebviewUri(vscode_1.Uri.file((0, path_1.join)(this.context.extensionPath, path))).toString();
        }
        return undefined;
    }
    initialHtml() {
        const libPostfix = `.${config_1.prodOrDev}${config_1.minIfProd}.js`;
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-type" content="text/html;charset=utf-8">
                <title>Infoview</title>
                <style>${this.stylesheet}</style>
                <link rel="stylesheet" href="${this.getLocalPath('dist/lean4-infoview/index.css')}">
            </head>
            <body>
                <div id="react_root"></div>
                <script
                    data-importmap-leanprover-infoview="${this.getLocalPath(`dist/lean4-infoview/index${libPostfix}`)}"
                    data-importmap-react="${this.getLocalPath(`dist/lean4-infoview/react${libPostfix}`)}"
                    data-importmap-react-jsx-runtime="${this.getLocalPath(`dist/lean4-infoview/react-jsx-runtime${libPostfix}`)}"
                    data-importmap-react-dom="${this.getLocalPath(`dist/lean4-infoview/react-dom${libPostfix}`)}"
                    src="${this.getLocalPath('dist/webview.js')}"></script>
            </body>
            </html>`;
    }
}
exports.InfoProvider = InfoProvider;
//# sourceMappingURL=infoview.js.map