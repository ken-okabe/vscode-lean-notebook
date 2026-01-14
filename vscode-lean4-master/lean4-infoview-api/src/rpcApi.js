"use strict";
/**
 * Defines TS bindings for RPC calls to the Lean server,
 * as well as some utilities which correspond to Lean functions.
 * TODO(WN): One would like to eventually auto-generate the bindings from Lean code.
 * @module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInteractiveGoals = getInteractiveGoals;
exports.getInteractiveTermGoal = getInteractiveTermGoal;
exports.getInteractiveDiagnostics = getInteractiveDiagnostics;
exports.InteractiveDiagnostics_msgToInteractive = InteractiveDiagnostics_msgToInteractive;
exports.lazyTraceChildrenToInteractive = lazyTraceChildrenToInteractive;
exports.InteractiveDiagnostics_infoToInteractive = InteractiveDiagnostics_infoToInteractive;
exports.getGoToLocation = getGoToLocation;
exports.Widget_getWidgets = Widget_getWidgets;
exports.Widget_getWidgetSource = Widget_getWidgetSource;
exports.highlightMatches = highlightMatches;
function getInteractiveGoals(rs, pos) {
    return rs.call('Lean.Widget.getInteractiveGoals', pos);
}
function getInteractiveTermGoal(rs, pos) {
    return rs.call('Lean.Widget.getInteractiveTermGoal', pos);
}
function getInteractiveDiagnostics(rs, lineRange) {
    return rs.call('Lean.Widget.getInteractiveDiagnostics', { lineRange });
}
function InteractiveDiagnostics_msgToInteractive(rs, msg, indent) {
    return rs.call('Lean.Widget.InteractiveDiagnostics.msgToInteractive', {
        msg,
        indent,
    });
}
function lazyTraceChildrenToInteractive(rs, children) {
    return rs.call('Lean.Widget.lazyTraceChildrenToInteractive', children);
}
function InteractiveDiagnostics_infoToInteractive(rs, info) {
    return rs.call('Lean.Widget.InteractiveDiagnostics.infoToInteractive', info);
}
function getGoToLocation(rs, kind, info) {
    return rs.call('Lean.Widget.getGoToLocation', { kind, info });
}
/** Given a position, returns all of the user-widgets on the infotree at this position. */
function Widget_getWidgets(rs, pos) {
    return rs.call('Lean.Widget.getWidgets', pos);
}
/** Gets the static code for a given widget.
 *
 * We make the assumption that either the code doesn't exist, or it exists and does not change for the lifetime of the widget.
 */
function Widget_getWidgetSource(rs, pos, hash) {
    return rs.call('Lean.Widget.getWidgetSource', { pos, hash });
}
function highlightMatches(rs, query, msg) {
    return rs.call('Lean.Widget.highlightMatches', {
        query,
        msg,
    });
}
//# sourceMappingURL=rpcApi.js.map