"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeanTaskGutter = void 0;
const infoview_api_1 = require("@leanprover/infoview-api");
const assert_1 = require("assert");
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const config_1 = require("./config");
const converters_1 = require("./utils/converters");
const exturi_1 = require("./utils/exturi");
const leanEditorProvider_1 = require("./utils/leanEditorProvider");
class LeanFileTaskGutter {
    constructor(uri) {
        this.uri = uri;
        this.editDelayMs = (0, config_1.decorationEditDelay)();
        this.subscriptions = [];
        this.decorationStates = [];
        vscode_1.workspace.onDidChangeTextDocument(e => {
            if (!uri.equalsUri(e.document.uri)) {
                return;
            }
            this.onDidChange();
        }, this.subscriptions);
    }
    onDidChange() {
        clearTimeout(this.editDelayTimeout);
        this.lastEditTimestampMs = Date.now();
    }
    onDidReveal() {
        this.scheduleUpdate([], 100);
    }
    onDidUpdateState(newDecorationStates) {
        this.scheduleUpdate(newDecorationStates, 100);
    }
    clear(clearedDecorationTypes) {
        const clearedDecorationStates = this.decorationStates
            .filter(state => clearedDecorationTypes.find(clearedType => clearedType.key === state.type.key) !== undefined)
            .map(state => ({
            ...state,
            decos: [],
        }));
        this.scheduleUpdate(clearedDecorationStates, 100);
    }
    scheduleUpdate(newDecorationStates, ms) {
        this.updateDecorationStates(newDecorationStates);
        if (this.timeout === undefined) {
            this.timeout = setTimeout(() => {
                this.timeout = undefined;
                this.displayDecorations('Instantaneous');
            }, ms);
        }
        clearTimeout(this.editDelayTimeout);
        const remainingDelayMs = this.lastEditTimestampMs !== undefined
            ? Math.max(ms, this.editDelayMs - (Date.now() - this.lastEditTimestampMs))
            : ms;
        this.editDelayTimeout = setTimeout(() => {
            this.editDelayTimeout = undefined;
            this.displayDecorations('EditDelayed');
        }, remainingDelayMs);
    }
    updateDecorationStates(newDecorationStates) {
        for (const newState of newDecorationStates) {
            const idx = this.decorationStates.findIndex(oldState => oldState.type.key === newState.type.key);
            if (idx === -1) {
                this.decorationStates.push(newState);
            }
            else {
                this.decorationStates[idx] = newState;
            }
        }
        this.decorationStates.sort((a, b) => a.prio - b.prio);
    }
    displayDecorations(kind) {
        for (const leanEditor of leanEditorProvider_1.lean.getVisibleLeanEditorsByUri(this.uri)) {
            for (const state of this.decorationStates) {
                if (state.kind === kind) {
                    leanEditor.editor.setDecorations(state.type, state.decos);
                }
            }
        }
    }
    dispose() {
        clearTimeout(this.timeout);
        clearTimeout(this.editDelayTimeout);
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
function diagRange(d) {
    if (d.severity !== vscode_languageclient_1.DiagnosticSeverity.Error) {
        return d.range;
    }
    if (d.fullRange === undefined) {
        return d.range;
    }
    return d.fullRange;
}
function inclusiveEndLine(r) {
    if (r.start.line === r.end.line) {
        return r.end.line;
    }
    if (r.end.character === 0) {
        return r.end.line - 1;
    }
    return r.end.line;
}
function diagStartKindPrio(kind) {
    switch (kind) {
        case 'Error':
            return 2;
        case 'Warning':
            return 1;
        case 'GoalsAccomplished':
            return 0;
    }
}
function diagStartRangePrio(range) {
    switch (range) {
        case 'SingleLine':
            return 0;
        case 'MultiLine':
            return 1;
    }
}
function mergeDiagStarts(a, b) {
    if (a === 'None') {
        return b;
    }
    if (b === 'None') {
        return a;
    }
    const kind = diagStartKindPrio(a.kind) >= diagStartKindPrio(b.kind) ? a.kind : b.kind;
    const range = diagStartRangePrio(a.range) >= diagStartRangePrio(b.range) ? a.range : b.range;
    return {
        kind,
        range,
    };
}
function mergeDiagnosticGutterDecos(a, b) {
    (0, assert_1.default)(a.line === b.line);
    const line = a.line;
    const diagStart = mergeDiagStarts(a.diagStart, b.diagStart);
    const isPreviousDiagContinue = a.isPreviousDiagContinue || b.isPreviousDiagContinue;
    const isPreviousDiagEnd = a.isPreviousDiagEnd || b.isPreviousDiagEnd;
    return {
        line,
        diagStart,
        isPreviousDiagContinue,
        isPreviousDiagEnd,
    };
}
function isGoalsAccomplishedDiagnostic(d) {
    return d.leanTags !== undefined && d.leanTags.some(t => t === converters_1.LeanTag.GoalsAccomplished);
}
function determineDiagStart(d, startLine, endLine, line) {
    if (line !== startLine) {
        return 'None';
    }
    if (d.severity === vscode_languageclient_1.DiagnosticSeverity.Error) {
        return {
            kind: 'Error',
            range: startLine === endLine ? 'SingleLine' : 'MultiLine',
        };
    }
    else if (d.severity === vscode_languageclient_1.DiagnosticSeverity.Warning) {
        return {
            kind: 'Warning',
            range: 'SingleLine',
        };
    }
    else if (isGoalsAccomplishedDiagnostic(d)) {
        return {
            kind: 'GoalsAccomplished',
            range: 'SingleLine',
        };
    }
    else {
        throw new Error();
    }
}
function determineDiagnosticGutterDeco(d, startLine, endLine, line) {
    const diagStart = determineDiagStart(d, startLine, endLine, line);
    if (diagStart !== 'None') {
        return {
            line,
            diagStart,
            isPreviousDiagContinue: false,
            isPreviousDiagEnd: false,
        };
    }
    return {
        line,
        diagStart,
        isPreviousDiagContinue: line < endLine,
        isPreviousDiagEnd: line === endLine,
    };
}
function updateDecos(decos, deco) {
    const oldDeco = decos.get(deco.line);
    if (oldDeco === undefined) {
        decos.set(deco.line, deco);
    }
    else {
        const mergedDeco = mergeDiagnosticGutterDecos(oldDeco, deco);
        decos.set(deco.line, mergedDeco);
    }
}
const diagnosticGutterDecoKinds = [
    'error',
    'error-init',
    'error-i',
    'error-i-passthrough',
    'error-l',
    'error-l-passthrough',
    'error-t',
    'error-t-passthrough',
    'warning',
    'warning-i-passthrough',
    'warning-l-passthrough',
    'warning-t-passthrough',
    'goals-accomplished-checkmark',
    'goals-accomplished-checkmark-i-passthrough',
    'goals-accomplished-checkmark-l-passthrough',
    'goals-accomplished-checkmark-t-passthrough',
    'goals-accomplished-circled-checkmark',
    'goals-accomplished-circled-checkmark-i-passthrough',
    'goals-accomplished-circled-checkmark-l-passthrough',
    'goals-accomplished-circled-checkmark-t-passthrough',
    'goals-accomplished-octopus',
    'goals-accomplished-octopus-i-passthrough',
    'goals-accomplished-octopus-l-passthrough',
    'goals-accomplished-octopus-t-passthrough',
    'goals-accomplished-tada',
    'goals-accomplished-tada-i-passthrough',
    'goals-accomplished-tada-l-passthrough',
    'goals-accomplished-tada-t-passthrough',
];
class LeanTaskGutter {
    constructor(client, context) {
        this.context = context;
        this.diagnosticGutterDecorationTypes = new Map();
        this.gutters = new Map();
        this.subscriptions = [];
        this.showDiagnosticGutterDecorations = true;
        this.showUnsolvedGoalsDecoration = true;
        this.processingDecorationType = vscode_1.window.createTextEditorDecorationType({
            overviewRulerLane: vscode_1.OverviewRulerLane.Left,
            overviewRulerColor: 'rgba(255, 165, 0, 0.5)',
            dark: {
                gutterIconPath: context.asAbsolutePath('media/progress-dark.svg'),
                gutterIconSize: 'contain',
            },
            light: {
                gutterIconPath: context.asAbsolutePath('media/progress-light.svg'),
                gutterIconSize: 'contain',
            },
        });
        this.fatalErrorDecorationType = vscode_1.window.createTextEditorDecorationType({
            overviewRulerLane: vscode_1.OverviewRulerLane.Left,
            overviewRulerColor: 'rgba(255, 0, 0, 0.5)',
            dark: {
                gutterIconPath: context.asAbsolutePath('media/progress-error-dark.svg'),
                gutterIconSize: 'contain',
            },
            light: {
                gutterIconPath: context.asAbsolutePath('media/progress-error-light.svg'),
                gutterIconSize: 'contain',
            },
        });
        this.unsolvedGoalsDecorationType = vscode_1.window.createTextEditorDecorationType({
            dark: {
                after: {
                    contentText: '🛠',
                    color: (0, config_1.unsolvedGoalsDecorationDarkThemeColor)(),
                    margin: '0 0 0 1ch',
                },
            },
            light: {
                after: {
                    contentText: '🛠',
                    color: (0, config_1.unsolvedGoalsDecorationLightThemeColor)(),
                    margin: '0 0 0 1ch',
                },
            },
            isWholeLine: true,
        });
        for (const kind of diagnosticGutterDecoKinds) {
            this.diagnosticGutterDecorationTypes.set(kind, vscode_1.window.createTextEditorDecorationType({
                dark: {
                    gutterIconPath: this.context.asAbsolutePath(`media/diagnostic-gutter-icons/${kind}-dark.svg`),
                    gutterIconSize: '100%',
                },
                light: {
                    gutterIconPath: this.context.asAbsolutePath(`media/diagnostic-gutter-icons/${kind}-light.svg`),
                    gutterIconSize: '100%',
                },
            }));
        }
        this.checkContext();
        this.subscriptions.push(this.processingDecorationType, this.fatalErrorDecorationType, this.unsolvedGoalsDecorationType, leanEditorProvider_1.lean.onDidCloseLeanDocument(doc => {
            const uri = doc.extUri.toString();
            this.gutters.get(uri)?.dispose();
            this.gutters.delete(uri);
        }), leanEditorProvider_1.lean.onDidRevealLeanEditor(editor => this.onDidReveal(editor)), vscode_1.window.onDidChangeActiveColorTheme(() => this.onDidChangeColorTheme()), vscode_1.extensions.onDidChange(() => this.checkContext()), vscode_1.workspace.onDidChangeConfiguration(() => this.checkContext()), client.progressChanged(([uri, processingInfos]) => {
            const extUri = (0, exturi_1.parseExtUri)(uri);
            if (extUri === undefined) {
                return;
            }
            this.onProgressChanged(extUri, processingInfos);
        }), client.diagnosticsChanged(params => {
            const extUri = (0, exturi_1.parseExtUri)(params.uri);
            if (extUri === undefined) {
                return;
            }
            this.onDiagnosticsChanged(extUri, params.diagnostics);
        }));
    }
    checkContext() {
        // Use the error lens gutter for diagnostics if it is enabled.
        const errorLensExtensions = vscode_1.extensions.getExtension('usernamehw.errorlens');
        const isErrorLensGutterEnabled = errorLensExtensions !== undefined &&
            errorLensExtensions.isActive &&
            vscode_1.workspace.getConfiguration('errorLens').get('gutterIconsEnabled', false);
        this.showDiagnosticGutterDecorations = !isErrorLensGutterEnabled && (0, config_1.showDiagnosticGutterDecorations)();
        this.goalsAccomplishedDecorationKind = (0, config_1.goalsAccomplishedDecorationKind)();
        this.showUnsolvedGoalsDecoration = (0, config_1.showUnsolvedGoalsDecoration)();
        if (!this.showDiagnosticGutterDecorations) {
            for (const gutter of this.gutters.values()) {
                gutter.clear([...this.diagnosticGutterDecorationTypes.values()]);
            }
        }
        if (!this.showUnsolvedGoalsDecoration) {
            for (const gutter of this.gutters.values()) {
                gutter.clear([this.unsolvedGoalsDecorationType]);
            }
        }
    }
    getGutter(uri) {
        const uriKey = uri.toString();
        if (!this.gutters.has(uriKey)) {
            const newGutter = new LeanFileTaskGutter(uri);
            this.gutters.set(uriKey, newGutter);
            return newGutter;
        }
        return this.gutters.get(uriKey);
    }
    onDidChangeColorTheme() {
        for (const leanEditor of leanEditorProvider_1.lean.visibleLeanEditors) {
            this.getGutter(leanEditor.documentExtUri).onDidReveal();
        }
    }
    onDidReveal(leanEditor) {
        this.getGutter(leanEditor.documentExtUri).onDidReveal();
    }
    onProgressChanged(uri, processingInfos) {
        const processingState = {
            type: this.processingDecorationType,
            prio: 1,
            kind: 'Instantaneous',
            decos: processingInfos
                .filter(i => i.kind === undefined || i.kind === infoview_api_1.LeanFileProgressKind.Processing)
                .map(i => ({
                range: new vscode_1.Range(i.range.start.line, 0, i.range.end.line, 0),
                hoverMessage: 'Processing ...',
            })),
        };
        const fatalErrorState = {
            type: this.fatalErrorDecorationType,
            prio: 1,
            kind: 'Instantaneous',
            decos: processingInfos
                .filter(i => i.kind === infoview_api_1.LeanFileProgressKind.FatalError)
                .map(i => ({
                range: new vscode_1.Range(i.range.start.line, 0, i.range.end.line, 0),
                hoverMessage: 'Processing stopped',
            })),
        };
        this.getGutter(uri).onDidUpdateState([processingState, fatalErrorState]);
    }
    onDiagnosticsChanged(uri, diagnostics) {
        const decoStates = [];
        if (this.showDiagnosticGutterDecorations) {
            decoStates.push(...this.computeDiagnosticGutterDecoStates(diagnostics));
        }
        if (this.showUnsolvedGoalsDecoration) {
            decoStates.push(this.computeUnsolvedGoalsDecoState(diagnostics));
        }
        this.getGutter(uri).onDidUpdateState(decoStates);
    }
    computeDiagnosticGutterDecoStates(diagnostics) {
        const decoStates = new Map();
        for (const [kind, type] of this.diagnosticGutterDecorationTypes.entries()) {
            decoStates.set(kind, {
                type,
                prio: 0,
                kind: 'Instantaneous',
                decos: [],
            });
        }
        const decos = this.computeDiagnosticGutterDecos(diagnostics);
        for (const deco of decos) {
            const kind = this.determineDiagnosticGutterDecoKind(deco);
            if (kind === undefined) {
                continue;
            }
            decoStates.get(kind).decos.push({
                range: new vscode_1.Range(deco.line, 0, deco.line, 0),
            });
        }
        return [...decoStates.values()];
    }
    computeDiagnosticGutterDecos(diagnostics) {
        const decos = new Map();
        for (const d of diagnostics) {
            if (!this.isGutterDecoDiagnostic(d)) {
                continue;
            }
            const range = diagRange(d);
            const startLine = range.start.line;
            const endLine = inclusiveEndLine(range);
            const startDeco = determineDiagnosticGutterDeco(d, startLine, endLine, startLine);
            updateDecos(decos, startDeco);
            if (startDeco.diagStart !== 'None' && startDeco.diagStart.range === 'SingleLine') {
                continue;
            }
            for (let line = startLine + 1; line <= endLine; line++) {
                const deco = determineDiagnosticGutterDeco(d, startLine, endLine, line);
                updateDecos(decos, deco);
            }
        }
        const result = [...decos.values()];
        result.sort((a, b) => a.line - b.line);
        return result;
    }
    isGutterDecoDiagnostic(d) {
        return (d.severity === vscode_languageclient_1.DiagnosticSeverity.Error ||
            d.severity === vscode_languageclient_1.DiagnosticSeverity.Warning ||
            (isGoalsAccomplishedDiagnostic(d) && this.goalsAccomplishedDecorationKind !== 'Off'));
    }
    getGoalsAccomplishedDiagnosticGutterDecoKindName() {
        const configName = this.goalsAccomplishedDecorationKind;
        if (configName === 'Double Checkmark') {
            return 'goals-accomplished-checkmark';
        }
        if (configName === 'Circled Checkmark') {
            return 'goals-accomplished-circled-checkmark';
        }
        if (configName === 'Octopus') {
            return 'goals-accomplished-octopus';
        }
        if (configName === 'Tada') {
            return 'goals-accomplished-tada';
        }
        return 'goals-accomplished-checkmark';
    }
    determineSingleLineDiagnosticGutterDecoKind(d, name) {
        const c = d.isPreviousDiagContinue;
        const e = d.isPreviousDiagEnd;
        if (!c && !e) {
            return name;
        }
        if (!c && e) {
            return `${name}-l-passthrough`;
        }
        if (c && !e) {
            return `${name}-i-passthrough`;
        }
        if (c && e) {
            return `${name}-t-passthrough`;
        }
        (0, assert_1.default)(false);
    }
    determineDiagnosticGutterDecoKind(d) {
        const s = d.diagStart;
        const c = d.isPreviousDiagContinue;
        const e = d.isPreviousDiagEnd;
        if (s !== 'None') {
            const k = s.kind;
            const r = s.range;
            if (k === 'Error') {
                if (!c && !e) {
                    if (r === 'SingleLine') {
                        return 'error';
                    }
                    if (r === 'MultiLine') {
                        return 'error-init';
                    }
                    r;
                }
                if (!c && e) {
                    if (r === 'SingleLine') {
                        return 'error-l-passthrough';
                    }
                    if (r === 'MultiLine') {
                        return 'error-t-passthrough';
                    }
                    r;
                }
                if (c && !e) {
                    // All designs I can think of that would distinguish `SingleLine` and `MultiLine` in this case
                    // have too much visual complexity for the small gutter.
                    return 'error-i-passthrough';
                }
                if (c && e) {
                    // All designs I can think of that would distinguish `SingleLine` and `MultiLine` in this case
                    // have too much visual complexity for the small gutter.
                    return 'error-t-passthrough';
                }
                (0, assert_1.default)(false);
            }
            if (k === 'Warning') {
                return this.determineSingleLineDiagnosticGutterDecoKind(d, 'warning');
            }
            if (k === 'GoalsAccomplished') {
                return this.determineSingleLineDiagnosticGutterDecoKind(d, this.getGoalsAccomplishedDiagnosticGutterDecoKindName());
            }
            k;
        }
        (0, assert_1.default)(s === 'None');
        if (!c && !e) {
            return undefined;
        }
        if (!c && e) {
            return 'error-l';
        }
        if (c && !e) {
            return 'error-i';
        }
        if (c && e) {
            return 'error-t';
        }
        (0, assert_1.default)(false);
    }
    computeUnsolvedGoalsDecoState(diagnostics) {
        const unsolvedGoalsLines = diagnostics
            .filter(d => {
            return d.leanTags?.some(t => t === converters_1.LeanTag.UnsolvedGoals);
        })
            .map(d => {
            const range = diagRange(d);
            return inclusiveEndLine(range);
        });
        return {
            type: this.unsolvedGoalsDecorationType,
            prio: 0,
            kind: 'EditDelayed',
            decos: unsolvedGoalsLines.map(line => ({
                range: new vscode_1.Range(line, 0, line, 0),
            })),
        };
    }
    dispose() {
        for (const gutter of this.gutters.values()) {
            gutter.dispose();
        }
        for (const t of this.diagnosticGutterDecorationTypes.values()) {
            t.dispose();
        }
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.LeanTaskGutter = LeanTaskGutter;
//# sourceMappingURL=taskgutter.js.map