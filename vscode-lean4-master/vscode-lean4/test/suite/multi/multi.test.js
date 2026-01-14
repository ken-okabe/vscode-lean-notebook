"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const mocha_1 = require("mocha");
const path = require("path");
const vscode = require("vscode");
const logger_1 = require("../../../src/utils/logger");
const notifs_1 = require("../../../src/utils/notifs");
const helpers_1 = require("../utils/helpers");
(0, mocha_1.suite)('Multi-Folder Test Suite', () => {
    test('Load a multi-project workspace', async () => {
        logger_1.logger.log('=================== Load Lean Files in a multi-project workspace ===================');
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        const multiRoot = path.join(__dirname, '..', '..', '..', '..', 'test', 'test-fixtures', 'multi');
        const features = await (0, helpers_1.initLean4)(path.join(multiRoot, 'test', 'Main.lean'));
        // verify we have a nightly build running in this folder.
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval Lean.versionString', info, '4.0.0-nightly-');
        // Now open a file from the other project
        const doc2 = await vscode.workspace.openTextDocument(path.join(multiRoot, 'foo', 'Foo.lean'));
        const version = (0, helpers_1.getAltBuildVersion)();
        const options = { preview: false };
        await vscode.window.showTextDocument(doc2, options);
        logger_1.logger.log(`wait for version ${version} to load...`);
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, version);
        // Now verify we have 2 LeanClients running.
        const clients = features.clientProvider;
        (0, assert_1.default)(clients, 'No LeanClientProvider export');
        const actual = clients.getClients().length;
        (0, assert_1.default)(actual === 2, 'Expected 2 LeanClients to be running, but found ' + actual);
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
}).timeout(60000);
//# sourceMappingURL=multi.test.js.map