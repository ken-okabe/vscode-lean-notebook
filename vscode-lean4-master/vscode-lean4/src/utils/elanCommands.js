"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElanCommandProvider = void 0;
const assert_1 = require("assert");
const fs_1 = require("fs");
const semver_1 = require("semver");
const vscode_1 = require("vscode");
const batch_1 = require("./batch");
const elan_1 = require("./elan");
const exturi_1 = require("./exturi");
const fsHelper_1 = require("./fsHelper");
const groupBy_1 = require("./groupBy");
const notifs_1 = require("./notifs");
const projectInfo_1 = require("./projectInfo");
const releaseQuery_1 = require("./releaseQuery");
function displayElanNotInstalledError() {
    (0, notifs_1.displayNotification)('Error', 'Elan is not installed.');
}
function parseToolchain(toolchain) {
    const releaseMatch = toolchain.match(/leanprover\/lean4:(.+)/);
    if (releaseMatch) {
        let version = releaseMatch[1];
        if (version[0] === 'v') {
            version = version.substring(1);
        }
        if ((0, semver_1.valid)(version)) {
            return { kind: 'Release', fullName: toolchain, version: new semver_1.SemVer(version) };
        }
    }
    const nightlyMatch = toolchain.match(/leanprover\/lean4-nightly:nightly-(.+)/);
    if (nightlyMatch) {
        const date = new Date(nightlyMatch[1]);
        if (!isNaN(date.valueOf())) {
            return { kind: 'Nightly', fullName: toolchain, date };
        }
    }
    const prReleaseMatch = toolchain.match(/leanprover\/lean4-pr-releases:pr-release-(\d+)/);
    if (prReleaseMatch) {
        const pr = Number.parseInt(prReleaseMatch[1]);
        return { kind: 'PRRelease', fullName: toolchain, pr };
    }
    return { kind: 'Unknown', fullName: toolchain };
}
function toolchainKindPrio(k) {
    switch (k) {
        case 'Unknown':
            return 3;
        case 'Release':
            return 2;
        case 'Nightly':
            return 1;
        case 'PRRelease':
            return 0;
    }
}
function compareToolchainKinds(k1, k2) {
    return toolchainKindPrio(k1) - toolchainKindPrio(k2);
}
function compareToolchains(t1, t2) {
    const kindComparison = compareToolchainKinds(t1.kind, t2.kind);
    if (kindComparison !== 0) {
        return kindComparison;
    }
    switch (t1.kind) {
        case 'Unknown':
            (0, assert_1.default)(t2.kind === 'Unknown');
            return -1 * t1.fullName.localeCompare(t2.fullName);
        case 'Release':
            (0, assert_1.default)(t2.kind === 'Release');
            return t1.version.compare(t2.version);
        case 'Nightly':
            (0, assert_1.default)(t2.kind === 'Nightly');
            return t1.date.valueOf() - t2.date.valueOf();
        case 'PRRelease':
            (0, assert_1.default)(t2.kind === 'PRRelease');
            return t1.pr - t2.pr;
    }
}
function sortToolchains(ts) {
    return ts
        .map(t => parseToolchain(t))
        .sort((t1, t2) => -1 * compareToolchains(t1, t2))
        .map(t => t.fullName);
}
class ElanCommandProvider {
    constructor(channel) {
        this.channel = channel;
        this.subscriptions = [];
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.setup.selectDefaultToolchain', () => this.selectDefaultToolchain()), vscode_1.commands.registerCommand('lean4.setup.updateReleaseChannel', () => this.updateReleaseChannel()), vscode_1.commands.registerCommand('lean4.setup.uninstallToolchains', () => this.uninstallToolchains()), vscode_1.commands.registerCommand('lean4.project.selectProjectToolchain', () => this.selectProjectToolchain()));
    }
    setClientProvider(clientProvider) {
        this.clientProvider = clientProvider;
    }
    async selectDefaultToolchain() {
        if (!(await this.checkElanSupportsDumpState())) {
            return;
        }
        const selectDefaultToolchainContext = 'Select Default Lean Version';
        const selectedDefaultToolchain = await this.displayToolchainSelectionQuickPick(selectDefaultToolchainContext, 'Select default Lean version', true);
        if (selectedDefaultToolchain === undefined) {
            return;
        }
        let prompt;
        if (selectedDefaultToolchain === elan_1.elanStableChannel) {
            prompt =
                `This operation will set the '${selectedDefaultToolchain}' Lean release channel to be the global default Lean release channel.\n` +
                    'This means that the most recent stable Lean version at any given time will be used for files in VS Code that do not belong to a Lean project, as well as for Lean commands on the command line outside of Lean projects.\n' +
                    'When a new stable Lean version becomes available, VS Code will issue a prompt about whether to update to the most recent Lean version. On the command line, the new stable Lean version will be downloaded automatically without a prompt.\n\n' +
                    'Do you wish to proceed?';
        }
        else {
            prompt =
                `This operation will set '${selectedDefaultToolchain}' to be the global default Lean version.\n` +
                    'This means that it will be used for files in VS Code that do not belong to a Lean project, as well as for Lean commands on the command line outside of Lean projects.\n\n' +
                    'Do you wish to proceed?';
        }
        const promptChoice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, ['Proceed']);
        if (promptChoice !== 'Proceed') {
            return;
        }
        const setDefaultToolchainResult = await (0, elan_1.elanSetDefaultToolchain)(this.channel, selectedDefaultToolchain);
        switch (setDefaultToolchainResult.kind) {
            case 'Success':
                (0, notifs_1.displayNotification)('Information', `Default Lean version '${selectedDefaultToolchain}' set successfully.`);
                const clientForUntitledFiles = this.clientProvider?.findClient(new exturi_1.UntitledUri());
                await clientForUntitledFiles?.restart();
                break;
            case 'ElanNotFound':
                (0, notifs_1.displayNotification)('Error', 'Cannot set Lean default version: Elan is not installed.');
                break;
            case 'Error':
                (0, notifs_1.displayNotification)('Error', `Cannot set Lean default version: ${setDefaultToolchainResult.message}`);
                break;
        }
    }
    async updateReleaseChannel() {
        if (!(await this.checkElanSupportsDumpState())) {
            return;
        }
        const context = 'Update Release Channel Lean Version';
        const channels = [
            {
                name: 'Stable',
                identifier: elan_1.elanStableChannel,
            },
            {
                name: 'Nightly',
                identifier: elan_1.elanNightlyChannel,
            },
        ];
        const channelInfos = [];
        for (const channel of channels) {
            const activeToolchainInfo = await this.activeToolchain(context, channel.identifier);
            if (activeToolchainInfo === undefined) {
                return;
            }
            if (activeToolchainInfo.cachedToolchain === activeToolchainInfo.resolvedToolchain) {
                continue;
            }
            channelInfos.push({
                name: channel.name,
                info: activeToolchainInfo,
            });
        }
        if (channelInfos.length === 0) {
            (0, notifs_1.displayNotification)('Information', 'All Lean versions for all release channels are up-to-date.');
            return;
        }
        const items = channelInfos.map(channelInfo => {
            const i = channelInfo.info;
            let detail;
            if (i.cachedToolchain === undefined) {
                detail = `Current: Not installed ⟹ New: ${(0, elan_1.toolchainVersion)(i.resolvedToolchain)}`;
            }
            else {
                detail = `Current: ${(0, elan_1.toolchainVersion)(i.cachedToolchain)} ⟹ New: ${(0, elan_1.toolchainVersion)(i.resolvedToolchain)}`;
            }
            return {
                label: channelInfo.name,
                description: i.unresolvedToolchain,
                detail,
                info: i,
            };
        });
        const choice = await vscode_1.window.showQuickPick(items, {
            title: 'Select the Lean release channel that should be updated to the most recent version',
            matchOnDescription: true,
        });
        if (choice === undefined) {
            return;
        }
        const channel = choice.info.unresolvedToolchain;
        const installToolchainResult = await (0, elan_1.elanInstallToolchain)(this.channel, 'Update Release Channel Lean Version', channel);
        if (installToolchainResult.kind === 'ElanNotFound') {
            (0, notifs_1.displayNotification)('Error', `Error while updating Lean version for '${channel}': Elan not found.`);
            return;
        }
        if (installToolchainResult.kind === 'Error') {
            (0, notifs_1.displayNotification)('Error', `Error while updating Lean version for '${channel}': ${installToolchainResult.message}`);
            return;
        }
        if (installToolchainResult.kind === 'Cancelled') {
            (0, notifs_1.displayNotification)('Information', 'Lean version update cancelled.');
            return;
        }
        if (installToolchainResult.kind === 'ToolchainAlreadyInstalled') {
            (0, notifs_1.displayNotification)('Information', `Lean version for release channel '${channel}' is already up-to-date.`);
            return;
        }
        installToolchainResult.kind;
        (0, notifs_1.displayNotification)('Information', `Lean version for release channel '${channel}' has been updated to '${choice.info.resolvedToolchain}' successfully.`);
    }
    async uninstallToolchains() {
        if (!(await this.checkElanSupportsDumpState())) {
            return;
        }
        const queryGcResult = await (0, elan_1.elanQueryGc)();
        if (queryGcResult.kind === 'ElanNotFound') {
            displayElanNotInstalledError();
            return;
        }
        if (queryGcResult.kind === 'ExecutionError') {
            (0, notifs_1.displayNotification)('Error', `Error while querying unused toolchains: ${queryGcResult.message}`);
            return;
        }
        const unusedToolchains = queryGcResult.info.unusedToolchains;
        const unusedToolchainIndex = new Set(unusedToolchains);
        const usedToolchainIndex = (0, groupBy_1.groupByKey)(queryGcResult.info.usedToolchains, u => u.toolchain);
        const toolchainInfo = await this.installedToolchains();
        if (toolchainInfo === undefined) {
            return;
        }
        const installedToolchains = sortToolchains(toolchainInfo.toolchains);
        if (installedToolchains.length === 0) {
            (0, notifs_1.displayNotification)('Information', 'No Lean versions installed.');
            return;
        }
        const installedToolchainItems = installedToolchains.map(t => {
            const users = usedToolchainIndex
                .get(t)
                ?.map(t => {
                if (t.user === 'default toolchain') {
                    // Translate Elan nomenclature to vscode-lean4 nomenclature
                    return 'default Lean version';
                }
                return `'${t.user}'`;
            })
                .join(', ');
            return {
                label: t,
                description: users !== undefined ? `(used by ${users})` : '(unused)',
            };
        });
        const allItems = [];
        const uninstallUnusedLabel = 'Uninstall all unused Lean versions';
        if (unusedToolchains.length > 0) {
            allItems.push({
                label: uninstallUnusedLabel,
                detail: unusedToolchains.map(t => (0, elan_1.toolchainVersion)(t)).join(', '),
            });
            allItems.push({
                label: '',
                kind: vscode_1.QuickPickItemKind.Separator,
            });
        }
        allItems.push(...installedToolchainItems);
        const choices = await vscode_1.window.showQuickPick(allItems, {
            canPickMany: true,
            title: 'Choose Lean versions to uninstall',
        });
        if (choices === undefined || choices.length === 0) {
            return;
        }
        const toolchainsToUninstall = [];
        if (choices.find(c => c.label === uninstallUnusedLabel) !== undefined) {
            toolchainsToUninstall.push(...unusedToolchains);
            toolchainsToUninstall.push(...choices
                .filter(c => c.label !== uninstallUnusedLabel && !unusedToolchainIndex.has(c.label))
                .map(c => c.label));
        }
        else {
            toolchainsToUninstall.push(...choices.map(c => c.label));
        }
        const formattedChoices = toolchainsToUninstall.length === 1
            ? `'${toolchainsToUninstall[0]}'`
            : toolchainsToUninstall.map(c => `'${c}'`).join(', ');
        const confirmationPromptChoice = await (0, notifs_1.displayNotificationWithInput)('Information', `This command will uninstall ${formattedChoices}. Do you wish to proceed?`, ['Proceed']);
        if (confirmationPromptChoice === undefined) {
            return;
        }
        confirmationPromptChoice;
        const r = await (0, elan_1.elanUninstallToolchains)(this.channel, 'Uninstall Lean Versions', toolchainsToUninstall);
        switch (r.exitCode) {
            case batch_1.ExecutionExitCode.Success:
                const name = toolchainsToUninstall.length === 1 ? 'Lean version' : 'Lean versions';
                (0, notifs_1.displayNotification)('Information', `${name} ${formattedChoices} uninstalled successfully.`);
                return;
            case batch_1.ExecutionExitCode.CannotLaunch:
                displayElanNotInstalledError();
                return;
            case batch_1.ExecutionExitCode.ExecutionError:
                (0, notifs_1.displayNotification)('Error', `Error while uninstalling Lean versions: ${r.combined}`);
                return;
            case batch_1.ExecutionExitCode.Cancelled:
                return;
        }
    }
    async selectProjectToolchain() {
        if (!(await this.checkElanSupportsDumpState())) {
            return;
        }
        const selectProjectToolchainContext = 'Select Project Lean Version';
        const activeClient = this.clientProvider?.getActiveClient();
        if (activeClient === undefined) {
            (0, notifs_1.displayNotification)('Error', 'No active client. Please focus a Lean file of the project for which you wish to select a Lean version.');
            return;
        }
        const activeClientUri = activeClient.getClientFolder();
        const leanToolchainPath = (clientUri) => (0, projectInfo_1.leanToolchainUri)(clientUri).fsPath;
        if (activeClientUri.scheme === 'untitled' || !(await (0, fsHelper_1.fileExists)(leanToolchainPath(activeClientUri)))) {
            (0, notifs_1.displayNotification)('Error', 'Focused file is not contained in a Lean project. Please focus a Lean file of the project for which you wish to select a Lean version.');
            return;
        }
        const selectedProjectToolchain = await this.displayToolchainSelectionQuickPick(selectProjectToolchainContext, 'Select project Lean version', false);
        if (selectedProjectToolchain === undefined) {
            return;
        }
        const prompt = `This operation will set '${selectedProjectToolchain}' to be the Lean version of the Lean project at '${activeClientUri.fsPath}'. It is only intended to be used by maintainers of this project.\n\n` +
            'Changing the Lean version of this project may lead to breakages induced by incompatibilities with the new Lean version. For example, the following components of this project may end up being incompatible with the new Lean version:\n' +
            '- The Lean code in this project\n' +
            "- The 'lakefile.toml' or 'lakefile.lean' configuring this project\n" +
            '- Lake dependencies of this project\n\n' +
            "If you simply wish to update a Lake dependency of this project and use its Lean version to ensure that the Lean version of the dependency is compatible with the Lean version of this project, it is preferable to use the 'Project: Update Dependency' command instead of this one.\n\n" +
            'Do you wish to proceed?';
        const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, ['Proceed']);
        if (choice !== 'Proceed') {
            return;
        }
        try {
            await fs_1.promises.writeFile(leanToolchainPath(activeClientUri), selectedProjectToolchain, {
                encoding: 'utf8',
                flush: true,
            });
        }
        catch (e) {
            if (e instanceof Error) {
                (0, notifs_1.displayNotification)('Error', `Update of '${leanToolchainPath(activeClientUri)}' failed: ${e.message}`);
            }
            else {
                (0, notifs_1.displayNotification)('Error', `Update of '${leanToolchainPath(activeClientUri)}' failed.`);
            }
            return;
        }
        await activeClient.restart();
        (0, notifs_1.displayNotification)('Information', 'Project Lean version update successful.');
    }
    async displayToolchainSelectionQuickPick(context, title, includeStable) {
        const toolchainInfo = await this.installedToolchains();
        if (toolchainInfo === undefined) {
            return undefined;
        }
        const installedToolchains = sortToolchains(toolchainInfo.toolchains);
        const installedToolchainIndex = new Set(installedToolchains);
        let stableToolchains = [];
        let betaToolchains = [];
        let nightlyToolchains = [];
        const leanReleasesQueryResult = await (0, releaseQuery_1.queryLeanReleases)(context);
        if (leanReleasesQueryResult.kind === 'CannotParse') {
            (0, notifs_1.displayNotification)('Warning', "Could not fetch Lean versions: Cannot parse response from 'https://release.lean-lang.org/'.");
        }
        if (leanReleasesQueryResult.kind === 'CannotFetch') {
            (0, notifs_1.displayNotification)('Warning', `Could not fetch Lean versions: ${leanReleasesQueryResult.error}`);
        }
        const toToolchainNames = (channel) => channel.map(t => `leanprover/lean4:${t.name}`).filter(t => !installedToolchainIndex.has(t));
        if (leanReleasesQueryResult.kind === 'Success') {
            stableToolchains = toToolchainNames(leanReleasesQueryResult.releases.stable);
            betaToolchains = toToolchainNames(leanReleasesQueryResult.releases.beta);
            nightlyToolchains = toToolchainNames(leanReleasesQueryResult.releases.nightly);
        }
        const downloadableToolchains = [stableToolchains, betaToolchains, nightlyToolchains];
        const stableItem = {
            label: 'Always use most recent stable version',
            description: elan_1.elanStableChannel,
            picked: true,
        };
        const installedToolchainSeparator = { label: '', kind: vscode_1.QuickPickItemKind.Separator };
        const installedToolchainItems = installedToolchains.map(t => ({
            label: t,
            description: '(installed)',
        }));
        const downloadableToolchainItems = [];
        for (const downloadableToolchainGroup of downloadableToolchains) {
            if (downloadableToolchainGroup.length === 0) {
                continue;
            }
            const downloadableToolchainGroupSeparator = { label: '', kind: vscode_1.QuickPickItemKind.Separator };
            downloadableToolchainItems.push(downloadableToolchainGroupSeparator);
            for (const downloadableToolchain of downloadableToolchainGroup) {
                downloadableToolchainItems.push({
                    label: downloadableToolchain,
                    description: '(not installed)',
                });
            }
        }
        const allItems = [];
        if (includeStable) {
            allItems.push(stableItem);
            allItems.push(installedToolchainSeparator);
        }
        allItems.push(...installedToolchainItems);
        allItems.push(...downloadableToolchainItems);
        const choice = await vscode_1.window.showQuickPick(allItems, {
            matchOnDescription: true,
            title,
        });
        if (choice === undefined) {
            return undefined;
        }
        if (choice.description === elan_1.elanStableChannel) {
            return elan_1.elanStableChannel;
        }
        else {
            return choice.label;
        }
    }
    async activeToolchain(context, toolchain) {
        const r = await (0, elan_1.elanActiveToolchain)(undefined, context, toolchain);
        if (r.kind === 'ExecutionError') {
            (0, notifs_1.displayNotification)('Error', `Error while obtaining Lean versions: ${r.message}`);
            return undefined;
        }
        if (r.kind === 'ElanNotFound') {
            displayElanNotInstalledError();
            return undefined;
        }
        if (r.kind === 'Cancelled') {
            return undefined;
        }
        if (r.kind === 'NoActiveToolchain') {
            if (toolchain === undefined) {
                (0, notifs_1.displayNotification)('Error', 'No active Lean version.');
            }
            else {
                (0, notifs_1.displayNotification)('Error', `Error while obtaining Lean versions: Expected active Lean version for toolchain override with '${toolchain}'`);
            }
            return undefined;
        }
        r.kind;
        return r.info;
    }
    async installedToolchains() {
        const r = await (0, elan_1.elanInstalledToolchains)();
        if (r.kind === 'ExecutionError') {
            (0, notifs_1.displayNotification)('Error', `Error while obtaining Lean versions:  ${r.message}`);
            return undefined;
        }
        if (r.kind === 'ElanNotFound') {
            displayElanNotInstalledError();
            return undefined;
        }
        r.kind;
        return {
            defaultToolchain: r.defaultToolchain,
            toolchains: r.toolchains,
        };
    }
    async checkElanSupportsDumpState() {
        const r = await (0, elan_1.elanVersion)();
        switch (r.kind) {
            case 'Success':
                if (!(0, elan_1.isElanEagerResolutionVersion)(r.version)) {
                    (0, notifs_1.displayNotification)('Error', `This command can only be used with Elan versions >= ${elan_1.elanEagerResolutionMajorVersion}.0.0, but the installed Elan version is ${r.version.toString()}.`);
                    return false;
                }
                return true;
            case 'ElanNotInstalled':
                displayElanNotInstalledError();
                return false;
            case 'ExecutionError':
                (0, notifs_1.displayNotification)('Error', `Error while checking Elan version: ${r.message}`);
                return false;
        }
    }
    dispose() {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
    }
}
exports.ElanCommandProvider = ElanCommandProvider;
//# sourceMappingURL=elanCommands.js.map