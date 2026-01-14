"use strict";
/**
 * Tests for breaking changes in the local state of the infoview API
 * (meaning anything exported from `src/index.tsx`)
 * relative to the latest published NPM release of `@leanprover/infoview`.
 * It does so by turning both packages into records in the TypeScript type system
 * and checking that one extends the other.
 *
 * If this file fails to typecheck,
 * then either there was a breaking change
 * or it is a false positive.
 * In case of such a failure, the procedure is:
 * 1. Ensure that `CheckSelfCompatible` below does not have errors.
 *    If it does, the test itself is broken and needs to be fixed.
 * 2. Inspect the error on `CheckNoBreakingChanges`
 *    to determine the change that caused it
 *    and decide whether it actually is breaking or not.
 *    If you are not sure, the conservative choice is to assume it's breaking.
 * 3. Bump the major (if breaking) or minor/patch (otherwise) version
 *    of the package in `lean4-infoview/package.json`.
 * 4. After finalizing your changes (e.g. after a round of PR reviews),
 *    publish the new release on NPM.
 * 5. Point the `current-release` dependency at the new NPM release.
 *    Rerun the test to ensure it now typechecks.
 *
 * @module
 */
//# sourceMappingURL=breaking.js.map