"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathExtensionProvider = void 0;
const vscode_1 = require("vscode");
const config_1 = require("../config");
const envPath_1 = require("./envPath");
class PathExtensionProvider {
    constructor() {
        this.currentPathExtensions = envPath_1.PATH.empty();
        this.subscriptions = [];
        this.replaceEnvPathExtensionsInPATH();
        this.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('lean4.envPathExtensions')) {
                this.replaceEnvPathExtensionsInPATH();
            }
        }));
    }
    static withAddedEnvPathExtensions() {
        return new PathExtensionProvider();
    }
    replaceEnvPathExtensionsInPATH() {
        const previousPathExtensions = this.currentPathExtensions;
        this.currentPathExtensions = (0, config_1.envPathExtensions)();
        const path = envPath_1.PATH.ofProcessEnv();
        const originalPath = path.filter(path => !previousPathExtensions.includes(path));
        (0, envPath_1.setProcessEnvPATH)(this.currentPathExtensions.join(originalPath));
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.PathExtensionProvider = PathExtensionProvider;
//# sourceMappingURL=pathExtensionProvider.js.map