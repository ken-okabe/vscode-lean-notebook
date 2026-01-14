"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const fs = require("fs");
const mocha_1 = require("mocha");
const path = require("path");
const vscode = require("vscode");
const logger_1 = require("../../../src/utils/logger");
const helpers_1 = require("../utils/helpers");
(0, mocha_1.suite)('Tests', () => {
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..', '..');
    const testCaseLocation = path.join(extensionDevelopmentPath, 'test', 'test-fixtures', 'lakefileTomlSchemaTestCases');
    const validLakefilesDirectory = path.join(testCaseLocation, 'valid');
    const invalidLakefilesDirectory = path.join(testCaseLocation, 'invalid');
    for (const testFileName of fs.readdirSync(invalidLakefilesDirectory)) {
        const testFileLocation = path.join(invalidLakefilesDirectory, testFileName);
        test(testFileName, async () => {
            logger_1.logger.log(`=================== Ensure ${testFileName} is rejected ===================`);
            (0, assert_1.default)(vscode.workspace.workspaceFolders !== undefined, 'No workspace folder is opened');
            (0, assert_1.default)(vscode.workspace.workspaceFolders.length === 1, 'Exactly one workspace folder should be opened ');
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            logger_1.logger.log(`Found workspace folder at ${workspaceFolder}`);
            const lakefilePath = path.join(workspaceFolder, 'lakefile.toml');
            (0, assert_1.default)(fs.existsSync(testFileLocation), `Test case location does not exist: ${testFileLocation}`);
            fs.copyFileSync(testFileLocation, lakefilePath);
            const document = await vscode.workspace.openTextDocument(lakefilePath);
            await vscode.window.showTextDocument(document);
            await (0, helpers_1.waitForActiveExtension)('tamasfe.even-better-toml');
            // Wait for 5 seconds for diagnostics to appear
            await (0, helpers_1.sleep)(5 * 1000);
            const diagnostics = vscode.languages.getDiagnostics().flatMap(([, diagnostic]) => diagnostic);
            const errorDiagnostics = diagnostics.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error && diagnostic.source === 'Even Better TOML');
            (0, assert_1.default)(errorDiagnostics.length > 0, 'Expected at least one error diagnostic for invalid lakefile.toml');
        });
    }
    for (const testFileName of fs.readdirSync(validLakefilesDirectory)) {
        const testFileLocation = path.join(validLakefilesDirectory, testFileName);
        test(testFileName, async () => {
            logger_1.logger.log(`=================== Ensure ${testFileName} is accepted ===================`);
            (0, assert_1.default)(vscode.workspace.workspaceFolders !== undefined, 'No workspace folder is opened');
            (0, assert_1.default)(vscode.workspace.workspaceFolders.length === 1, 'Exactly one workspace folder should be opened ');
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            logger_1.logger.log(`Found workspace folder at ${workspaceFolder}`);
            const lakefilePath = path.join(workspaceFolder, 'lakefile.toml');
            (0, assert_1.default)(fs.existsSync(testFileLocation), `Test case location does not exist: ${testFileLocation}`);
            fs.copyFileSync(testFileLocation, lakefilePath);
            const document = await vscode.workspace.openTextDocument(lakefilePath);
            await vscode.window.showTextDocument(document);
            await (0, helpers_1.waitForActiveExtension)('tamasfe.even-better-toml');
            // Wait for 5 seconds for diagnostics to appear
            await (0, helpers_1.sleep)(5 * 1000);
            const diagnostics = vscode.languages.getDiagnostics().flatMap(([, diagnostic]) => diagnostic);
            const errorDiagnostics = diagnostics.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error && diagnostic.source === 'Even Better TOML');
            (0, assert_1.default)(errorDiagnostics.length === 0, 'Expected no error diagnostics for valid lakefile.toml');
        });
    }
});
//# sourceMappingURL=lakefileTomlSchema.test.js.map