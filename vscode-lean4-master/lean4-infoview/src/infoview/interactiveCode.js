"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractiveTaggedText = InteractiveTaggedText;
exports.Markdown = Markdown;
exports.InteractiveCode = InteractiveCode;
const React = require("react");
const infoview_api_1 = require("@leanprover/infoview-api");
// @ts-ignore
const highlightjs_lean_1 = require("highlightjs-lean");
const react_markdown_1 = require("react-markdown");
const react_syntax_highlighter_1 = require("react-syntax-highlighter");
const rehype_mathjax_1 = require("rehype-mathjax");
const remark_math_1 = require("remark-math");
const contexts_1 = require("./contexts");
const goalLocation_1 = require("./goalLocation");
const hoverHighlight_1 = require("./hoverHighlight");
const rpcSessions_1 = require("./rpcSessions");
const tooltips_1 = require("./tooltips");
const util_1 = require("./util");
react_syntax_highlighter_1.Light.registerLanguage('lean', highlightjs_lean_1.default);
// See https://github.com/leanprover/vscode-lean4/pull/500#discussion_r1681001815 for why `any` is used.
function InteractiveTaggedText__({ fmt, InnerTagUi }) {
    if ('text' in fmt)
        return <>{fmt.text}</>;
    else if ('append' in fmt)
        return (<>
                {fmt.append.map((a, i) => (<InteractiveTaggedText__ key={i} fmt={a} InnerTagUi={InnerTagUi}/>))}
            </>);
    else if ('tag' in fmt)
        return <InnerTagUi fmt={fmt.tag[1]} tag={fmt.tag[0]}/>;
    else
        throw new Error(`malformed 'TaggedText': '${fmt}'`);
}
const InteractiveTaggedText_ = React.memo(InteractiveTaggedText__);
/**
 * Core loop to display {@link TaggedText} objects. Invokes `InnerTagUi` on `tag` nodes in order to support
 * various embedded information, for example subexpression information stored in {@link CodeWithInfos}.
 */
function InteractiveTaggedText({ fmt, InnerTagUi }) {
    return <InteractiveTaggedText_ fmt={fmt} InnerTagUi={InnerTagUi}/>;
}
/**
 * Parse the `contents` as Markdown and render the result.
 *
 * This component applies some infoview-specific styling
 * and then passes the content through to a Markdown renderer
 * (currently `remark`).
 */
function Markdown({ contents }) {
    return (<react_markdown_1.default children={contents} remarkPlugins={[remark_math_1.default]} rehypePlugins={[rehype_mathjax_1.default]} components={{
            code(props) {
                const { children, className, node, ...rest } = props;
                if (!children)
                    return <code {...rest} className={className}/>;
                const lang = /language-(\w+)/.exec(className || '');
                // NOTE: Instead of `react-syntax-highlighter`, we could use
                // - `rehype-starrynight` with the TextMate grammar in this repo
                // - the Lean server's semantic token capability,
                //   if we had code to highlight semantic tokens in the infoview
                //   (especially in the tactic state)
                return (
                // @ts-ignore
                <react_syntax_highlighter_1.Light {...rest} language={lang ? lang[1] : 'lean'} children={String(children).replace(/\n$/, '')} codeTagProps={{ className: (className || '') + ' font-code overflow-x-auto' }} wrapLongLines={true} PreTag="span" useInlineStyles={false}/>);
            },
        }}/>);
}
/** Shows `explicitValue : itsType` and a docstring if there is one. */
function TypePopupContents({ info }) {
    const rs = (0, rpcSessions_1.useRpcSession)();
    // When `err` is defined we show the error,
    // otherwise if `ip` is defined we show its contents,
    // otherwise a 'loading' message.
    const interactive = (0, util_1.useAsync)(() => (0, infoview_api_1.InteractiveDiagnostics_infoToInteractive)(rs, info.info), [rs, info.info]);
    // Even when subexpressions are selectable in our parent component, it doesn't make sense
    // to select things inside the *type* of the parent, so we clear the context.
    // NOTE: selecting in the explicit term does make sense but it complicates the implementation
    // so let's not add it until someone really wants it.
    return (<goalLocation_1.LocationsContext.Provider value={undefined}>
            {/* NOTE: we don't have to unset locations in `data-vscode-context` here
        because popup contents are not DOM children, only React children. */}
            <div className="tooltip-code-content">
                {interactive.state === 'resolved' ? (<>
                        <div className="font-code tl pre-wrap">
                            {interactive.value.exprExplicit && <InteractiveCode fmt={interactive.value.exprExplicit}/>}{' '}
                            : {interactive.value.type && <InteractiveCode fmt={interactive.value.type}/>}
                        </div>
                        {interactive.value.doc && (<>
                                <hr />
                                <Markdown contents={interactive.value.doc}/>
                            </>)}
                        {info.diffStatus && (<>
                                <hr />
                                <div>{DIFF_TAG_TO_EXPLANATION[info.diffStatus]}</div>
                            </>)}
                    </>) : interactive.state === 'rejected' ? (<>Error: {(0, util_1.mapRpcError)(interactive.error).message}</>) : (<>Loading..</>)}
            </div>
        </goalLocation_1.LocationsContext.Provider>);
}
const DIFF_TAG_TO_CLASS = {
    wasChanged: 'inserted-text',
    willChange: 'removed-text',
    wasInserted: 'inserted-text',
    willInsert: 'inserted-text',
    willDelete: 'removed-text',
    wasDeleted: 'removed-text',
};
const DIFF_TAG_TO_EXPLANATION = {
    wasChanged: 'This subexpression has been modified.',
    willChange: 'This subexpression will be modified.',
    wasInserted: 'This subexpression has been inserted.',
    willInsert: 'This subexpression will be inserted.',
    wasDeleted: 'This subexpression has been removed.',
    willDelete: 'This subexpression will be deleted.',
};
/**
 * Tagged spans can be hovered over to display extra info stored in the associated `SubexprInfo`.
 * Moreover if this component is rendered in a context where locations can be selected, the span
 * can be shift-clicked to select it.
 */
