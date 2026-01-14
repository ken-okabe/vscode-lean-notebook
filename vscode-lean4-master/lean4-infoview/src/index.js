"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageData = exports.useServerNotificationState = exports.useServerNotificationEffect = exports.useEventResult = exports.useEvent = exports.useClientNotificationState = exports.useClientNotificationEffect = exports.useAsyncWithTrigger = exports.useAsyncPersistent = exports.useAsync = exports.mapRpcError = exports.DocumentPosition = exports.importWidgetModule = exports.DynamicComponent = exports.ServerVersion = exports.useRpcSession = exports.RpcContext = exports.renderInfoview = exports.Markdown = exports.InteractiveCode = exports.LocationsContext = exports.GoalsLocation = exports.GoalLocation = exports.EditorConnection = exports.VersionContext = exports.EnvPosContext = exports.EditorContext = void 0;
exports.InteractiveMessageData = InteractiveMessageData;
const infoview_api_1 = require("@leanprover/infoview-api");
Object.defineProperty(exports, "MessageData", { enumerable: true, get: function () { return infoview_api_1.MessageData; } });
const rpcSessions_1 = require("./infoview/rpcSessions");
const traceExplorer_1 = require("./infoview/traceExplorer");
const util_1 = require("./infoview/util");
__exportStar(require("@leanprover/infoview-api"), exports);
var contexts_1 = require("./infoview/contexts");
Object.defineProperty(exports, "EditorContext", { enumerable: true, get: function () { return contexts_1.EditorContext; } });
Object.defineProperty(exports, "EnvPosContext", { enumerable: true, get: function () { return contexts_1.EnvPosContext; } });
Object.defineProperty(exports, "VersionContext", { enumerable: true, get: function () { return contexts_1.VersionContext; } });
var editorConnection_1 = require("./infoview/editorConnection");
Object.defineProperty(exports, "EditorConnection", { enumerable: true, get: function () { return editorConnection_1.EditorConnection; } });
var goalLocation_1 = require("./infoview/goalLocation");
Object.defineProperty(exports, "GoalLocation", { enumerable: true, get: function () { return goalLocation_1.GoalLocation; } });
Object.defineProperty(exports, "GoalsLocation", { enumerable: true, get: function () { return goalLocation_1.GoalsLocation; } });
Object.defineProperty(exports, "LocationsContext", { enumerable: true, get: function () { return goalLocation_1.LocationsContext; } });
var interactiveCode_1 = require("./infoview/interactiveCode");
Object.defineProperty(exports, "InteractiveCode", { enumerable: true, get: function () { return interactiveCode_1.InteractiveCode; } });
Object.defineProperty(exports, "Markdown", { enumerable: true, get: function () { return interactiveCode_1.Markdown; } });
var main_1 = require("./infoview/main");
Object.defineProperty(exports, "renderInfoview", { enumerable: true, get: function () { return main_1.renderInfoview; } });
var rpcSessions_2 = require("./infoview/rpcSessions");
Object.defineProperty(exports, "RpcContext", { enumerable: true, get: function () { return rpcSessions_2.RpcContext; } });
Object.defineProperty(exports, "useRpcSession", { enumerable: true, get: function () { return rpcSessions_2.useRpcSession; } });
var serverVersion_1 = require("./infoview/serverVersion");
Object.defineProperty(exports, "ServerVersion", { enumerable: true, get: function () { return serverVersion_1.ServerVersion; } });
var userWidget_1 = require("./infoview/userWidget");
Object.defineProperty(exports, "DynamicComponent", { enumerable: true, get: function () { return userWidget_1.DynamicComponent; } });
Object.defineProperty(exports, "importWidgetModule", { enumerable: true, get: function () { return userWidget_1.importWidgetModule; } });
var util_2 = require("./infoview/util");
Object.defineProperty(exports, "DocumentPosition", { enumerable: true, get: function () { return util_2.DocumentPosition; } });
Object.defineProperty(exports, "mapRpcError", { enumerable: true, get: function () { return util_2.mapRpcError; } });
Object.defineProperty(exports, "useAsync", { enumerable: true, get: function () { return util_2.useAsync; } });
Object.defineProperty(exports, "useAsyncPersistent", { enumerable: true, get: function () { return util_2.useAsyncPersistent; } });
Object.defineProperty(exports, "useAsyncWithTrigger", { enumerable: true, get: function () { return util_2.useAsyncWithTrigger; } });
Object.defineProperty(exports, "useClientNotificationEffect", { enumerable: true, get: function () { return util_2.useClientNotificationEffect; } });
Object.defineProperty(exports, "useClientNotificationState", { enumerable: true, get: function () { return util_2.useClientNotificationState; } });
Object.defineProperty(exports, "useEvent", { enumerable: true, get: function () { return util_2.useEvent; } });
Object.defineProperty(exports, "useEventResult", { enumerable: true, get: function () { return util_2.useEventResult; } });
Object.defineProperty(exports, "useServerNotificationEffect", { enumerable: true, get: function () { return util_2.useServerNotificationEffect; } });
Object.defineProperty(exports, "useServerNotificationState", { enumerable: true, get: function () { return util_2.useServerNotificationState; } });
/** Display the given message data as interactive, pretty-printed text. */
function InteractiveMessageData({ msg }) {
    const rs = (0, rpcSessions_1.useRpcSession)();
    const interactive = (0, util_1.useAsync)(() => (0, infoview_api_1.InteractiveDiagnostics_msgToInteractive)(rs, msg, 0), [rs, msg]);
    if (interactive.state === 'resolved') {
        return <traceExplorer_1.InteractiveMessage fmt={interactive.value}/>;
    }
    else if (interactive.state === 'loading') {
        return <>...</>;
    }
    else {
        return (<div>
                Failed to display message:
                {<span>{(0, util_1.mapRpcError)(interactive.error).message}</span>}
            </div>);
    }
}
//# sourceMappingURL=index.js.map