"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.minIfProd = exports.prodOrDev = void 0;
exports.getPowerShellPath = getPowerShellPath;
exports.automaticallyBuildDependencies = automaticallyBuildDependencies;
exports.envPathExtensions = envPathExtensions;
exports.alwaysAskBeforeInstallingLeanVersions = alwaysAskBeforeInstallingLeanVersions;
exports.setAlwaysAskBeforeInstallingLeanVersions = setAlwaysAskBeforeInstallingLeanVersions;
exports.serverArgs = serverArgs;
exports.isLoggingEnabled = isLoggingEnabled;
exports.loggingDir = loggingDir;
exports.allowedLoggingMethods = allowedLoggingMethods;
exports.disallowedLoggingMethods = disallowedLoggingMethods;
exports.shouldAutofocusOutput = shouldAutofocusOutput;
exports.getInfoViewStyle = getInfoViewStyle;
exports.getInfoViewAutoOpen = getInfoViewAutoOpen;
exports.getInfoViewAutoOpenShowsGoal = getInfoViewAutoOpenShowsGoal;
exports.getInfoViewAllErrorsOnLine = getInfoViewAllErrorsOnLine;
exports.getInfoViewDebounceTime = getInfoViewDebounceTime;
exports.getInfoViewExpectedTypeVisibility = getInfoViewExpectedTypeVisibility;
exports.getInfoViewShowGoalNames = getInfoViewShowGoalNames;
exports.getInfoViewEmphasizeFirstGoal = getInfoViewEmphasizeFirstGoal;
exports.getInfoViewReverseTacticState = getInfoViewReverseTacticState;
exports.getInfoViewHideTypeAssumptions = getInfoViewHideTypeAssumptions;
exports.getInfoViewHideInstanceAssumptions = getInfoViewHideInstanceAssumptions;
exports.getInfoViewHideInaccessibleAssumptions = getInfoViewHideInaccessibleAssumptions;
exports.getInfoViewHideLetValues = getInfoViewHideLetValues;
exports.getInfoViewShowTooltipOnHover = getInfoViewShowTooltipOnHover;
exports.getInfoViewMessageOrder = getInfoViewMessageOrder;
exports.shouldShowSetupWarnings = shouldShowSetupWarnings;
exports.getFallBackToStringOccurrenceHighlighting = getFallBackToStringOccurrenceHighlighting;
exports.showDiagnosticGutterDecorations = showDiagnosticGutterDecorations;
exports.showUnsolvedGoalsDecoration = showUnsolvedGoalsDecoration;
exports.unsolvedGoalsDecorationLightThemeColor = unsolvedGoalsDecorationLightThemeColor;
exports.unsolvedGoalsDecorationDarkThemeColor = unsolvedGoalsDecorationDarkThemeColor;
exports.goalsAccomplishedDecorationKind = goalsAccomplishedDecorationKind;
exports.decorationEditDelay = decorationEditDelay;
exports.isRunningTest = isRunningTest;
exports.getTestFolder = getTestFolder;
exports.getEditorLineHeight = getEditorLineHeight;
const vscode_1 = require("vscode");
const envPath_1 = require("./utils/envPath");
function processConfigColor(c) {
    if (c.match(/^(#|rgb\(|rgba\(|hsl\(|hsla\()/)) {
        return c;
    }
    return new vscode_1.ThemeColor(c);
}
function getPowerShellPath() {
    const windir = process.env.windir;
    return `${windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}
function automaticallyBuildDependencies() {
    return vscode_1.workspace.getConfiguration('lean4').get('automaticallyBuildDependencies', false);
}
function envPathExtensions() {
    return new envPath_1.PATH(vscode_1.workspace.getConfiguration('lean4').get('envPathExtensions', []));
}
function alwaysAskBeforeInstallingLeanVersions() {
    return vscode_1.workspace.getConfiguration('lean4').get('alwaysAskBeforeInstallingLeanVersions', false);
}
async function setAlwaysAskBeforeInstallingLeanVersions(alwaysAskBeforeInstallingLeanVersions) {
    await vscode_1.workspace
        .getConfiguration('lean4')
        .update('alwaysAskBeforeInstallingLeanVersions', alwaysAskBeforeInstallingLeanVersions, vscode_1.ConfigurationTarget.Global);
}
function serverArgs() {
    return vscode_1.workspace.getConfiguration('lean4').get('serverArgs', []);
}
function isLoggingEnabled() {
    return vscode_1.workspace.getConfiguration('lean4.logging').get('enabled', false);
}
function loggingDir() {
    return vscode_1.workspace.getConfiguration('lean4.logging').get('dir', '.');
}
function allowedLoggingMethods() {
    return vscode_1.workspace
        .getConfiguration('lean4.logging')
        .get('allowedMethods', [
        'textDocument/didOpen',
        'textDocument/didChange',
        'textDocument/didClose',
        'textDocument/didSave',
        'textDocument/hover',
        'textDocument/documentHighlight',
        'completionItem/resolve',
        'codeAction/resolve',
        'textDocument/definition',
        'textDocument/declaration',
        'textDocument/typeDefinition',
        'textDocument/references',
        'textDocument/prepareCallHierarchy',
        'callHierarchy/incomingCalls',
        'callHierarchy/outgoingCalls',
        '$/lean/prepareModuleHierarchy',
        '$/lean/moduleHierarchy/imports',
        '$/lean/moduleHierarchy/importedBy',
        'textDocument/prepareRename',
        'textDocument/rename',
        'workspace/symbol',
        '$/lean/rpc/call',
        'Lean.Widget.getInteractiveDiagnostics',
        'Lean.Widget.getInteractiveGoals',
        'Lean.Widget.getInteractiveTermGoal',
        'Lean.Widget.InteractiveDiagnostics.infoToInteractive',
        'Lean.Widget.getGoToLocation',
        'Lean.Widget.lazyTraceChildrenToInteractive',
        'Lean.Widget.highlightMatches',
    ]);
}
function disallowedLoggingMethods() {
    return vscode_1.workspace.getConfiguration('lean4.logging').get('disallowedMethods', []);
}
function shouldAutofocusOutput() {
    return vscode_1.workspace.getConfiguration('lean4').get('autofocusOutput', false);
}
function getInfoViewStyle() {
    const val = vscode_1.workspace.getConfiguration('lean4.infoview').get('style');
    if (val !== undefined)
        return val;
    // Try deprecated name of the same setting if not found
    return vscode_1.workspace.getConfiguration('lean4').get('infoViewStyle', '');
}
function getInfoViewAutoOpen() {
    const val = vscode_1.workspace.getConfiguration('lean4.infoview').get('autoOpen');
    if (val !== undefined)
        return val;
    return vscode_1.workspace.getConfiguration('lean4').get('infoViewAutoOpen', true);
}
function getInfoViewAutoOpenShowsGoal() {
    const val = vscode_1.workspace.getConfiguration('lean4.infoview').get('autoOpenShowsGoal');
    if (val !== undefined)
        return val;
    return vscode_1.workspace.getConfiguration('lean4').get('infoViewAutoOpenShowGoal', true);
}
function getInfoViewAllErrorsOnLine() {
    const val = vscode_1.workspace.getConfiguration('lean4.infoview').get('allErrorsOnLine');
    if (val !== undefined)
        return val;
    return vscode_1.workspace.getConfiguration('lean4').get('infoViewAllErrorsOnLine', true);
}
function getInfoViewDebounceTime() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('debounceTime', 50);
}
function getInfoViewShowExpectedType() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('showExpectedType', true);
}
function getInfoViewExpectedTypeVisibility() {
    const show = getInfoViewShowExpectedType();
    const visibility = vscode_1.workspace.getConfiguration('lean4.infoview').get('expectedTypeVisibility', 'Expanded by default');
    if (!show && visibility === 'Expanded by default') {
        return 'Collapsed by default';
    }
    return visibility;
}
function getInfoViewShowGoalNames() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('showGoalNames', true);
}
function getInfoViewEmphasizeFirstGoal() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('emphasizeFirstGoal', false);
}
function getInfoViewReverseTacticState() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('reverseTacticState', false);
}
function getInfoViewHideTypeAssumptions() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('hideTypeAssumptions', false);
}
function getInfoViewHideInstanceAssumptions() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('hideInstanceAssumptions', false);
}
function getInfoViewHideInaccessibleAssumptions() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('hideInaccessibleAssumptions', false);
}
function getInfoViewHideLetValues() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('hideLetValues', false);
}
function getInfoViewShowTooltipOnHover() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('showTooltipOnHover', true);
}
function getInfoViewMessageOrder() {
    return vscode_1.workspace.getConfiguration('lean4.infoview').get('messageOrder', 'Sort by proximity to text cursor');
}
function shouldShowSetupWarnings() {
    return vscode_1.workspace.getConfiguration('lean4').get('showSetupWarnings', true);
}
function getFallBackToStringOccurrenceHighlighting() {
    return vscode_1.workspace.getConfiguration('lean4').get('fallBackToStringOccurrenceHighlighting', false);
}
function showDiagnosticGutterDecorations() {
    return vscode_1.workspace.getConfiguration('lean4').get('showDiagnosticGutterDecorations', true);
}
function showUnsolvedGoalsDecoration() {
    return vscode_1.workspace.getConfiguration('lean4').get('showUnsolvedGoalsDecoration', true);
}
function unsolvedGoalsDecorationLightThemeColor() {
    return processConfigColor(vscode_1.workspace.getConfiguration('lean4').get('unsolvedGoalsDecorationLightThemeColor', 'editorInfo.foreground'));
}
function unsolvedGoalsDecorationDarkThemeColor() {
    return processConfigColor(vscode_1.workspace.getConfiguration('lean4').get('unsolvedGoalsDecorationDarkThemeColor', 'editorInfo.foreground'));
}
function goalsAccomplishedDecorationKind() {
    return vscode_1.workspace.getConfiguration('lean4').get('goalsAccomplishedDecorationKind', 'Double Checkmark');
}
function decorationEditDelay() {
    return vscode_1.workspace.getConfiguration('lean4').get('decorationEditDelay', 750);
}
function isRunningTest() {
    return typeof process.env.LEAN4_TEST_FOLDER === 'string';
}
function getTestFolder() {
    return typeof process.env.LEAN4_TEST_FOLDER === 'string' ? process.env.LEAN4_TEST_FOLDER : '';
}
/** The editor line height, in pixels. */
function getEditorLineHeight() {
    // The implementation
    // (recommended by Microsoft: https://github.com/microsoft/vscode/issues/125341#issuecomment-854812591)
    // is absolutely cursed. It's just to copy whatever VSCode does internally.
    const fontSize = vscode_1.workspace.getConfiguration('editor').get('fontSize') ?? 0;
    let lineHeight = vscode_1.workspace.getConfiguration('editor').get('lineHeight') ?? 0;
    const GOLDEN_LINE_HEIGHT_RATIO = process.platform === 'darwin' ? 1.5 : 1.35;
    const MINIMUM_LINE_HEIGHT = 8;
    if (lineHeight === 0) {
        lineHeight = GOLDEN_LINE_HEIGHT_RATIO * fontSize;
    }
    else if (lineHeight < MINIMUM_LINE_HEIGHT) {
        // Values too small to be line heights in pixels are in ems.
        lineHeight = lineHeight * fontSize;
    }
    // Enforce integer, minimum constraints
    lineHeight = Math.round(lineHeight);
    if (lineHeight < MINIMUM_LINE_HEIGHT) {
        lineHeight = MINIMUM_LINE_HEIGHT;
    }
    return lineHeight;
}
/**
 * The literal 'production' or 'development', depending on the build.
 * Should be turned into a string literal by build tools.
 */
exports.prodOrDev = process.env.NODE_ENV && process.env.NODE_ENV === 'production' ? 'production' : 'development';
/** The literal '.min' or empty, depending on the build. See {@link prodOrDev}. */
exports.minIfProd = process.env.NODE_ENV && process.env.NODE_ENV === 'production' ? '.min' : '';
//# sourceMappingURL=config.js.map