"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const mocha_1 = require("mocha");
const path = require("path");
const vscode = require("vscode");
const exturi_1 = require("../../../src/utils/exturi");
const logger_1 = require("../../../src/utils/logger");
const notifs_1 = require("../../../src/utils/notifs");
const helpers_1 = require("../utils/helpers");
// Expects to be launched with folder: ${workspaceFolder}/vscode-lean4/test/suite/simple
(0, mocha_1.suite)('Lean Server Restart Test Suite', () => {
    test('Worker crashed and client running - Restarting Lean Server', async () => {
        logger_1.logger.log('=================== Test worker crashed and client running - Restarting Lean Server ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        // add normal values to initialize lean4 file
        const hello = 'Hello World';
        const evalLine = `#eval "${hello}"`;
        const features = await (0, helpers_1.initLean4Untitled)(evalLine);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        logger_1.logger.log('make sure language server is up and running.');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, hello);
        const clients = features.clientProvider;
        (0, assert_1.default)(clients, 'No LeanClientProvider export');
        logger_1.logger.log('Insert eval that causes crash.');
        await (0, helpers_1.insertTextAfter)(evalLine, '\n\n#eval (unsafeCast 0 : String)');
        const expectedMessage = 'The Lean Server has stopped processing this file';
        await (0, helpers_1.assertStringInInfoview)(info, expectedMessage);
        logger_1.logger.log('restart the server (without modifying the file, so it should crash again)');
        let client = await (0, helpers_1.waitForActiveClient)(clients);
        await (0, helpers_1.restartLeanServer)(client);
        logger_1.logger.log('Checking that it crashed again.');
        await (0, helpers_1.assertStringInInfoview)(info, expectedMessage);
        logger_1.logger.log('deleting the problematic string closing active editors and restarting the server');
        await (0, helpers_1.deleteAllText)();
        await (0, helpers_1.insertText)(`#eval "${hello}"`);
        logger_1.logger.log('Now invoke the restart server command');
        client = await (0, helpers_1.waitForActiveClient)(clients);
        await (0, helpers_1.restartLeanServer)(client);
        logger_1.logger.log('checking that Hello World comes back after restart');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, hello);
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(120000);
    test('Worker crashed and client running - Restarting File (Refreshing dependencies)', async () => {
        logger_1.logger.log('=================== Test worker crashed and client running (Refreshing dependencies) ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        // add normal values to initialize lean4 file
        const hello = 'Hello World';
        const evalLine = `#eval "${hello}"`;
        const features = await (0, helpers_1.initLean4Untitled)(evalLine);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        logger_1.logger.log('make sure language server is up and running.');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, hello);
        const clients = features.clientProvider;
        (0, assert_1.default)(clients, 'No LeanClientProvider export');
        logger_1.logger.log('Insert eval that causes crash.');
        await (0, helpers_1.insertTextAfter)(evalLine, '\n\n#eval (unsafeCast 0 : String)');
        const expectedMessage = 'The Lean Server has stopped processing this file';
        await (0, helpers_1.assertStringInInfoview)(info, expectedMessage);
        logger_1.logger.log('restart the server (without modifying the file, so it should crash again)');
        let client = await (0, helpers_1.waitForActiveClient)(clients);
        await (0, helpers_1.restartFile)();
        logger_1.logger.log('Checking that it crashed again.');
        await (0, helpers_1.assertStringInInfoview)(info, expectedMessage);
        logger_1.logger.log('deleting the problematic string closing active editors and restarting the server');
        await (0, helpers_1.deleteAllText)();
        await (0, helpers_1.insertText)(`#eval "${hello}"`);
        logger_1.logger.log('Now invoke the restart server command');
        client = await (0, helpers_1.waitForActiveClient)(clients);
        await (0, helpers_1.restartFile)();
        logger_1.logger.log('checking that Hello World comes back after restart');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, hello);
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(120000);
    test('Restart Server', async () => {
        logger_1.logger.log('=================== Test Restart Server ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        // Test we can restart the lean server
        const simpleRoot = path.join(__dirname, '..', '..', '..', '..', 'test', 'test-fixtures', 'simple');
        // run this code twice to ensure that it still works after a Restart Server
        for (let i = 0; i < 2; i++) {
            const features = await (0, helpers_1.initLean4)(path.join(simpleRoot, 'Main.lean'));
            const info = features.infoProvider;
            (0, assert_1.default)(info, 'No InfoProvider export');
            const activeEditor = vscode.window.activeTextEditor;
            (0, assert_1.default)(activeEditor, 'No active text editor');
            const evalLine = '#eval main';
            const startOffset = activeEditor.document.getText().indexOf(evalLine);
            (0, assert_1.default)(startOffset !== -1, 'Cannot find #eval in Main.lean');
            const endOffset = startOffset + evalLine.length;
            const endPos = activeEditor.document.positionAt(endOffset);
            activeEditor.selection = new vscode.Selection(endPos, endPos);
            const expectedVersion = 'Hello:';
            const html = await (0, helpers_1.waitForInfoviewHtml)(info, expectedVersion);
            const versionString = (0, helpers_1.extractPhrase)(html, 'Hello:', '<').trim();
            logger_1.logger.log(`>>> Found "${versionString}" in infoview`);
            logger_1.logger.log('Now invoke the restart server command');
            const clients = features.clientProvider;
            (0, assert_1.default)(clients, 'No LeanClientProvider export');
            const client = clients.getClientForFolder(new exturi_1.FileUri(simpleRoot));
            if (client) {
                await (0, helpers_1.restartLeanServer)(client);
            }
            else {
                (0, assert_1.default)(false, 'No LeanClient found for folder');
            }
            // make sure test is always run in predictable state, which is no file or folder open
            await (0, helpers_1.closeAllEditors)();
        }
    }).timeout(120000);
}).timeout(120000);
//# sourceMappingURL=restarts.test.js.map