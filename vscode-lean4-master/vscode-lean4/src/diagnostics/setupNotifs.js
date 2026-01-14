"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupNotifier = void 0;
exports.preconditionCheckResultToSeverity = preconditionCheckResultToSeverity;
exports.severityToPreconditionCheckResult = severityToPreconditionCheckResult;
exports.worstPreconditionViolation = worstPreconditionViolation;
const config_1 = require("../config");
const notifs_1 = require("../utils/notifs");
function preconditionCheckResultToSeverity(result) {
    switch (result) {
        case 'Fulfilled':
            return 0;
        case 'Warning':
            return 1;
        case 'Fatal':
            return 2;
    }
}
function severityToPreconditionCheckResult(severity) {
    switch (severity) {
        case 0:
            return 'Fulfilled';
        case 1:
            return 'Warning';
        case 2:
            return 'Fatal';
    }
}
function worstPreconditionViolation(...results) {
    let worstViolation = 'Fulfilled';
    for (const r of results) {
        if (preconditionCheckResultToSeverity(r) > preconditionCheckResultToSeverity(worstViolation)) {
            worstViolation = r;
        }
    }
    return worstViolation;
}
const closeItem = 'Close';
const proceedItem = 'Proceed';
const proceedRegardlessItem = 'Proceed Regardless';
const retryItem = {
    input: 'Retry',
    continueDisplaying: false,
    action: async () => { },
};
class SetupNotifier {
    constructor(options) {
        this.options = options;
        this.subscriptions = [];
    }
    async error(notifs) {
        const m = this.options.errorMode;
        if (m.mode === 'Modal') {
            return await notifs.modal();
        }
        if (m.mode === 'NonModal') {
            if (notifs.nonModal === undefined) {
                return await notifs.modal();
            }
            return notifs.nonModal();
        }
        const r = await notifs.modal();
        if (r !== 'Fatal') {
            return r;
        }
        const options = {
            onInput: async (_, continueDisplaying) => {
                if (!continueDisplaying) {
                    await m.retry();
                }
                return continueDisplaying;
            },
            onDisplay: async () => { },
        };
        const d = await notifs.sticky(options);
        this.subscriptions.push(d);
        return 'Fatal';
    }
    async warning(notifs) {
        if (!(0, config_1.shouldShowSetupWarnings)()) {
            return 'Warning';
        }
        if (this.options.warningMode.modal || notifs.nonModal === undefined) {
            if (this.options.warningMode.proceedByDefault) {
                return await notifs.modalProceedByDefault();
            }
            else {
                return await notifs.modalAskBeforeProceeding();
            }
        }
        else {
            return notifs.nonModal();
        }
    }
    async displaySetupError(message) {
        return await this.error({
            modal: async () => {
                await (0, notifs_1.displayModalNotification)('Error', message);
                return 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotification)('Error', message);
                return 'Fatal';
            },
            sticky: async (options) => (0, notifs_1.displayStickyNotificationWithOptionalInput)('Error', message, options, [retryItem]),
        });
    }
    async displaySetupWarning(message) {
        return await this.warning({
            modalProceedByDefault: async () => {
                await (0, notifs_1.displayModalNotification)('Warning', message);
                return 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const choice = await (0, notifs_1.displayNotificationWithInput)('Warning', message, [proceedRegardlessItem]);
                return choice === proceedRegardlessItem ? 'Warning' : 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotification)('Warning', message);
                return 'Warning';
            },
        });
    }
    async displaySetupErrorWithInput(message, inputs) {
        return await this.error({
            modal: async () => {
                const choice = await (0, notifs_1.displayNotificationWithInput)('Error', message, inputs.map(i => i.input));
                const chosenInput = inputs.find(i => i.input === choice);
                await chosenInput?.action();
                return 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithOptionalInput)('Error', message, inputs);
                return 'Fatal';
            },
            sticky: async (options) => (0, notifs_1.displayStickyNotificationWithOptionalInput)('Error', message, options, [retryItem, ...inputs]),
        });
    }
    async displaySetupWarningWithInput(message, inputs) {
        return await this.warning({
            modalProceedByDefault: async () => {
                const choice = await (0, notifs_1.displayNotificationWithInput)('Warning', message, inputs.map(i => i.input), proceedItem);
                const chosenInput = inputs.find(i => i.input === choice);
                chosenInput?.action();
                return 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const choice = await (0, notifs_1.displayNotificationWithInput)('Warning', message, [
                    ...inputs.map(i => i.input),
                    proceedRegardlessItem,
                ]);
                const chosenInput = inputs.find(i => i.input === choice);
                chosenInput?.action();
                return choice === proceedRegardlessItem ? 'Warning' : 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithOptionalInput)('Warning', message, inputs);
                return 'Warning';
            },
        });
    }
    async displaySetupErrorWithOutput(message) {
        return await this.error({
            modal: async () => {
                await (0, notifs_1.displayModalNotificationWithOutput)('Error', message, [], closeItem);
                return 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithOutput)('Error', message);
                return 'Fatal';
            },
            sticky: async (options) => (0, notifs_1.displayStickyNotificationWithOutput)('Error', message, options, [retryItem]),
        });
    }
    async displaySetupWarningWithOutput(message) {
        return await this.warning({
            modalProceedByDefault: async () => {
                await (0, notifs_1.displayModalNotificationWithOutput)('Warning', message, [], proceedItem);
                return 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const choice = await (0, notifs_1.displayModalNotificationWithOutput)('Warning', message, [proceedRegardlessItem]);
                return choice === proceedRegardlessItem ? 'Warning' : 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithOutput)('Warning', message);
                return 'Warning';
            },
        });
    }
    async displaySetupErrorWithSetupGuide(message) {
        return await this.error({
            modal: async () => {
                await (0, notifs_1.displayModalNotificationWithSetupGuide)('Error', message, [], closeItem);
                return 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithSetupGuide)('Error', message);
                return 'Fatal';
            },
            sticky: async (options) => (0, notifs_1.displayStickyNotificationWithSetupGuide)('Error', message, options, [retryItem]),
        });
    }
    async displaySetupWarningWithSetupGuide(message) {
        return await this.warning({
            modalProceedByDefault: async () => {
                await (0, notifs_1.displayModalNotificationWithSetupGuide)('Warning', message, [], proceedItem);
                return 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const choice = await (0, notifs_1.displayModalNotificationWithSetupGuide)('Warning', message, [proceedRegardlessItem]);
                return choice === proceedRegardlessItem ? 'Warning' : 'Fatal';
            },
            nonModal: () => {
                (0, notifs_1.displayNotificationWithSetupGuide)('Warning', message);
                return 'Warning';
            },
        });
    }
    async displayDependencySetupError(installer, reason) {
        return await this.error({
            modal: async () => {
                const result = await installer.displayInstallDependenciesPrompt('Error', reason);
                return result === 'Success' ? 'Fulfilled' : 'Fatal';
            },
            sticky: async (options) => await installer.displayStickyInstallDependenciesPrompt('Error', reason, options, [retryItem]),
        });
    }
    async displayElanSetupError(installer, reason) {
        return await this.error({
            modal: async () => {
                const isElanInstalled = await installer.displayInstallElanPrompt('Error', reason);
                return isElanInstalled ? 'Fulfilled' : 'Fatal';
            },
            sticky: async (options) => installer.displayStickyInstallElanPrompt('Error', reason, options, [retryItem]),
        });
    }
    async displayElanSetupWarning(installer, reason) {
        return await this.warning({
            modalProceedByDefault: async () => {
                const r = await installer.displayInstallElanPromptWithItems('Warning', reason, [], proceedItem);
                const success = r !== undefined && r.kind === 'InstallElan' && r.success;
                return success ? 'Fulfilled' : 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const r = await installer.displayInstallElanPromptWithItems('Warning', reason, [proceedRegardlessItem]);
                if (r === undefined) {
                    return 'Fatal';
                }
                if (r.kind === 'InstallElan') {
                    return r.success ? 'Fulfilled' : 'Warning';
                }
                return 'Warning';
            },
        });
    }
    async displayElanOutdatedSetupError(installer, currentVersion, recommendedVersion) {
        const mode = {
            kind: 'Outdated',
            versions: { currentVersion, recommendedVersion },
        };
        return await this.error({
            modal: async () => {
                const isElanUpToDate = await installer.displayUpdateElanPrompt('Error', mode);
                return isElanUpToDate ? 'Fulfilled' : 'Fatal';
            },
            sticky: async (options) => installer.displayStickyUpdateElanPrompt('Error', mode, options, [retryItem]),
        });
    }
    async displayElanOutdatedSetupWarning(installer, currentVersion, recommendedVersion) {
        const mode = {
            kind: 'Outdated',
            versions: { currentVersion, recommendedVersion },
        };
        return await this.warning({
            modalProceedByDefault: async () => {
                const r = await installer.displayUpdateElanPromptWithItems('Warning', mode, [], proceedItem);
                const success = r !== undefined && r.kind === 'UpdateElan' && r.success;
                return success ? 'Fulfilled' : 'Warning';
            },
            modalAskBeforeProceeding: async () => {
                const r = await installer.displayUpdateElanPromptWithItems('Warning', mode, [proceedRegardlessItem]);
                if (r === undefined) {
                    return 'Fatal';
                }
                if (r.kind === 'UpdateElan') {
                    return r.success ? 'Fulfilled' : 'Warning';
                }
                return 'Warning';
            },
        });
    }
}
exports.SetupNotifier = SetupNotifier;
//# sourceMappingURL=setupNotifs.js.map