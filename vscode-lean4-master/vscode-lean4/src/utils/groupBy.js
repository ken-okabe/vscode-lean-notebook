"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupByKey = groupByKey;
exports.groupByUniqueKey = groupByUniqueKey;
function groupByKey(values, key) {
    const r = new Map();
    for (const v of values) {
        const k = key(v);
        const group = r.get(k) ?? [];
        group.push(v);
        r.set(k, group);
    }
    return r;
}
function groupByUniqueKey(values, key) {
    const r = new Map();
    for (const v of values) {
        r.set(key(v), v);
    }
    return r;
}
//# sourceMappingURL=groupBy.js.map