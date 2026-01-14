"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Exports = void 0;
class Exports {
    constructor(alwaysEnabledFeatures, lean4EnabledFeatures) {
        this.alwaysEnabledFeatures = alwaysEnabledFeatures;
        this.lean4EnabledFeatures = lean4EnabledFeatures;
    }
    async allFeatures() {
        const lean4EnabledFeatures = await this.lean4EnabledFeatures;
        return { ...this.alwaysEnabledFeatures, ...lean4EnabledFeatures };
    }
}
exports.Exports = Exports;
//# sourceMappingURL=exports.js.map