"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UntitledUri = exports.FileUri = void 0;
exports.isInWorkspaceFolder = isInWorkspaceFolder;
exports.isWorkspaceFolder = isWorkspaceFolder;
exports.isExtUri = isExtUri;
exports.toExtUri = toExtUri;
exports.toExtUriOrError = toExtUriOrError;
exports.parseExtUri = parseExtUri;
exports.parseExtUriOrError = parseExtUriOrError;
exports.extUriEquals = extUriEquals;
exports.extUriToCwdUri = extUriToCwdUri;
const path_1 = require("path");
const vscode_1 = require("vscode");
const fsHelper_1 = require("./fsHelper");
function unsupportedSchemeError(uri) {
    return new Error(`Got URI with unsupported scheme '${uri.scheme}': '${uri}'`);
}
class FileUri {
    constructor(fsPath) {
        this.scheme = 'file';
        this.fsPath = fsPath;
    }
    static fromUri(uri) {
        if (uri.scheme !== 'file') {
            return undefined;
        }
        return new FileUri(uri.fsPath);
    }
    static fromUriOrError(uri) {
        const fileUri = FileUri.fromUri(uri);
        if (fileUri === undefined) {
            throw unsupportedSchemeError(uri);
        }
        return fileUri;
    }
    asUri() {
        return vscode_1.Uri.file(this.fsPath);
    }
    equals(other) {
        return this.fsPath === other.fsPath;
    }
    equalsUri(other) {
        const otherFileUri = FileUri.fromUri(other);
        if (otherFileUri === undefined) {
            return false;
        }
        return this.equals(otherFileUri);
    }
    toString() {
        return this.asUri().toString();
    }
    baseName() {
        return path_1.default.basename(this.fsPath);
    }
    join(...pathSegments) {
        return FileUri.fromUriOrError(vscode_1.Uri.joinPath(this.asUri(), ...pathSegments));
    }
    isInFolder(folderUri) {
        return (0, fsHelper_1.isFileInFolder)(this.fsPath, folderUri.fsPath);
    }
    relativeTo(folderUri) {
        const relativePath = (0, fsHelper_1.relativeFilePathInFolder)(this.fsPath, folderUri.fsPath);
        if (relativePath === undefined) {
            return undefined;
        }
        return new FileUri(relativePath);
    }
}
exports.FileUri = FileUri;
function isInWorkspaceFolder(uri) {
    return vscode_1.workspace.getWorkspaceFolder(uri.asUri()) !== undefined;
}
function isWorkspaceFolder(uri) {
    if (vscode_1.workspace.workspaceFolders === undefined) {
        return false;
    }
    return vscode_1.workspace.workspaceFolders.some(folder => uri.equalsUri(folder.uri));
}
class UntitledUri {
    constructor(path) {
        this.scheme = 'untitled';
        this.path = path ?? '';
    }
    static fromUri(uri) {
        if (uri.scheme !== 'untitled') {
            return undefined;
        }
        return new UntitledUri(uri.path);
    }
    static fromUriOrError(uri) {
        const untitledUri = UntitledUri.fromUri(uri);
        if (untitledUri === undefined) {
            throw unsupportedSchemeError(uri);
        }
        return untitledUri;
    }
    asUri() {
        return vscode_1.Uri.from({ scheme: 'untitled', path: this.path });
    }
    equals(other) {
        return this.path === other.path;
    }
    equalsUri(other) {
        const otherFileUri = UntitledUri.fromUri(other);
        if (otherFileUri === undefined) {
            return false;
        }
        return this.equals(otherFileUri);
    }
    toString() {
        return this.asUri().toString();
    }
}
exports.UntitledUri = UntitledUri;
function isExtUri(uri) {
    return uri.scheme === 'untitled' || uri.scheme === 'file';
}
function toExtUri(uri) {
    if (uri.scheme === 'untitled') {
        return new UntitledUri(uri.path);
    }
    if (uri.scheme === 'file') {
        return new FileUri(uri.fsPath);
    }
    return undefined;
}
function toExtUriOrError(uri) {
    const result = toExtUri(uri);
    if (result === undefined) {
        throw unsupportedSchemeError(uri);
    }
    return result;
}
function parseExtUri(uriString) {
    return toExtUri(vscode_1.Uri.parse(uriString));
}
function parseExtUriOrError(uriString) {
    return toExtUriOrError(vscode_1.Uri.parse(uriString));
}
function extUriEquals(a, b) {
    if (a.scheme === 'untitled' && b.scheme === 'untitled') {
        return a.equals(b);
    }
    if (a.scheme === 'file' && b.scheme === 'file') {
        return a.equals(b);
    }
    return false;
}
function extUriToCwdUri(uri) {
    if (uri.scheme === 'untitled') {
        return undefined;
    }
    return uri;
}
//# sourceMappingURL=exturi.js.map