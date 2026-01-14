"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tooltip = Tooltip;
exports.useToggleableTooltip = useToggleableTooltip;
exports.useHoverTooltip = useHoverTooltip;
exports.WithTooltipOnHover = WithTooltipOnHover;
const React = require("react");
const ReactDOM = require("react-dom");
const react_1 = require("@floating-ui/react");
const contexts_1 = require("./contexts");
const util_1 = require("./util");
function Tooltip(props_) {
    const { reference, children, style, ...props } = props_;
    const arrowRef = React.useRef(null);
    const { refs, floatingStyles, context } = (0, react_1.useFloating)({
        elements: { reference },
        placement: 'top',
        middleware: [
            (0, react_1.offset)(8),
            (0, react_1.shift)(),
            (0, react_1.autoPlacement)({
                padding: 10,
            }),
            (0, react_1.size)({
                apply({ availableHeight, elements }) {
                    elements.floating.style.maxHeight = `${Math.min(availableHeight, 300)}px`;
                },
                padding: 10,
            }),
            // NOTE: `padding` should be `tooltip.borderRadius` or more so that the arrow
            // doesn't overflow the rounded corner.
            (0, react_1.arrow)({ element: arrowRef, padding: 6 }),
        ],
        whileElementsMounted: react_1.autoUpdate,
    });
    const logicalDom = React.useContext(util_1.LogicalDomContext);
    const logicalDomCleanupFn = React.useRef(() => { });
    const floating = (<div ref={node => {
            refs.setFloating(node);
            logicalDomCleanupFn.current();
            if (node)
                logicalDomCleanupFn.current = logicalDom.registerDescendant(node);
            else
                logicalDomCleanupFn.current = () => { };
        }} style={{ ...style, ...floatingStyles }} className="tooltip" {...props}>
            <react_1.FloatingArrow ref={arrowRef} context={context} fill="var(--vscode-editorHoverWidget-background)" strokeWidth={1} stroke="var(--vscode-editorHoverWidget-border)"/>
            <div className="tooltip-content">{children}</div>
        </div>);
    // Append the tooltip to the end of document body to avoid layout issues.
    // (https://github.com/leanprover/vscode-lean4/issues/51)
    return ReactDOM.createPortal(floating, document.body);
}
/**
 * Provides handlers to show a tooltip when a state variable is changed.
 * The tooltip is hidden when a click is made anywhere (on or outside the tooltip).
 */
function useToggleableTooltip(ref, tooltipChildren) {
    const [anchor, setAnchor] = React.useState(null);
    const [tooltipDisplayed, setTooltipDisplayed_] = React.useState(false);
    const setTooltipDisplayed = (tooltipDisplayed) => {
        setTooltipDisplayed_(tooltipDisplayed);
        if (tooltipDisplayed) {
            // Setting the tooltip anchor lazily only when the tooltip is displayed avoids accidental
            // re-renders induced by setting this state variable during the initial render of a component.
            setAnchor(ref.current);
        }
    };
    // Since we do not want to hide the tooltip if the user is trying to select text in it,
    // we need both the "click outside" and "click inside" handlers here because they
    // play nicer with existing selections than a global click handler.
    // With a single global click handler, any selection anywhere in the InfoView could block
    // the tooltip from being hidden. This is especially annoying because right-clicking any
    // element also selects it.
    // With both inside and outside click handlers, the outside click handler can simply disregard
    // selections, whereas React ensures that only a selection in the tooltip itself can block
    // the inside click handler from hiding the tooltip, since the outer selection is removed
    // before the inside click handler fires.
    const onClickOutside = () => {
        setTooltipDisplayed(false);
    };
    const onClick = () => {
        if (!window.getSelection()?.toString()) {
            setTooltipDisplayed(false);
        }
    };
    const tooltip = <>{tooltipDisplayed && <Tooltip reference={anchor}>{tooltipChildren}</Tooltip>}</>;
    return {
        tooltip,
        tooltipDisplayed,
        setTooltipDisplayed,
        onClick,
        onClickOutside,
    };
}
const TipChainContext = React.createContext({ pinParent: () => { } });
/** Provides handlers to show a tooltip when the children of a component are hovered over or clicked.
 *
 * A `guardedOnClick` middleware can optionally be given in order to control what happens when the
 * hoverable area is clicked. The middleware can invoke `cont` to execute the default action,
 * which is to pin the tooltip open.
 */
