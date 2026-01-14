"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const mocha_1 = require("mocha");
const batch_1 = require("../../../src/utils/batch");
const leanInstaller_1 = require("../../../src/utils/leanInstaller");
const logger_1 = require("../../../src/utils/logger");
const notifs_1 = require("../../../src/utils/notifs");
const helpers_1 = require("../utils/helpers");
(0, mocha_1.suite)('Lean4 Bootstrap Test Suite', () => {
    test('Install Elan', async () => {
        logger_1.logger.log('=================== Install elan on demand ===================');
        (0, notifs_1.displayNotification)('Information', 'Running tests: ' + __dirname);
        (0, helpers_1.cleanTempFolder)('elan');
        const method = (0, leanInstaller_1.elanInstallationMethod)();
        const result = await (0, batch_1.batchExecute)(method.script, [], undefined, undefined, undefined, method.shell);
        (0, assert_1.default)(result.exitCode === batch_1.ExecutionExitCode.Success);
        const result2 = await (0, batch_1.batchExecute)('elan', ['toolchain', 'install', 'leanprover/lean4:' + (0, helpers_1.getTestLeanVersion)()]);
        (0, assert_1.default)(result2.exitCode === batch_1.ExecutionExitCode.Success || result2.stderr.includes('is already installed'));
        const result3 = await (0, batch_1.batchExecute)('elan', ['default', 'leanprover/lean4:' + (0, helpers_1.getTestLeanVersion)()]);
        (0, assert_1.default)(result3.exitCode === batch_1.ExecutionExitCode.Success);
        const result4 = await (0, batch_1.batchExecute)('elan', ['toolchain', 'install', 'leanprover/lean4:' + (0, helpers_1.getAltBuildVersion)()]);
        (0, assert_1.default)(result4.exitCode === batch_1.ExecutionExitCode.Success || result4.stderr.includes('is already installed'));
        logger_1.logger.log('Lean installation is complete.');
        // make sure test is always run in predictable state, which is no file or folder open
        await (0, helpers_1.closeAllEditors)();
    }).timeout(600000); // give it 5 minutes to install lean in case test machine is really slow.
}).timeout(60000);
//# sourceMappingURL=bootstrap.test.js.map