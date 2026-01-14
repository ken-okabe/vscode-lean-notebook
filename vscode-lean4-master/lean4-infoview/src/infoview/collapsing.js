"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsVisible = useIsVisible;
exports.Details = Details;
const React = require("react");
const util_1 = require("./util");
/** Returns `[node, isVisible]`. Attach `node` to the dom element you care about as `<div ref={node}>...</div>` and
 * `isVisible` will change depending on whether the node is visible in the viewport or not. */
// NOTE: Unused.
function useIsVisible() {
    const [isVisible, setIsVisible] = React.useState(false);
    const observer = React.useRef(null);
    const node = React.useCallback(n => {
        if (observer.current) {
            observer.current.disconnect();
        }
        if (n !== null) {
            // this is called when the given element is mounted.
            observer.current = new IntersectionObserver(([x]) => {
                setIsVisible(x.isIntersecting);
            }, { threshold: 0, root: null, rootMargin: '0px' });
            observer.current.observe(n);
        }
        else {
            // when unmounted
        }
    }, []);
    return [node, isVisible];
}
/** Like `<details>` but can be programatically revealed using `setOpenRef`.
 * The first child is placed inside the `<summary>` node. */
function Details({ initiallyOpen, children: [summary, ...children], setOpenRef, selectable, ...props }) {
    const [isOpen, setOpen] = React.useState(initiallyOpen === undefined ? false : initiallyOpen);
    if (setOpenRef)
        setOpenRef(setOpen);
    return (<details open={isOpen} {...props}>
            <summary className={'mv2 pointer ' + (!selectable ? 'non-selectable ' : '')} onClick={(0, util_1.withPreventedClickOnTextSelection)(e => {
            if (e.defaultPrevented) {
                e.preventDefault();
                return;
            }
            setOpen(!isOpen);
            // See https://github.com/facebook/react/issues/15486#issuecomment-873516817
            e.preventDefault();
        })} onMouseDown={e => (0, util_1.preventDoubleClickTextSelection)(e)}>
                {summary}
            </summary>
            {isOpen && children}
        </details>);
}
//# sourceMappingURL=collapsing.js.map