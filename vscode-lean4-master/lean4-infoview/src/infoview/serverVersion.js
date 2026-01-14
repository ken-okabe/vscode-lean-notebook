"use strict";
/**
 * Keeps track of the Lean server version and available features.
 * @module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerVersion = void 0;
class ServerVersion {
    constructor(version) {
        const vs = version.split('.');
        if (vs.length === 2) {
            this.major = parseInt(vs[0]);
            this.minor = parseInt(vs[1]);
            this.patch = 0;
        }
        else if (vs.length === 3) {
            this.major = parseInt(vs[0]);
            this.minor = parseInt(vs[1]);
            this.patch = parseInt(vs[2]);
        }
        else {
            throw new Error(`cannot parse Lean server version '${version}'`);
        }
    }
}
exports.ServerVersion = ServerVersion;
//# sourceMappingURL=serverVersion.js.map