"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderInfoview = renderInfoview;
const react_elements_1 = require("@vscode-elements/react-elements");
const React = require("react");
const ReactDOM = require("react-dom/client");
require("@vscode/codicons/dist/codicon.css");
require("@vscode/codicons/dist/codicon.ttf");
require("tachyons/css/tachyons.css");
require("./highlightjs.css");
require("./index.css");
const infoview_api_1 = require("@leanprover/infoview-api");
const contexts_1 = require("./contexts");
const editorConnection_1 = require("./editorConnection");
const event_1 = require("./event");
const infos_1 = require("./infos");
const messages_1 = require("./messages");
const rpcSessions_1 = require("./rpcSessions");
const serverVersion_1 = require("./serverVersion");
const util_1 = require("./util");
function Main() {
    const ec = React.useContext(contexts_1.EditorContext);
    /* Set up updates to the global infoview state on editor events. */
    const config = (0, util_1.useEventResult)(ec.events.changedInfoviewConfig) ?? infoview_api_1.defaultInfoviewConfig;
    const [allProgress, _1] = (0, util_1.useServerNotificationState)('$/lean/fileProgress', new Map(), async (params) => allProgress => {
        const newProgress = new Map(allProgress);
        return newProgress.set(params.textDocument.uri, params.processing);
    }, []);
    const curUri = (0, util_1.useEventResult)(ec.events.changedCursorLocation, loc => loc?.uri);
    (0, util_1.useClientNotificationEffect)('textDocument/didClose', (params) => {
        if (ec.events.changedCursorLocation.current &&
            ec.events.changedCursorLocation.current.uri === params.textDocument.uri) {
            ec.events.changedCursorLocation.fire(undefined);
        }
    }, []);
    const serverVersion = (0, util_1.useEventResult)(ec.events.serverRestarted, result => new serverVersion_1.ServerVersion(result.serverInfo?.version ?? ''));
    const capabilities = (0, util_1.useEventResult)(ec.events.serverRestarted, result => result.capabilities);
    const serverStoppedResult = (0, util_1.useEventResult)(ec.events.serverStopped);
    // NB: the cursor may temporarily become `undefined` when a file is closed. In this case
    // it's important not to reconstruct the `WithBlah` wrappers below since they contain state
    // that we want to persist.
    let ret;
    if (!serverVersion) {
        ret = <p>Waiting for Lean server to start...</p>;
    }
    else if (serverStoppedResult) {
        ret = (<div>
                <p>{serverStoppedResult.message}</p>
                <p className="error">{serverStoppedResult.reason}</p>
            </div>);
    }
    else {
        ret = (<div className="ma1">
                <infos_1.Infos />
                {curUri && (<div className="mv2">
                        <messages_1.AllMessages uri={curUri}/>
                    </div>)}
                {curUri && (<react_elements_1.VscodeButton className="restart-file-button" onClick={_ => ec.api.restartFile(curUri)} title="Restarts this file, rebuilding all of its outdated dependencies.">
                        Restart File
                    </react_elements_1.VscodeButton>)}
            </div>);
    }
    return (<contexts_1.ConfigContext.Provider value={config}>
            <contexts_1.CapabilityContext.Provider value={capabilities}>
                <contexts_1.VersionContext.Provider value={serverVersion}>
                    <rpcSessions_1.WithRpcSessions>
                        <messages_1.WithLspDiagnosticsContext>
                            <contexts_1.ProgressContext.Provider value={allProgress}>{ret}</contexts_1.ProgressContext.Provider>
                        </messages_1.WithLspDiagnosticsContext>
                    </rpcSessions_1.WithRpcSessions>
                </contexts_1.VersionContext.Provider>
            </contexts_1.CapabilityContext.Provider>
        </contexts_1.ConfigContext.Provider>);
}
/**
 * Render the Lean infoview into the DOM element `uiElement`.
 *
 * @param editorApi is a collection of methods which the infoview needs to be able to invoke
 * on the editor in order to function correctly (such as inserting text or moving the cursor).
 * @returns a collection of methods which must be invoked when the relevant editor events occur.
 */
function renderInfoview(editorApi, uiElement) {
    const editorEvents = {
        initialize: new event_1.EventEmitter(),
        gotServerNotification: new event_1.EventEmitter(),
        sentClientNotification: new event_1.EventEmitter(),
        serverRestarted: new event_1.EventEmitter(),
        serverStopped: new event_1.EventEmitter(),
        changedCursorLocation: new event_1.EventEmitter(),
        changedInfoviewConfig: new event_1.EventEmitter(),
        runTestScript: new event_1.EventEmitter(),
        requestedAction: new event_1.EventEmitter(),
        clickedContextMenu: new event_1.EventEmitter(),
    };
    // Challenge: write a type-correct fn from `Eventify<T>` to `T` without using `any`
    const infoviewApi = {
        initialize: async (l) => editorEvents.initialize.fire(l),
        gotServerNotification: async (method, params) => {
            editorEvents.gotServerNotification.fire([method, params]);
        },
        sentClientNotification: async (method, params) => {
            editorEvents.sentClientNotification.fire([method, params]);
        },
        serverRestarted: async (r) => editorEvents.serverRestarted.fire(r),
        serverStopped: async (serverStoppedReason) => {
            editorEvents.serverStopped.fire(serverStoppedReason);
        },
        changedCursorLocation: async (loc) => editorEvents.changedCursorLocation.fire(loc),
        changedInfoviewConfig: async (conf) => editorEvents.changedInfoviewConfig.fire(conf),
        requestedAction: async (action) => editorEvents.requestedAction.fire(action, action.kind),
        clickedContextMenu: async (action) => {
            editorEvents.clickedContextMenu.fire(action, `${action.entry}:${action.id}`);
            // See comments on `InteractiveCodeTag`.
            const sel = window.getSelection();
            if (sel && 0 < sel.rangeCount && '_InteractiveCodeTagAutoSelection' in sel.getRangeAt(0))
                sel.removeAllRanges();
        },
        // See https://rollupjs.org/guide/en/#avoiding-eval
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        runTestScript: async (script) => new Function(script)(),
        getInfoviewHtml: async () => document.body.innerHTML,
    };
    const ec = new editorConnection_1.EditorConnection(editorApi, editorEvents);
    editorEvents.initialize.on((loc) => ec.events.changedCursorLocation.fire(loc));
    const root = ReactDOM.createRoot(uiElement);
    root.render(<React.StrictMode>
            <contexts_1.EditorContext.Provider value={ec}>
                <Main />
            </contexts_1.EditorContext.Provider>
        </React.StrictMode>);
    return infoviewApi;
}
//# sourceMappingURL=main.js.map