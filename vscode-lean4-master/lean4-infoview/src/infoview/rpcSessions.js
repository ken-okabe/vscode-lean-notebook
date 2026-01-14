"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcContext = void 0;
exports.WithRpcSessions = WithRpcSessions;
exports.useRpcSessionAtTdpp = useRpcSessionAtTdpp;
exports.useRpcSessionAtPos = useRpcSessionAtPos;
exports.useRpcSession = useRpcSession;
const infoview_api_1 = require("@leanprover/infoview-api");
const React = require("react");
const contexts_1 = require("./contexts");
const util_1 = require("./util");
const RpcSessionsContext = React.createContext(undefined);
/**
 * Provides a {@link RpcSessionsContext} to the children.
 * The {@link RpcSessions} object stored there manages RPC sessions in the Lean server.
 */
function WithRpcSessions({ children }) {
    const ec = React.useContext(contexts_1.EditorContext);
    const [sessions] = React.useState(() => new infoview_api_1.RpcSessions({
        createRpcSession: (uri) => ec.api.createRpcSession(uri),
        closeRpcSession: (uri) => ec.api.closeRpcSession(uri),
        call: (params) => ec.api.sendClientRequest(params.textDocument.uri, '$/lean/rpc/call', params),
        release: (params) => void ec.api.sendClientNotification(params.uri, '$/lean/rpc/release', params),
    }));
    React.useEffect(() => {
        // Clean up the sessions on unmount
        return () => sessions.dispose();
    }, [sessions]);
    (0, util_1.useClientNotificationEffect)('textDocument/didClose', (params) => {
        sessions.closeSessionForFile(params.textDocument.uri);
    }, [sessions]);
    // TODO: only restart files for the server that stopped
    (0, util_1.useEvent)(ec.events.serverRestarted, () => sessions.closeAllSessions());
    return <RpcSessionsContext.Provider value={sessions}>{children}</RpcSessionsContext.Provider>;
}
const noCtxRpcSession = {
    call: async () => {
        throw new Error('no RPC context set');
    },
};
const noPosRpcSession = {
    call: async () => {
        throw new Error('no position context set');
    },
};
function useRpcSessionAtTdpp(pos) {
    return React.useContext(RpcSessionsContext)?.connect(pos) || noCtxRpcSession;
}
function useRpcSessionAtPos(pos) {
    return useRpcSessionAtTdpp(util_1.DocumentPosition.toTdpp(pos));
}
/** @deprecated use {@link useRpcSession} instead */
/*
 * NOTE(WN): This context cannot be removed as of 2024-05-27 since existing widgets use it.
 * For backwards compatibility, it must be set to the correct value by infoview code.
 * A future major release of @leanprover/infoview could remove this context
 * after it has been deprecated for a sufficiently long time.
 */
exports.RpcContext = React.createContext(noCtxRpcSession);
/**
 * Retrieve an RPC session at {@link EnvPosContext},
 * if the context is set.
 * Otherwise return a dummy session that throws on any RPC call.
 */
function useRpcSession() {
    const pos = React.useContext(contexts_1.EnvPosContext);
    const rsc = React.useContext(RpcSessionsContext);
    if (!pos)
        return noPosRpcSession;
    if (!rsc)
        return noCtxRpcSession;
    return rsc.connect(util_1.DocumentPosition.toTdpp(pos));
}
//# sourceMappingURL=rpcSessions.js.map