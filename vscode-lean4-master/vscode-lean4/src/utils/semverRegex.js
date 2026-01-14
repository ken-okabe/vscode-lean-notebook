"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.semVerRegex = void 0;
// Suggested at https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
exports.semVerRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
//# sourceMappingURL=semverRegex.js.map