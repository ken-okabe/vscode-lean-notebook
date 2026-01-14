"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeanInstaller = exports.LeanVersion = void 0;
exports.elanInstallationMethod = elanInstallationMethod;
const vscode_1 = require("vscode");
const config_1 = require("../config");
const batch_1 = require("./batch");
const elan_1 = require("./elan");
const notifs_1 = require("./notifs");
const windowsInstallationScript = `try {
    $installCode = (Invoke-WebRequest -Uri "https://elan.lean-lang.org/elan-init.ps1" -UseBasicParsing -ErrorAction Stop).Content
    $installer = [ScriptBlock]::Create([System.Text.Encoding]::UTF8.GetString($installCode))
    Set-ExecutionPolicy -ExecutionPolicy Unrestricted -Scope Process
    $rc = & $installer -NoPrompt 1 -DefaultToolchain ${elan_1.elanStableChannel}
    exit $rc
} catch {
    Write-Host "Downloading and running the Elan installer failed."
    Write-Host $_
    exit 1
}`;
const unixInstallationScript = `curl "https://elan.lean-lang.org/elan-init.sh" -sSf | sh -s -- -y --default-toolchain ${elan_1.elanStableChannel}`;
function elanInstallationMethod() {
    if (process.platform === 'win32') {
        return {
            script: windowsInstallationScript,
            shell: 'Windows',
        };
    }
    return {
        script: unixInstallationScript,
        shell: 'Unix',
    };
}
class LeanVersion {
}
exports.LeanVersion = LeanVersion;
class LeanInstaller {
    constructor(outputChannel) {
        this.subscriptions = [];
        this.outputChannel = outputChannel;
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.setup.installElan', async () => await this.displayInstallElanPrompt('Information', undefined)), vscode_1.commands.registerCommand('lean4.setup.updateElan', async () => await this.displayManualUpdateElanPrompt()), vscode_1.commands.registerCommand('lean4.setup.uninstallElan', async () => await this.displayUninstallElanPrompt()));
    }
    setClientProvider(clientProvider) {
        this.clientProvider = clientProvider;
    }
    // Installation
    async displayInstallElanPrompt(severity, reason) {
        const r = await this.displayInstallElanPromptWithItems(severity, reason);
        if (r !== undefined && r.kind === 'InstallElan') {
            return r.success;
        }
        return false;
    }
    displayStickyInstallElanPrompt(severity, reason, 
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    options, otherItems = []) {
        const p = this.installElanPrompt(reason);
        const installElanItem = {
            input: p.item,
            continueDisplaying: false,
            action: async () => {
                await this.installElanAndDisplaySettingPrompt();
            },
        };
        return (0, notifs_1.displayStickyNotificationWithOptionalInput)(severity, p.message, options, [
            installElanItem,
            ...otherItems,
        ]);
    }
    async displayInstallElanPromptWithItems(severity, reason, otherItems = [], defaultItem) {
        const p = this.installElanPrompt(reason);
        const choice = await (0, notifs_1.displayNotificationWithInput)(severity, p.message, [p.item, ...otherItems], defaultItem);
        if (choice === undefined) {
            return undefined;
        }
        if (choice === p.item) {
            return {
                kind: 'InstallElan',
                success: (await this.installElanAndDisplaySettingPrompt()) === 'Success',
            };
        }
        return { kind: 'OtherItem', choice };
    }
    async installElanAndDisplaySettingPrompt() {
        const r = await this.installElan();
        switch (r.kind) {
            case 'Success':
                await this.displayInstallationSuccessfulPrompt();
                return 'Success';
            case 'Error':
                await this.displayInstallationUnsuccessfulPrompt(r.result);
                return 'InstallationFailed';
            case 'Cancelled':
                return 'InstallationFailed';
            case 'PendingOperation':
                return 'InstallationFailed';
        }
    }
    async installElan() {
        const r = await this.runOperation('Install', async () => {
            const method = elanInstallationMethod();
            const result = await (0, batch_1.batchExecuteWithProgress)(method.script, [], 'Lean Installation', "Installing Lean's version manager Elan", {
                channel: this.outputChannel,
                allowCancellation: true,
                shell: method.shell,
            });
            switch (result.exitCode) {
                case batch_1.ExecutionExitCode.Success:
                    return { kind: 'Success' };
                case batch_1.ExecutionExitCode.CannotLaunch:
                case batch_1.ExecutionExitCode.ExecutionError:
                    return { kind: 'Error', result };
                case batch_1.ExecutionExitCode.Cancelled:
                    return { kind: 'Cancelled' };
            }
        });
        if (r === 'PendingOperation') {
            return { kind: 'PendingOperation' };
        }
        return r;
    }
    installElanPrompt(reason) {
        let message;
        if (reason !== undefined) {
            message = `${reason} Do you wish to install Lean's version manager Elan?`;
        }
        else {
            message = "This command will install Lean's version manager Elan.\n\n" + 'Do you wish to proceed?';
        }
        const item = 'Install Elan';
        return { message, item };
    }
    async displayInstallationSuccessfulPrompt() {
        const prompt = 'Lean installation successful!\n\n' +
            "Do you want Lean's version manager Elan to download and install Lean versions automatically in VS Code, or would you prefer it to ask for confirmation before downloading and installing new Lean versions?\n" +
            'Asking for confirmation is especially desirable if you are ever using a limited internet data plan or your internet connection tends to be slow, whereas automatic installs are less tedious on fast and unlimited internet connections.';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, ['Always Ask For Confirmation'], 'Install Lean Versions Automatically');
        if (choice === 'Always Ask For Confirmation') {
            await (0, config_1.setAlwaysAskBeforeInstallingLeanVersions)(true);
        }
        if (choice === 'Install Lean Versions Automatically') {
            await (0, config_1.setAlwaysAskBeforeInstallingLeanVersions)(false);
        }
    }
    async displayInstallationUnsuccessfulPrompt(result) {
        const error = "Installation of Lean's version manager Elan was unsuccessful.\n" +
            'If you are unable to figure out the issue from the command output below, you can also try running the following manual installation script from a terminal:\n\n' +
            elanInstallationMethod().script;
        await (0, batch_1.displayModalResultError)(result, error);
    }
    // Updating
    async displayManualUpdateElanPrompt() {
        const versionResult = await (0, elan_1.elanVersion)();
        switch (versionResult.kind) {
            case 'Success':
                await this.displayUpdateElanPrompt('Information', {
                    kind: 'Manual',
                    versions: { currentVersion: versionResult.version },
                });
                break;
            case 'ElanNotInstalled':
                (0, notifs_1.displayNotification)('Error', 'Elan is not installed.');
                break;
            case 'ExecutionError':
                (0, notifs_1.displayNotification)('Error', `Error while determining current Elan version: ${versionResult.message}`);
                break;
        }
    }
    async displayUpdateElanPrompt(severity, mode) {
        const r = await this.displayUpdateElanPromptWithItems(severity, mode);
        if (r !== undefined && r.kind === 'UpdateElan') {
            return r.success;
        }
        return false;
    }
    async displayUpdateElanPromptWithItems(severity, mode, otherItems = [], defaultItem) {
        const p = this.updateElanPrompt(mode);
        const choice = await (0, notifs_1.displayNotificationWithInput)(severity, p.message, [p.item, ...otherItems], defaultItem);
        if (choice === undefined) {
            return undefined;
        }
        if (choice === p.item) {
            return { kind: 'UpdateElan', success: await this.updateElan(mode.versions.currentVersion) };
        }
        return { kind: 'OtherItem', choice };
    }
    displayStickyUpdateElanPrompt(severity, mode, 
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    options, otherItems = []) {
        const p = this.updateElanPrompt(mode);
        const updateElanItem = {
            input: p.item,
            continueDisplaying: false,
            action: async () => {
                await this.updateElan(mode.versions.currentVersion);
            },
        };
        return (0, notifs_1.displayStickyNotificationWithOptionalInput)(severity, p.message, options, [updateElanItem, ...otherItems]);
    }
    async updateElan(currentVersion) {
        const r = await this.runOperation('Update', async () => {
            if (currentVersion.compare('3.1.0') === 0) {
                // `elan self update` was broken in elan 3.1.0, so we need to take a different approach to updating elan here.
                const installElanResult = await this.installElanAndDisplaySettingPrompt();
                if (installElanResult !== 'Success') {
                    return false;
                }
                await this.displayElanUpdateSuccessfulPrompt(currentVersion);
                return true;
            }
            const elanSelfUpdateResult = await (0, elan_1.elanSelfUpdate)(this.outputChannel, 'Update Elan');
            if (elanSelfUpdateResult.exitCode !== batch_1.ExecutionExitCode.Success) {
                (0, batch_1.displayResultError)(elanSelfUpdateResult, "Cannot update Elan. If you suspect that this is due to the way that you have set up Elan (e.g. from a package repository that ships an outdated version of Elan), you can disable these warnings using the 'Lean4: Show Setup Warnings' setting under 'File' > 'Preferences' > 'Settings'.");
                return false;
            }
            await this.displayElanUpdateSuccessfulPrompt(currentVersion);
            return true;
        });
        if (r === 'PendingOperation') {
            return false;
        }
        return r;
    }
    updateElanPrompt(mode) {
        switch (mode.kind) {
            case 'Manual':
                return {
                    message: "This command will update Lean's version manager Elan to its most recent version.\n\n" +
                        'Do you wish to proceed?',
                    item: 'Update Elan',
                };
            case 'Outdated':
                return {
                    message: `Lean's version manager Elan is outdated: the installed version is ${mode.versions.currentVersion.toString()}, but a version of ${mode.versions.recommendedVersion.toString()} is recommended.\n\n` +
                        'Do you wish to update Elan?',
                    item: 'Update Elan',
                };
        }
    }
    async displayElanUpdateSuccessfulPrompt(currentVersion) {
        if ((0, elan_1.isElanEagerResolutionVersion)(currentVersion)) {
            (0, notifs_1.displayNotification)('Information', 'Elan update successful!');
            return;
        }
        const prompt = 'Elan update successful!\n\n' +
            'Do you want Elan in VS Code to continue downloading and installing Lean versions automatically, or would you prefer it to ask for confirmation before downloading and installing new Lean versions?\n' +
            'Asking for confirmation is especially desirable if you are ever using a limited internet data plan or your internet connection tends to be slow, whereas automatic installs are less tedious on fast and unlimited internet connections.';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, ['Always Ask For Confirmation'], 'Install Lean Versions Automatically');
        if (choice === 'Always Ask For Confirmation') {
            await (0, config_1.setAlwaysAskBeforeInstallingLeanVersions)(true);
        }
        if (choice === 'Install Lean Versions Automatically') {
            await (0, config_1.setAlwaysAskBeforeInstallingLeanVersions)(false);
        }
    }
    // Uninstalling
    async displayUninstallElanPrompt() {
        await this.runOperation('Uninstall', async () => {
            const prompt = "This command will uninstall Lean's version manager Elan and all installed Lean versions.\n\n" +
                'Do you wish to proceed?';
            const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, ['Proceed']);
            if (choice !== 'Proceed') {
                return;
            }
            const r = await (0, elan_1.elanSelfUninstall)(this.outputChannel, 'Uninstall Elan');
            switch (r.exitCode) {
                case batch_1.ExecutionExitCode.Success:
                    (0, notifs_1.displayNotification)('Information', 'Elan uninstalled successfully.');
                    break;
                case batch_1.ExecutionExitCode.CannotLaunch:
                    (0, notifs_1.displayNotification)('Error', 'Elan is not installed.');
                    break;
                case batch_1.ExecutionExitCode.ExecutionError:
                    (0, notifs_1.displayNotification)('Error', `Error while installing Elan: ${r.combined}`);
                    break;
                case batch_1.ExecutionExitCode.Cancelled:
                    (0, notifs_1.displayNotification)('Information', 'Uninstalling Elan cancelled.');
            }
        });
    }
    async runOperation(kind, op) {
        switch (this.pendingOperation) {
            case 'Install':
                (0, notifs_1.displayNotification)('Error', 'Elan is being installed. Please wait until the installation has finished.');
                return 'PendingOperation';
            case 'Update':
                (0, notifs_1.displayNotification)('Error', 'Elan is being updated. Please wait until the update has finished.');
                return 'PendingOperation';
            case 'Uninstall':
                (0, notifs_1.displayNotification)('Error', 'Elan is being uninstalled. Please wait until the deinstallation has finished.');
                return 'PendingOperation';
            case undefined:
                this.pendingOperation = kind;
                try {
                    if (this.clientProvider === undefined) {
                        return await op();
                    }
                    const r = await this.clientProvider.withStoppedClients(op);
                    if (r.kind === 'IsRestarting') {
                        (0, notifs_1.displayNotification)('Error', 'Cannot re-install Elan while a server is being restarted.');
                        return 'PendingOperation';
                    }
                    return r.result;
                }
                finally {
                    this.pendingOperation = undefined;
                }
        }
    }
    getOutputChannel() {
        return this.outputChannel;
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.LeanInstaller = LeanInstaller;
//# sourceMappingURL=leanInstaller.js.map