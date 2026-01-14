"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const os = require("os");
const path = require("path");
const vscode_1 = require("vscode");
const AbbreviationFeature_1 = require("./abbreviation/AbbreviationFeature");
const abbreviationview_1 = require("./abbreviationview");
const fullDiagnostics_1 = require("./diagnostics/fullDiagnostics");
const setupDiagnostics_1 = require("./diagnostics/setupDiagnostics");
const exports_1 = require("./exports");
const infoview_1 = require("./infoview");
const loogleview_1 = require("./loogleview");
const manualview_1 = require("./manualview");
const projectinit_1 = require("./projectinit");
const projectoperations_1 = require("./projectoperations");
const taskgutter_1 = require("./taskgutter");
const clientProvider_1 = require("./utils/clientProvider");
const depInstaller_1 = require("./utils/depInstaller");
const elanCommands_1 = require("./utils/elanCommands");
const envPath_1 = require("./utils/envPath");
const events_1 = require("./utils/events");
const exturi_1 = require("./utils/exturi");
const fullInstaller_1 = require("./utils/fullInstaller");
const internalErrors_1 = require("./utils/internalErrors");
const leanCmdRunner_1 = require("./utils/leanCmdRunner");
const leanEditorProvider_1 = require("./utils/leanEditorProvider");
const leanInstaller_1 = require("./utils/leanInstaller");
const moduleTreeViewProvider_1 = require("./utils/moduleTreeViewProvider");
const notifs_1 = require("./utils/notifs");
const pathExtensionProvider_1 = require("./utils/pathExtensionProvider");
const projectInfo_1 = require("./utils/projectInfo");
const uriHandlerService_1 = require("./utils/uriHandlerService");
async function setLeanFeatureSetActive(isActive) {
    await vscode_1.commands.executeCommand('setContext', 'lean4.isLeanFeatureSetActive', isActive);
}
async function findInitialLeanProjectUri(editor) {
    const uri = (0, exturi_1.toExtUri)(editor.document.uri);
    if (uri === undefined) {
        return undefined;
    }
    const info = await (0, projectInfo_1.findLeanProjectRootInfo)(uri);
    if (info.kind === 'FileNotFound') {
        return undefined;
    }
    if (editor.document.languageId !== 'lean4' && info.kind === 'Success' && info.toolchainUri === undefined) {
        return undefined;
    }
    return info.projectRootUri;
}
async function findActiveLeanProjectUri() {
    const activeEditor = vscode_1.window.activeTextEditor;
    if (activeEditor === undefined) {
        return undefined;
    }
    return await findInitialLeanProjectUri(activeEditor);
}
async function findVisibleLeanProjectUri() {
    // This happens if vscode starts with a lean file open
    // but the "Getting Started" page is active.
    for (const editor of vscode_1.window.visibleTextEditors) {
        const projectUri = await findInitialLeanProjectUri(editor);
        if (projectUri === undefined) {
            continue;
        }
        return projectUri;
    }
    return undefined;
}
async function findOpenLeanProjectUri() {
    const activeProjectUri = await findActiveLeanProjectUri();
    if (activeProjectUri !== undefined) {
        return activeProjectUri;
    }
    const visibleProjectUri = await findVisibleLeanProjectUri();
    if (visibleProjectUri !== undefined) {
        return visibleProjectUri;
    }
    return 'NoValidDocument';
}
function addElanPathToPATH() {
    (0, envPath_1.addToProcessEnvPATH)(path.join(os.homedir(), '.elan', 'bin'));
}
/**
 * Activates all extension features that are *always* enabled, even when no Lean 4 document is currently open.
 */
