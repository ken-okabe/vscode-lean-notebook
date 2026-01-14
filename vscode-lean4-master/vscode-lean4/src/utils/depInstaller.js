"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepInstaller = void 0;
exports.depInstallationLocations = depInstallationLocations;
exports.missingDepsSentence = missingDepsSentence;
exports.sentenceJoin = sentenceJoin;
exports.missingDeps = missingDeps;
exports.unsuccessfulDependencyInstallationPrompt = unsuccessfulDependencyInstallationPrompt;
const os = require("os");
const path_1 = require("path");
const vscode_1 = require("vscode");
const setupDiagnoser_1 = require("../diagnostics/setupDiagnoser");
const batch_1 = require("./batch");
const envPath_1 = require("./envPath");
const notifs_1 = require("./notifs");
const gitInstallDir = path_1.default.join('c:', 'Program Files', 'Git', 'cmd');
function depInstallationLocations() {
    switch (os.type()) {
        case 'Linux':
            // Installation locations of Git and curl should already be in PATH on most Linux systems
            return [];
        case 'Darwin':
            // MacOS ships with a dummy executable for Git that is already in the PATH, which is replaced
            // with the real executable when Apple Command Line Tools is installed.
            return [];
        case 'Windows_NT':
            return [gitInstallDir];
    }
    return [];
}
const windowsRawGitInstallScript = `$gitInstallerUrl = "https://github.com/git-for-windows/git/releases/download/v2.50.1.windows.1/Git-2.50.1-64-bit.exe"
$installDir = "%TEMP%\\lean4-vscode-extension"
$gitInstallerLoc = "$installDir\\GitInstaller.exe"
New-Item -ItemType Directory -Path $installDir -Force
Invoke-WebRequest -Uri $gitInstallerUrl -OutFile $gitInstallerLoc
& $gitInstallerLoc /VERYSILENT /NORESTART /SP-
exit $LASTEXITCODE`;
const macOsInstallScript = `set -e
touch "/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress"
aclt_label="$(/usr/sbin/softwareupdate -l |
              grep -B 1 -E 'Command Line Tools' |
              awk -F'*' '/^ *\\*/ {print $2}' |
              sed -e 's/^ *Label: //' -e 's/^ *//' |
              sort -V |
              tail -n1 |
              tr -d '\n')"
/usr/sbin/softwareupdate -i "$aclt_label"`;
class DepInstaller {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
        this.pendingInstall = false;
        this.subscriptions = [];
        this.diagnoser = new setupDiagnoser_1.SetupDiagnoser({
            channel: outputChannel,
            cwdUri: undefined,
            context: 'Dependency Installation',
        });
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.setup.installDeps', () => this.displayInstallDependenciesPrompt('Information', undefined)));
    }
    async displayInstallDependenciesPrompt(severity, reason) {
        const p = await this.determineDependencyInstallationProcedure();
        if (p.kind === 'AllDepsInstalled') {
            (0, notifs_1.displayNotification)('Information', 'All dependencies of Lean (Git and curl) are already installed.');
            return 'Success';
        }
        if (p.method.kind === 'Manual') {
            await displayManualInstallationPrompt(severity, reason, p);
            return 'Failure';
        }
        const choice = await (0, notifs_1.displayNotificationWithInput)(severity, installDependenciesPrompt(reason, p), ['Proceed']);
        if (choice !== 'Proceed') {
            return 'Failure';
        }
        return await this.installMissingDepsAndDisplayNotification(p);
    }
    async displayStickyInstallDependenciesPrompt(severity, reason, options, otherItems = []) {
        const p = await this.determineDependencyInstallationProcedure();
        if (p.kind === 'AllDepsInstalled') {
            (0, notifs_1.displayNotification)('Information', 'All dependencies of Lean (Git and curl) are already installed.');
            return vscode_1.Disposable.from();
        }
        if (p.method.kind === 'Manual') {
            return await displayStickyManualInstallationPrompt(severity, reason, p, options, otherItems);
        }
        const installDepsItem = {
            input: 'Install Dependencies',
            continueDisplaying: false,
            action: async () => {
                await this.installMissingDepsAndDisplayNotification(p);
            },
        };
        return (0, notifs_1.displayStickyNotificationWithOptionalInput)(severity, installDependenciesPrompt(reason, p), options, [
            installDepsItem,
            ...otherItems,
        ]);
    }
    async installMissingDepsAndDisplayNotification(p) {
        const r = await this.installMissingDeps(p);
        switch (r.kind) {
            case 'Success':
                (0, notifs_1.displayNotification)('Information', 'Dependency installation successful!');
                return 'Success';
            case 'Error':
                await (0, batch_1.displayModalResultError)(r.result, unsuccessfulDependencyInstallationPrompt(p));
                return 'Failure';
            case 'Cancelled':
                return 'Failure';
            case 'PendingInstall':
                return 'PendingInstall';
        }
    }
    async installMissingDeps(p) {
        if (p.method.kind === 'Manual') {
            throw new Error('got manual installation method in `installMissingDeps`');
        }
        if (this.pendingInstall) {
            (0, notifs_1.displayNotification)('Error', 'Dependencies are already being installed.');
            return { kind: 'PendingInstall' };
        }
        this.pendingInstall = true;
        try {
            const installationResult = await this.runCommand(p.method.script, [], 'Installing missing dependencies', p.method.shell);
            switch (installationResult.exitCode) {
                case batch_1.ExecutionExitCode.Success:
                    this.addDepsToProcessEnv(p.method);
                    return { kind: 'Success' };
                case batch_1.ExecutionExitCode.CannotLaunch:
                case batch_1.ExecutionExitCode.ExecutionError:
                    return { kind: 'Error', result: installationResult };
                case batch_1.ExecutionExitCode.Cancelled:
                    return { kind: 'Cancelled' };
            }
        }
        finally {
            this.pendingInstall = false;
        }
    }
    addDepsToProcessEnv(method) {
        if (method.kind !== 'Automatic') {
            return;
        }
        for (const pathExt of method.pathExtensions) {
            (0, envPath_1.addToProcessEnvPATH)(pathExt);
        }
    }
    async determineDependencyInstallationProcedure() {
        const p = await this.determineMissingDependencyInstallationProcedure();
        if (p === undefined) {
            return { kind: 'AllDepsInstalled' };
        }
        return { ...p, method: dependencyInstallationMethod(p) };
    }
    async determineMissingDependencyInstallationProcedure() {
        const isCurlAvailable = await this.diagnoser.checkCurlAvailable();
        const isGitAvailable = await this.diagnoser.checkGitAvailable();
        if (isCurlAvailable && isGitAvailable) {
            return undefined;
        }
        switch (os.type()) {
            case 'Linux':
                const isAptAvailable = await this.diagnoser.checkAptGetAvailable();
                if (isAptAvailable) {
                    const isPkExecAvailable = await this.diagnoser.checkPkExecAvailable();
                    return {
                        kind: 'Linux',
                        isCurlAvailable,
                        isGitAvailable,
                        packageManager: { kind: 'Apt', isPkExecAvailable },
                    };
                }
                const isDnfAvailable = await this.diagnoser.checkDnfAvailable();
                if (isDnfAvailable) {
                    const isPkExecAvailable = await this.diagnoser.checkPkExecAvailable();
                    return {
                        kind: 'Linux',
                        isCurlAvailable,
                        isGitAvailable,
                        packageManager: { kind: 'Dnf', isPkExecAvailable },
                    };
                }
                return {
                    kind: 'Linux',
                    isCurlAvailable,
                    isGitAvailable,
                    packageManager: { kind: 'Other' },
                };
            case 'Darwin':
                return {
                    kind: 'MacOS',
                    isCurlAvailable: true,
                    isGitAvailable,
                };
            case 'Windows_NT':
                const isWinGetAvailable = await this.diagnoser.checkWinGetAvailable();
                return {
                    kind: 'Windows',
                    isCurlAvailable: true,
                    isGitAvailable,
                    isWinGetAvailable,
                };
        }
        return {
            kind: 'Other',
            isCurlAvailable,
            isGitAvailable,
        };
    }
    async runCommand(executablePath, args, title, shell) {
        const options = {
            allowCancellation: true,
            channel: this.outputChannel,
            shell,
        };
        return (0, batch_1.batchExecuteWithProgress)(executablePath, args, 'Dependency Installation', title, options);
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.DepInstaller = DepInstaller;
function dependencyInstallationMethod(p) {
    switch (p.kind) {
        case 'Linux':
            switch (p.packageManager.kind) {
                case 'Apt':
                    const manualAptScript = `sudo apt update && sudo apt install ${missingDeps(p).join(' ')}`;
                    if (!p.packageManager.isPkExecAvailable) {
                        return {
                            kind: 'Manual',
                            script: manualAptScript,
                        };
                    }
                    return {
                        kind: 'Automatic',
                        shell: 'Unix',
                        // `ulimit -Sn 1024`: https://github.com/microsoft/vscode/issues/237427
                        script: `ulimit -Sn 1024; pkexec bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -y && apt-get install -y ${missingDeps(p).join(' ')}'`,
                        manualBackupScript: manualAptScript,
                        pathExtensions: [],
                    };
                case 'Dnf':
                    const manualDnfScript = `sudo dnf install ${missingDeps(p).join(' ')}`;
                    if (!p.packageManager.isPkExecAvailable) {
                        return {
                            kind: 'Manual',
                            script: manualDnfScript,
                        };
                    }
                    return {
                        kind: 'Automatic',
                        shell: 'Unix',
                        script: `pkexec dnf install -y ${missingDeps(p).join(' ')}`,
                        manualBackupScript: manualDnfScript,
                        pathExtensions: [],
                    };
                case 'Other':
                    return {
                        kind: 'Manual',
                        script: undefined,
                    };
            }
        case 'MacOS':
            return {
                kind: 'Automatic',
                shell: 'Unix',
                script: macOsInstallScript,
                manualBackupScript: macOsInstallScript,
                pathExtensions: [],
            };
        case 'Windows':
            if (!p.isWinGetAvailable) {
                return {
                    kind: 'Automatic',
                    shell: 'Windows',
                    script: windowsRawGitInstallScript,
                    manualBackupScript: undefined,
                    pathExtensions: [gitInstallDir],
                };
            }
            const windowsWingetGitInstallScript = 'winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements --disable-interactivity';
            return {
                kind: 'Automatic',
                shell: 'Windows',
                script: windowsWingetGitInstallScript,
                manualBackupScript: windowsWingetGitInstallScript,
                pathExtensions: [gitInstallDir],
            };
        case 'Other':
            return {
                kind: 'Manual',
                script: undefined,
            };
    }
}
async function displayManualInstallationPrompt(severity, reason, p) {
    let reasonPrefix = '';
    if (reason !== undefined) {
        reasonPrefix = `${reason} `;
    }
    if (p.method.script === undefined) {
        await (0, notifs_1.displayModalNotification)(severity, `${reasonPrefix}Please install ${missingDepsSentence(p)} and restart VS Code.`);
        return;
    }
    const prompt = `${reasonPrefix}Please install ${missingDepsSentence(p)} from a terminal using the script below and restart VS Code.\n\n${p.method.script}`;
    const copyToClipboardInput = 'Copy Script to Clipboard';
    const choice = await (0, notifs_1.displayNotificationWithInput)('Information', prompt, [copyToClipboardInput], 'Close');
    if (choice === copyToClipboardInput) {
        await vscode_1.env.clipboard.writeText(p.method.script);
    }
}
async function displayStickyManualInstallationPrompt(severity, reason, p, options, otherItems = []) {
    let reasonPrefix = '';
    if (reason !== undefined) {
        reasonPrefix = `${reason} `;
    }
    const script = p.method.script;
    if (script === undefined) {
        await (0, notifs_1.displayModalNotification)(severity, `${reasonPrefix}Please install ${missingDepsSentence(p)} and restart VS Code.`);
        return vscode_1.Disposable.from();
    }
    const prompt = `${reasonPrefix}Please install ${missingDepsSentence(p)} from a [terminal](command:workbench.action.terminal.new) using the script below and restart VS Code.\n\n${script}`;
    const copyToClipboardItem = {
        input: 'Copy Script to Clipboard',
        continueDisplaying: true,
        action: async () => {
            await vscode_1.env.clipboard.writeText(script);
        },
    };
    return (0, notifs_1.displayStickyNotificationWithOptionalInput)(severity, prompt, options, [copyToClipboardItem, ...otherItems]);
}
function missingDepsSentence(p) {
    return sentenceJoin(missingDeps(p).map(d => '`' + d + '`'));
}
function sentenceJoin(entries) {
    if (entries.length === 0) {
        throw new Error('Cannot join empty array.');
    }
    if (entries.length === 1) {
        return entries[0];
    }
    if (entries.length === 2) {
        return `${entries[0]} and ${entries[1]}`;
    }
    return `${entries.slice(0, entries.length - 1).join(', ')} and ${entries[entries.length - 1]}`;
}
function missingDeps(p) {
    const missingDeps = [];
    if (!p.isGitAvailable) {
        missingDeps.push('git');
    }
    if (!p.isCurlAvailable) {
        missingDeps.push('curl');
    }
    return missingDeps;
}
function installDependenciesPrompt(reason, p) {
    if (p.method.kind === 'Manual') {
        throw new Error('cannot display installDependenciesPrompt for manual installation');
    }
    let reasonPrefix = '';
    if (reason !== undefined) {
        reasonPrefix = `${reason} `;
    }
    return `${reasonPrefix}Do you wish to install ${missingDepsSentence(p)}?`;
}
function unsuccessfulDependencyInstallationPrompt(p) {
    if (p.method.kind === 'Manual') {
        throw new Error('cannot display unsuccessfulDependencyInstallationPrompt for manual installation');
    }
    if (p.method.manualBackupScript === undefined) {
        return `Installation of ${missingDepsSentence(p)} unsuccessful.`;
    }
    return `Installation of ${missingDepsSentence(p)} unsuccessful.
If you are unable to figure out the issue from the command output below, you can also try running the following manual installation script from a terminal:

${p.method.manualBackupScript}`;
}
//# sourceMappingURL=depInstaller.js.map