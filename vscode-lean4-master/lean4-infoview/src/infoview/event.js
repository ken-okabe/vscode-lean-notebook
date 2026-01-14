"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
class EventEmitter {
    constructor() {
        this.freshId = 0;
        this.handlers = new Map();
        this.handlersWithKey = new Map();
    }
    /**
     * Register a handler that will receive events from this emitter
     * and return a closure that removes the handler registration.
     *
     * If `key` is specified, only events fired with that key
     * will be propagated to this handler.
     */
    on(handler, key) {
        const id = this.freshId;
        this.freshId += 1;
        if (key) {
            const handlersForKey = this.handlersWithKey.get(key) ?? [];
            handlersForKey.push(handler);
            this.handlersWithKey.set(key, handlersForKey);
        }
        else {
            this.handlers.set(id, handler);
        }
        return {
            dispose: () => {
                if (key) {
                    const handlersForKey = this.handlersWithKey.get(key) ?? [];
                    // We assume that no key has so many handlers registered
                    // that the linear `filter` operation becomes a perf issue.
                    this.handlersWithKey.set(key, handlersForKey.filter(h => h !== handler));
                }
                else {
                    this.handlers.delete(id);
                }
            },
        };
    }
    /**
     * Propagate the event to registered handlers.
     *
     * The event is propagated to all keyless handlers.
     * Furthermore if `key` is provided,
     * the event is also propagated to handlers registered with that key.
     */
    fire(event, key) {
        this.current = event;
        for (const h of this.handlers.values()) {
            h(event);
        }
        if (key) {
            const handlersForKey = this.handlersWithKey.get(key) ?? [];
            for (const h of handlersForKey) {
                h(event);
            }
        }
    }
}
exports.EventEmitter = EventEmitter;
//# sourceMappingURL=event.js.map