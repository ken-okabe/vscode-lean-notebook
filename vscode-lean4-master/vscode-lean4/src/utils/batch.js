"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionExitCode = void 0;
exports.formatCommandExecutionOutput = formatCommandExecutionOutput;
exports.batchExecuteWithProc = batchExecuteWithProc;
exports.batchExecute = batchExecute;
exports.batchExecuteWithProgress = batchExecuteWithProgress;
exports.executeAll = executeAll;
exports.displayResultError = displayResultError;
exports.displayModalResultError = displayModalResultError;
exports.displayOutputError = displayOutputError;
exports.displayModalOutputError = displayModalOutputError;
const child_process_1 = require("child_process");
const vscode_1 = require("vscode");
const logger_1 = require("./logger");
const notifs_1 = require("./notifs");
var ExecutionExitCode;
(function (ExecutionExitCode) {
    ExecutionExitCode[ExecutionExitCode["Success"] = 0] = "Success";
    ExecutionExitCode[ExecutionExitCode["CannotLaunch"] = 1] = "CannotLaunch";
    ExecutionExitCode[ExecutionExitCode["ExecutionError"] = 2] = "ExecutionError";
    ExecutionExitCode[ExecutionExitCode["Cancelled"] = 3] = "Cancelled";
})(ExecutionExitCode || (exports.ExecutionExitCode = ExecutionExitCode = {}));
function createCannotLaunchExecutionResult(message) {
    return {
        exitCode: ExecutionExitCode.CannotLaunch,
        stdout: message,
        stderr: '',
        combined: message,
    };
}
function formatCommandExecutionOutput(workingDirectory, executablePath, args) {
    const formattedCwd = workingDirectory ? `${workingDirectory}` : '';
    const formattedArgs = args.map(arg => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ');
    return `${formattedCwd}> ${executablePath} ${formattedArgs}`;
}
function batchExecuteWithProc(executablePath, args, workingDirectory, channel, envExtensions, shell) {
    let stdout = '';
    let stderr = '';
    let combined = '';
    let options = {};
    if (workingDirectory !== undefined) {
        options = { cwd: workingDirectory, windowsHide: true };
    }
    if (envExtensions !== undefined) {
        const env = Object.assign({}, process.env);
        for (const [key, value] of Object.entries(envExtensions)) {
            env[key] = value;
        }
        options = { ...options, env };
    }
    if (shell === 'Unix') {
        options = { ...options, shell: '/bin/bash' };
    }
    else if (shell === 'Windows') {
        options = { ...options, shell: 'powershell.exe' };
    }
    if (channel?.combined) {
        channel.combined.appendLine(formatCommandExecutionOutput(workingDirectory, executablePath, args));
    }
    let proc;
    try {
        proc = (0, child_process_1.spawn)(executablePath, args, options);
    }
    catch (e) {
        return ['CannotLaunch', new Promise(resolve => resolve(createCannotLaunchExecutionResult('')))];
    }
    const execPromise = new Promise(resolve => {
        const conclude = (r) => resolve({
            exitCode: r.exitCode,
            stdout: r.stdout.trim(),
            stderr: r.stderr.trim(),
            combined: r.combined.trim(),
        });
        proc.on('error', err => {
            conclude(createCannotLaunchExecutionResult(err.message));
        });
        proc.stdout.on('data', line => {
            const s = line.toString();
            if (channel?.combined)
                channel.combined.appendLine(s);
            if (channel?.stdout)
                channel.stdout.appendLine(s);
            stdout += s + '\n';
            combined += s + '\n';
        });
        proc.stderr.on('data', line => {
            const s = line.toString();
            if (channel?.combined)
                channel.combined.appendLine(s);
            if (channel?.stderr)
                channel.stderr.appendLine(s);
            stderr += s + '\n';
            combined += s + '\n';
        });
        proc.on('close', (code, signal) => {
            logger_1.logger.log(`child process exited with code ${code}`);
            if (signal === 'SIGTERM') {
                if (channel?.combined) {
                    channel.combined.appendLine('=> Operation cancelled by user.');
                }
                conclude({
                    exitCode: ExecutionExitCode.Cancelled,
                    stdout,
                    stderr,
                    combined,
                });
                return;
            }
            if (code !== 0) {
                if (channel?.combined) {
                    const formattedCode = code ? `Exit code: ${code}.` : '';
                    const formattedSignal = signal ? `Signal: ${signal}.` : '';
                    channel.combined.appendLine(`=> Operation failed. ${formattedCode} ${formattedSignal}`.trim());
                }
                conclude({
                    exitCode: ExecutionExitCode.ExecutionError,
                    stdout,
                    stderr,
                    combined,
                });
                return;
            }
            conclude({
                exitCode: ExecutionExitCode.Success,
                stdout,
                stderr,
                combined,
            });
        });
    });
    return [proc, execPromise];
}
async function batchExecute(executablePath, args, workingDirectory, channel, envExtensions, shell) {
    const [_, execPromise] = batchExecuteWithProc(executablePath, args, workingDirectory, channel, envExtensions, shell);
    return execPromise;
}
async function batchExecuteWithProgress(executablePath, args, context, title, options = {}) {
    const titlePrefix = context ? `[${context}] ` : '';
    const titleSuffix = options.channel ? ' [(Click for details)](command:lean4.troubleshooting.showOutput)' : '';
    const progressOptions = {
        location: vscode_1.ProgressLocation.Notification,
        title: titlePrefix + title + titleSuffix,
        cancellable: options.allowCancellation === true,
    };
    let progress;
    const progressChannel = {
        name: 'ProgressChannel',
        append(value) {
            if (options.translator) {
                const translatedValue = options.translator(value);
                if (translatedValue === undefined) {
                    return;
                }
                value = translatedValue;
            }
            if (options.channel) {
                options.channel.appendLine(value.trimEnd());
                progress?.report({ message: value });
            }
        },
        appendLine(value) {
            this.append(value + '\n');
        },
        replace(_) {
            /* empty */
        },
        clear() {
            /* empty */
        },
        show() {
            /* empty */
        },
        hide() {
            /* empty */
        },
        dispose() {
            /* empty */
        },
    };
    const expensiveExecutionTimeoutPromise = new Promise((resolve, _) => setTimeout(() => resolve(undefined), 500));
    const [proc, executionPromise] = batchExecuteWithProc(executablePath, args, options.cwd, {
        combined: progressChannel,
    }, options.envExtensions, options.shell);
    if (proc === 'CannotLaunch') {
        return executionPromise; // resolves to a 'CannotLaunch' ExecutionResult
    }
    const preliminaryResult = await Promise.race([expensiveExecutionTimeoutPromise, executionPromise]);
    if (preliminaryResult !== undefined) {
        return preliminaryResult;
    }
    // Execution already took longer than 500ms, let's start displaying a progress bar now
    const result = await vscode_1.window.withProgress(progressOptions, (p, token) => {
        progress = p;
        token.onCancellationRequested(() => proc.kill());
        return executionPromise;
    });
    return result;
}
async function executeAll(executions) {
    const results = [];
    for (const execution of executions) {
        const result = await execution.execute();
        results.push(result);
        if (execution.optional !== true && result.exitCode !== ExecutionExitCode.Success) {
            break;
        }
    }
    return results;
}
function displayResultError(result, message) {
    if (result.exitCode === ExecutionExitCode.Success) {
        throw Error();
    }
    displayOutputError(result.combined, message);
}
async function displayModalResultError(result, message) {
    if (result.exitCode === ExecutionExitCode.Success) {
        throw Error();
    }
    await displayModalOutputError(result.combined, message);
}
function displayOutputError(output, message) {
    const errorMessage = formatErrorMessage(output, message);
    (0, notifs_1.displayNotificationWithOutput)('Error', errorMessage);
}
async function displayModalOutputError(output, message) {
    const errorMessage = formatModalErrorMessage(output, message);
    await (0, notifs_1.displayModalNotificationWithOutput)('Error', errorMessage);
}
function formatErrorMessage(output, message) {
    if (output === '') {
        return `${message}`;
    }
    return `${message} Command output: ${output}`;
}
function formatModalErrorMessage(output, message) {
    if (output === '') {
        return `${message}`;
    }
    return `${message}\n\n---\n\nOutput of command that failed: ${output}`;
}
//# sourceMappingURL=batch.js.map