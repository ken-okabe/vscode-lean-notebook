"use strict";
/**
 * For LSP communication, we need a way to translate between LSP types and corresponding VSCode types.
 * By default this translation is provided as a bunch of methods on a `LanguageClient`, but this is
 * awkward to use in multi-client workspaces wherein we need to look up specific clients. In fact the
 * conversions are *not* stateful, so having them depend on the client is unnecessary. Instead, we
 * provide global converters here.
 *
 * Some of the conversions are patched to support extended Lean-specific structures.
 *
 * @module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.c2pConverter = exports.p2cConverter = exports.LeanTag = void 0;
exports.setDependencyBuildMode = setDependencyBuildMode;
exports.patchConverters = patchConverters;
const code = require("vscode");
const codeConverter_1 = require("vscode-languageclient/lib/common/codeConverter");
const protocolConverter_1 = require("vscode-languageclient/lib/common/protocolConverter");
const async = require("vscode-languageclient/lib/common/utils/async");
const ls = require("vscode-languageserver-protocol");
const config_1 = require("../config");
var LeanTag;
(function (LeanTag) {
    LeanTag[LeanTag["UnsolvedGoals"] = 1] = "UnsolvedGoals";
    LeanTag[LeanTag["GoalsAccomplished"] = 2] = "GoalsAccomplished";
})(LeanTag || (exports.LeanTag = LeanTag = {}));
var SnippetTextEdit;
(function (SnippetTextEdit) {
    function is(value) {
        if (!ls.TextEdit.is(value))
            return false;
        if (!('leanExtSnippet' in value))
            return false;
        const snip = value.leanExtSnippet;
        if (snip === null || typeof snip !== 'object')
            return false;
        if (!('value' in snip))
            return false;
        if (typeof snip.value !== 'string' && !(snip.value instanceof String))
            return false;
        return true;
    }
    SnippetTextEdit.is = is;
})(SnippetTextEdit || (SnippetTextEdit = {}));
function setDependencyBuildMode(params, dependencyBuildMode) {
    const updatedParams = params;
    updatedParams.dependencyBuildMode = (0, config_1.automaticallyBuildDependencies)() ? 'always' : dependencyBuildMode;
    return updatedParams;
}
exports.p2cConverter = (0, protocolConverter_1.createConverter)(undefined, true, true);
exports.c2pConverter = (0, codeConverter_1.createConverter)(undefined);
function patchConverters(p2cConverter, c2pConverter) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldP2cAsDiagnostic = p2cConverter.asDiagnostic;
    p2cConverter.asDiagnostic = function (protDiag) {
        if (!protDiag.message) {
            // Fixes: Notification handler 'textDocument/publishDiagnostics' failed with message: message must be set
            protDiag.message = ' ';
        }
        const diag = oldP2cAsDiagnostic.apply(this, [protDiag]);
        diag.fullRange = p2cConverter.asRange(protDiag.fullRange);
        diag.leanTags = protDiag.leanTags;
        diag.isSilent = protDiag.isSilent;
        return diag;
    };
    // The original definition refers to `asDiagnostic` as a local function
    // rather than as a member of `Protocol2CodeConverter`,
    // so we need to overwrite it, too.
    p2cConverter.asDiagnostics = async (diags, token) => async.map(diags, d => p2cConverter.asDiagnostic(d), token);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldC2pAsDiagnostic = c2pConverter.asDiagnostic;
    c2pConverter.asDiagnostic = function (diag) {
        const protDiag = oldC2pAsDiagnostic.apply(this, [diag]);
        protDiag.fullRange = c2pConverter.asRange(diag.fullRange);
        protDiag.leanTags = diag.leanTags;
        protDiag.isSilent = diag.isSilent;
        return protDiag;
    };
    c2pConverter.asDiagnostics = async (diags, token) => async.map(diags, d => c2pConverter.asDiagnostic(d), token);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldC2pAsOpenTextDocumentParams = c2pConverter.asOpenTextDocumentParams;
    c2pConverter.asOpenTextDocumentParams = doc => {
        const params = oldC2pAsOpenTextDocumentParams.apply(this, [doc]);
        return setDependencyBuildMode(params, 'never');
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldP2CAsWorkspaceEdit = p2cConverter.asWorkspaceEdit;
    p2cConverter.asWorkspaceEdit = async function (item, token) {
        if (item === undefined || item === null)
            return undefined;
        if (item.documentChanges) {
            // 1. Preprocess `documentChanges` by filtering out snippet edits
            // which we support as a Lean-specific extension.
            // 2. Create a `WorkspaceEdit` using the default function
            // which does not take snippet edits into account.
            // 3. Append the snippet edits.
            // Note that this may permute the relative ordering of snippet edits and text edits,
            // so users cannot rely on it;
            // but a mix of both doesn't seem to work in VSCode anyway as of 1.84.2.
            const snippetChanges = [];
            const documentChanges = await async.map(item.documentChanges, change => {
                if (!ls.TextDocumentEdit.is(change))
                    return true;
                const uri = code.Uri.parse(change.textDocument.uri);
                const snippetEdits = [];
                const edits = change.edits.filter(edit => {
                    if (!SnippetTextEdit.is(edit))
                        return true;
                    const range = p2cConverter.asRange(edit.range);
                    snippetEdits.push(new code.SnippetTextEdit(range, new code.SnippetString(edit.leanExtSnippet.value)));
                    return false;
                });
                snippetChanges.push([uri, snippetEdits]);
                return { ...change, edits };
            }, token);
            const newItem = { ...item, documentChanges };
            const result = await oldP2CAsWorkspaceEdit.apply(this, [newItem, token]);
            for (const [uri, snippetEdits] of snippetChanges)
                result.set(uri, snippetEdits);
            return result;
        }
        return oldP2CAsWorkspaceEdit.apply(this, [item, token]);
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldP2cAsCodeAction = p2cConverter.asCodeAction;
    p2cConverter.asCodeAction = async function (item, token) {
        if (item === undefined || item === null)
            return undefined;
        if (item.edit || item.diagnostics) {
            const result = await oldP2cAsCodeAction.apply(this, [item, token]);
            if (item.diagnostics !== undefined)
                result.diagnostics = await p2cConverter.asDiagnostics(item.diagnostics, token);
            if (item.edit)
                result.edit = await p2cConverter.asWorkspaceEdit(item.edit, token);
        }
        return oldP2cAsCodeAction.apply(this, [item, token]);
    };
    // Note: as of 2023-12-10, there is no c2pConverter.asWorkspaceEdit.
    // This is possibly because code.WorkspaceEdit supports features
    // that cannot be encoded in ls.WorkspaceEdit.
}
patchConverters(exports.p2cConverter, exports.c2pConverter);
//# sourceMappingURL=converters.js.map