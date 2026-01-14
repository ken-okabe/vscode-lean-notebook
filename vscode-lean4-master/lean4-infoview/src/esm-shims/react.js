"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.version = exports.useTransition = exports.useSyncExternalStore = exports.useState = exports.useRef = exports.useReducer = exports.useMemo = exports.useLayoutEffect = exports.useInsertionEffect = exports.useImperativeHandle = exports.useId = exports.useEffect = exports.useDeferredValue = exports.useDebugValue = exports.useContext = exports.useCallback = exports.unstable_act = exports.startTransition = exports.memo = exports.lazy = exports.isValidElement = exports.forwardRef = exports.createRef = exports.createFactory = exports.createElement = exports.createContext = exports.cloneElement = exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = exports.Suspense = exports.StrictMode = exports.PureComponent = exports.Profiler = exports.Fragment = exports.Component = exports.Children = void 0;
/** @module See `rollup.config.js` for what this file does. */
const React = require("react");
exports.default = React;
// We need to explicitly list all the names because 'react' is a CommonJS module for which
// `export * from` does not work.
const react_1 = require("react");
Object.defineProperty(exports, "Children", { enumerable: true, get: function () { return react_1.Children; } });
Object.defineProperty(exports, "cloneElement", { enumerable: true, get: function () { return react_1.cloneElement; } });
Object.defineProperty(exports, "Component", { enumerable: true, get: function () { return react_1.Component; } });
Object.defineProperty(exports, "createContext", { enumerable: true, get: function () { return react_1.createContext; } });
Object.defineProperty(exports, "createElement", { enumerable: true, get: function () { return react_1.createElement; } });
Object.defineProperty(exports, "createFactory", { enumerable: true, get: function () { return react_1.createFactory; } });
Object.defineProperty(exports, "createRef", { enumerable: true, get: function () { return react_1.createRef; } });
Object.defineProperty(exports, "forwardRef", { enumerable: true, get: function () { return react_1.forwardRef; } });
Object.defineProperty(exports, "Fragment", { enumerable: true, get: function () { return react_1.Fragment; } });
Object.defineProperty(exports, "isValidElement", { enumerable: true, get: function () { return react_1.isValidElement; } });
Object.defineProperty(exports, "lazy", { enumerable: true, get: function () { return react_1.lazy; } });
Object.defineProperty(exports, "memo", { enumerable: true, get: function () { return react_1.memo; } });
Object.defineProperty(exports, "Profiler", { enumerable: true, get: function () { return react_1.Profiler; } });
Object.defineProperty(exports, "PureComponent", { enumerable: true, get: function () { return react_1.PureComponent; } });
Object.defineProperty(exports, "startTransition", { enumerable: true, get: function () { return react_1.startTransition; } });
Object.defineProperty(exports, "StrictMode", { enumerable: true, get: function () { return react_1.StrictMode; } });
Object.defineProperty(exports, "Suspense", { enumerable: true, get: function () { return react_1.Suspense; } });
Object.defineProperty(exports, "unstable_act", { enumerable: true, get: function () { return 
    // @ts-ignore
    react_1.unstable_act; } });
Object.defineProperty(exports, "useCallback", { enumerable: true, get: function () { return react_1.useCallback; } });
Object.defineProperty(exports, "useContext", { enumerable: true, get: function () { return react_1.useContext; } });
Object.defineProperty(exports, "useDebugValue", { enumerable: true, get: function () { return react_1.useDebugValue; } });
Object.defineProperty(exports, "useDeferredValue", { enumerable: true, get: function () { return react_1.useDeferredValue; } });
Object.defineProperty(exports, "useEffect", { enumerable: true, get: function () { return react_1.useEffect; } });
Object.defineProperty(exports, "useId", { enumerable: true, get: function () { return react_1.useId; } });
Object.defineProperty(exports, "useImperativeHandle", { enumerable: true, get: function () { return react_1.useImperativeHandle; } });
Object.defineProperty(exports, "useInsertionEffect", { enumerable: true, get: function () { return react_1.useInsertionEffect; } });
Object.defineProperty(exports, "useLayoutEffect", { enumerable: true, get: function () { return react_1.useLayoutEffect; } });
Object.defineProperty(exports, "useMemo", { enumerable: true, get: function () { return react_1.useMemo; } });
Object.defineProperty(exports, "useReducer", { enumerable: true, get: function () { return react_1.useReducer; } });
Object.defineProperty(exports, "useRef", { enumerable: true, get: function () { return react_1.useRef; } });
Object.defineProperty(exports, "useState", { enumerable: true, get: function () { return react_1.useState; } });
Object.defineProperty(exports, "useSyncExternalStore", { enumerable: true, get: function () { return react_1.useSyncExternalStore; } });
Object.defineProperty(exports, "useTransition", { enumerable: true, get: function () { return react_1.useTransition; } });
Object.defineProperty(exports, "version", { enumerable: true, get: function () { return react_1.version; } });
Object.defineProperty(exports, "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED", { enumerable: true, get: function () { return 
    // @ts-ignore
    react_1.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED; } });
//# sourceMappingURL=react.js.map