function useHoverTooltip(ref, tooltipChildren, guardedOnClick) {
    const config = React.useContext(contexts_1.ConfigContext);
    const [state, setState_] = React.useState('hide');
    const [anchor, setAnchor] = React.useState(null);
    const setState = React.useCallback(state => {
        setState_(state);
        if (state !== 'hide') {
            setAnchor(ref.current);
        }
    }, [ref]);
    const tipChainCtx = React.useContext(TipChainContext);
    React.useEffect(() => {
        if (state === 'pin')
            tipChainCtx.pinParent();
    }, [state, tipChainCtx]);
    const newHTTipChainCtx = React.useMemo(() => ({
        pinParent: () => {
            setState('pin');
            tipChainCtx.pinParent();
        },
    }), [tipChainCtx, setState]);
    // Note: because tooltips are attached to `document.body`, they are not descendants of the
    // hoverable area in the DOM tree. Thus the `contains` check fails for elements within tooltip
    // contents and succeeds for elements within the hoverable. We can use this to distinguish them.
    const isWithinHoverable = (el) => ref.current && el instanceof Node && ref.current.contains(el);
    // We use timeouts for debouncing hover events.
    const timeout = React.useRef();
    const clearTimeout = () => {
        if (timeout.current) {
            window.clearTimeout(timeout.current);
            timeout.current = undefined;
        }
    };
    const showDelay = 500;
    const hideDelay = 300;
    const startShowTimeout = () => {
        clearTimeout();
        if (!config.showTooltipOnHover)
            return;
        timeout.current = window.setTimeout(() => {
            if (!(0, util_1.isAnyTextSelected)()) {
                setState(state === 'hide' ? 'show' : state);
            }
            timeout.current = undefined;
        }, showDelay);
    };
    const isPointerOverTooltip = React.useRef(false);
    const startHideTimeout = () => {
        clearTimeout();
        timeout.current = window.setTimeout(() => {
            if (!isPointerOverTooltip.current)
                setState(state === 'show' ? 'hide' : state);
            timeout.current = undefined;
        }, hideDelay);
    };
    const onPointerEnter = (e) => {
        isPointerOverTooltip.current = true;
        clearTimeout();
    };
    const onPointerLeave = (e) => {
        isPointerOverTooltip.current = false;
        startHideTimeout();
    };
    const guardMouseEvent = (act, e) => {
        if ('_WithTooltipOnHoverSeen' in e)
            return;
        if (!isWithinHoverable(e.target))
            return;
        e._WithTooltipOnHoverSeen = {};
        act(e);
    };
    const pinClick = (e) => {
        clearTimeout();
        if (!(0, util_1.isAnyTextSelected)()) {
            setState(state === 'pin' ? 'hide' : 'pin');
        }
        e.stopPropagation();
        e.preventDefault();
    };
    const onClick = (e) => {
        guardMouseEvent(e => {
            if (!guardedOnClick) {
                pinClick(e);
                return;
            }
            guardedOnClick(e, e => pinClick(e));
        }, e);
    };
    const onClickOutside = () => {
        clearTimeout();
        setState('hide');
    };
    const onMouseDown = (e) => (0, util_1.preventDoubleClickTextSelection)(e);
    const isModifierHeld = (e) => e.altKey || e.ctrlKey || e.shiftKey || e.metaKey;
    const onPointerDown = (e) => {
        // We have special handling for some modifier+click events, so prevent default browser
        // events from interfering when a modifier is held.
        if (isModifierHeld(e)) {
            e.preventDefault();
        }
    };
    const onPointerOver = (e) => {
        if (!isModifierHeld(e)) {
            guardMouseEvent(_ => startShowTimeout(), e);
        }
    };
    const onPointerOut = (e) => {
        guardMouseEvent(_ => startHideTimeout(), e);
    };
    const tooltip = (<>
            {state !== 'hide' && (<TipChainContext.Provider value={newHTTipChainCtx}>
                    <Tooltip reference={anchor} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
                        {tooltipChildren}
                    </Tooltip>
                </TipChainContext.Provider>)}
        </>);
    return {
        state,
        onClick,
        onClickOutside,
        onMouseDown,
        onPointerDown,
        onPointerOver,
        onPointerOut,
        tooltip,
    };
}
/**
 * Span that uses the logic of {@link useHoverTooltip}.
 */
function WithTooltipOnHover(props_) {
    const { tooltipChildren, ...props } = props_;
    const ref = React.useRef(null);
    const [logicalSpanElt, logicalDomStorage] = (0, util_1.useLogicalDomObserver)(ref);
    const ht = useHoverTooltip(ref, tooltipChildren);
    (0, util_1.useOnClickOutside)(logicalSpanElt, ht.onClickOutside, ht.state !== 'hide');
    return (<util_1.LogicalDomContext.Provider value={logicalDomStorage}>
            <span {...props} ref={ref} onClick={e => ht.onClick(e)} onMouseDown={e => ht.onMouseDown(e)} onPointerDown={e => ht.onPointerDown(e)} onPointerOver={e => ht.onPointerOver(e)} onPointerOut={e => ht.onPointerOut(e)}>
                {ht.tooltip}
                {props.children}
            </span>
        </util_1.LogicalDomContext.Provider>);
}
//# sourceMappingURL=tooltips.js.map