"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Info = Info;
const React = require("react");
const infoview_api_1 = require("@leanprover/infoview-api");
const collapsing_1 = require("./collapsing");
const contexts_1 = require("./contexts");
const goalLocation_1 = require("./goalLocation");
const goals_1 = require("./goals");
const messages_1 = require("./messages");
const rpcSessions_1 = require("./rpcSessions");
const userWidget_1 = require("./userWidget");
const util_1 = require("./util");
const InfoStatusBar = React.memo((props) => {
    const { kind, onPin, status, pos, isPaused, setPaused, triggerUpdate } = props;
    const ec = React.useContext(contexts_1.EditorContext);
    const statusColTable = {
        updating: 'gold ',
        error: 'dark-red ',
        ready: '',
    };
    const statusColor = statusColTable[status];
    const locationString = `${(0, util_1.basename)(pos.uri)}:${pos.line + 1}:${pos.character}`;
    const isPinned = kind === 'pin';
    const spinnerStyle = {
        opacity: status === 'updating' ? 1 : 0,
        animationName: 'spin',
        animationIterationCount: 'infinite',
        transitionDuration: '0.15s',
        transitionProperty: 'opacity',
        transitionTimingFunction: 'ease-in',
        color: 'var(--vscode-editor-foreground)',
        fontSize: 'calc(0.8 * var(--vscode-font-size))',
    };
    return (<summary style={{ transition: 'color 0.5s ease' }} className={'mv2 pointer non-selectable' + statusColor}>
            {locationString}
            {isPinned && !isPaused && ' (pinned)'}
            {!isPinned && isPaused && ' (paused)'}
            {isPinned && isPaused && ' (pinned and paused)'}
            <span style={spinnerStyle} className="mh2 codicon codicon-loading" title="Updating ...">
                <style>
                    {`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}
                </style>
            </span>
            <span className="fr" onClick={e => {
            e.preventDefault();
        }}>
                {isPinned && (<a className="link pointer mh2 dim codicon codicon-go-to-file" data-id="reveal-file-location" onClick={_ => {
                void ec.revealPosition(pos);
            }} title="Go to pinned location in file"/>)}
                {isPaused && (<a className="link pointer mh2 dim codicon codicon-refresh" data-id="update" onClick={_ => {
                void triggerUpdate();
            }} title="Refresh paused state"/>)}
                <a className={'link pointer mh2 dim codicon ' + (isPinned ? 'codicon-pinned ' : 'codicon-pin ')} data-id="toggle-pinned" onClick={_ => {
            onPin(pos);
        }} title={isPinned ? 'Unpin state' : 'Pin state to top'}/>
                <a className={'link pointer mh2 dim codicon ' +
            (isPaused ? 'codicon-debug-continue ' : 'codicon-debug-pause ')} data-id="toggle-paused" onClick={_ => {
            setPaused(!isPaused);
        }} title={isPaused ? 'Unpause state' : 'Pause state'}/>
            </span>
        </summary>);
});
function GoalInfoDisplay(props) {
    const { pos, goals, termGoal, userWidgets } = props;
    const ec = React.useContext(contexts_1.EditorContext);
    const config = React.useContext(contexts_1.ConfigContext);
    const [selectedLocs, setSelectedLocs] = React.useState([]);
    const selectedLocationsId = React.useId();
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        setSelectedLocs([]);
    }, [setSelectedLocs], `unselectAll:${selectedLocationsId}`);
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const [prevPos, setPrevPos] = React.useState(pos);
    if (!util_1.DocumentPosition.isEqual(pos, prevPos)) {
        setPrevPos(pos);
        setSelectedLocs([]);
    }
    const locs = React.useMemo(() => ({
        isSelected: (l) => selectedLocs.some(v => goalLocation_1.GoalsLocation.isEqual(v, l)),
        setSelected: (l, act) => setSelectedLocs(ls => {
            // We ensure that `selectedLocs` maintains its reference identity if the selection
            // status of `l` didn't change.
            const newLocs = ls.filter(v => !goalLocation_1.GoalsLocation.isEqual(v, l));
            const wasSelected = newLocs.length !== ls.length;
            const isSelected = typeof act === 'function' ? act(wasSelected) : act;
            if (isSelected)
                newLocs.push(l);
            return wasSelected === isSelected ? ls : newLocs;
        }),
        subexprTemplate: undefined,
    }), [selectedLocs]);
    return (<>
            <goalLocation_1.LocationsContext.Provider value={locs}>
                <span data-vscode-context={JSON.stringify(selectedLocs.length === 0 ? {} : { selectedLocationsId })}>
                    <goals_1.FilteredGoals key="goals" headerChildren="Tactic state" initiallyOpen goals={goals} displayCount/>
                </span>
            </goalLocation_1.LocationsContext.Provider>
            {config.expectedTypeVisibility !== 'Hidden' && (<goals_1.FilteredGoals key="term-goal" headerChildren="Expected type" goals={termGoal !== undefined ? { goals: [termGoal] } : undefined} initiallyOpen={config.expectedTypeVisibility === 'Expanded by default'} displayCount={false} togglingAction="toggleExpectedType"/>)}
            {userWidgets.map(widget => {
            const inner = (<userWidget_1.PanelWidgetDisplay key={`widget::${widget.id}::${widget.range?.toString()}`} pos={pos} goals={goals ? goals.goals : []} termGoal={termGoal} selectedLocations={selectedLocs} widget={widget}/>);
            if (widget.name)
                return (<details key={`widget::${widget.id}::${widget.range?.toString()}`} open>
                            <summary className="mv2 pointer non-selectable">{widget.name}</summary>
                            {inner}
                        </details>);
            else
                return inner;
        })}
        </>);
}
const InfoDisplayContent = React.memo((props) => {
    const { pos, messages, goals, termGoal, error, userWidgets, triggerUpdate, isPaused, setPaused } = props;
    const hasWidget = userWidgets.length > 0;
    const hasError = !!error;
    const hasMessages = messages.length !== 0;
    const nothingToShow = !hasError && !goals && !termGoal && !hasMessages && !hasWidget;
    /* Adding {' '} to manage string literals properly: https://reactjs.org/docs/jsx-in-depth.html#string-literals-1 */
    return (<>
            {hasError && (<div className="error" key="errors">
                    Error updating: {error}.
                    <a className="link pointer dim" onClick={(0, util_1.withPreventedClickOnTextSelection)(_ => void triggerUpdate())}>
                        {' '}
                        Try again.
                    </a>
                </div>)}
            <GoalInfoDisplay pos={pos} goals={goals} termGoal={termGoal} userWidgets={userWidgets}/>
            <div style={hasMessages ? {} : { display: 'none' }} key="messages">
                <collapsing_1.Details initiallyOpen key="messages">
                    <>
                        Messages <messages_1.TallyDisplay t={(0, messages_1.tallyOfDiags)(messages)}></messages_1.TallyDisplay>
                    </>
                    <div className="ml1">
                        <messages_1.MessagesList uri={pos.uri} messages={messages} pos={pos} sortOrder={'Sort by proximity to text cursor'}/>
                    </div>
                </collapsing_1.Details>
            </div>
            {nothingToShow &&
            (isPaused ? (
            /* Adding {' '} to manage string literals properly: https://reactjs.org/docs/jsx-in-depth.html#string-literals-1 */
            <span>
                        Updating is paused.{' '}
                        <a className="link pointer dim" onClick={(0, util_1.withPreventedClickOnTextSelection)(_ => void triggerUpdate())}>
                            Refresh
                        </a>{' '}
                        or{' '}
                        <a className="link pointer dim" onClick={(0, util_1.withPreventedClickOnTextSelection)(_ => setPaused(false))}>
                            resume updating
                        </a>{' '}
                        to see information.
                    </span>) : ('No info found.'))}
        </>);
});
/** Displays goal state and messages. Can be paused. */
function InfoDisplay(props0) {
    // Used to update the paused state *just once* if it is paused,
    // but a display update is triggered
    const [shouldRefresh, setShouldRefresh] = React.useState(false);
    const [{ isPaused, setPaused }, props, propsRef] = (0, util_1.usePausableState)(false, props0);
    if (shouldRefresh) {
        propsRef.current = props0;
        setShouldRefresh(false);
    }
    const triggerDisplayUpdate = async () => {
        await props0.triggerUpdate();
        setShouldRefresh(true);
    };
    const { kind, pos, onPin, goals, rpcSess } = props;
    const ec = React.useContext(contexts_1.EditorContext);
    // If we are the cursor infoview, then we should subscribe to
    // some commands from the editor extension
    const isCursor = kind === 'cursor';
    (0, util_1.useEvent)(ec.events.requestedAction, _ => {
        if (!isCursor)
            return;
        if (goals)
            void ec.copyToComment((0, goals_1.goalsToString)(goals));
    }, [isCursor, goals, ec], 'copyToComment');
    (0, util_1.useEvent)(ec.events.requestedAction, _ => {
        if (!isCursor)
            return;
        setPaused(isPaused => !isPaused);
    }, [isCursor, setPaused], 'togglePaused');
    const id = React.useId();
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        setPaused(true);
    }, [setPaused], `pause:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        setPaused(false);
    }, [setPaused], `unpause:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        if (isCursor) {
            onPin(pos);
        }
    }, [isCursor, onPin, pos], `pin:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        if (!isCursor) {
            onPin(pos);
        }
    }, [isCursor, onPin, pos], `unpin:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => {
        void triggerDisplayUpdate();
    }, [isCursor, onPin, pos], `refresh:${id}`);
    (0, util_1.useEvent)(ec.events.clickedContextMenu, async (_) => void ec.revealPosition(pos), [pos], `goToPinnedLocation:${id}`);
    const pauseContext = isPaused ? { unpauseId: id } : { pauseId: id };
    const pinContext = isCursor ? { pinId: id } : { unpinId: id };
    const refreshContext = isPaused ? { refreshId: id } : {};
    const goToPinnedLocationContext = !isCursor ? { goToPinnedLocationId: id } : {};
    return (<rpcSessions_1.RpcContext.Provider value={rpcSess}>
            <contexts_1.EnvPosContext.Provider value={pos}>
                <details data-vscode-context={JSON.stringify({
            ...pauseContext,
            ...pinContext,
            ...refreshContext,
            ...goToPinnedLocationContext,
        })} open>
                    <InfoStatusBar {...props} triggerUpdate={triggerDisplayUpdate} isPaused={isPaused} setPaused={setPaused}/>
                    <div className="ml1">
                        <InfoDisplayContent {...props} triggerUpdate={triggerDisplayUpdate} isPaused={isPaused} setPaused={setPaused}/>
                    </div>
                </details>
            </contexts_1.EnvPosContext.Provider>
        </rpcSessions_1.RpcContext.Provider>);
}
/** Fetches info from the server and renders an {@link InfoDisplay}. */
function Info(props) {
    if (props.kind === 'cursor')
        return <InfoAtCursor {...props}/>;
    else
        return <InfoAux {...props} pos={props.pos}/>;
}
function InfoAtCursor(props) {
    const ec = React.useContext(contexts_1.EditorContext);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [curLoc, setCurLoc] = React.useState(ec.events.changedCursorLocation.current);
    (0, util_1.useEvent)(ec.events.changedCursorLocation, loc => loc && setCurLoc(loc), []);
    const pos = { uri: curLoc.uri, ...curLoc.range.start };
    return <InfoAux {...props} pos={pos}/>;
}
function useIsProcessingAt(p) {
    const allProgress = React.useContext(contexts_1.ProgressContext);
    const processing = allProgress.get(p.uri);
    if (!processing)
        return false;
    return processing.some(i => util_1.RangeHelpers.contains(i.range, p));
}
function InfoAux(props) {
    const config = React.useContext(contexts_1.ConfigContext);
    const pos = props.pos;
    const rpcSess = (0, rpcSessions_1.useRpcSessionAtPos)(pos);
    // Compute the LSP diagnostics at this info's position. We try to ensure that if these remain
    // the same, then so does the identity of `lspDiagsHere` so that it can be used as a dep.
    const lspDiags = React.useContext(contexts_1.LspDiagnosticsContext);
    const [lspDiagsHere, setLspDiagsHere] = React.useState([]);
    React.useEffect(() => {
        // Note: the curly braces are important. https://medium.com/geekculture/react-uncaught-typeerror-destroy-is-not-a-function-192738a6e79b
        setLspDiagsHere(diags0 => {
            const diagPred = (d) => util_1.RangeHelpers.contains(d.fullRange || d.range, { line: pos.line, character: pos.character }, config.allErrorsOnLine);
            const newDiags = (lspDiags.get(pos.uri) || []).filter(diagPred);
            if (newDiags.length === diags0.length && newDiags.every((d, i) => d === diags0[i]))
                return diags0;
            return newDiags;
        });
    }, [lspDiags, pos.uri, pos.line, pos.character, config.allErrorsOnLine]);
    const serverIsProcessing = useIsProcessingAt(pos);
    // This is a virtual dep of the info-requesting function. It is bumped whenever the Lean server
    // indicates that another request should be made. Bumping it dirties the dep state of
    // `useAsyncWithTrigger` below, causing the `useEffect` lower down in this component to
    // make the request. We cannot simply call `triggerUpdateCore` because `useAsyncWithTrigger`
    // does not support reentrancy like that.
    const [updaterTick, setUpdaterTick] = React.useState(0);
    const [state, triggerUpdateCore] = (0, util_1.useAsyncWithTrigger)(() => new Promise((resolve, reject) => {
        const goalsReq = (0, infoview_api_1.getInteractiveGoals)(rpcSess, util_1.DocumentPosition.toTdpp(pos));
        const termGoalReq = (0, infoview_api_1.getInteractiveTermGoal)(rpcSess, util_1.DocumentPosition.toTdpp(pos));
        const widgetsReq = (0, infoview_api_1.Widget_getWidgets)(rpcSess, pos).catch(util_1.discardMethodNotFound);
        const messagesReq = (0, infoview_api_1.getInteractiveDiagnostics)(rpcSess, { start: pos.line, end: pos.line + 1 })
            // fall back to non-interactive diagnostics when lake fails
            // (see https://github.com/leanprover/vscode-lean4/issues/90)
            .then(diags => (diags.length === 0 ? lspDiagsHere.map(messages_1.lspDiagToInteractive) : diags));
        // While `lake print-paths` is running, the output of Lake is shown as
        // info diagnostics on line 1.  However, all RPC requests block until
        // Lake is finished, so we don't see these diagnostics while Lake is
        // building. Therefore we show the LSP diagnostics on line 1 if the
        // server does not respond within half a second.
        // The same is true for fatal header diagnostics like the stale dependency notification.
        const isAllHeaderDiags = lspDiagsHere.length > 0 && lspDiagsHere.every(diag => diag.range.start.line === 0);
        if (isAllHeaderDiags) {
            setTimeout(() => resolve({
                pos,
                status: 'updating',
                messages: lspDiagsHere.map(messages_1.lspDiagToInteractive),
                goals: undefined,
                termGoal: undefined,
                error: undefined,
                userWidgets: [],
                rpcSess,
            }), 500);
        }
        // NB: it is important to await await reqs at once, otherwise
        // if both throw then one exception becomes unhandled.
        Promise.all([goalsReq, termGoalReq, widgetsReq, messagesReq]).then(([goals, termGoal, userWidgets, messages]) => resolve({
            pos,
            status: 'ready',
            messages,
            goals,
            termGoal,
            error: undefined,
            userWidgets: userWidgets?.widgets ?? [],
            rpcSess,
        }), ex => {
            if (ex?.code === infoview_api_1.RpcErrorCode.ContentModified || ex?.code === infoview_api_1.RpcErrorCode.RpcNeedsReconnect) {
                // Document has been changed since we made the request, or we need to reconnect
                // to the RPC sessions. Try again.
                setUpdaterTick(t => t + 1);
                reject('retry');
                return;
            }
            let errorString = '';
            if (typeof ex === 'string') {
                errorString = ex;
            }
            else if ((0, infoview_api_1.isRpcError)(ex)) {
                errorString = (0, util_1.mapRpcError)(ex).message;
            }
            else if (ex instanceof Error) {
                errorString = ex.toString();
            }
            else if ('message' in ex && typeof ex.message === 'string') {
                errorString = ex.message;
            }
            else {
                errorString = `Unrecognized error: ${JSON.stringify(ex)}`;
            }
            resolve({
                pos,
                status: 'error',
                messages: lspDiagsHere.map(messages_1.lspDiagToInteractive),
                goals: undefined,
                termGoal: undefined,
                error: `Error fetching goals: ${errorString}`,
                userWidgets: [],
                rpcSess,
            });
        });
    }), [updaterTick, pos.uri, pos.line, pos.character, rpcSess, serverIsProcessing, lspDiagsHere]);
    // We use a timeout to debounce info requests. Whenever a request is already scheduled
    // but something happens that warrants a request for newer info, we cancel the old request
    // and schedule just the new one.
    const updaterTimeout = React.useRef();
    const clearUpdaterTimeout = () => {
        if (updaterTimeout.current) {
            window.clearTimeout(updaterTimeout.current);
            updaterTimeout.current = undefined;
        }
    };
    const triggerUpdate = React.useCallback(() => new Promise(resolve => {
        clearUpdaterTimeout();
        const tm = window.setTimeout(() => {
            void triggerUpdateCore().then(resolve);
            updaterTimeout.current = undefined;
        }, config.debounceTime);
        // Hack: even if the request is cancelled, the promise should resolve so that no `await`
        // is left waiting forever. We ensure this happens in a simple way.
        window.setTimeout(resolve, config.debounceTime);
        updaterTimeout.current = tm;
    }), [triggerUpdateCore, config.debounceTime]);
    const [displayProps, setDisplayProps] = React.useState({
        pos,
        status: 'updating',
        messages: [],
        goals: undefined,
        termGoal: undefined,
        error: undefined,
        userWidgets: [],
        rpcSess,
        triggerUpdate,
    });
    // Propagates changes in the state of async info requests to the display props,
    // and re-requests info if needed.
    // This effect triggers new requests for info whenever need. It also propagates changes
    // in the state of the `useAsyncWithTrigger` to the displayed props.
    React.useEffect(() => {
        if (state.state === 'notStarted')
            void triggerUpdate();
        else if (state.state === 'loading')
            setDisplayProps(dp => ({ ...dp, status: 'updating' }));
        else if (state.state === 'resolved') {
            setDisplayProps({ ...state.value, triggerUpdate });
        }
        else if (state.state === 'rejected' && state.error !== 'retry') {
            // The code inside `useAsyncWithTrigger` may only ever reject with a `retry` exception.
            console.warn('Unreachable code reached with error: ', state.error);
        }
    }, [state, triggerUpdate]);
    return <InfoDisplay kind={props.kind} onPin={props.onPin} {...displayProps}/>;
}
//# sourceMappingURL=info.js.map