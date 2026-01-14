"use strict";
/**
 * Traces of any substantial compilation or elaboration process are usually extremely verbose,
 * which makes them slow (or even infeasible) to pretty-print and difficult to understand.
 * Instead, we provide a "TraceExplorer" UI which allows users to lazily expand trace subtrees,
 * and (TODO) execute search queries.
 *
 * @module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractiveMessage = InteractiveMessage;
const infoview_api_1 = require("@leanprover/infoview-api");
const React = require("react");
const goals_1 = require("./goals");
const interactiveCode_1 = require("./interactiveCode");
const rpcSessions_1 = require("./rpcSessions");
const userWidget_1 = require("./userWidget");
const util_1 = require("./util");
const TraceClassContext = React.createContext('');
function abbreviateCommonPrefix(parent, cls) {
    const parentParts = parent.split('.');
    const clsParts = cls.split('.');
    let i = 0;
    for (; i < parentParts.length && i < clsParts.length && parentParts[i] === clsParts[i]; i++)
        ;
    return clsParts.slice(i).join('.');
}
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
function TraceLine({ indent, cls, msg, icon }) {
    const spaces = ' '.repeat(indent);
    const abbrCls = abbreviateCommonPrefix(React.useContext(TraceClassContext), cls);
    return (<div className="trace-line pointer">
            {spaces}
            <span className="trace-class" title={cls}>
                [{abbrCls}]
            </span>{' '}
            <InteractiveMessage fmt={msg}/> {icon}
        </div>);
}
function ChildlessTraceNode(traceEmbed) {
    return <TraceLine {...traceEmbed} icon=""/>;
}
function CollapsibleTraceNode(traceEmbed) {
    const { cls, collapsed: collapsedByDefault, children: lazyKids } = traceEmbed;
    const rs = (0, rpcSessions_1.useRpcSession)();
    const [children, fetchChildren] = (0, util_1.useAsyncWithTrigger)(async () => {
        if ('strict' in lazyKids) {
            return lazyKids.strict;
        }
        else {
            return (0, infoview_api_1.lazyTraceChildrenToInteractive)(rs, lazyKids.lazy);
        }
    }, [rs, lazyKids]);
    const [open, setOpen] = React.useState(!collapsedByDefault);
    if (open && children.state === 'notStarted')
        void fetchChildren();
    let icon = open ? '▼' : '▶';
    if (children.state === 'loading')
        icon += ' ⋯';
    const onClick = React.useCallback((ev) => {
        if (!(ev.target instanceof Node))
            return;
        if (!ev.currentTarget || !ev.target)
            return;
        // Don't handle clicks within React portals nested in this div (notably, tooltips).
        if (!ev.currentTarget.contains(ev.target))
            return;
        ev.stopPropagation();
        ev.preventDefault();
        if ((0, util_1.isAnyTextSelected)()) {
            return;
        }
        if (!open)
            void fetchChildren();
        setOpen(o => !o);
    }, [open, fetchChildren]);
    return (<div className="pointer">
            <div onClick={onClick} onMouseDown={e => (0, util_1.preventDoubleClickTextSelection)(e)}>
                <TraceLine {...traceEmbed} icon={icon}/>
            </div>
            <div style={open ? {} : { display: 'none' }}>
                <TraceClassContext.Provider value={cls}>
                    {children.state === 'resolved' ? (children.value.map((tt, i) => <InteractiveMessage fmt={tt} key={i}/>)) : children.state === 'rejected' ? ((0, util_1.mapRpcError)(children.error).toString()) : (<></>)}
                </TraceClassContext.Provider>
            </div>
        </div>);
}
function Trace(traceEmbed) {
    const noChildren = 'strict' in traceEmbed.children && traceEmbed.children.strict.length === 0;
    return noChildren ? (<ChildlessTraceNode {...traceEmbed}/>) : (<CollapsibleTraceNode key={traceEmbed.collapsed ? 1 : 0} {...traceEmbed}/>);
}
function InteractiveMessageTag({ tag: embed, }) {
    if (embed === 'highlighted') {
        return <span className="highlighted-text"></span>;
    }
    if ('expr' in embed)
        return <interactiveCode_1.InteractiveCode fmt={embed.expr}/>;
    else if ('goal' in embed)
        return (<goals_1.Goal goal={embed.goal} settings={{
                reverse: false,
                hideGoalNames: false,
                emphasizeFirstGoal: false,
                showType: true,
                showInstance: true,
                showHiddenAssumption: true,
                showLetValue: true,
            }} additionalClassNames=""/>);
    else if ('widget' in embed)
        return <userWidget_1.DynamicComponent hash={embed.widget.wi.javascriptHash} props={embed.widget.wi.props}/>;
    else if ('trace' in embed)
        return <Trace {...embed.trace}/>;
    else
        return <div>malformed MsgEmbed: {JSON.stringify(embed)}</div>;
}
function InteractiveMessage({ fmt }) {
    return (0, interactiveCode_1.InteractiveTaggedText)({ fmt, InnerTagUi: InteractiveMessageTag });
}
//# sourceMappingURL=traceExplorer.js.map