"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UriHandlerService = void 0;
const vscode_1 = require("vscode");
class UriHandlerService {
    constructor() {
        this.subscriptions = [];
        this.registerUriHandler();
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
    registerUriHandler() {
        this.subscriptions.push(vscode_1.window.registerUriHandler({
            async handleUri(uri) {
                if (uri.path === '/setup-guide') {
                    await vscode_1.commands.executeCommand('lean4.docs.showSetupGuide');
                }
            },
        }));
    }
}
exports.UriHandlerService = UriHandlerService;
//# sourceMappingURL=uriHandlerService.js.map