"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStickyNotificationActiveButHidden = setStickyNotificationActiveButHidden;
exports.displayActiveStickyNotification = displayActiveStickyNotification;
exports.displayNotification = displayNotification;
exports.displayStickyNotification = displayStickyNotification;
exports.displayNotificationWithInput = displayNotificationWithInput;
exports.displayModalNotification = displayModalNotification;
exports.displayNotificationWithOptionalInput = displayNotificationWithOptionalInput;
exports.displayStickyNotificationWithOptionalInput = displayStickyNotificationWithOptionalInput;
exports.displayNotificationWithOutput = displayNotificationWithOutput;
exports.displayModalNotificationWithOutput = displayModalNotificationWithOutput;
exports.displayStickyNotificationWithOutput = displayStickyNotificationWithOutput;
exports.displayNotificationWithSetupGuide = displayNotificationWithSetupGuide;
exports.displayStickyNotificationWithSetupGuide = displayStickyNotificationWithSetupGuide;
exports.displayModalNotificationWithSetupGuide = displayModalNotificationWithSetupGuide;
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
const vscode_1 = require("vscode");
const leanEditorProvider_1 = require("./leanEditorProvider");
function toNotif(severity) {
    switch (severity) {
        case 'Information':
            return vscode_1.window.showInformationMessage;
        case 'Warning':
            return vscode_1.window.showWarningMessage;
        case 'Error':
            return vscode_1.window.showErrorMessage;
    }
}
async function setStickyNotificationActiveButHidden(isActiveButHidden) {
    await vscode_1.commands.executeCommand('setContext', 'lean4.isStickyNotificationActiveButHidden', isActiveButHidden);
}
let activeStickyNotification;
let nextStickyNotification;
let activeDisplayFn;
function makeSticky(n) {
    if (activeStickyNotification !== undefined) {
        nextStickyNotification = n;
        return vscode_1.Disposable.from();
    }
    activeStickyNotification = n;
    let isDisplaying = false;
    // eslint-disable-next-line prefer-const
    let d;
    const display = async () => {
        if (isDisplaying) {
            return;
        }
        await setStickyNotificationActiveButHidden(false);
        isDisplaying = true;
        try {
            await activeStickyNotification?.options.onDisplay();
            let gotNewStickyNotification = false;
            let r;
            let continueDisplaying;
            do {
                gotNewStickyNotification = false;
                r = await activeStickyNotification?.displayNotification();
                continueDisplaying =
                    r === undefined || ((await activeStickyNotification?.options.onInput(r, true)) ?? false);
                if (nextStickyNotification !== undefined) {
                    activeStickyNotification = nextStickyNotification;
                    nextStickyNotification = undefined;
                    gotNewStickyNotification = true;
                }
            } while ((r !== undefined && continueDisplaying) || gotNewStickyNotification);
            if (!continueDisplaying) {
                activeStickyNotification = undefined;
                await setStickyNotificationActiveButHidden(false);
                d?.dispose();
            }
            else {
                await setStickyNotificationActiveButHidden(true);
            }
        }
        catch (e) {
            activeStickyNotification = undefined;
            nextStickyNotification = undefined;
            await setStickyNotificationActiveButHidden(false);
            d?.dispose();
            console.log(e);
        }
        finally {
            isDisplaying = false;
        }
    };
    activeDisplayFn = display;
    d = vscode_1.Disposable.from(leanEditorProvider_1.lean.onDidRevealLeanEditor(async () => await display()), {
        dispose: () => {
            activeStickyNotification = undefined;
            activeDisplayFn = undefined;
        },
    });
    void display();
    return d;
}
function displayActiveStickyNotification() {
    if (activeDisplayFn !== undefined) {
        void activeDisplayFn();
    }
}
function displayNotification(severity, message, finalizer) {
    void (async () => {
        await toNotif(severity)(message, {});
        if (finalizer) {
            finalizer();
        }
    })();
}
function displayStickyNotification(severity, message, options) {
    return makeSticky({
        displayNotification: async () => (await toNotif(severity)(message, {})),
        options,
    });
}
async function displayNotificationWithInput(severity, message, items, defaultItem) {
    if (defaultItem === undefined) {
        // VS Code renders buttons for modal notifications in the reverse order (which it doesn't do for non-modal notifications),
        // so we reverse them for consistency.
        // The close button is placed to the left of the primary button.
        return await toNotif(severity)(message, { modal: true }, ...[...items].reverse());
    }
    let notif;
    switch (severity) {
        case 'Information':
            notif = vscode_1.window.showInformationMessage;
            break;
        case 'Warning':
            notif = vscode_1.window.showWarningMessage;
            break;
        case 'Error':
            notif = vscode_1.window.showErrorMessage;
            break;
    }
    const messageItems = items.map(item => ({
        title: item,
        isCloseAffordance: false,
    }));
    // VS Code always moves the `isCloseAffordance: true` button to the left of the primary button.
    messageItems.push({
        title: defaultItem,
        isCloseAffordance: true,
    });
    messageItems.reverse();
    const choice = await notif(message, { modal: true }, ...messageItems);
    return choice?.title;
}
async function displayModalNotification(severity, message) {
    await displayNotificationWithInput(severity, message, [], 'Close');
}
function displayNotificationWithOptionalInput(severity, message, inputs, finalizer) {
    void (async () => {
        const choice = await toNotif(severity)(message, {}, ...inputs.map(i => i.input));
        const chosenInput = inputs.find(i => i.input === choice);
        if (chosenInput !== undefined) {
            chosenInput.action();
        }
        if (finalizer) {
            finalizer();
        }
    })();
}
function displayStickyNotificationWithOptionalInput(severity, message, options, inputs) {
    const updatedOptions = {
        ...options,
        onInput: async (lastChoice, continueDisplaying) => {
            const chosenInput = inputs.find(i => i.input === lastChoice);
            if (chosenInput !== undefined) {
                await chosenInput.action();
                continueDisplaying = chosenInput.continueDisplaying;
            }
            return options.onInput(lastChoice, continueDisplaying);
        },
    };
    return makeSticky({
        displayNotification: async () => await toNotif(severity)(message, {}, ...inputs.map(i => i.input)),
        options: updatedOptions,
    });
}
function displayNotificationWithOutput(severity, message, otherInputs = [], finalizer) {
    displayNotificationWithOptionalInput(severity, message, [
        { input: 'Show Output', action: () => vscode_1.commands.executeCommand('lean4.troubleshooting.showOutput') },
        ...otherInputs,
    ], finalizer);
}
async function displayModalNotificationWithOutput(severity, message, otherItems = [], defaultItem) {
    const choice = await displayNotificationWithInput(severity, message, ['Show Output', ...otherItems], defaultItem);
    if (choice === 'Show Output') {
        await vscode_1.commands.executeCommand('lean4.troubleshooting.showOutput');
    }
    return choice;
}
function displayStickyNotificationWithOutput(severity, message, options, otherInputs = []) {
    const showOutputItem = {
        input: 'Show Output',
        continueDisplaying: true,
        action: async () => await vscode_1.commands.executeCommand('lean4.troubleshooting.showOutput'),
    };
    return displayStickyNotificationWithOptionalInput(severity, message, options, [showOutputItem, ...otherInputs]);
}
function displayNotificationWithSetupGuide(severity, message, otherInputs = [], finalizer) {
    displayNotificationWithOptionalInput(severity, message, [
        { input: 'Open Setup Guide', action: () => vscode_1.commands.executeCommand('lean4.docs.showSetupGuide') },
        ...otherInputs,
    ], finalizer);
}
function displayStickyNotificationWithSetupGuide(severity, message, options, otherInputs = []) {
    const openSetupGuideItem = {
        input: 'Open Setup Guide',
        continueDisplaying: true,
        action: async () => await vscode_1.commands.executeCommand('lean4.docs.showSetupGuide'),
    };
    return displayStickyNotificationWithOptionalInput(severity, message, options, [openSetupGuideItem, ...otherInputs]);
}
async function displayModalNotificationWithSetupGuide(severity, message, otherItems = [], defaultItem) {
    const choice = await displayNotificationWithInput(severity, message, ['Open Setup Guide', ...otherItems], defaultItem);
    if (choice === 'Open Setup Guide') {
        await vscode_1.commands.executeCommand('lean4.docs.showSetupGuide');
    }
    return choice;
}
//# sourceMappingURL=notifs.js.map