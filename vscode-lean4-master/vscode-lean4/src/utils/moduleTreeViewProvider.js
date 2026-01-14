"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleTreeViewProvider = void 0;
const vscode_1 = require("vscode");
const exturi_1 = require("./exturi");
const leanEditorProvider_1 = require("./leanEditorProvider");
const notifs_1 = require("./notifs");
function nodeModule(n) {
    switch (n.kind) {
        case 'Root':
            return n.module;
        case 'Import':
            return n.import.module;
    }
}
class ModuleTreeViewProvider {
    constructor(clientProvider) {
        this.clientProvider = clientProvider;
        this.subscriptions = [];
        this.onDidChangeTreeDataEmitter = new vscode_1.EventEmitter();
        this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    }
    static async init(clientProvider) {
        const p = new ModuleTreeViewProvider(clientProvider);
        await p.updateMode('Imports');
        p.subscriptions.push(vscode_1.window.registerTreeDataProvider('leanModuleHierarchy', p));
        p.subscriptions.push(vscode_1.commands.registerCommand('lean4.leanModuleHierarchy.showModuleHierarchy', () => p.showModuleHierarchy()), vscode_1.commands.registerCommand('lean4.leanModuleHierarchy.showInverseModuleHierarchy', () => p.showInverseModuleHierarchy()), vscode_1.commands.registerCommand('lean4.leanModuleHierarchy.refresh', () => p.refresh()), vscode_1.commands.registerCommand('lean4.leanModuleHierarchy.showImports', () => p.showImports()), vscode_1.commands.registerCommand('lean4.leanModuleHierarchy.showImportedBy', () => p.showImportedBy()));
        p.view = vscode_1.window.createTreeView('leanModuleHierarchy', {
            treeDataProvider: p,
            showCollapseAll: true,
        });
        p.updateDescription();
        p.subscriptions.push(p.view);
        return p;
    }
    async showModuleHierarchy() {
        await this.show('Imports');
        await this.refreshTree();
    }
    async showInverseModuleHierarchy() {
        await this.show('ImportedBy');
        await this.refreshTree();
    }
    async refresh() {
        await this.refreshRoot();
    }
    async showImports() {
        await this.updateModeWithDescription('Imports');
        await this.refreshRoot();
    }
    async showImportedBy() {
        await this.updateModeWithDescription('ImportedBy');
        await this.refreshRoot();
    }
    async refreshRoot() {
        if (this.currentRoot) {
            this.onDidChangeTreeDataEmitter.fire(this.currentRoot);
            await this.view.reveal(this.currentRoot);
        }
        else {
            await this.refreshTree();
        }
    }
    async refreshTree() {
        const root = await this.computeRoot();
        if (root === undefined) {
            return;
        }
        // Necessary so that the `reveal` below selects the root when the view container of the `leanModuleHierarchy` is not visible.
        // Don't ask me why this makes it work. It's what VS Code's internal tree views do as well.
        await vscode_1.commands.executeCommand('leanModuleHierarchy.focus');
        this.onDidChangeTreeDataEmitter.fire(undefined);
        await this.view.reveal(root);
    }
    async show(mode) {
        await this.updateModeWithDescription(mode);
        await vscode_1.commands.executeCommand('setContext', 'lean4.leanModuleHierarchy.visible', true);
    }
    updateDescription() {
        switch (this.mode) {
            case 'Imports':
                this.view.description = 'Mode: Imports';
                return;
            case 'ImportedBy':
                this.view.description = 'Mode: Imported By';
                return;
        }
    }
    async updateMode(mode) {
        this.mode = mode;
        await vscode_1.commands.executeCommand('setContext', 'lean4.leanModuleHierarchy.mode', mode);
    }
    async updateModeWithDescription(mode) {
        await this.updateMode(mode);
        this.updateDescription();
    }
    getDescription(n) {
        switch (n.kind) {
            case 'Root':
                return undefined;
            case 'Import':
                const k = n.import.kind;
                const keywords = [];
                if (k.isPrivate) {
                    keywords.push('private');
                }
                if (k.isAll) {
                    keywords.push('all');
                }
                if (k.metaKind === 'meta') {
                    keywords.push('meta');
                }
                else if (k.metaKind === 'full') {
                    keywords.push('meta + non-meta');
                }
                if (keywords.length === 0) {
                    return undefined;
                }
                return `[${keywords.join(', ')}]`;
        }
    }
    getTreeItem(n) {
        const module = nodeModule(n);
        const uri = vscode_1.Uri.parse(module.uri);
        const collapsibleState = n.kind === 'Root' ? vscode_1.TreeItemCollapsibleState.Expanded : vscode_1.TreeItemCollapsibleState.Collapsed;
        return {
            label: module.name,
            description: this.getDescription(n),
            resourceUri: uri,
            iconPath: new vscode_1.ThemeIcon('file-code'),
            collapsibleState,
            command: {
                command: 'vscode.open',
                title: 'Open',
                arguments: [uri],
            },
        };
    }
    async getChildren(element) {
        if (element === undefined) {
            const root = await this.computeRoot();
            if (root === undefined) {
                return undefined;
            }
            return [root];
        }
        const elementUri = (0, exturi_1.parseExtUri)(nodeModule(element).uri);
        if (elementUri === undefined) {
            return undefined;
        }
        const client = this.clientProvider.findClient(elementUri);
        if (client === undefined) {
            return undefined;
        }
        switch (this.mode) {
            case 'Imports':
                const importsResult = await client.sendModuleHierarchyImports(nodeModule(element));
                if (importsResult.kind === 'StoppedClient') {
                    return undefined;
                }
                if (importsResult.kind === 'Unsupported') {
                    this.displayUnsupportedModuleHierarchyError();
                    return;
                }
                return importsResult.imports.map(i => ({ kind: 'Import', import: i, parent: element }));
            case 'ImportedBy':
                const importedByResult = await client.sendModuleHierarchyImportedBy(nodeModule(element));
                if (importedByResult.kind === 'StoppedClient') {
                    return undefined;
                }
                if (importedByResult.kind === 'Unsupported') {
                    this.displayUnsupportedModuleHierarchyError();
                    return;
                }
                return importedByResult.imports.map(i => ({ kind: 'Import', import: i, parent: element }));
        }
    }
    async computeRoot() {
        const lastActiveUri = leanEditorProvider_1.lean.lastActiveLeanDocument?.extUri;
        if (lastActiveUri === undefined) {
            return undefined;
        }
        const client = this.clientProvider.findClient(lastActiveUri);
        if (client === undefined) {
            return undefined;
        }
        const r = await client.sendPrepareModuleHierarchy(lastActiveUri);
        if (r.kind === 'StoppedClient') {
            return undefined;
        }
        if (r.kind === 'Unsupported') {
            this.displayUnsupportedModuleHierarchyError();
            return;
        }
        if (r.module === undefined) {
            return undefined;
        }
        const root = { kind: 'Root', module: r.module };
        this.currentRoot = root;
        return root;
    }
    displayUnsupportedModuleHierarchyError() {
        (0, notifs_1.displayNotification)('Error', 'This command is only supported in Lean versions >= v4.22.0.');
    }
    async getParent(element) {
        switch (element.kind) {
            case 'Root':
                return undefined;
            case 'Import':
                return element.parent;
        }
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.ModuleTreeViewProvider = ModuleTreeViewProvider;
//# sourceMappingURL=moduleTreeViewProvider.js.map