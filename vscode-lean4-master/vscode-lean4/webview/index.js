"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const loader_1 = require("@leanprover/infoview/loader");
const rpc_1 = require("../src/rpc");
const vscodeApi = acquireVsCodeApi();
function modifyState(f) {
    vscodeApi.setState(f(vscodeApi.getState() ?? {}));
}
const rpc = new rpc_1.Rpc((m) => vscodeApi.postMessage(m));
window.addEventListener('message', e => rpc.messageReceived(e.data));
const editorApi = rpc.getApi();
const div = document.querySelector('#react_root');
const script = document.currentScript;
if (div && script) {
    const imports = {
        '@leanprover/infoview': script.getAttribute('data-importmap-leanprover-infoview'),
        react: script.getAttribute('data-importmap-react'),
        'react/jsx-runtime': script.getAttribute('data-importmap-react-jsx-runtime'),
        'react-dom': script.getAttribute('data-importmap-react-dom'),
    };
    (0, loader_1.loadRenderInfoview)(imports, [editorApi, div], async (api) => {
        const previousState = vscodeApi.getState();
        const apiWithPersistedState = { ...api };
        apiWithPersistedState.initialize = async (loc) => {
            await api.initialize(loc);
            modifyState(s => {
                return { ...s, cursorLoc: loc };
            });
        };
        apiWithPersistedState.changedCursorLocation = async (loc) => {
            await api.changedCursorLocation(loc);
            if (loc !== undefined) {
                modifyState(s => {
                    return { ...s, cursorLoc: loc };
                });
            }
        };
        apiWithPersistedState.changedInfoviewConfig = async (config) => {
            await api.changedInfoviewConfig(config);
            modifyState(s => {
                return { ...s, config };
            });
        };
        apiWithPersistedState.serverRestarted = async (initializeResult) => {
            await api.serverRestarted(initializeResult);
            modifyState(s => {
                return { ...s, initializeResult };
            });
        };
        apiWithPersistedState.gotServerNotification = async (method, params) => {
            await api.gotServerNotification(method, params);
            if (method === 'textDocument/publishDiagnostics') {
                modifyState(s => {
                    return { ...s, diags: params };
                });
            }
        };
        rpc.register(apiWithPersistedState);
        if (previousState !== undefined) {
            if (previousState.cursorLoc !== undefined) {
                await api.initialize(previousState.cursorLoc);
            }
            if (previousState.config !== undefined) {
                await api.changedInfoviewConfig(previousState.config);
            }
            if (previousState.initializeResult !== undefined) {
                await api.serverRestarted(previousState.initializeResult);
            }
            if (previousState.diags !== undefined) {
                await api.gotServerNotification('textDocument/publishDiagnostics', previousState.diags);
            }
        }
    });
}
//# sourceMappingURL=index.js.map