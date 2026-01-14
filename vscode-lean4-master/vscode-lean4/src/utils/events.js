"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNextEvent = onNextEvent;
exports.onEventWhile = onEventWhile;
exports.withoutReentrancy = withoutReentrancy;
exports.actionWithoutReentrancy = actionWithoutReentrancy;
exports.combine = combine;
const vscode_1 = require("vscode");
function onNextEvent(ev, listener) {
    const d = ev(e => {
        d.dispose();
        listener(e);
    });
    return d;
}
function onEventWhile(ev, listener) {
    const d = ev(async (e) => {
        const r = await listener(e);
        if (r === 'Stop') {
            d.dispose();
        }
    });
    return d;
}
function withoutReentrancy(onReentrancy, f) {
    let isRunning = false;
    return async (v) => {
        if (isRunning) {
            return onReentrancy;
        }
        isRunning = true;
        try {
            return await f(v);
        }
        finally {
            isRunning = false;
        }
    };
}
function actionWithoutReentrancy(f) {
    let isRunning = false;
    return async (v) => {
        if (isRunning) {
            return;
        }
        isRunning = true;
        try {
            await f(v);
        }
        finally {
            isRunning = false;
        }
    };
}
function combine(ev1, filter1, ev2, filter2) {
    const emitter = new vscode_1.EventEmitter();
    const d1 = ev1(e1 => {
        if (filter1(e1)) {
            emitter.fire(e1);
        }
    });
    const d2 = ev2(e2 => {
        if (filter2(e2)) {
            emitter.fire(e2);
        }
    });
    return {
        disposable: vscode_1.Disposable.from(d1, d2),
        event: emitter.event,
    };
}
//# sourceMappingURL=events.js.map