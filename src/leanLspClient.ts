import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from 'vscode-languageclient/node';
import type {
    DocumentSymbolParams,
    HoverParams,
    DocumentSymbol,
    Hover,
} from 'vscode-languageserver-protocol';

/**
 * Minimal self-managed Lean LSP client.
 *
 * Root rule: choose the nearest directory (walking upward) that contains
 * `lakefile.lean` or `lakefile.toml`. If none exists, we use the document folder.
 */
export class LeanLspManager {
    private clientsByRoot = new Map<string, LanguageClient>();
    private openedDocsByRoot = new Map<string, Set<string>>();
    private outputChannel = vscode.window.createOutputChannel('LeanNotebook LSP');
    private diagnosticCollection = vscode.languages.createDiagnosticCollection('leannotebook-lsp');

    async getClientForDocument(document: vscode.TextDocument): Promise<LanguageClient> {
        const root = await this.findNearestLakeRoot(document.uri);
        let client = this.clientsByRoot.get(root);
        if (!client) {
            client = await this.startClient(root);
            this.clientsByRoot.set(root, client);
            this.openedDocsByRoot.set(root, new Set());
        }

        await this.ensureDidOpen(client, root, document);
        return client;
    }

    async sendDocumentSymbol(document: vscode.TextDocument): Promise<DocumentSymbol[] | null> {
        const client = await this.getClientForDocument(document);
        const params: DocumentSymbolParams = { textDocument: { uri: document.uri.toString() } };
        const res = await client.sendRequest('textDocument/documentSymbol', params);
        return res as any;
    }

    async sendHover(document: vscode.TextDocument, position: vscode.Position): Promise<Hover | null> {
        const client = await this.getClientForDocument(document);
        const params: HoverParams = {
            textDocument: { uri: document.uri.toString() },
            position: { line: position.line, character: position.character },
        };
        const res = await client.sendRequest('textDocument/hover', params);
        return res as any;
    }

    disposeAll(): void {
        for (const client of this.clientsByRoot.values()) {
            void client.stop();
        }
        this.clientsByRoot.clear();
        this.openedDocsByRoot.clear();
        this.diagnosticCollection.dispose();
    }

    private async startClient(root: string): Promise<LanguageClient> {
        // Prefer running in the nearest Lake project.
        // This requires that `lake` is available in PATH for the user.
        const serverOptions: ServerOptions = {
            command: 'lake',
            args: ['env', 'lean', '--server'],
            options: { cwd: root },
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: 'lean4' }],
            workspaceFolder: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root)),
            // Avoid noisy UI; log to output channel if needed
            outputChannel: this.outputChannel,
            revealOutputChannelOn: 4, // Never
        };

        const client = new LanguageClient(
            `lean-notebook-lsp:${root}`,
            'LeanNotebook Lean LSP',
            serverOptions,
            clientOptions,
        );

        await client.start();

        // Listen for diagnostics from this Lean server and push to VS Code's diagnostic collection.
        // This ensures that #eval results (which Lean sends as Information diagnostics) are available
        // even when the official Lean4 extension is disabled.
        client.onNotification('textDocument/publishDiagnostics', (params: any) => {
            const uri = vscode.Uri.parse(params.uri);
            console.log(`[LeanLspClient] Received ${params.diagnostics.length} diagnostics for ${uri.fsPath}`);
            const diagnostics = params.diagnostics.map((d: any) => {
                const range = new vscode.Range(
                    new vscode.Position(d.range.start.line, d.range.start.character),
                    new vscode.Position(d.range.end.line, d.range.end.character)
                );
                const severity = this.mapSeverity(d.severity);
                const diag = new vscode.Diagnostic(range, d.message, severity);
                if (d.source) diag.source = d.source;
                if (d.code) diag.code = d.code;
                return diag;
            });
            const infoCount = diagnostics.filter((d: vscode.Diagnostic) => d.severity === vscode.DiagnosticSeverity.Information).length;
            console.log(`[LeanLspClient] Pushed ${diagnostics.length} diagnostics (${infoCount} Information) to collection`);
            this.diagnosticCollection.set(uri, diagnostics);
        });

        return client;
    }

    private mapSeverity(lspSeverity: number | undefined): vscode.DiagnosticSeverity {
        // LSP DiagnosticSeverity: 1=Error, 2=Warning, 3=Information, 4=Hint
        switch (lspSeverity) {
            case 1: return vscode.DiagnosticSeverity.Error;
            case 2: return vscode.DiagnosticSeverity.Warning;
            case 3: return vscode.DiagnosticSeverity.Information;
            case 4: return vscode.DiagnosticSeverity.Hint;
            default: return vscode.DiagnosticSeverity.Information;
        }
    }

    private async ensureDidOpen(client: LanguageClient, root: string, document: vscode.TextDocument): Promise<void> {
        const opened = this.openedDocsByRoot.get(root);
        if (!opened) return;

        const uri = document.uri.toString();
        if (opened.has(uri)) return;

        // Explicitly send didOpen so we can immediately request symbols/hover.
        // (LanguageClient will also send didOpen automatically for matching documents,
        // but that timing can be racy when we request immediately.)
        await client.sendNotification('textDocument/didOpen', {
            textDocument: {
                uri,
                languageId: 'lean4',
                version: document.version,
                text: document.getText(),
            },
        });

        opened.add(uri);
    }

    private async findNearestLakeRoot(uri: vscode.Uri): Promise<string> {
        if (uri.scheme !== 'file') {
            // Untitled etc. – just use workspace root if any.
            return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        }

        let dir = path.dirname(uri.fsPath);
        const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;

        while (true) {
            const lakeLean = vscode.Uri.file(path.join(dir, 'lakefile.lean'));
            const lakeToml = vscode.Uri.file(path.join(dir, 'lakefile.toml'));

            const hasLake = await this.exists(lakeLean).then(x => x) || await this.exists(lakeToml).then(x => x);
            if (hasLake) return dir;

            const parent = path.dirname(dir);
            if (parent === dir) break;
            // Stop at workspace root boundary if present
            if (workspaceRoot && dir === workspaceRoot) break;
            dir = parent;
        }

        return path.dirname(uri.fsPath);
    }

    private async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}

export const leanLspManager = new LeanLspManager();