function activateAlwaysEnabledFeatures(context) {
    addElanPathToPATH();
    // Add all dependency installation locations to the PATH.
    // This is especially useful on Windows, where apparently (?) users sometimes need to
    // restart their system for changes in the PATH to be reflected in newly launched applications.
    for (const loc of (0, depInstaller_1.depInstallationLocations)()) {
        (0, envPath_1.addToProcessEnvPATH)(loc);
    }
    context.subscriptions.push(pathExtensionProvider_1.PathExtensionProvider.withAddedEnvPathExtensions());
    context.subscriptions.push(vscode_1.commands.registerCommand('lean4.docs.showSetupGuide', () => vscode_1.commands.executeCommand('workbench.action.openWalkthrough', 'leanprover.lean4#lean4.welcome', false)), vscode_1.commands.registerCommand('lean4.troubleshooting.showTroubleshootingGuide', () => vscode_1.commands.executeCommand('workbench.action.openWalkthrough', { category: 'leanprover.lean4#lean4.welcome', step: 'lean4.welcome.help' }, false)), vscode_1.commands.registerCommand('lean4.docs.showDocResources', () => vscode_1.commands.executeCommand('simpleBrowser.show', 'https://lean-lang.org/learn/')));
    const extensionPath = new exturi_1.FileUri(context.extensionPath);
    const manualView = new manualview_1.ManualView(extensionPath, extensionPath.join('manual', 'manual.md'));
    context.subscriptions.push(manualView);
    const loogleView = new loogleview_1.LoogleView(extensionPath, context.extension.packageJSON.version);
    context.subscriptions.push(loogleView);
    const outputChannel = vscode_1.window.createOutputChannel('Lean: Editor');
    context.subscriptions.push(vscode_1.commands.registerCommand('lean4.troubleshooting.showOutput', () => outputChannel.show(true)));
    const depInstaller = new depInstaller_1.DepInstaller(outputChannel);
    context.subscriptions.push(depInstaller);
    const leanInstaller = new leanInstaller_1.LeanInstaller(outputChannel);
    context.subscriptions.push(leanInstaller);
    const fullInstaller = new fullInstaller_1.FullInstaller(outputChannel, depInstaller, leanInstaller);
    context.subscriptions.push(fullInstaller);
    const projectInitializationProvider = new projectinit_1.ProjectInitializationProvider(outputChannel, leanInstaller, depInstaller);
    context.subscriptions.push(projectInitializationProvider);
    const checkForExtensionConflict = (doc) => {
        const isLean3ExtensionInstalled = vscode_1.extensions.getExtension('jroesch.lean') !== undefined;
        if (isLean3ExtensionInstalled && (doc.languageId === 'lean' || doc.languageId === 'lean4')) {
            (0, notifs_1.displayNotification)('Error', "The Lean 3 and the Lean 4 VS Code extension are enabled at the same time. Since both extensions act on .lean files, this can lead to issues with either extension. Please disable the extension for the Lean major version that you do not wish to use ('Extensions' in the left sidebar > Cog icon > 'Disable').");
        }
    };
    for (const doc of vscode_1.workspace.textDocuments) {
        checkForExtensionConflict(doc);
    }
    context.subscriptions.push(vscode_1.workspace.onDidOpenTextDocument(checkForExtensionConflict));
    const fullDiagnosticsProvider = new fullDiagnostics_1.FullDiagnosticsProvider(outputChannel);
    context.subscriptions.push(fullDiagnosticsProvider);
    const abbreviationFeature = new AbbreviationFeature_1.AbbreviationFeature(outputChannel);
    context.subscriptions.push(abbreviationFeature);
    const abbreviationView = new abbreviationview_1.AbbreviationView(extensionPath, abbreviationFeature.abbreviations);
    context.subscriptions.push(abbreviationView);
    const elanCommandProvider = new elanCommands_1.ElanCommandProvider(outputChannel);
    context.subscriptions.push(elanCommandProvider);
    const uriHandlerService = new uriHandlerService_1.UriHandlerService();
    context.subscriptions.push(uriHandlerService);
    return {
        projectInitializationProvider,
        outputChannel,
        leanInstaller,
        depInstaller,
        fullDiagnosticsProvider,
        elanCommandProvider,
    };
}
async function checkLean4FeaturePreconditions(leanInstaller, depInstaller, context, cwdUri, d) {
    return await (0, setupDiagnostics_1.checkAll)(() => d.checkIsOperatingSystemSupported(), () => d.checkAreDependenciesInstalled(depInstaller, leanInstaller.getOutputChannel(), cwdUri), () => d.checkIsLean4Installed(leanInstaller, context, cwdUri, 'PromptAboutUpdate'), () => d.checkIsElanUpToDate(leanInstaller, cwdUri, {
        elanMustBeInstalled: false,
    }), () => d.checkIsVSCodeUpToDate());
}
async function activateLean4Features(context, installer, elanCommandProvider) {
    const clientProvider = new clientProvider_1.LeanClientProvider(installer.getOutputChannel());
    elanCommandProvider.setClientProvider(clientProvider);
    installer.setClientProvider(clientProvider);
    context.subscriptions.push(clientProvider);
    const infoProvider = new infoview_1.InfoProvider(clientProvider, context);
    context.subscriptions.push(infoProvider);
    context.subscriptions.push(new taskgutter_1.LeanTaskGutter(clientProvider, context));
    const projectOperationProvider = new projectoperations_1.ProjectOperationProvider(installer.getOutputChannel(), clientProvider);
    context.subscriptions.push(await moduleTreeViewProvider_1.ModuleTreeViewProvider.init(clientProvider));
    await setLeanFeatureSetActive(true);
    return { clientProvider, infoProvider, projectOperationProvider };
}
async function tryActivatingLean4FeaturesInProject(context, leanInstaller, depInstaller, elanCommandProvider, resolve, d, projectUri) {
    const preconditionCheckResult = await checkLean4FeaturePreconditions(leanInstaller, depInstaller, 'Lean 4 Extension Startup', (0, exturi_1.extUriToCwdUri)(projectUri), d);
    if (preconditionCheckResult === 'Fatal') {
        return;
    }
    const lean4EnabledFeatures = await (0, internalErrors_1.displayInternalErrorsIn)('activating Lean 4 features', () => activateLean4Features(context, leanInstaller, elanCommandProvider));
    resolve(lean4EnabledFeatures);
}
async function tryActivatingLean4Features(context, leanInstaller, depInstaller, elanCommandProvider, resolve, d, warnAboutNoValidDocument) {
    const projectUri = await findOpenLeanProjectUri();
    if (projectUri !== 'NoValidDocument') {
        await tryActivatingLean4FeaturesInProject(context, leanInstaller, depInstaller, elanCommandProvider, resolve, d, projectUri);
        return;
    }
    if (warnAboutNoValidDocument) {
        await (0, notifs_1.displayModalNotification)('Error', 'No visible Lean document - cannot retry activating the extension. Please select a Lean document.');
    }
    // We try activating the Lean features in two cases:
    // 1. When revealing a new editor with the `lean4` language ID (e.g.: switching tabs, opening a new Lean document, changing the language ID to `lean4`)
    // 2. When revealing a new editor in a Lean project that doesn't have the `lean4` language ID (e.g.: switching tabs, opening a new document)
    // These two events are disjoint, so combining them won't cause duplicate triggers.
    const combinedEvent = (0, events_1.combine)(leanEditorProvider_1.lean.onDidRevealLeanEditor, _ => true, leanEditorProvider_1.text.onDidRevealLeanEditor, editor => editor.editor.document.languageId !== 'lean4');
    context.subscriptions.push(combinedEvent.disposable);
    context.subscriptions.push((0, events_1.onEventWhile)(combinedEvent.event, (0, events_1.withoutReentrancy)('Continue', async (leanEditor) => {
        const projectUri = await findInitialLeanProjectUri(leanEditor.editor);
        if (projectUri === undefined) {
            return 'Continue';
        }
        await tryActivatingLean4FeaturesInProject(context, leanInstaller, depInstaller, elanCommandProvider, resolve, d, projectUri);
        return 'Stop';
    })));
}
async function activate(context) {
    await setLeanFeatureSetActive(false);
    (0, leanEditorProvider_1.registerLeanEditorProviders)(context);
    await (0, notifs_1.setStickyNotificationActiveButHidden)(false);
    context.subscriptions.push(vscode_1.commands.registerCommand('lean4.redisplaySetupError', async () => (0, notifs_1.displayActiveStickyNotification)()));
    (0, leanCmdRunner_1.registerLeanCommandRunner)(context);
    const alwaysEnabledFeatures = await (0, internalErrors_1.displayInternalErrorsIn)('activating Lean 4 extension', async () => activateAlwaysEnabledFeatures(context));
    const lean4EnabledFeatures = new Promise(async (resolve, _) => {
        // eslint-disable-next-line prefer-const
        let d;
        const options = {
            errorMode: {
                mode: 'Sticky',
                retry: async () => tryActivatingLean4Features(context, alwaysEnabledFeatures.leanInstaller, alwaysEnabledFeatures.depInstaller, alwaysEnabledFeatures.elanCommandProvider, resolve, d, true),
            },
            warningMode: { modal: true, proceedByDefault: true },
        };
        d = new setupDiagnostics_1.SetupDiagnostics(options);
        await tryActivatingLean4Features(context, alwaysEnabledFeatures.leanInstaller, alwaysEnabledFeatures.depInstaller, alwaysEnabledFeatures.elanCommandProvider, resolve, d, false);
    });
    return new exports_1.Exports(alwaysEnabledFeatures, lean4EnabledFeatures);
}
//# sourceMappingURL=extension.js.map