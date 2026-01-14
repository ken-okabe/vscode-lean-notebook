"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcErrorCode = exports.RpcPtr = exports.LeanFileProgressKind = exports.LeanTag = void 0;
exports.isRpcError = isRpcError;
// Lean 4 extensions to LSP.
var LeanTag;
(function (LeanTag) {
    LeanTag[LeanTag["UnsolvedGoals"] = 1] = "UnsolvedGoals";
    LeanTag[LeanTag["GoalsAccomplished"] = 2] = "GoalsAccomplished";
})(LeanTag || (exports.LeanTag = LeanTag = {}));
// Seems to be an eslint bug:
// eslint-disable-next-line no-shadow
var LeanFileProgressKind;
(function (LeanFileProgressKind) {
    LeanFileProgressKind[LeanFileProgressKind["Processing"] = 1] = "Processing";
    LeanFileProgressKind[LeanFileProgressKind["FatalError"] = 2] = "FatalError";
})(LeanFileProgressKind || (exports.LeanFileProgressKind = LeanFileProgressKind = {}));
// eslint-disable-next-line @typescript-eslint/no-namespace
var RpcPtr;
(function (RpcPtr) {
    function copy(p) {
        return { p: p.p };
    }
    RpcPtr.copy = copy;
    /** Turns a reference into a unique string. Useful for React `key`s. */
    function toKey(p) {
        return p.p;
    }
    RpcPtr.toKey = toKey;
})(RpcPtr || (exports.RpcPtr = RpcPtr = {}));
var RpcErrorCode;
(function (RpcErrorCode) {
    RpcErrorCode[RpcErrorCode["ParseError"] = -32700] = "ParseError";
    RpcErrorCode[RpcErrorCode["InvalidRequest"] = -32600] = "InvalidRequest";
    RpcErrorCode[RpcErrorCode["MethodNotFound"] = -32601] = "MethodNotFound";
    RpcErrorCode[RpcErrorCode["InvalidParams"] = -32602] = "InvalidParams";
    RpcErrorCode[RpcErrorCode["InternalError"] = -32603] = "InternalError";
    RpcErrorCode[RpcErrorCode["ServerNotInitialized"] = -32002] = "ServerNotInitialized";
    RpcErrorCode[RpcErrorCode["UnknownErrorCode"] = -32001] = "UnknownErrorCode";
    RpcErrorCode[RpcErrorCode["ContentModified"] = -32801] = "ContentModified";
    RpcErrorCode[RpcErrorCode["RequestCancelled"] = -32800] = "RequestCancelled";
    RpcErrorCode[RpcErrorCode["RpcNeedsReconnect"] = -32900] = "RpcNeedsReconnect";
    RpcErrorCode[RpcErrorCode["WorkerExited"] = -32901] = "WorkerExited";
    RpcErrorCode[RpcErrorCode["WorkerCrashed"] = -32902] = "WorkerCrashed";
})(RpcErrorCode || (exports.RpcErrorCode = RpcErrorCode = {}));
function isRpcError(x) {
    return !!(x?.code && x?.message);
}
//# sourceMappingURL=lspTypes.js.map