"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const glob_1 = require("glob");
const mocha_1 = require("mocha");
const path = require("path");
const config_1 = require("../../../src/config");
const logger_1 = require("../../../src/utils/logger");
function run(testsRoot, cb) {
    // Create the mocha test
    const mocha = new mocha_1.default({
        ui: 'tdd',
    });
    if (process.platform === 'win32') {
        // workaround for https://github.com/microsoft/vscode-test/issues/134
        testsRoot = testsRoot.toLowerCase();
    }
    const folder = (0, config_1.getTestFolder)();
    if (folder) {
        testsRoot = path.resolve(testsRoot, '..', folder);
    }
    logger_1.logger.log('>>>>>>>>> testsRoot=' + testsRoot);
    try {
        const files = (0, glob_1.globSync)('**/**.test.js', { cwd: testsRoot });
        // Add files to the test suite
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
        // Run the mocha test
        mocha.timeout(60000); // 60 seconds to run
        mocha.run(failures => {
            cb(null, failures);
        });
    }
    catch (err) {
        console.error(err);
        cb(err);
    }
}
//# sourceMappingURL=index.js.map