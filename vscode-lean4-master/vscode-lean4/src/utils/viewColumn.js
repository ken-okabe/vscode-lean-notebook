"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewColumnOfInfoView = viewColumnOfInfoView;
exports.viewColumnOfActiveTextEditor = viewColumnOfActiveTextEditor;
const vscode_1 = require("vscode");
function viewColumnOfInfoView() {
    for (const tabGroup of vscode_1.window.tabGroups.all) {
        const tab = tabGroup.tabs.find(tab => tab.input instanceof vscode_1.TabInputWebview && tab.input.viewType === 'mainThreadWebview-lean4_infoview');
        if (tab !== undefined) {
            return tabGroup.viewColumn;
        }
    }
    // We do not use `ViewColumn.Beside` here because `ViewColumn.Beside` will never
    // add a tab to a locked tab group.
    // This is especially problematic because locking the tab group of the InfoView
    // is a workaround for https://github.com/microsoft/vscode/issues/212679
    // and using `ViewColumn.Beside` will retain an empty locked tab group when restarting VS Code.
    const activeColumn = vscode_1.window.activeTextEditor?.viewColumn;
    if (activeColumn === undefined) {
        return vscode_1.ViewColumn.Two;
    }
    return activeColumn + 1;
}
function viewColumnOfActiveTextEditor() {
    return vscode_1.window.activeTextEditor?.viewColumn ?? vscode_1.ViewColumn.One;
}
//# sourceMappingURL=viewColumn.js.map