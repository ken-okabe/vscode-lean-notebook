"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileExists = fileExists;
exports.dirExists = dirExists;
exports.isFileInFolder = isFileInFolder;
exports.relativeFilePathInFolder = relativeFilePathInFolder;
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Returns true if `pathFile` exists and is a file
 */
async function fileExists(pathFile) {
    try {
        return (await fs_1.promises.stat(pathFile)).isFile();
    }
    catch (e) {
        return false;
    }
}
/**
 * Returns true if `pathFile` exists and is a directory
 */
async function dirExists(pathFile) {
    try {
        return (await fs_1.promises.stat(pathFile)).isDirectory();
    }
    catch (e) {
        return false;
    }
}
/**
 * This helper function is used to check if an specific file is in certain Folder.
 * @param file string that contains a file name that will be checked if it exists in a certain folder.
 * @param folder string that contains a folder name where it will check if a certain file exists
 * @returns a boolean that says if the file exists in folder
 */
function isFileInFolder(file, folder) {
    const relative = path_1.default.relative(folder, file);
    const isSubdir = relative.length > 0 && !relative.startsWith('..') && !path_1.default.isAbsolute(relative);
    return isSubdir;
}
/** Computes the relative file path of `file` in `folder`. Returns `undefined` if `file` is not in `folder`. */
function relativeFilePathInFolder(file, folder) {
    if (!isFileInFolder(file, folder)) {
        return undefined;
    }
    return path_1.default.relative(folder, file);
}
//# sourceMappingURL=fsHelper.js.map