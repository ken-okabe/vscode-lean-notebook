"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesList = void 0;
exports.AllMessages = AllMessages;
exports.tallyOfDiags = tallyOfDiags;
exports.TallyDisplay = TallyDisplay;
exports.WithLspDiagnosticsContext = WithLspDiagnosticsContext;
exports.lspDiagToInteractive = lspDiagToInteractive;
const React = require("react");
const react_fast_compare_1 = require("react-fast-compare");
const vscode_languageserver_protocol_1 = require("vscode-languageserver-protocol");
const infoview_api_1 = require("@leanprover/infoview-api");
const infoview_api_2 = require("@leanprover/infoview-api");
const react_elements_1 = require("@vscode-elements/react-elements");
const collapsing_1 = require("./collapsing");
const contexts_1 = require("./contexts");
const rpcSessions_1 = require("./rpcSessions");
const traceExplorer_1 = require("./traceExplorer");
const util_1 = require("./util");
function isTraceMessage(message) {
    if ('text' in message) {
        return false;
    }
    if ('append' in message) {
        return message.append.some(m => isTraceMessage(m));
    }
    const embed = message.tag[0];
    if (embed === 'highlighted' || !('trace' in embed)) {
        return false;
    }
    return true;
}
const MessageView = React.memo(({ uri, diag }) => {
    const ec = React.useContext(contexts_1.EditorContext);
    const fname = (0, util_1.escapeHtml)((0, util_1.basename)(uri));
    const { line, character } = diag.range.start;
    const loc = { uri, range: diag.range };
    /* We grab the text contents of the message from `node.innerText`. */
    const node = React.useRef(null);
    const severityClass = diag.severity
        ? {
            [vscode_languageserver_protocol_1.DiagnosticSeverity.Error]: 'error',
            [vscode_languageserver_protocol_1.DiagnosticSeverity.Warning]: 'warning',
            [vscode_languageserver_protocol_1.DiagnosticSeverity.Information]: 'information',
            [vscode_languageserver_protocol_1.DiagnosticSeverity.Hint]: 'hint',
        }[diag.severity]
        : '';
    const title = `${fname}:${line + 1}:${character}`;
    const startPos = React.useMemo(() => ({ uri, ...(diag.fullRange?.start || diag.range.start) }), [uri, diag.fullRange, diag.range]);
    const cc = React.useContext(contexts_1.CapabilityContext);
    const serverSupportsTraceSearch = cc?.experimental?.rpcProvider?.highlightMatchesProvider !== undefined;
    const [msg, setMsg] = React.useState(diag.message);
    const isMessageWithTraceSearch = serverSupportsTraceSearch && isTraceMessage(msg);
    const [isSearchWidgetDisplayed, setSearchWidgetDisplayed] = React.useState(false);
    const [traceSearchMessage, setTraceSearchMessage] = React.useState('');
    const messageId = React.useId();
    const context = {};
    const useContextMenuEvent = (name, action, isEnabled, dependencies) => {
        if (isEnabled) {
            context[name + 'Id'] = messageId;
        }
        (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => action(), dependencies, `${name}:${messageId}`);
    };
    useContextMenuEvent('goToMessageLocation', () => void ec.revealLocation(loc), true, [loc]);
    useContextMenuEvent('copyMessage', () => {
        if (node.current) {
            void ec.api.copyToClipboard(node.current.innerText);
        }
    }, true, [loc]);
    useContextMenuEvent('hideTraceSearch', () => setSearchWidgetDisplayed(false), isMessageWithTraceSearch && isSearchWidgetDisplayed, []);
    useContextMenuEvent('showTraceSearch', () => setSearchWidgetDisplayed(true), isMessageWithTraceSearch && !isSearchWidgetDisplayed, []);
    const rs = (0, rpcSessions_1.useRpcSessionAtPos)(startPos);
    const search = React.useCallback(async () => {
        if (traceSearchMessage === '') {
            setMsg(diag.message);
        }
        const r = await (0, infoview_api_1.highlightMatches)(rs, traceSearchMessage, diag.message);
        setMsg(r);
    }, [rs, traceSearchMessage, diag.message]);
    return (<collapsing_1.Details initiallyOpen data-vscode-context={JSON.stringify(context)}>
            <span className={severityClass}>
                {title}
                <span className="fr" onClick={e => e.preventDefault()}>
                    <a className="link pointer mh2 dim codicon codicon-go-to-file" onClick={_ => {
            void ec.revealLocation(loc);
        }} title="Go to source location of message"></a>
                    {isMessageWithTraceSearch && (<a className={'link pointer mh2 dim codicon ' +
                (isSearchWidgetDisplayed ? 'codicon-search-stop' : 'codicon-go-to-search')} onClick={_ => {
                if (isSearchWidgetDisplayed) {
                    setSearchWidgetDisplayed(false);
                    setTraceSearchMessage('');
                    setMsg(diag.message);
                }
                else {
                    setSearchWidgetDisplayed(true);
                }
            }} title={isSearchWidgetDisplayed ? 'Hide search' : 'Show search'}></a>)}
                </span>
            </span>
            <div className="ml1" ref={node}>
                <pre className="font-code pre-wrap">
                    <contexts_1.EnvPosContext.Provider value={startPos}>
                        {isSearchWidgetDisplayed && (<form onSubmit={e => {
                e.preventDefault();
                void search();
            }}>
                                <react_elements_1.VscodeTextfield className="trace-search" value={traceSearchMessage} onInput={e => setTraceSearchMessage(e.target.value)} placeholder="Search">
                                    <a className="link pointer mh2 dim codicon codicon-collapse-all" title="Collapse all" slot="content-after" onClick={_ => {
                setTraceSearchMessage('');
                setMsg(diag.message);
            }}></a>
                                    <a className="link pointer mh2 dim codicon codicon-search" type="submit" title="Search" slot="content-after" onClick={_ => void search()}></a>
                                </react_elements_1.VscodeTextfield>
                            </form>)}
                        <traceExplorer_1.InteractiveMessage fmt={msg}/>
                    </contexts_1.EnvPosContext.Provider>
                </pre>
            </div>
        </collapsing_1.Details>);
}, react_fast_compare_1.default);
function comparePosition(p1, p2) {
    const l = p1.line - p2.line;
    if (l !== 0) {
        return l;
    }
    return p1.character - p2.character;
}
function compareRange(r1, r2) {
    const s = comparePosition(r1.start, r2.start);
    if (s !== 0) {
        return s;
    }
    return comparePosition(r1.end, r2.end);
}
function computeProximity(r, p) {
    if (util_1.PositionHelpers.isLessThanOrEqual(r.end, p)) {
        return {
            relation: 'Before',
            lineDistance: p.line - r.end.line,
            characterOffset: r.end.character,
        };
    }
    if (util_1.PositionHelpers.isLessThan(p, r.start)) {
        return {
            relation: 'After',
            lineDistance: r.start.line - p.line,
            characterOffset: r.start.character,
        };
    }
    return {
        relation: 'Inside',
        lineDistance: p.line - r.start.line,
        characterOffset: r.start.character,
    };
}
function relationPriority(r) {
    switch (r) {
        case 'Inside':
            return 0;
        case 'Before':
            return 1;
        case 'After':
            return 2;
    }
}
function compareProximity(p1, p2) {
    const ld = p1.lineDistance - p2.lineDistance;
    if (ld !== 0) {
        return ld;
    }
    const r = relationPriority(p1.relation) - relationPriority(p2.relation);
    if (r !== 0) {
        return r;
    }
    const rel = p1.relation;
    if (rel === 'Before' || rel === 'Inside') {
        return p2.characterOffset - p1.characterOffset;
    }
    rel;
    return p1.characterOffset - p2.characterOffset;
}
function sortDiags(idiags, sortOrder, p) {
    if (p === undefined || sortOrder === 'Sort by message location') {
        return idiags.toSorted((d1, d2) => compareRange(d1.fullRange ?? d1.range, d2.fullRange ?? d2.range));
    }
    sortOrder;
    return idiags.toSorted((d1, d2) => {
        const p1 = computeProximity(d1.range, p);
        const p2 = computeProximity(d2.range, p);
        return compareProximity(p1, p2);
    });
}
function mkMessageViewProps(uri, messages, sortOrder, pos) {
    const views = sortDiags(messages, sortOrder, pos).map(m => {
        return { uri, diag: m };
    });
    return (0, util_1.addUniqueKeys)(views, v => JSON.stringify(v));
}
/** Shows the given messages assuming they are for the given file. */
exports.MessagesList = React.memo(({ uri, messages, sortOrder, pos, }) => {
    const should_hide = messages.length === 0;
    if (should_hide) {
        return <>No messages.</>;
    }
    return (<div className="ml1">
                {mkMessageViewProps(uri, messages, sortOrder, pos).map(m => (<MessageView {...m} key={m.key}/>))}
            </div>);
});
function lazy(f) {
    let state;
    return () => {
        if (!state)
            state = { t: f() };
        return state.t;
    };
}
/** Displays all messages for the specified file. Can be paused. */
function AllMessages({ uri: uri0 }) {
    const ec = React.useContext(contexts_1.EditorContext);
    const rs0 = (0, rpcSessions_1.useRpcSessionAtPos)({ uri: uri0, line: 0, character: 0 });
    const dc = React.useContext(contexts_1.LspDiagnosticsContext);
    const config = React.useContext(contexts_1.ConfigContext);
    const diags0 = React.useMemo(() => dc.get(uri0) || [], [dc, uri0]).filter(diag => diag.isSilent === undefined || !diag.isSilent);
    const curPos = (0, util_1.useEventResult)(ec.events.changedCursorLocation, loc => loc ? { uri: loc.uri, ...loc.range.start } : undefined);
    const [sortOrder, setSortOrder] = React.useState(config.messageOrder);
    const iDiags0 = React.useMemo(() => lazy(async () => {
        // The last line for which we have received diagnostics so far.
        // Providing a line range to `getInteractiveDiagnostics`
        // ensures that the call doesn't block until the whole file is elaborated.
        const maxLine = diags0.reduce((ln, d) => Math.max(ln, d.range.end.line), 0) + 1;
        try {
            let diags = await (0, infoview_api_2.getInteractiveDiagnostics)(rs0, { start: 0, end: maxLine });
            diags = diags.filter(d => d.isSilent === undefined || !d.isSilent);
            if (diags.length > 0) {
                return { diags, tally: tallyOfDiags(diags) };
            }
        }
        catch (err) {
            if (err?.code === infoview_api_1.RpcErrorCode.ContentModified) {
                // Document has been changed since we made the request. This can happen
                // while typing quickly. When the server catches up on next edit, it will
                // send new diagnostics to which the infoview responds by calling
                // `getInteractiveDiagnostics` again.
            }
            else {
                console.log('getInteractiveDiagnostics error ', err);
            }
        }
        const diags = diags0.map(d => ({ ...d, message: { text: d.message } }));
        return { diags, tally: tallyOfDiags(diags) };
    }), [rs0, diags0]);
    const [{ isPaused, setPaused }, [uri, rs, diags, iDiags], _] = (0, util_1.usePausableState)(false, [uri0, rs0, diags0, iDiags0]);
    // Fetch interactive diagnostics when we're entering the paused state
    // (if they haven't already been fetched before)
    React.useEffect(() => {
        if (isPaused) {
            void iDiags();
        }
    }, [iDiags, isPaused]);
    const setOpenRef = React.useRef();
    (0, util_1.useEvent)(ec.events.requestedAction, _ => {
        if (setOpenRef.current !== undefined) {
            setOpenRef.current(t => !t);
        }
    }, [setOpenRef], 'toggleAllMessages');
    // The number of actually displayed messages, or `undefined` if the panel is collapsed.
    // When `undefined`, we can approximate it by `diags.length`.
    const [tally, setTally] = React.useState(undefined);
    const id = React.useId();
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => setPaused(true), [], `pauseAllMessages:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => setPaused(false), [], `unpauseAllMessages:${id}`);
    const context = isPaused ? { unpauseAllMessagesId: id } : { pauseAllMessagesId: id };
    return (<rpcSessions_1.RpcContext.Provider value={rs}>
            <collapsing_1.Details setOpenRef={r => (setOpenRef.current = r)} initiallyOpen={!config.autoOpenShowsGoal} data-vscode-context={JSON.stringify(context)}>
                <>
                    All Messages <TallyDisplay t={tally ?? tallyOfDiags(diags)}></TallyDisplay>
                    <span className="fr" onClick={e => {
            e.preventDefault();
        }}>
                        <a className={'link pointer mh2 dim codicon codicon-sort-precedence'} onClick={_ => {
            setSortOrder(o => o === 'Sort by message location'
                ? 'Sort by proximity to text cursor'
                : 'Sort by message location');
        }} title={sortOrder === 'Sort by message location'
            ? 'Sort by proximity to text cursor'
            : 'Sort by message location'}></a>
                        <a className={'link pointer mh2 dim codicon ' +
            (isPaused ? 'codicon-debug-continue' : 'codicon-debug-pause')} onClick={_ => {
            setPaused(p => !p);
        }} title={isPaused ? "Unpause 'All Messages'" : "Pause 'All Messages'"}></a>
                    </span>
                </>
                <AllMessagesBody uri={uri} messages={iDiags} tally={tally} setTally={setTally} sortOrder={sortOrder} pos={curPos}/>
            </collapsing_1.Details>
        </rpcSessions_1.RpcContext.Provider>);
}
function tallyOfDiags(msgs) {
    return {
        errors: (0, util_1.count)(msgs, m => m.severity === vscode_languageserver_protocol_1.DiagnosticSeverity.Error),
        warnings: (0, util_1.count)(msgs, m => m.severity === vscode_languageserver_protocol_1.DiagnosticSeverity.Warning),
        infos: (0, util_1.count)(msgs, m => m.severity === vscode_languageserver_protocol_1.DiagnosticSeverity.Information),
        total: msgs.length,
    };
}
function TallyDisplay({ t }) {
    if (t.errors === 0 && t.warnings === 0 && t.infos === 0) {
        return <></>;
    }
    const warningSpace = t.errors > 0 ? <> </> : <></>;
    const infoSpace = t.warnings > 0 || t.errors > 0 ? <> </> : <></>;
    return (<>
            (
            {t.errors > 0 && (<>
                    <span className={'font-codicon codicon codicon-error'}></span> {t.errors}
                </>)}
            {t.warnings > 0 && (<>
                    {warningSpace}
                    <span className={'font-codicon codicon codicon-warning'}></span> {t.warnings}
                </>)}
            {t.infos > 0 && (<>
                    {infoSpace}
                    <span className={'font-codicon codicon codicon-info'}></span> {t.infos}
                </>)}
            )
        </>);
}
/** We factor out the body of {@link AllMessages} which lazily fetches its contents only when expanded. */
function AllMessagesBody({ uri, messages, tally, setTally, sortOrder, pos }) {
    const [msgs, setMsgs] = React.useState(undefined);
    React.useEffect(() => {
        const fn = async () => {
            const { diags, tally: newTally } = await messages();
            setMsgs(diags);
            // Avoid re-render loop with `AllMessages`
            if (JSON.stringify(tally) !== JSON.stringify(newTally)) {
                setTally(newTally);
            }
        };
        void fn();
    }, [messages, tally, setTally]);
    React.useEffect(() => () => /* Called on unmount. */ setTally(undefined), [setTally]);
    if (msgs === undefined)
        return <>Loading messages...</>;
    else
        return <exports.MessagesList uri={uri} messages={msgs} sortOrder={sortOrder} pos={pos}/>;
}
/**
 * Provides a `LspDiagnosticsContext` which stores the latest version of the
 * diagnostics as sent by the publishDiagnostics notification.
 */
function WithLspDiagnosticsContext({ children }) {
    const [allDiags, _0] = (0, util_1.useServerNotificationState)('textDocument/publishDiagnostics', new Map(), async (params) => diags => new Map(diags).set(params.uri, params.diagnostics), []);
    return <contexts_1.LspDiagnosticsContext.Provider value={allDiags}>{children}</contexts_1.LspDiagnosticsContext.Provider>;
}
/** Embeds a non-interactive diagnostic into the type `InteractiveDiagnostic`. */
function lspDiagToInteractive(diag) {
    return { ...diag, message: { text: diag.message } };
}
//# sourceMappingURL=messages.js.map