"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogicalDomContext = exports.RangeHelpers = exports.PositionHelpers = exports.DocumentPosition = void 0;
exports.count = count;
exports.escapeHtml = escapeHtml;
exports.colorizeMessage = colorizeMessage;
exports.basename = basename;
exports.useEvent = useEvent;
exports.useEventResult = useEventResult;
exports.useServerNotificationEffect = useServerNotificationEffect;
exports.useServerNotificationState = useServerNotificationState;
exports.useClientNotificationEffect = useClientNotificationEffect;
exports.useClientNotificationState = useClientNotificationState;
exports.usePausableState = usePausableState;
exports.addUniqueKeys = addUniqueKeys;
exports.useLogicalDomObserver = useLogicalDomObserver;
exports.useOnClickOutside = useOnClickOutside;
exports.mapRpcError = mapRpcError;
exports.discardMethodNotFound = discardMethodNotFound;
exports.useAsyncWithTrigger = useAsyncWithTrigger;
exports.useAsync = useAsync;
exports.useAsyncPersistent = useAsyncPersistent;
exports.isAnyTextSelected = isAnyTextSelected;
exports.preventClickOnTextSelection = preventClickOnTextSelection;
exports.withPreventedClickOnTextSelection = withPreventedClickOnTextSelection;
exports.preventDoubleClickTextSelection = preventDoubleClickTextSelection;
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable react-hooks/exhaustive-deps */
const React = require("react");
const infoview_api_1 = require("@leanprover/infoview-api");
const contexts_1 = require("./contexts");
function count(xs, p) {
    let n = 0;
    for (const x of xs) {
        if (p(x)) {
            n++;
        }
    }
    return n;
}
var DocumentPosition;
(function (DocumentPosition) {
    function isEqual(p1, p2) {
        return p1.uri === p2.uri && p1.line === p2.line && p1.character === p2.character;
    }
    DocumentPosition.isEqual = isEqual;
    function toTdpp(p) {
        return { textDocument: { uri: p.uri }, position: { line: p.line, character: p.character } };
    }
    DocumentPosition.toTdpp = toTdpp;
    function toString(p) {
        return `${p.uri}:${p.line + 1}:${p.character}`;
    }
    DocumentPosition.toString = toString;
})(DocumentPosition || (exports.DocumentPosition = DocumentPosition = {}));
var PositionHelpers;
(function (PositionHelpers) {
    function isLessThanOrEqual(p1, p2) {
        return p1.line < p2.line || (p1.line === p2.line && p1.character <= p2.character);
    }
    PositionHelpers.isLessThanOrEqual = isLessThanOrEqual;
    function isLessThan(p1, p2) {
        return p1.line < p2.line || (p1.line === p2.line && p1.character < p2.character);
    }
    PositionHelpers.isLessThan = isLessThan;
})(PositionHelpers || (exports.PositionHelpers = PositionHelpers = {}));
var RangeHelpers;
(function (RangeHelpers) {
    function contains(range, pos, ignoreCharacter) {
        if (!ignoreCharacter) {
            if (pos.line === range.start.line && pos.character < range.start.character)
                return false;
            if (pos.line === range.end.line && pos.character > range.end.character)
                return false;
        }
        return range.start.line <= pos.line && pos.line <= range.end.line;
    }
    RangeHelpers.contains = contains;
})(RangeHelpers || (exports.RangeHelpers = RangeHelpers = {}));
// https://stackoverflow.com/questions/6234773/can-i-escape-html-special-chars-in-javascript
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/** @deprecated (unused) */
function colorizeMessage(goal) {
    return goal
        .replace(/^([|⊢]) /gm, '<strong class="goal-vdash">$1</strong> ')
        .replace(/^(\d+ goals|1 goal)/gm, '<strong class="goal-goals">$1</strong>')
        .replace(/^(context|state):/gm, '<strong class="goal-goals">$1</strong>:')
        .replace(/^(case) /gm, '<strong class="goal-case">$1</strong> ')
        .replace(/^([^:\n< ][^:\n⊢{[(⦃]*) :/gm, '<strong class="goal-hyp">$1</strong> :');
}
function basename(path) {
    const bn = path.split(/[\\/]/).pop();
    if (bn)
        return bn;
    else
        return '';
}
/**
 * A specialization of {@link React.useEffect} which executes `f` with the event data
 * whenever `ev` fires.
 * If `key` is provided, `f` is only invoked on events fired with that key.
 */
function useEvent(ev, f, dependencies, key) {
    React.useEffect(() => {
        const h = ev.on(f, key);
        return () => h.dispose();
    }, dependencies);
}
function useEventResult(ev, f) {
    const fn = f ?? (x => x);
    const [s, setS] = React.useState(ev.current ? fn(ev.current) : undefined);
    useEvent(ev, newV => setS(newV ? fn(newV) : undefined));
    return s;
}
function useServerNotificationEffect(method, f, deps) {
    const ec = React.useContext(contexts_1.EditorContext);
    React.useEffect(() => {
        void ec.api.subscribeServerNotifications(method).catch(ex => {
            console.error(`Failed subscribing to server notification '${method}': ${ex}`);
        });
        const h = ec.events.gotServerNotification.on(([thisMethod, params]) => {
            if (thisMethod !== method)
                return;
            f(params);
        });
        return () => {
            h.dispose();
            void ec.api.unsubscribeServerNotifications(method);
        };
    }, deps);
}
/**
 * Returns the same tuple as `setState` such that whenever a server notification with `method`
 * arrives at the editor, the state will be updated according to `f`.
 */
function useServerNotificationState(method, initial, f, deps) {
    const [s, setS] = React.useState(initial);
    useServerNotificationEffect(method, (params) => void f(params).then(g => setS(g)), deps);
    return [s, setS];
}
function useClientNotificationEffect(method, f, deps) {
    const ec = React.useContext(contexts_1.EditorContext);
    React.useEffect(() => {
        void ec.api.subscribeClientNotifications(method).catch(ex => {
            console.error(`Failed subscribing to client notification '${method}': ${ex}`);
        });
        const h = ec.events.sentClientNotification.on(([thisMethod, params]) => {
            if (thisMethod !== method)
                return;
            f(params);
        });
        return () => {
            h.dispose();
            void ec.api.unsubscribeClientNotifications(method);
        };
    }, deps);
}
/**
 * Like {@link useServerNotificationState} but for client->server notifications sent by the editor.
 */
function useClientNotificationState(method, initial, f, deps) {
    const [s, setS] = React.useState(initial);
    useClientNotificationEffect(method, (params) => {
        setS(state => f(state, params));
    }, deps);
    return [s, setS];
}
/**
 * Returns `[{ isPaused, setPaused }, tPausable, tRef]` s.t.
 * - `[isPaused, setPaused]` are the paused status state
 * - for as long as `isPaused` is set, `tPausable` holds its initial value (the `t` passed before pausing)
 *   rather than updates with changes to `t`.
 * - `tRef` can be used to overwrite the paused state
 *
 * To pause child components, `startPaused` can be passed in their props.
 */
function usePausableState(startPaused, t) {
    const [isPaused, setPaused] = React.useState(startPaused);
    const old = React.useRef(t);
    if (!isPaused)
        old.current = t;
    return [{ isPaused, setPaused }, old.current, old];
}
/**
 * Adds a unique `key` property to each element in `elems` using
 * the values of (possibly non-injective) `getId`.
 */
function addUniqueKeys(elems, getId) {
    const keys = {};
    return elems.map(el => {
        const id = getId(el);
        keys[id] = (keys[id] || 0) + 1;
        return { key: `${id}:${keys[id]}`, ...el };
    });
}
exports.LogicalDomContext = React.createContext({ registerDescendant: () => () => { } });
/** Suppose a component B appears as a React descendant of the component A. For layout reasons,
 * we sometimes don't want B to appear as a descendant of A in the DOM, so we use `createPortal`.
 * We may still however want to carry out `contains` checks as if B were there, i.e. according to
 * the React tree structure rather than the DOM structure. While React already correctly propagates
 * DOM events up the React tree, other functionality such as `contains` is not provided. We provide
 * it in this hook.
 *
 * Accepts a ref to the observed {@link HTMLElement} (A in the example). Returns:
 * - a {@link LogicalDomElement} which provides `contains` checks for that {@link HTMLElement}; and
 * - a {@link LogicalDomStorage} which MUST be passed to a {@link LogicalDomContext} enclosing
 *   the observed {@link HTMLElement}.
 *
 * Additionally, any component which introduces a portal MUST call `registerDescendant` in the
 * {@link LogicalDomContext} with a ref to the portalled component (B in the example). */
function useLogicalDomObserver(elt) {
    const parentCtx = React.useContext(exports.LogicalDomContext);
    const descendants = React.useRef(new Set());
    // Provides a `contains` check for the children only, but not the observed element.
    // We pass this to the parent context under the assumption that its own DOM-based
    // `contains` check already includes the observed element.
    const logicalChildrenElt = React.useMemo(() => ({
        contains: (e) => {
            for (const d of descendants.current) {
                if (d.contains(e))
                    return true;
            }
            return false;
        },
    }), []);
    React.useEffect(() => parentCtx.registerDescendant(logicalChildrenElt), [parentCtx, logicalChildrenElt]);
    const logicalElt = React.useMemo(() => ({
        contains: (e) => {
            if (!elt.current)
                return false;
            if (elt.current.contains(e))
                return true;
            return logicalChildrenElt.contains(e);
        },
    }), [elt, logicalChildrenElt]);
    const registerDescendant = React.useCallback((el) => {
        descendants.current.add(el);
        return () => {
            descendants.current.delete(el);
        };
    }, []);
    return [logicalElt, React.useMemo(() => ({ registerDescendant }), [registerDescendant])];
}
/**
 * An effect which calls `onClickOutside` whenever an element not logically descending from `ld`
 * (see {@link useLogicalDomObserver}) is clicked. Note that `onClickOutside` is not called on clicks
 * on the scrollbar since these should usually not impact the app's state.
 * `isActive` controls whether the `onClickOutside` handler is active. This can be useful for performance,
 * since having lots of `onClickOutside` handlers when they are not needed can be expensive.
 */
function useOnClickOutside(ld, onClickOutside, isActive = true) {
    React.useEffect(() => {
        if (!isActive) {
            return;
        }
        const onClickAnywhere = (e) => {
            if (e.target instanceof Node && !ld.contains(e.target)) {
                if (e.target instanceof Element && e.target.tagName === 'HTML') {
                    // then user might be clicking in a scrollbar, otherwise
                    // e.target would be a tag other than 'HTML'
                }
                else
                    onClickOutside(e);
            }
        };
        document.addEventListener('pointerdown', onClickAnywhere);
        return () => document.removeEventListener('pointerdown', onClickAnywhere);
    }, [ld, onClickOutside, isActive]);
}
/** Sends an exception object to a throwable error.
 * Maps JSON Rpc errors to throwable errors.
 */
function mapRpcError(err) {
    if ((0, infoview_api_1.isRpcError)(err)) {
        return new Error(`Rpc error: ${infoview_api_1.RpcErrorCode[err.code]}: ${err.message}`);
    }
    else if (!(err instanceof Error)) {
        return new Error(`Unrecognised error ${JSON.stringify(err)}`);
    }
    else {
        return err;
    }
}
/** Catch handler for RPC methods that just returns undefined if the method is not found.
 * This is useful for compatibility with versions of Lean that do not yet have the given RPC method.
 */
function discardMethodNotFound(e) {
    if ((0, infoview_api_1.isRpcError)(e) && e.code === infoview_api_1.RpcErrorCode.MethodNotFound) {
        return undefined;
    }
    else {
        throw e;
    }
}
function useAsyncWithTrigger(fn, deps = []) {
    const asyncState = React.useRef({ state: 'notStarted' });
    const asyncStateDeps = React.useRef([]);
    // A monotonically increasing counter.
    const tick = React.useRef(0);
    // This is bumped up to the current `tick` whenever `asyncState.current` is assigned,
    // in order to trigger a React update.
    const [_, setUpdate] = React.useState(0);
    const trigger = React.useCallback(async () => {
        if (asyncState.current.state === 'loading' || asyncState.current.state === 'resolved')
            return;
        tick.current += 1;
        asyncState.current = { state: 'loading' };
        setUpdate(tick.current);
        tick.current += 1;
        const startTick = tick.current;
        const set = (state) => {
            if (tick.current === startTick) {
                asyncState.current = state;
                setUpdate(tick.current);
            }
        };
        return fn().then(value => set({ state: 'resolved', value }), error => set({ state: 'rejected', error }));
    }, deps);
    const depsTheSame = asyncStateDeps.current.length === deps.length && asyncStateDeps.current.every((d, i) => Object.is(d, deps[i]));
    if (!depsTheSame) {
        tick.current += 1;
        asyncState.current = { state: 'notStarted' };
        asyncStateDeps.current = deps;
        setUpdate(tick.current);
    }
    return [asyncState.current, trigger];
}
/** This React hook will run the given promise function `fn` whenever the deps change
 * and use it to update the status and result when the promise resolves.
 *
 * This function prevents race conditions if the requests resolve in a
 * different order to that which they were requested in:
 *
 * - Request 1 is sent with, say, line=42.
 * - Request 2 is sent with line=90.
 * - Request 2 returns with diags=[].
 * - Request 1 returns with diags=['error'].
 *
 * Without `useAsync` we would now return the diagnostics for line 42 even though we're at line 90.
 *
 * When the deps change, the function immediately returns `{ state: 'loading' }`.
 */
function useAsync(fn, deps = []) {
    const [state, trigger] = useAsyncWithTrigger(fn, deps);
    if (state.state === 'notStarted') {
        void trigger();
        return { state: 'loading' };
    }
    else {
        return state;
    }
}
/** Like {@link useAsync} but never transitions from `resolved` to `loading` by internally storing
 * the latest `resolved` state and continuing to return it while an update is in flight. The lower
 * amount of re-renders tends to be less visually jarring.
 */
function useAsyncPersistent(fn, deps = []) {
    const [latestState, setLatestState] = React.useState(undefined);
    const state = useAsync(async () => {
        const newState = await fn();
        setLatestState(newState);
        return newState;
    }, deps);
    if (state.state === 'loading' && latestState !== undefined) {
        return { state: 'resolved', value: latestState };
    }
    return state;
}
function isAnyTextSelected() {
    const s = window.getSelection();
    return s !== null && !s.isCollapsed;
}
function preventClickOnTextSelection(e) {
    if (isAnyTextSelected()) {
        e.preventDefault();
        return true;
    }
    return false;
}
function withPreventedClickOnTextSelection(f) {
    return e => {
        const isPrevented = preventClickOnTextSelection(e);
        if (isPrevented) {
            return;
        }
        f(e);
    };
}
function preventDoubleClickTextSelection(e) {
    if (e.detail > 1) {
        e.preventDefault();
        return true;
    }
    return false;
}
//# sourceMappingURL=util.js.map