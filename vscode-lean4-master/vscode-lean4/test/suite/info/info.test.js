"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const mocha_1 = require("mocha");
const vscode = require("vscode");
const logger_1 = require("../../../src/utils/logger");
const helpers_1 = require("../utils/helpers");
(0, mocha_1.suite)('InfoView Test Suite', () => {
    test('Pinning and unpinning', async () => {
        logger_1.logger.log('=================== Pinning and unpinning ===================');
        const a = 23;
        const b = 95;
        const c = 77;
        const d = 7;
        const evalLine1 = `#eval ${a}*${b}`;
        const features = await (0, helpers_1.initLean4Untitled)(evalLine1);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        const expectedEval1 = (a * b).toString();
        await (0, helpers_1.assertStringInInfoview)(info, expectedEval1);
        logger_1.logger.log('Pin this info');
        await (0, helpers_1.clickInfoViewButton)(info, 'toggle-pinned');
        logger_1.logger.log('Insert another couple lines and another eval');
        const evalLine2 = `#eval ${c}*${d}`;
        await (0, helpers_1.insertTextAfter)(evalLine1, `\n\n/- add another unpinned eval -/\n${evalLine2}`);
        logger_1.logger.log('wait for the new expression to appear');
        const expectedEval2 = (c * d).toString();
        await (0, helpers_1.assertStringInInfoviewAt)(evalLine2, info, expectedEval2);
        logger_1.logger.log('make sure pinned expression is still there');
        await (0, helpers_1.assertStringInInfoview)(info, expectedEval1);
        logger_1.logger.log('Unpin this info');
        await (0, helpers_1.clickInfoViewButton)(info, 'toggle-pinned');
        logger_1.logger.log('Make sure pinned eval is gone, but unpinned eval remains');
        await (0, helpers_1.waitForInfoviewNotHtml)(info, expectedEval1);
        await (0, helpers_1.assertStringInInfoviewAt)(evalLine2, info, expectedEval2);
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
    test('Pin survives interesting edits', async () => {
        logger_1.logger.log('=================== Pin survives interesting edits ===================');
        const expectedEval = '[1, 2, 3]';
        const features = await (0, helpers_1.initLean4Untitled)('#eval [1, 1+1, 1+1+1] \n');
        const editor = await (0, helpers_1.waitForActiveEditor)();
        const firstLine = editor.document.lineAt(0).range;
        editor.selection = new vscode.Selection(firstLine.end, firstLine.end);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        await (0, helpers_1.waitForInfoviewHtmlAt)('#eval', info, expectedEval, 30, 1000, false);
        logger_1.logger.log('Pin this info');
        await (0, helpers_1.clickInfoViewButton)(info, 'toggle-pinned');
        const firstEval = firstLine.start.with(undefined, 5);
        editor.selection = new vscode.Selection(firstLine.start, firstEval);
        await (0, helpers_1.insertText)('/- add\nsome\nfun\ncomments-/\n#eval List.append [4] ');
        const lastLine = editor.document.lineAt(5).range;
        editor.selection = new vscode.Selection(lastLine.start, lastLine.start);
        logger_1.logger.log('wait for the new expression to appear');
        const expectedEval2 = '[4, 1, 2, 3]';
        await (0, helpers_1.waitForInfoviewHtmlAt)('#eval', info, expectedEval2, 30, 1000, false);
        logger_1.logger.log('make sure pinned expression is not showing an error');
        await (0, helpers_1.waitForInfoviewNotHtml)(info, 'Incorrect position');
        await vscode.commands.executeCommand('undo');
        const newLastLine = editor.document.lineAt(1).range;
        editor.selection = new vscode.Selection(newLastLine.start, newLastLine.start);
        logger_1.logger.log('make sure pinned value reverts after an undo');
        await (0, helpers_1.waitForInfoviewHtmlAt)('#eval', info, expectedEval, 30, 1000, false);
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
    test('Pin survives file close', async () => {
        logger_1.logger.log('=================== Pin survives file close ===================');
        const a = 23;
        const b = 95;
        const prefix = 'Lean version is:';
        const evalLine = `#eval ${a}*${b}`;
        const features = await (0, helpers_1.initLean4Untitled)(evalLine);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        const expectedEval = (a * b).toString();
        await (0, helpers_1.assertStringInInfoviewAt)('#eval', info, expectedEval);
        logger_1.logger.log('Pin this info');
        await (0, helpers_1.clickInfoViewButton)(info, 'toggle-pinned');
        logger_1.logger.log('Insert another eval');
        await (0, helpers_1.insertTextAfter)(evalLine, '\n\n#eval s!"' + prefix + ': {Lean.versionString}"');
        logger_1.logger.log('make sure output of versionString is also there');
        await (0, helpers_1.assertStringInInfoviewAt)('#eval s!', info, prefix);
        logger_1.logger.log('make sure pinned expression is not showing an error');
        await (0, helpers_1.waitForInfoviewNotHtml)(info, 'Incorrect position');
        logger_1.logger.log('and make sure pinned value is still there');
        await (0, helpers_1.assertStringInInfoview)(info, expectedEval);
        logger_1.logger.log('Goto definition on versionString');
        let editor = await (0, helpers_1.waitForActiveEditor)();
        await (0, helpers_1.gotoDefinition)(editor, 'versionString');
        editor = await (0, helpers_1.waitForActiveEditor)('Meta.lean');
        logger_1.logger.log('make sure pinned expression is still there');
        await (0, helpers_1.assertStringInInfoview)(info, expectedEval);
        logger_1.logger.log('Close meta.lean');
        await (0, helpers_1.closeActiveEditor)();
        editor = await (0, helpers_1.waitForActiveEditor)('Untitled-1');
        logger_1.logger.log('make sure pinned expression is still there');
        await (0, helpers_1.assertStringInInfoview)(info, expectedEval);
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
    test('Tooltip exists', async () => {
        logger_1.logger.log('=================== Clicking to open nested tooltips ===================');
        const text = 'example (issue461 : Type 4) : issue461 := by sorry';
        const features = await (0, helpers_1.initLean4Untitled)(text);
        const info = features.infoProvider;
        (0, assert_1.default)(info, 'No InfoProvider export');
        (0, helpers_1.gotoPosition)('by');
        await (0, helpers_1.assertStringInInfoview)(info, 'issue461');
        logger_1.logger.log('Opening tooltip for goal type');
        await info.runTestScript(`
          Array.from(document.querySelectorAll('[data-is-goal] *'))
            .find(el => el.innerHTML === 'issue461')
            .click()
        `);
        await (0, helpers_1.waitForInfoviewHtml)(info, 'tooltip-content', 30, 1000, false);
        logger_1.logger.log('Opening tooltip in tooltip');
        await info.runTestScript(`
          Array.from(document.querySelectorAll('.tooltip-content *[data-has-tooltip-on-hover]'))
            .find(el => el.innerHTML === 'Type 4')
            .click()
        `);
        await (0, helpers_1.assertStringInInfoview)(info, 'Type 5');
        logger_1.logger.log('Opening tooltip in tooltip in tooltip');
        await info.runTestScript(`
          Array.from(document.querySelectorAll('.tooltip-content *[data-has-tooltip-on-hover]'))
            .find(el => el.innerHTML === 'Type 5')
            .click()
        `);
        await (0, helpers_1.assertStringInInfoview)(info, 'Type 6');
        await (0, helpers_1.closeAllEditors)();
    }).timeout(60000);
}).timeout(60000);
//# sourceMappingURL=info.test.js.map