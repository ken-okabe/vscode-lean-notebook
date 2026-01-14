"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = sleep;
exports.closeAllEditors = closeAllEditors;
exports.closeActiveEditor = closeActiveEditor;
exports.assertAndLog = assertAndLog;
exports.initLean4 = initLean4;
exports.initLean4WithoutInstallation = initLean4WithoutInstallation;
exports.insertText = insertText;
exports.deleteAllText = deleteAllText;
exports.gotoPosition = gotoPosition;
exports.insertTextAfter = insertTextAfter;
exports.initLean4Untitled = initLean4Untitled;
exports.waitForActiveClientRunning = waitForActiveClientRunning;
exports.waitForActiveClient = waitForActiveClient;
exports.waitForActiveExtension = waitForActiveExtension;
exports.waitForLean4FeatureActivation = waitForLean4FeatureActivation;
exports.assertLean4FeaturesNotLoaded = assertLean4FeaturesNotLoaded;
exports.waitForActiveEditor = waitForActiveEditor;
exports.waitForActiveInfoProvider = waitForActiveInfoProvider;
exports.waitForInfoViewOpen = waitForInfoViewOpen;
exports.cleanTempFolder = cleanTempFolder;
exports.waitForInfoviewLambda = waitForInfoviewLambda;
exports.waitForInfoviewHtml = waitForInfoviewHtml;
exports.waitForInfoviewHtmlAt = waitForInfoviewHtmlAt;
exports.waitForInfoviewNotHtml = waitForInfoviewNotHtml;
exports.extractPhrase = extractPhrase;
exports.findWord = findWord;
exports.gotoDefinition = gotoDefinition;
exports.restartFile = restartFile;
exports.restartLeanServer = restartLeanServer;
exports.assertStringInInfoview = assertStringInInfoview;
exports.assertStringInInfoviewAt = assertStringInInfoviewAt;
exports.clickInfoViewButton = clickInfoViewButton;
exports.mkdirs = mkdirs;
exports.copyFolder = copyFolder;
exports.getTestLeanVersion = getTestLeanVersion;
exports.getAltBuildVersion = getAltBuildVersion;
const assert_1 = require("assert");
const fs = require("fs");
const os = require("os");
const path_1 = require("path");
const vscode = require("vscode");
const logger_1 = require("../../../src/utils/logger");
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function closeAllEditors() {
    return vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
function closeActiveEditor() {
    return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}
function assertAndLog(value, message) {
    if (!value) {
        logger_1.logger.log(message);
    }
    (0, assert_1.default)(value, message);
}
async function initLean4(fileName) {
    await closeAllEditors();
    const options = { preview: false };
    const lean = await waitForActiveExtension('leanprover.lean4', 60);
    assertAndLog(lean, 'Lean extension not loaded');
    assertAndLog(lean.isActive, 'Lean extension is not active');
    assertAndLog(lean.exports !== undefined, 'Lean extension exports not active');
    logger_1.logger.log(`Found lean package version: ${lean.packageJSON.version}`);
    const doc = await vscode.workspace.openTextDocument(fileName);
    await vscode.window.showTextDocument(doc, options);
    await waitForActiveEditor((0, path_1.basename)(fileName));
    const features = await waitForLean4FeatureActivation(lean.exports);
    assertAndLog(await waitForActiveInfoProvider(features), 'Info view provider did not load after 60 seconds');
    const info = features.infoProvider;
    assertAndLog(info, 'No InfoProvider export');
    assertAndLog(await waitForInfoViewOpen(info, 60), 'Info view did not open after 20 seconds');
    return features;
}
async function initLean4WithoutInstallation(fileName) {
    await closeAllEditors();
    const options = { preview: false };
    const lean = await waitForActiveExtension('leanprover.lean4', 60);
    assertAndLog(lean, 'Lean extension not loaded');
    assertAndLog(lean.isActive, 'Lean extension is not active');
    logger_1.logger.log(`Found lean package version: ${lean.packageJSON.version}`);
    const doc = await vscode.workspace.openTextDocument(fileName);
    await vscode.window.showTextDocument(doc, options);
    await waitForActiveEditor((0, path_1.basename)(fileName));
    return lean.exports.alwaysEnabledFeatures;
}
async function insertText(text) {
    const editor = vscode.window.activeTextEditor;
    assertAndLog(editor !== undefined, 'no active editor');
    await editor.edit(builder => {
        builder.delete(editor.selection);
        const cursorPos = editor.selection.end;
        builder.insert(cursorPos, text);
        const endInsert = editor.selection.end;
        editor.selection = new vscode.Selection(endInsert, endInsert);
    });
}
async function deleteAllText() {
    const editor = vscode.window.activeTextEditor;
    assertAndLog(editor !== undefined, 'no active editor');
    await editor.edit(builder => {
        builder.delete(new vscode.Range(new vscode.Position(0, 0), editor.document.lineAt(editor.document.lineCount - 1).range.end));
    });
}
function gotoPosition(searchString, after = false) {
    const editor = vscode.window.activeTextEditor;
    assertAndLog(editor !== undefined, 'no active editor');
    const text = editor.document.getText();
    let offset = text.indexOf(searchString);
    if (after) {
        offset += searchString.length;
    }
    const position = editor.document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
}
async function insertTextAfter(searchString, text) {
    gotoPosition(searchString, true);
    await insertText(text);
}
async function initLean4Untitled(contents) {
    // make sure test is always run in predictable state, which is no file or folder open
    await closeAllEditors();
    await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
    const editor = await waitForActiveEditor();
    // make it a lean4 document even though it is empty and untitled.
    logger_1.logger.log('Setting lean4 language on untitled doc');
    await vscode.languages.setTextDocumentLanguage(editor.document, 'lean4');
    await editor.edit(builder => {
        builder.insert(new vscode.Position(0, 0), contents);
    });
    const lean = await waitForActiveExtension('leanprover.lean4', 60);
    assertAndLog(lean, 'Lean extension not loaded');
    assertAndLog(lean.isActive, 'Lean extension is not active');
    assertAndLog(lean.exports !== undefined, 'Lean extension exports not active');
    logger_1.logger.log(`Found lean package version: ${lean.packageJSON.version}`);
    const features = await waitForLean4FeatureActivation(lean.exports);
    const info = features.infoProvider;
    assertAndLog(info, 'No InfoProvider export');
    // If info view opens too quickly there is no LeanClient ready yet and
    // it's initialization gets messed up.
    assertAndLog(await waitForInfoViewOpen(info, 60), 'Info view did not open after 60 seconds');
    return features;
}
async function waitForActiveClientRunning(clientProvider, retries = 60, delay = 1000, retryHandler = nullHandler) {
    let count = 0;
    let tally = 0;
    assertAndLog(clientProvider, 'missing LeanClientProvider');
    logger_1.logger.log('Waiting for active client to enter running state...');
    while (count < retries) {
        const client = clientProvider.getActiveClient();
        if (client && client.isRunning()) {
            return;
        }
        await sleep(1000);
        tally += 1000;
        if (tally >= delay) {
            count += 1;
            tally = 0;
            if (retryHandler) {
                retryHandler();
            }
        }
    }
    const timeout = (retries * delay) / 1000;
    assertAndLog(false, `active client is not reaching the running state after ${timeout} seconds`);
}
async function waitForActiveClient(clientProvider, retries = 60, delay = 1000) {
    let count = 0;
    assertAndLog(clientProvider, 'missing LeanClientProvider');
    logger_1.logger.log('Waiting for active client ...');
    while (count < retries) {
        const client = clientProvider.getActiveClient();
        if (client) {
            return client;
        }
        await sleep(delay);
        count += 1;
    }
    const timeout = (retries * delay) / 1000;
    assertAndLog(false, `Missing active LeanClient after ${timeout} seconds`);
}
async function waitForActiveExtension(extensionId, retries = 60, delay = 1000) {
    logger_1.logger.log(`Waiting for extension ${extensionId} to be loaded...`);
    let lean;
    let count = 0;
    while (!lean) {
        vscode.extensions.all.forEach(e => {
            if (e.id === extensionId) {
                lean = e;
                logger_1.logger.log(`Found extension: ${extensionId}`);
            }
        });
        if (!lean) {
            count += 1;
            if (count >= retries) {
                return null;
            }
            await sleep(delay);
        }
    }
    logger_1.logger.log(`Waiting for extension ${extensionId} activation...`);
    count = 0;
    while (!lean.isActive && count < retries) {
        await sleep(delay);
        count += 1;
    }
    logger_1.logger.log(`Extension ${extensionId} isActive=${lean.isActive}`);
    return lean;
}
async function waitForLean4FeatureActivation(exports, timeout = 60000) {
    logger_1.logger.log('Waiting for Lean 4 feature exports of extension to be loaded...');
    const timeoutPromise = new Promise((resolve, _) => setTimeout(() => resolve(undefined), timeout));
    const allFeatures = await Promise.race([exports.allFeatures(), timeoutPromise]);
    assertAndLog(allFeatures, 'Lean 4 features did not activate.');
    logger_1.logger.log('Lean 4 feature exports loaded.');
    return allFeatures;
}
async function assertLean4FeaturesNotLoaded(exports) {
    logger_1.logger.log('Waiting for Lean 4 feature exports of extension to be loaded...');
    const allFeatures = await new Promise(async (resolve, _) => {
        setTimeout(() => resolve(undefined), 5000);
        await exports.allFeatures();
    });
    assertAndLog(!allFeatures, 'Lean 4 features activated when they should not have been activated.');
    logger_1.logger.log('Lean 4 features correctly did not load.');
}
async function waitForActiveEditor(filename = '', retries = 60, delay = 1000) {
    let count = 0;
    while (!vscode.window.activeTextEditor && count < retries) {
        await sleep(delay);
        count += 1;
    }
    let editor = vscode.window.activeTextEditor;
    assertAndLog(editor, 'Missing active text editor');
    logger_1.logger.log(`Loaded document ${editor.document.uri}`);
    if (filename) {
        count = 0;
        while (editor &&
            !editor.document.uri.fsPath.toLowerCase().endsWith(filename.toLowerCase()) &&
            count < retries) {
            await sleep(delay);
            count += 1;
            editor = vscode.window.activeTextEditor;
        }
        assertAndLog(editor && editor.document.uri.fsPath.toLowerCase().endsWith(filename.toLowerCase()), `Active text editor does not match ${filename}`);
    }
    return editor;
}
async function waitForActiveInfoProvider(features, retries = 60, delay = 1000) {
    logger_1.logger.log('Waiting for info view provider to be loaded...');
    let count = 0;
    while (!features.infoProvider) {
        count += 1;
        if (count >= retries) {
            logger_1.logger.log('Info view provider did not load.');
            return false;
        }
        await sleep(delay);
    }
    logger_1.logger.log('Info view provider loaded.');
    return true;
}
async function waitForInfoViewOpen(infoView, retries = 60, delay = 1000) {
    let count = 0;
    let opened = false;
    logger_1.logger.log('Waiting for InfoView...');
    while (count < retries) {
        const isOpen = infoView.isOpen();
        if (isOpen) {
            logger_1.logger.log('InfoView is open.');
            return true;
        }
        else if (!opened) {
            opened = true;
            await vscode.commands.executeCommand('lean4.displayGoal');
        }
        await sleep(delay);
        count += 1;
    }
    logger_1.logger.log('InfoView not found.');
    return false;
}
function nullHandler() {
    return;
}
function cleanTempFolder(name) {
    const path = (0, path_1.join)(os.tmpdir(), name);
    if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true });
    }
}
async function waitForInfoviewLambda(infoView, matchString, retries = 60, delay = 1000, expand = true, retryHandler = nullHandler) {
    let count = 0;
    let html = '';
    let tally = 0;
    while (count < retries) {
        html = await infoView.getHtmlContents();
        if (matchString(html)) {
            return html;
        }
        if (expand && html.indexOf('<details>') >= 0) {
            // we want '<details open>' instead...
            await infoView.toggleAllMessages();
        }
        await sleep(1000);
        tally += 1000;
        if (tally >= delay) {
            count += 1;
            tally = 0;
            if (retryHandler) {
                retryHandler();
            }
        }
    }
    return html;
}
async function waitForInfoviewHtml(infoView, toFind, retries = 60, delay = 1000, expand = true, retryHandler = nullHandler) {
    const html = await waitForInfoviewLambda(infoView, s => s.indexOf(toFind) > 0, retries, delay, expand, retryHandler);
    if (html.indexOf(toFind) > 0) {
        return html;
    }
    const timeout = (retries * delay) / 1000;
    logger_1.logger.log('>>> infoview contains:');
    logger_1.logger.log(html);
    logger_1.logger.log('>>> end of infoview contents');
    assertAndLog(false, `Missing "${toFind}" in infoview after ${timeout} seconds`);
}
async function waitForInfoviewHtmlAt(positionSearchString, infoView, toFind, retries = 60, delay = 1000, expand = true, retryHandler = nullHandler) {
    gotoPosition(positionSearchString);
    return await waitForInfoviewHtml(infoView, toFind, retries, delay, expand, retryHandler);
}
async function waitForInfoviewNotHtml(infoView, toFind, retries = 60, delay = 1000, collapse = true) {
    let count = 0;
    let html = '';
    while (count < retries) {
        html = await infoView.getHtmlContents();
        if (html.indexOf(toFind) < 0) {
            return;
        }
        if (collapse && html.indexOf('<details ') >= 0) {
            // we want '<details>' instead...(collapsed)
            await infoView.toggleAllMessages();
        }
        await sleep(delay);
        count += 1;
    }
    const timeout = (retries * delay) / 1000;
    logger_1.logger.log('>>> infoview contains:');
    logger_1.logger.log(html);
    logger_1.logger.log('>>> end of infoview contents');
    assertAndLog(false, `infoview still contains "${toFind}" after ${timeout} seconds`);
}
function extractPhrase(html, word, terminator) {
    const pos = html.indexOf(word);
    if (pos >= 0) {
        let endPos = html.indexOf(terminator, pos);
        const eolPos = html.indexOf('\n', pos);
        if (eolPos > 0 && eolPos < endPos) {
            endPos = eolPos;
        }
        return html.substring(pos, endPos);
    }
    return '';
}
async function findWord(editor, word, retries = 60, delay = 1000) {
    let count = 0;
    while (retries > 0) {
        const text = editor.document.getText();
        const pos = text.indexOf(word);
        if (pos < 0) {
            await sleep(delay);
            count += 1;
        }
        else {
            return new vscode.Range(editor.document.positionAt(pos), editor.document.positionAt(pos + word.length));
        }
    }
    const timeout = (retries * delay) / 1000;
    assertAndLog(false, `word ${word} not found in editor after ${timeout} seconds`);
}
async function gotoDefinition(editor, word, retries = 60, delay = 1000) {
    const wordRange = await findWord(editor, word, retries, delay);
    // The -1 is to workaround a bug in goto definition.
    // The cursor must be placed before the end of the identifier.
    const secondLastChar = new vscode.Position(wordRange.end.line, wordRange.end.character - 1);
    editor.selection = new vscode.Selection(wordRange.start, secondLastChar);
    await vscode.commands.executeCommand('editor.action.revealDefinition');
}
async function restartFile() {
    console.log('restarting file in lean client ...');
    await vscode.commands.executeCommand('lean4.restartFile');
}
async function restartLeanServer(client, retries = 60, delay = 1000) {
    let count = 0;
    logger_1.logger.log('restarting lean client ...');
    const stateChanges = [];
    client.stopped(() => {
        stateChanges.push('stopped');
    });
    client.restarted(() => {
        stateChanges.push('restarted');
    });
    client.serverFailed(() => {
        stateChanges.push('failed');
    });
    await vscode.commands.executeCommand('lean4.restartServer');
    while (count < retries) {
        const index = stateChanges.indexOf('restarted');
        if (index >= 0) {
            break;
        }
        await sleep(delay);
        count += 1;
    }
    const timeout = (retries * delay) / 1000;
    // check we have no errors.
    assertAndLog(stateChanges.length !== 0, `restartServer did not fire any events after ${timeout} seconds`);
    const actual = stateChanges[stateChanges.length - 1];
    const expected = 'restarted';
    assertAndLog(actual === expected, `restartServer did not produce expected result "${actual}" after ${timeout} seconds`);
    return false;
}
async function assertStringInInfoview(infoView, expectedVersion) {
    return await waitForInfoviewHtml(infoView, expectedVersion);
}
async function assertStringInInfoviewAt(positionSearchString, infoView, expectedVersion) {
    return await waitForInfoviewHtmlAt(positionSearchString, infoView, expectedVersion);
}
async function clickInfoViewButton(info, name) {
    await assertStringInInfoview(info, name);
    let retries = 5;
    while (retries > 0) {
        retries--;
        try {
            const cmd = `document.querySelector(\'[data-id*="${name}"]\').click()`;
            await info.runTestScript(cmd);
        }
        catch (err) {
            logger_1.logger.log(`### runTestScript failed: ${err.message}`);
            if (retries === 0) {
                throw err;
            }
            logger_1.logger.log(`### Retrying clickInfoViewButton ${name}...`);
            await sleep(1000);
        }
    }
}
function mkdirs(fullPath) {
    const parts = fullPath.split(path_1.default.sep);
    // on windows the parts[0] is the drive letter, e.g. "c:"
    // on other platforms parts[0] is empty string, but we want to start with '/'
    let newPath = parts[0];
    parts.splice(0, 1);
    if (!newPath) {
        newPath = '/';
    }
    parts.forEach(p => {
        newPath = path_1.default.join(newPath, p);
        if (newPath && !fs.existsSync(newPath)) {
            fs.mkdirSync(newPath);
        }
    });
}
function copyFolder(source, target) {
    if (!fs.existsSync(target)) {
        mkdirs(target);
    }
    const files = fs.readdirSync(source);
    for (const file of files) {
        const sourceFile = path_1.default.join(source, file);
        const targetFile = path_1.default.join(target, file);
        const stats = fs.lstatSync(sourceFile);
        if (stats.isFile()) {
            fs.copyFileSync(sourceFile, targetFile);
        }
        else if (stats.isDirectory()) {
            copyFolder(sourceFile, targetFile);
        }
    }
}
function getTestLeanVersion() {
    return 'nightly-2022-10-26';
}
function getAltBuildVersion() {
    return 'nightly-2022-10-20';
}
//# sourceMappingURL=helpers.js.map