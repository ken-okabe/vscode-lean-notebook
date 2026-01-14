"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayInternalError = displayInternalError;
exports.displayInternalErrorsIn = displayInternalErrorsIn;
const vscode_1 = require("vscode");
const notifs_1 = require("./notifs");
async function displayInternalError(scope, e) {
    let msg = `Internal error (while ${scope}): ${e}`;
    let fullMsg = msg;
    if (e instanceof Error && e.stack !== undefined) {
        fullMsg += `\n\n${e.stack}`;
    }
    msg +=
        "\n\nIf you are using an up-to-date version of the Lean 4 VS Code extension, please copy the full error message using the 'Copy Error to Clipboard' button and report it at https://github.com/leanprover/vscode-lean4/ or https://leanprover.zulipchat.com/.";
    const copyToClipboardInput = 'Copy Error to Clipboard';
    const closeInput = 'Close';
    const choice = await (0, notifs_1.displayNotificationWithInput)('Error', msg, [copyToClipboardInput], closeInput);
    if (choice === copyToClipboardInput) {
        await vscode_1.env.clipboard.writeText(fullMsg);
    }
}
const duplicateCommandError = (scope) => `Error (while ${scope}): Two separate Lean 4 VS Code extensions that register the same VS Code functionality are installed.
Please uninstall or disable one of them and restart VS Code.

The 'Lean 4' extension by the 'leanprover' organization is the only official Lean 4 VS Code extension.`;
async function displayInternalErrorsIn(scope, f) {
    try {
        return await f();
    }
    catch (e) {
        const msg = e.message;
        if (msg !== undefined && typeof msg === 'string' && msg.match(/command '.*' already exists/)) {
            await (0, notifs_1.displayModalNotification)('Error', duplicateCommandError(scope));
            throw e;
        }
        await displayInternalError(scope, e);
        throw e;
    }
}
//# sourceMappingURL=internalErrors.js.map