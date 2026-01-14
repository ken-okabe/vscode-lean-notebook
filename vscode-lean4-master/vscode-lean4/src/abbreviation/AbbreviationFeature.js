"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbbreviationFeature = void 0;
const unicode_input_1 = require("@leanprover/unicode-input");
const vscode_1 = require("vscode");
const AbbreviationHoverProvider_1 = require("./AbbreviationHoverProvider");
const AbbreviationRewriterFeature_1 = require("./AbbreviationRewriterFeature");
const VSCodeAbbreviationConfig_1 = require("./VSCodeAbbreviationConfig");
class AbbreviationFeature {
    constructor(outputChannel) {
        this.disposables = new Array();
        const config = new VSCodeAbbreviationConfig_1.VSCodeAbbreviationConfig();
        this.disposables.push(config);
        this.abbreviations = new unicode_input_1.AbbreviationProvider(config);
        this.disposables.push(vscode_1.languages.registerHoverProvider(config.languages, new AbbreviationHoverProvider_1.AbbreviationHoverProvider(config, this.abbreviations)), new AbbreviationRewriterFeature_1.AbbreviationRewriterFeature(config, this.abbreviations, outputChannel));
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.AbbreviationFeature = AbbreviationFeature;
//# sourceMappingURL=AbbreviationFeature.js.map