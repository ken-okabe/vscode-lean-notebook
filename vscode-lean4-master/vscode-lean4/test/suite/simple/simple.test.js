"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const mocha_1 = require("mocha");
const path = require("path");
const vscode = require("vscode");
const elan_1 = require("../../../src/utils/elan");
const logger_1 = require("../../../src/utils/logger");
const notifs_1 = require("../../../src/utils/notifs");
const helpers_1 = require("../utils/helpers");
(0, mocha_1.suite)('Lean4 Basics Test Suite', () => {
    test('Untitled Lean File', async () => {
        logger_1.logger.log('=================== Untitled Lean File ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        const features = await (0, helpers_1.initLean4Untitled)('#eval Lean.versionString');
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, '4.0.0-nightly-');
        // test goto definition to lean toolchain works
        await (0, helpers_1.waitForActiveEditor)();
        let editor = vscode.window.activeTextEditor;
        (0, assert_1.default)(editor !== undefined, 'no active editor');
        await (0, helpers_1.gotoDefinition)(editor, 'versionString');
        // check infoview is working in this new editor, it should be showing the expected type
        // for the versionString function we just jumped to.
        const html = await (0, helpers_1.waitForInfoviewHtml)(info, 'Expected type');
        editor = vscode.window.activeTextEditor;
        (0, assert_1.default)(editor !== undefined, 'no active editor');
        const actual = editor.document.uri.fsPath.replaceAll('\\', '/');
        const expected = /\.elan\/toolchains\/.*\/src\/lean/;
        if (!expected.test(actual)) {
            console.log('Path does not match');
        }
        (0, assert_1.default)(expected.test(actual), `Active text editor is not located in ${expected}`);
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
    test('Orphaned Lean File', async () => {
        logger_1.logger.log('=================== Orphaned Lean File ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        const testsRoot = path.join(__dirname, '..', '..', '..', '..', 'test', 'test-fixtures', 'orphan');
        const features = await (0, helpers_1.initLean4)(path.join(testsRoot, 'factorial.lean'));
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        const expectedVersion = '5040'; // the factorial function works.
        const html = await (0, helpers_1.waitForInfoviewHtmlAt)('#eval factorial 7', info, expectedVersion);
        const installer = features.leanInstaller;
        (0, assert_1.default)(installer, 'No LeanInstaller export');
        const defaultToolchainResult = await (0, elan_1.elanInstalledToolchains)();
        if (defaultToolchainResult.kind === 'Success' && defaultToolchainResult.defaultToolchain !== undefined) {
            let defaultToolchain = defaultToolchainResult.defaultToolchain;
            // the IO.appPath should output something like this:
            // FilePath.mk "/home/.elan/toolchains/leanprover--lean4---nightly/bin/lean.exe"
            // So let's try and find the 'leanprover--lean4---nightly' part.
            defaultToolchain = defaultToolchain.replace('/', '--');
            defaultToolchain = defaultToolchain.replace(':', '---');
            // make sure this string exists in the info view.
            await (0, helpers_1.waitForInfoviewHtmlAt)('#eval IO.appPath', info, defaultToolchain);
        }
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
    test('Goto definition in a package folder', async () => {
        logger_1.logger.log('=================== Goto definition in a package folder ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        // Test we can load file in a project folder from a package folder and also
        // have goto definition work showing that the LeanClient is correctly
        // running in the package root.
        // This test is run twice, once as an ad-hoc mode (no folder open)
        // and again using "open folder" mode.
        const testsRoot = path.join(__dirname, '..', '..', '..', '..', 'test', 'test-fixtures', 'simple');
        const features = await (0, helpers_1.initLean4)(path.join(testsRoot, 'Main.lean'));
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        let expectedVersion = 'Hello:';
        let html = await (0, helpers_1.waitForInfoviewHtmlAt)('#eval main', info, expectedVersion);
        const versionString = (0, helpers_1.extractPhrase)(html, 'Hello:', '<').trim();
        logger_1.logger.log(`>>> Found "${versionString}" in infoview`);
        const editor = await (0, helpers_1.waitForActiveEditor)();
        await (0, helpers_1.gotoDefinition)(editor, 'getLeanVersion');
        // if goto definition worked, then we are in Version.lean and we should see the Lake version string.
        expectedVersion = 'Lake Version:';
        html = await (0, helpers_1.waitForInfoviewHtmlAt)('#eval s!"Lake', info, expectedVersion);
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
}).timeout(60000);
//# sourceMappingURL=simple.test.js.map