"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAsManifest = parseAsManifest;
exports.parseManifestInFolder = parseManifestInFolder;
const fs = require("fs");
const semver_1 = require("semver");
const vscode_1 = require("vscode");
const zod_1 = require("zod");
const semverRegex_1 = require("./semverRegex");
function asManifestVersion(versionField) {
    switch (typeof versionField) {
        case 'string':
            return { kind: 'SemVer', version: new semver_1.SemVer(versionField) };
        case 'number':
            return {
                kind: 'LegacyNumberVersion',
                version: versionField,
                versionAsSemVer: new semver_1.SemVer(`0.${versionField}.0`),
            };
    }
}
function parseVersion1To6Manifest(version, parsedJson) {
    const version1To6ManifestSchema = zod_1.z.object({
        name: zod_1.z.optional(zod_1.z.string()),
        packagesDir: zod_1.z.string(),
        packages: zod_1.z.array(zod_1.z.union([
            zod_1.z.object({
                git: zod_1.z.object({
                    name: zod_1.z.string(),
                    url: zod_1.z.string().url(),
                    rev: zod_1.z.string(),
                    inherited: zod_1.z.boolean(),
                    'inputRev?': zod_1.z.optional(zod_1.z.nullable(zod_1.z.string())),
                }),
            }),
            zod_1.z.object({
                path: zod_1.z.any(),
            }),
        ])),
    });
    const result = version1To6ManifestSchema.safeParse(parsedJson);
    if (!result.success) {
        return undefined;
    }
    const manifest = {
        name: result.data.name,
        version,
        packagesDir: result.data.packagesDir,
        directGitDependencies: [],
    };
    for (const pkg of result.data.packages) {
        if (!('git' in pkg)) {
            continue;
        }
        if (pkg.git.inherited) {
            continue; // Inherited Git packages are not direct dependencies
        }
        manifest.directGitDependencies.push({
            name: pkg.git.name,
            uri: vscode_1.Uri.parse(pkg.git.url),
            revision: pkg.git.rev,
            inputRevision: pkg.git['inputRev?'] ?? 'master', // Lake also always falls back to master
        });
    }
    return manifest;
}
function parseVersion7ToNManifest(version, parsedJson) {
    const version7ToNManifestSchema = zod_1.z.object({
        name: zod_1.z.string(),
        packagesDir: zod_1.z.string(),
        packages: zod_1.z.array(zod_1.z.union([
            zod_1.z.object({
                type: zod_1.z.literal('git'),
                name: zod_1.z.string(),
                url: zod_1.z.string().url(),
                rev: zod_1.z.string(),
                inherited: zod_1.z.boolean(),
                inputRev: zod_1.z.optional(zod_1.z.nullable(zod_1.z.string())),
            }),
            zod_1.z.object({
                type: zod_1.z.literal('path'),
            }),
        ])),
    });
    const result = version7ToNManifestSchema.safeParse(parsedJson);
    if (!result.success) {
        return undefined;
    }
    const manifest = {
        name: result.data.name,
        version,
        packagesDir: result.data.packagesDir,
        directGitDependencies: [],
    };
    for (const pkg of result.data.packages) {
        if (pkg.type !== 'git') {
            continue;
        }
        if (pkg.inherited) {
            continue; // Inherited Git packages are not direct dependencies
        }
        manifest.directGitDependencies.push({
            name: pkg.name,
            uri: vscode_1.Uri.parse(pkg.url),
            revision: pkg.rev,
            inputRevision: pkg.inputRev ?? 'master', // Lake also always falls back to master
        });
    }
    return manifest;
}
function parseAsManifest(jsonString) {
    let parsedJson;
    try {
        parsedJson = JSON.parse(jsonString);
    }
    catch (e) {
        return undefined;
    }
    const versionSchema = zod_1.z.object({
        version: zod_1.z.union([zod_1.z.number().int().nonnegative(), zod_1.z.string().regex(semverRegex_1.semVerRegex)]),
    });
    const versionResult = versionSchema.safeParse(parsedJson);
    if (!versionResult.success) {
        return undefined;
    }
    const version = asManifestVersion(versionResult.data.version);
    if (version.kind === 'LegacyNumberVersion') {
        if (version.version <= 6) {
            return parseVersion1To6Manifest(version.versionAsSemVer, parsedJson);
        }
        else {
            return parseVersion7ToNManifest(version.versionAsSemVer, parsedJson);
        }
    }
    return parseVersion7ToNManifest(version.version, parsedJson);
}
async function parseManifestInFolder(folderUri) {
    const manifestPath = folderUri.join('lake-manifest.json').fsPath;
    let jsonString;
    try {
        jsonString = fs.readFileSync(manifestPath, 'utf8');
    }
    catch (e) {
        return `Cannot read 'lake-manifest.json' file at ${manifestPath}.`;
    }
    const manifest = parseAsManifest(jsonString);
    if (!manifest) {
        return `Cannot parse 'lake-manifest.json' file at ${manifestPath}.`;
    }
    return manifest;
}
//# sourceMappingURL=manifest.js.map