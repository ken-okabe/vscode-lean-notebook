"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeAbbreviationConfig = void 0;
const vscode_1 = require("vscode");
class VSCodeAbbreviationConfig {
    constructor() {
        this.subscriptions = [];
        this.reloadConfig();
        this.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('lean4.input')) {
                this.reloadConfig();
            }
        }));
    }
    reloadConfig() {
        this.inputModeEnabled = vscode_1.workspace.getConfiguration('lean4.input').get('enabled', true);
        this.abbreviationCharacter = vscode_1.workspace.getConfiguration('lean4.input').get('leader', '\\');
        this.languages = vscode_1.workspace.getConfiguration('lean4.input').get('languages', ['lean4']);
        this.customTranslations = vscode_1.workspace.getConfiguration('lean4.input').get('customTranslations', {});
        this.eagerReplacementEnabled = vscode_1.workspace.getConfiguration('lean4.input').get('eagerReplacementEnabled', true);
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.VSCodeAbbreviationConfig = VSCodeAbbreviationConfig;
//# sourceMappingURL=VSCodeAbbreviationConfig.js.map