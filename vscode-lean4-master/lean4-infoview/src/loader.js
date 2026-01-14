"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRenderInfoview = loadRenderInfoview;
require("es-module-shims");
/**
 * Dynamically load the infoview module, execute `renderInfoview` with the provided `args`,
 * and pass its return value to `next`. See `README.md` for why this is needed.
 *
 * @param imports is the `imports` section of an [`importmap`](https://github.com/WICG/import-maps).
 * It must contain URLs for `@leanprover/infoview`, `react`, `react/jsx-runtime`, `react-dom`,
 * It may include additional URLs. The listed libraries become `import`able
 * from user widgets. Note that `dist/` already includes these files, so the following works:
 * ```js
 * {
 * '@leanprover/infoview': 'https://unpkg.com/@leanprover/infoview/dist/index.production.min.js',
 * 'react': 'https://unpkg.com/@leanprover/infoview/dist/react.production.min.js',
 * 'react/jsx-runtime': 'https://unpkg.com/@leanprover/infoview/dist/react-jsx-runtime.production.min.js',
 * 'react-dom': 'https://unpkg.com/@leanprover/infoview/dist/react-dom.production.min.js',
 * }
 * ```
 */
function loadRenderInfoview(imports, args, next) {
    importShim.addImportMap({ imports });
    importShim('@leanprover/infoview')
        .then((mod) => next(mod.renderInfoview(...args)))
        .catch(ex => console.error(`Error importing '@leanprover/infoview': ${JSON.stringify(ex)}`));
}
//# sourceMappingURL=loader.js.map