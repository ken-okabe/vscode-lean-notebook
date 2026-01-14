"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvPosContext = exports.ProgressContext = exports.LspDiagnosticsContext = exports.ConfigContext = exports.VersionContext = exports.CapabilityContext = exports.EditorContext = void 0;
const React = require("react");
const infoview_api_1 = require("@leanprover/infoview-api");
// Type-unsafe initializers for contexts which we immediately set up at the top-level.
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
exports.EditorContext = React.createContext(null);
exports.CapabilityContext = React.createContext(undefined);
exports.VersionContext = React.createContext(undefined);
exports.ConfigContext = React.createContext(infoview_api_1.defaultInfoviewConfig);
exports.LspDiagnosticsContext = React.createContext(new Map());
exports.ProgressContext = React.createContext(new Map());
/**
 * Certain infoview components and widget instances
 * utilize data that has been introduced above a specific position
 * in a Lean source file.
 *
 * For instance, if we declare a global constant with `def foo` on line 10,
 * we can immediately display it in a widget on line 11.
 * To achieve this, the widget code needs to have access
 * to the environment on line 11 as that environment contains `foo`.
 *
 * {@link EnvPosContext} stores the position in the file
 * from which an appropriate environment can be retrieved.
 * This is used to look up global constants,
 * in particular RPC methods (`@[server_rpc_method]`)
 * and widget modules (`@[widget_module]`).
 *
 * Note that {@link EnvPosContext} may, but need not,
 * be equal to any of the positions which the infoview keeps track of
 * (such as the editor cursor position).
 *
 * #### Infoview implementation details
 *
 * In the infoview, {@link EnvPosContext} is set as follows:
 * - in an `<InfoDisplay>`,
 *   it is the position at which the info block is being displayed:
 *   either a recent editor cursor position
 *   (when shown in the at-cursor `<InfoDisplay>`,
 *   this will lag behind the current editor cursor position
 *   while the `<InfoDisplay>` is in the process of updating),
 *   or a pinned position.
 * - in an `<InteractiveMessage>` that comes from a diagnostic
 *   emitted with a syntactic range,
 *   it is the start of the diagnostic's `fullRange`.
 */
exports.EnvPosContext = React.createContext(undefined);
//# sourceMappingURL=contexts.js.map