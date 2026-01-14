"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useHoverHighlight = useHoverHighlight;
const react_1 = require("react");
/**
 * Logic for a component that is highlighted/underlined when hovered over.
 * The component is passed in `settings.ref`.
 *
 * The hook returns the current hover state of the component,
 * a string of CSS classes containing `highlight` and/or `underline` when appropriate,
 * as well as event handlers which the the caller must attach to the component.
 */
function useHoverHighlight(settings) {
    const { ref, highlightOnHover, underlineOnModHover } = settings;
    const [hoverState, setHoverState] = react_1.default.useState('off');
    const isHoveredOver = hoverState !== 'off';
    let className = '';
    if (highlightOnHover && isHoveredOver) {
        className += 'highlight ';
    }
    if (underlineOnModHover && hoverState === 'ctrlOver') {
        className += 'underline ';
    }
    const onPointerEvent = (b, e) => {
        // It's more composable to let pointer events bubble up rather than to call `stopPropagation`,
        // but we only want to handle hovers in the innermost component. So we record that the
        // event was handled with a property.
        // The `contains` check ensures that the node hovered over is a child in the DOM
        // tree and not just a logical React child (see useLogicalDom and
        // https://reactjs.org/docs/portals.html#event-bubbling-through-portals).
        if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) {
            if ('_DetectHoverSpanSeen' in e) {
                return;
            }
            ;
            e._DetectHoverSpanSeen = {};
            if (!b) {
                setHoverState('off');
            }
            else if (e.ctrlKey || e.metaKey) {
                setHoverState('ctrlOver');
            }
            else {
                setHoverState('over');
            }
        }
    };
    const onPointerOver = (e) => onPointerEvent(true, e);
    const onPointerOut = (e) => onPointerEvent(false, e);
    const onPointerMove = (e) => {
        if (e.ctrlKey || e.metaKey) {
            setHoverState(st => (st === 'over' ? 'ctrlOver' : st));
        }
        else {
            setHoverState(st => (st === 'ctrlOver' ? 'over' : st));
        }
    };
    const onKeyDown = react_1.default.useCallback((e) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            setHoverState(st => (st === 'over' ? 'ctrlOver' : st));
        }
    }, []);
    const onKeyUp = react_1.default.useCallback((e) => {
        if (e.key === 'Control' || e.key === 'Meta') {
            setHoverState(st => (st === 'ctrlOver' ? 'over' : st));
        }
    }, []);
    react_1.default.useEffect(() => {
        if (!isHoveredOver) {
            // Avoid adding lots of expensive global event handlers for spans that are not being
            // hovered over
            return;
        }
        // These event handlers do not fire when the InfoView is not focused.
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
        };
    }, [onKeyDown, onKeyUp, isHoveredOver]);
    return {
        hoverState,
        setHoverState,
        className,
        onPointerOver,
        onPointerOut,
        onPointerMove,
    };
}
//# sourceMappingURL=hoverHighlight.js.map