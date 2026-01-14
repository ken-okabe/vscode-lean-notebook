"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rpc = void 0;
class Rpc {
    constructor(sendMessage) {
        this.sendMessage = sendMessage;
        this.seqNum = 0;
        this.methods = {};
        this.pending = {};
        this.initialized = false;
        this.resolveInit = () => { }; // pacify the typechecker; the real initializer is below
        this.initPromise = new Promise(resolve => {
            this.resolveInit = resolve;
        });
    }
    /** Register procedures that the other side of the channel can invoke. Must be called exactly once. */
    register(methods) {
        if (this.initialized)
            throw new Error('RPC methods already registered');
        this.methods = { ...methods };
        const interval = setInterval(() => {
            this.sendMessage({ kind: 'initialize' });
        }, 50);
        const prevResolveInit = this.resolveInit;
        this.resolveInit = () => {
            clearInterval(interval);
            prevResolveInit();
        };
        this.initialized = true;
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    messageReceived(msg) {
        if (msg.kind) {
            if (msg.kind === 'initialize') {
                this.sendMessage({ kind: 'initialized' });
            }
            else if (msg.kind === 'initialized' && this.initialized) {
                this.resolveInit();
            }
            return;
        }
        const { seqNum, name, args, result, exception } = msg;
        if (seqNum === undefined)
            return;
        if (name !== undefined) {
            // It's important that we wait on `initPromise` here. Otherwise we may try to invoke
            // a method before `register` is called.
            return void this.initPromise.then(async () => {
                try {
                    const fn = this.methods[name];
                    if (fn === undefined)
                        throw new Error(`unknown RPC method ${name}`);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    this.sendMessage({ seqNum, result: await fn(...args) });
                }
                catch (ex) {
                    this.sendMessage({ seqNum, exception: prepareExceptionForSerialization(ex) });
                }
            });
        }
        if (exception !== undefined) {
            this.pending[seqNum].reject(exception);
        }
        else {
            this.pending[seqNum].resolve(result);
        }
        delete this.pending[seqNum];
    }
    async invoke(name, args) {
        await this.initPromise;
        this.seqNum += 1;
        const seqNum = this.seqNum;
        return new Promise((resolve, reject) => {
            this.pending[seqNum] = { resolve, reject };
            this.sendMessage({ seqNum, name, args });
        });
    }
    getApi() {
        return new Proxy({}, {
            get: (_, prop) => (...args) => this.invoke(prop, args),
        });
    }
}
exports.Rpc = Rpc;
function prepareExceptionForSerialization(ex) {
    if (ex === undefined) {
        return 'error';
    }
    else if (typeof ex === 'object' && !(ex instanceof Array)) {
        /* Certain properties (such as `ex.message`) are not /enumerable/ per ECMAScript
         * and disappear along the way through `Webview.postMessage`; we create a new object
         * so that they make it through. */
        const exOut = {};
        for (const p of Object.getOwnPropertyNames(ex)) {
            exOut[p] = ex[p];
        }
        return exOut;
    }
    else {
        return ex;
    }
}
//# sourceMappingURL=rpc.js.map