function InteractiveCodeTag({ tag: ct, fmt }) {
    const rs = (0, rpcSessions_1.useRpcSession)();
    const ec = React.useContext(contexts_1.EditorContext);
    const ref = React.useRef(null);
    const [logicalSpanElt, logicalDomStorage] = (0, util_1.useLogicalDomObserver)(ref);
    const tt = (0, tooltips_1.useToggleableTooltip)(ref, <>{`No definition found for '${(0, infoview_api_1.TaggedText_stripTags)(fmt)}'`}</>);
    const [setGoToDefErrorTooltipDisplayed, onClickOutsideGoToDefErrorTooltip] = [
        tt.setTooltipDisplayed,
        tt.onClickOutside,
    ];
    // We mimick the VSCode ctrl-hover and ctrl-click UI for go-to-definition
    const [goToLoc, setGoToLoc] = React.useState(undefined);
    const hhl = (0, hoverHighlight_1.useHoverHighlight)({
        ref,
        highlightOnHover: true,
        underlineOnModHover: goToLoc !== undefined,
    });
    const [hoverState, setHoverState] = [hhl.hoverState, hhl.setHoverState];
    const locs = React.useContext(goalLocation_1.LocationsContext);
    let selectableLocationSettings;
    if (locs && locs.subexprTemplate && ct.subexprPos) {
        selectableLocationSettings = {
            isSelectable: true,
            loc: goalLocation_1.GoalsLocation.withSubexprPos(locs.subexprTemplate, ct.subexprPos),
        };
    }
    else {
        selectableLocationSettings = { isSelectable: false };
    }
    const sl = (0, goalLocation_1.useSelectableLocation)(selectableLocationSettings);
    const fetchGoToLoc = React.useCallback(async () => {
        if (goToLoc !== undefined)
            return goToLoc;
        try {
            const lnks = await (0, infoview_api_1.getGoToLocation)(rs, 'definition', ct.info);
            if (lnks.length > 0) {
                const loc = { uri: lnks[0].targetUri, range: lnks[0].targetSelectionRange };
                setGoToLoc(loc);
                return loc;
            }
        }
        catch (e) {
            console.error('Error in go-to-definition: ', JSON.stringify(e));
        }
        return undefined;
    }, [rs, ct.info, goToLoc]);
    // Eagerly fetch the location as soon as the pointer enters this area so that we can show
    // an underline if a jump target is available.
    React.useEffect(() => {
        if (hoverState === 'ctrlOver')
            void fetchGoToLoc();
    }, [hoverState, fetchGoToLoc]);
    const execGoToLoc = React.useCallback(async (withError) => {
        const loc = await fetchGoToLoc();
        if (loc === undefined) {
            if (withError) {
                setGoToDefErrorTooltipDisplayed(true);
            }
            return;
        }
        await ec.revealPosition({ uri: loc.uri, ...loc.range.start });
    }, [fetchGoToLoc, ec, setGoToDefErrorTooltipDisplayed]);
    let className = hhl.className + sl.className;
    if (ct.diffStatus) {
        className += DIFF_TAG_TO_CLASS[ct.diffStatus] + ' ';
    }
    // ID that we can use to identify the component that a context menu was opened in.
    // When selecting a custom context menu entry, VS Code will execute a VS Code command
    // parameterized with `data-vscode-context`. We then use this context to execute the
    // command in the context of the correct interactive code tag in the InfoView.
    const interactiveCodeTagId = React.useId();
    (0, util_1.useEvent)(ec.events.clickedContextMenu, async (_) => void execGoToLoc(true), [execGoToLoc], `goToDefinition:${interactiveCodeTagId}`);
    const ht = (0, tooltips_1.useHoverTooltip)(ref, <TypePopupContents info={ct}/>, (e, cont) => {
        // On ctrl-click or ⌘-click, if location is known, go to it in the editor
        if (e.ctrlKey || e.metaKey) {
            setHoverState(st => (st === 'over' ? 'ctrlOver' : st));
            void execGoToLoc(false);
            return;
        }
        if (!e.shiftKey) {
            cont(e);
        }
    });
    const onClickOutsideHoverTooltip = ht.onClickOutside;
    const onClickOutside = React.useCallback(() => {
        onClickOutsideHoverTooltip();
        onClickOutsideGoToDefErrorTooltip();
    }, [onClickOutsideHoverTooltip, onClickOutsideGoToDefErrorTooltip]);
    // The condition ensures that we only add the handler when a tooltip is displayed.
    // These handlers can be expensive, so adding them lazily drastically improves performance.
    (0, util_1.useOnClickOutside)(logicalSpanElt, onClickOutside, tt.tooltipDisplayed || ht.state !== 'hide');
    return (<util_1.LogicalDomContext.Provider value={logicalDomStorage}>
            <span ref={ref} className={className} data-vscode-context={JSON.stringify({ ...sl.dataVscodeContext, interactiveCodeTagId })} data-has-tooltip-on-hover onClick={e => {
            const stopClick = sl.onClick(e);
            if (stopClick) {
                return;
            }
            ht.onClick(e);
            tt.onClick();
        }} onMouseDown={e => ht.onMouseDown(e)} onPointerDown={e => {
            sl.onPointerDown(e);
            ht.onPointerDown(e);
        }} onPointerOver={e => {
            hhl.onPointerOver(e);
            ht.onPointerOver(e);
        }} onPointerOut={e => {
            hhl.onPointerOut(e);
            ht.onPointerOut(e);
        }} onPointerMove={e => hhl.onPointerMove(e)} onContextMenu={e => {
            // Mark the event as seen so that parent handlers skip it.
            // We cannot use `stopPropagation` as that prevents the VSC context menu from showing up.
            if ('_InteractiveCodeTagSeen' in e)
                return;
            e._InteractiveCodeTagSeen = {};
            if (!(e.target instanceof Node))
                return;
            if (!e.currentTarget.contains(e.target))
                return;
            // Select the pretty-printed code (see issue #311).
            const sel = window.getSelection();
            if (!sel || !sel.isCollapsed)
                return;
            sel.selectAllChildren(e.currentTarget);
            // If a context menu action other than cut/copy is chosen,
            // the auto-selection we made above should be removed.
            // We hack this by tagging the first auto-selected range with a special property,
            // and removing any selection on which the identifier is present in a global handler.
            if (0 < sel.rangeCount)
                sel.getRangeAt(0)._InteractiveCodeTagAutoSelection = {};
            // Hide the tooltip when a context menu is opened
            // by simulating a click-outside.
            ht.onClickOutside();
        }}>
                {tt.tooltip}
                {ht.tooltip}
                <InteractiveTaggedText fmt={fmt} InnerTagUi={InteractiveCodeTag_}/>
            </span>
        </util_1.LogicalDomContext.Provider>);
}
function InteractiveCodeTag_({ tag: ct, fmt }) {
    if (ct === 'highlighted') {
        return (<span className="highlighted-text">
                <InteractiveTaggedText fmt={fmt} InnerTagUi={InteractiveCodeTag}/>
            </span>);
    }
    return <InteractiveCodeTag tag={ct} fmt={fmt}/>;
}
/** Displays a {@link CodeWithInfos} obtained via RPC from the Lean server. */
function InteractiveCode(props) {
    if ('text' in props.fmt && props.fmt.text === '') {
        // Avoid creating empty spans
        return <></>;
    }
    return (<span className="font-code">
            <InteractiveTaggedText {...props} InnerTagUi={InteractiveCodeTag_}/>
        </span>);
}
//# sourceMappingURL=interactiveCode.js.map