"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCoreLean4Directory = isCoreLean4Directory;
exports.leanToolchainUri = leanToolchainUri;
exports.lakefileTomlUri = lakefileTomlUri;
exports.lakefileLeanUri = lakefileLeanUri;
exports.findLeanProjectRootInfo = findLeanProjectRootInfo;
exports.findLeanProjectInfo = findLeanProjectInfo;
exports.isValidLeanProject = isValidLeanProject;
exports.checkParentFoldersForLeanProject = checkParentFoldersForLeanProject;
exports.willUseLakeServer = willUseLakeServer;
const fs = require("fs");
const path_1 = require("path");
const exturi_1 = require("./exturi");
const fsHelper_1 = require("./fsHelper");
// Detect lean4 root directory (works for both lean4 repo and nightly distribution)
async function isCoreLean4Directory(path) {
    const licensePath = path.join('LICENSE').fsPath;
    const licensesPath = path.join('LICENSES').fsPath;
    const srcPath = path.join('src').fsPath;
    const isCoreLean4RootDirectory = (await (0, fsHelper_1.fileExists)(licensePath)) && (await (0, fsHelper_1.fileExists)(licensesPath)) && (await (0, fsHelper_1.dirExists)(srcPath));
    if (isCoreLean4RootDirectory) {
        return true;
    }
    const initPath = path.join('Init.lean').fsPath;
    const leanPath = path.join('Lean.lean').fsPath;
    const kernelPath = path.join('kernel').fsPath;
    const runtimePath = path.join('runtime').fsPath;
    const isCoreLean4SrcDirectory = (await (0, fsHelper_1.fileExists)(initPath)) &&
        (await (0, fsHelper_1.fileExists)(leanPath)) &&
        (await (0, fsHelper_1.dirExists)(kernelPath)) &&
        (await (0, fsHelper_1.dirExists)(runtimePath));
    return isCoreLean4SrcDirectory;
}
function leanToolchainUri(projectUri) {
    return projectUri.join('lean-toolchain');
}
function lakefileTomlUri(projectUri) {
    return projectUri.join('lakefile.toml');
}
function lakefileLeanUri(projectUri) {
    return projectUri.join('lakefile.lean');
}
// Find the root of a Lean project and the Uri for the 'lean-toolchain' file found there.
async function findLeanProjectRootInfo(uri) {
    if (uri.scheme === 'untitled') {
        return { kind: 'Success', projectRootUri: new exturi_1.UntitledUri(), toolchainUri: undefined };
    }
    let path = uri;
    try {
        if ((await fs.promises.stat(path.fsPath)).isFile()) {
            path = uri.join('..');
        }
    }
    catch (e) {
        return { kind: 'FileNotFound' };
    }
    let bestFolder = path;
    let bestLeanToolchain;
    while (true) {
        const leanToolchain = leanToolchainUri(path);
        const lakefileLean = lakefileLeanUri(path);
        const lakefileToml = lakefileTomlUri(path);
        if (await (0, fsHelper_1.fileExists)(leanToolchain.fsPath)) {
            bestFolder = path;
            bestLeanToolchain = leanToolchain;
        }
        else if (await isCoreLean4Directory(path)) {
            bestFolder = path;
            bestLeanToolchain = undefined;
            // Stop searching in case users accidentally created a lean-toolchain file above the core directory
            break;
        }
        else if (await (0, fsHelper_1.fileExists)(lakefileLean.fsPath)) {
            return { kind: 'LakefileWithoutToolchain', projectRootUri: path, lakefileUri: lakefileLean };
        }
        else if (await (0, fsHelper_1.fileExists)(lakefileToml.fsPath)) {
            return { kind: 'LakefileWithoutToolchain', projectRootUri: path, lakefileUri: lakefileToml };
        }
        if ((0, exturi_1.isWorkspaceFolder)(path)) {
            if (bestLeanToolchain === undefined) {
                // If we haven't found a toolchain yet, prefer the workspace folder as the project scope for the file,
                // but keep looking in case there is a lean-toolchain above the workspace folder
                // (New users sometimes accidentally open sub-folders of projects)
                bestFolder = path;
            }
            else {
                // Stop looking above the barrier if we have a toolchain. This is necessary for the nested lean-toolchain setup of core.
                break;
            }
        }
        const parent = path.join('..');
        if (parent.equals(path)) {
            // no project file found.
            break;
        }
        path = parent;
    }
    return { kind: 'Success', projectRootUri: bestFolder, toolchainUri: bestLeanToolchain };
}
async function findLeanProjectInfo(uri) {
    const info = await findLeanProjectRootInfo(uri);
    switch (info.kind) {
        case 'Success':
            let toolchainInfo;
            if (info.toolchainUri !== undefined) {
                toolchainInfo = { uri: info.toolchainUri, toolchain: await readLeanToolchainFile(info.toolchainUri) };
            }
            return { kind: 'Success', projectRootUri: info.projectRootUri, toolchainInfo };
        case 'FileNotFound':
            return info;
        case 'LakefileWithoutToolchain':
            return info;
    }
}
async function readLeanToolchainFile(toolchainFileUri) {
    try {
        return (await fs.promises.readFile(toolchainFileUri.fsPath, { encoding: 'utf-8' })).trim();
    }
    catch {
        return undefined;
    }
}
async function isValidLeanProject(projectFolder) {
    try {
        const leanToolchainPath = leanToolchainUri(projectFolder).fsPath;
        const isLeanProject = await (0, fsHelper_1.fileExists)(leanToolchainPath);
        const isLeanItself = await isCoreLean4Directory(projectFolder);
        return isLeanProject || isLeanItself;
    }
    catch {
        return false;
    }
}
async function checkParentFoldersForLeanProject(folder) {
    let childFolder;
    do {
        childFolder = folder;
        folder = new exturi_1.FileUri(path_1.default.dirname(folder.fsPath));
        if (await isValidLeanProject(folder)) {
            return folder;
        }
    } while (!childFolder.equals(folder));
    return undefined;
}
async function willUseLakeServer(folder) {
    if (folder.scheme !== 'file') {
        return false;
    }
    const lakefileLean = lakefileLeanUri(folder);
    const lakefileToml = lakefileTomlUri(folder);
    return (await (0, fsHelper_1.fileExists)(lakefileLean.fsPath)) || (await (0, fsHelper_1.fileExists)(lakefileToml.fsPath));
}
//# sourceMappingURL=projectInfo.js.map