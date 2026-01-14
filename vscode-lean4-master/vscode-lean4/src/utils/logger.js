"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
class Logger {
    static now() {
        const now = new Date();
        return (String(now.getUTCHours()).padStart(2, '0') +
            ':' +
            String(now.getMinutes()).padStart(2, '0') +
            ':' +
            String(now.getUTCSeconds()).padStart(2, '0') +
            '.' +
            String(now.getMilliseconds()).padStart(3, '0'));
    }
    log(msg) {
        console.log(Logger.now(), '-', msg);
    }
    error(msg) {
        console.error(Logger.now(), '-', msg);
    }
}
const logger = new Logger();
exports.logger = logger;
//# sourceMappingURL=logger.js.map