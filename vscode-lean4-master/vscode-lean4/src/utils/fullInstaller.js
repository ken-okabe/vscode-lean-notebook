"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullInstaller = void 0;
const vscode_1 = require("vscode");
const batch_1 = require("./batch");
const depInstaller_1 = require("./depInstaller");
const notifs_1 = require("./notifs");
class FullInstaller {
    constructor(outputChannel, depInstaller, leanInstaller) {
        this.outputChannel = outputChannel;
        this.depInstaller = depInstaller;
        this.leanInstaller = leanInstaller;
        this.subscriptions = [];
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.setup.installLean', () => this.displayInstallLeanPrompt()));
    }
    async displayInstallLeanPrompt() {
        const dependencyInstallationProcedure = await this.depInstaller.determineDependencyInstallationProcedure();
        if (dependencyInstallationProcedure.kind !== 'AllDepsInstalled' &&
            dependencyInstallationProcedure.method.kind === 'Manual') {
            await this.displayManualInstallationPrompt(dependencyInstallationProcedure);
            return 'Failure';
        }
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', this.installationPrompt(dependencyInstallationProcedure), ['Proceed']);
        if (choice !== 'Proceed') {
            return 'Failure';
        }
        if (dependencyInstallationProcedure.kind !== 'AllDepsInstalled') {
            const dependencyInstallationResult = await this.depInstaller.installMissingDeps(dependencyInstallationProcedure);
            if (dependencyInstallationResult.kind === 'Error') {
                await (0, batch_1.displayModalResultError)(dependencyInstallationResult.result, (0, depInstaller_1.unsuccessfulDependencyInstallationPrompt)(dependencyInstallationProcedure));
                return 'Failure';
            }
            if (dependencyInstallationResult.kind === 'Cancelled') {
                return 'Failure';
            }
            if (dependencyInstallationResult.kind === 'PendingInstall') {
                return 'PendingInstall';
            }
            dependencyInstallationResult.kind;
        }
        const elanInstallationResult = await this.leanInstaller.installElan();
        switch (elanInstallationResult.kind) {
            case 'Success':
                await this.leanInstaller.displayInstallationSuccessfulPrompt();
                return 'Success';
            case 'Error':
                await this.leanInstaller.displayInstallationUnsuccessfulPrompt(elanInstallationResult.result);
                return 'Failure';
            case 'Cancelled':
                return 'Failure';
            case 'PendingOperation':
                return 'PendingInstall';
        }
    }
    installationPrompt(p) {
        let specifics;
        if (p.kind === 'AllDepsInstalled' || (p.isCurlAvailable && p.isGitAvailable)) {
            specifics =
                "Specifically, it will install Lean's version manager 'Elan' that manages all Lean versions on your system.";
        }
        else if (p.isCurlAvailable && !p.isGitAvailable) {
            if (p.kind === 'MacOS') {
                specifics =
                    "Specifically, it will install Lean's version manager 'Elan' that manages all Lean versions on your system, as well as Apple Command Line Tools, which includes the version control system 'Git' that is used by Lean to help manage different versions of Lean formalization packages and software packages.";
            }
            else {
                specifics =
                    "Specifically, it will install Lean's version manager 'Elan' that manages all Lean versions on your system, as well as the version control system 'Git' that is used by Lean to help manage different versions of Lean formalization packages and software packages.";
            }
        }
        else if (!p.isCurlAvailable && p.isGitAvailable) {
            specifics =
                "Specifically, it will install Lean's version manager 'Elan' that manages all Lean versions on your system, as well as the file downloader 'Curl' that is sometimes used by Lean tools to query information from the internet.";
        }
        else if (!p.isCurlAvailable && !p.isGitAvailable) {
            specifics =
                "Specifically, it will install Lean's version manager 'Elan' that manages all Lean versions on your system, the version control system 'Git' that is used by Lean to help manage different versions of Lean formalization packages and software packages, as well as the file downloader 'Curl' that is sometimes used by Lean tools to query information from the internet.";
        }
        else {
            throw new Error('unreachable installationPrompt case');
        }
        return `This command will install Lean. ${specifics}\n\nDo you wish to proceed?`;
    }
    async displayManualInstallationPrompt(p) {
        if (p.method.script === undefined) {
            await (0, notifs_1.displayModalNotification)('Error', `Please install ${(0, depInstaller_1.missingDepsSentence)(p)}, restart VS Code and repeat this step to install Lean.`);
            return;
        }
        const prompt = `Please install ${(0, depInstaller_1.missingDepsSentence)(p)} from a terminal using the script below, restart VS Code and repeat this step to install Lean.\n\n${p.method.script}`;
        const copyToClipboardInput = 'Copy Script to Clipboard';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, [copyToClipboardInput], 'Close');
        if (choice === copyToClipboardInput) {
            await vscode_1.env.clipboard.writeText(p.method.script);
        }
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.FullInstaller = FullInstaller;
//# sourceMappingURL=fullInstaller.js.map