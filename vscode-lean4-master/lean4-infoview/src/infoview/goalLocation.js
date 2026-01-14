"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsContext = exports.GoalsLocation = exports.GoalLocation = void 0;
exports.useSelectableLocation = useSelectableLocation;
const React = require("react");
const contexts_1 = require("./contexts");
const util_1 = require("./util");
// eslint-disable-next-line @typescript-eslint/no-namespace
var GoalLocation;
(function (GoalLocation) {
    function isEqual(l1, l2) {
        if ('hyp' in l1)
            return 'hyp' in l2 ? l1.hyp === l2.hyp : false;
        else if ('hypType' in l1)
            return 'hypType' in l2 ? l1.hypType[0] === l2.hypType[0] && l1.hypType[1] === l2.hypType[1] : false;
        else if ('hypValue' in l1)
            return 'hypValue' in l2 ? l1.hypValue[0] === l2.hypValue[0] && l1.hypValue[1] === l2.hypValue[1] : false;
        else if ('target' in l1)
            return 'target' in l2 ? l1.target === l2.target : false;
        else
            return false;
    }
    GoalLocation.isEqual = isEqual;
    function withSubexprPos(l, p) {
        if ('hyp' in l)
            return l;
        else if ('hypType' in l)
            return { hypType: [l.hypType[0], p] };
        else if ('hypValue' in l)
            return { hypValue: [l.hypValue[0], p] };
        else if ('target' in l)
            return { target: p };
        else
            throw new Error(`unrecognized GoalLocation variant ${JSON.stringify(l)}`);
    }
    GoalLocation.withSubexprPos = withSubexprPos;
})(GoalLocation || (exports.GoalLocation = GoalLocation = {}));
// eslint-disable-next-line @typescript-eslint/no-namespace
var GoalsLocation;
(function (GoalsLocation) {
    function isEqual(l1, l2) {
        return l1.mvarId === l2.mvarId && GoalLocation.isEqual(l1.loc, l2.loc);
    }
    GoalsLocation.isEqual = isEqual;
    function withSubexprPos(l, p) {
        return { ...l, loc: GoalLocation.withSubexprPos(l.loc, p) };
    }
    GoalsLocation.withSubexprPos = withSubexprPos;
})(GoalsLocation || (exports.GoalsLocation = GoalsLocation = {}));
exports.LocationsContext = React.createContext(undefined);
/**
 * Logic for a component that can be selected using Shift-click and is highlighted when selected.
 *
 * The hook returns
 * - a string of CSS classes containing `highlight-selected` when appropriate; and
 * - event handlers which the the caller must attach to the component; and
 * - an object to append to `data-vscode-context`
 *   in order to display context menu entries to (un)select this location in VSCode.
 */
function useSelectableLocation(settings) {
    const locs = React.useContext(exports.LocationsContext);
    const ec = React.useContext(contexts_1.EditorContext);
    let className = '';
    if (settings.isSelectable && locs && locs.isSelected(settings.loc)) {
        className += 'highlight-selected ';
    }
    const onClick = (e) => {
        // On shift-click, if we are in a context where selecting subexpressions makes sense,
        // (un)select the current subexpression.
        if (settings.isSelectable && locs && e.shiftKey) {
            locs.setSelected(settings.loc, on => !on);
            e.stopPropagation();
            e.preventDefault();
            return true;
        }
        return false;
    };
    const onPointerDown = (e) => {
        // We have special handling for shift+click events, so prevent default browser
        // events from interfering when shift is held.
        if (settings.isSelectable && locs && e.shiftKey) {
            e.preventDefault();
        }
    };
    const dataVscodeContext = {
        // We set both IDs to an invalid value by default
        // in order to clear ancestors' locations in this span
        // (`data-vscode-context` fields are overridden by child components).
        // The value can be anything that will not be returned from `useId`.
        selectableLocationId: '',
        unselectableLocationId: '',
    };
    const id = React.useId();
    if (settings.isSelectable && locs) {
        if (locs.isSelected(settings.loc))
            dataVscodeContext.unselectableLocationId = id;
        else
            dataVscodeContext.selectableLocationId = id;
    }
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        if (!settings.isSelectable || !locs)
            return;
        locs.setSelected(settings.loc, true);
    }, [locs, settings], `select:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        if (!settings.isSelectable || !locs)
            return;
        locs.setSelected(settings.loc, false);
    }, [locs, settings], `unselect:${id}`);
    return {
        className,
        onClick,
        onPointerDown,
        dataVscodeContext,
    };
}
//# sourceMappingURL=goalLocation.js.map