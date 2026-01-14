"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLeanReleases = queryLeanReleases;
const vscode_1 = require("vscode");
const zod_1 = require("zod");
async function fetchJson(context) {
    const titlePrefix = context ? `[${context}] ` : '';
    const progressOptions = {
        location: vscode_1.ProgressLocation.Notification,
        title: titlePrefix + 'Querying Lean release information',
        cancellable: true,
    };
    let r;
    try {
        r = await vscode_1.window.withProgress(progressOptions, async (_, tk) => {
            const controller = new AbortController();
            const signal = controller.signal;
            tk.onCancellationRequested(() => controller.abort());
            return await fetch('https://release.lean-lang.org/', {
                signal,
            });
        });
    }
    catch (e) {
        if (e instanceof Error) {
            return { kind: 'CannotFetch', error: e.message };
        }
        return { kind: 'CannotFetch', error: 'Unknown error' };
    }
    let j;
    try {
        j = await r.json();
    }
    catch (e) {
        return { kind: 'CannotParse' };
    }
    return { kind: 'Success', result: j };
}
function zodReleaseChannel() {
    return zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        created_at: zod_1.z.string().datetime(),
    }));
}
function convertLeanReleaseChannel(zodReleaseChannel) {
    return zodReleaseChannel.map(release => ({
        name: release.name,
        creationDate: new Date(release.created_at),
    }));
}
function parseLeanReleases(json) {
    const leanReleasesSchema = zod_1.z.object({
        version: zod_1.z.string(),
        stable: zodReleaseChannel(),
        beta: zodReleaseChannel(),
        nightly: zodReleaseChannel(),
    });
    const r = leanReleasesSchema.safeParse(json);
    if (!r.success) {
        return undefined;
    }
    return {
        version: r.data.version,
        stable: convertLeanReleaseChannel(r.data.stable),
        beta: convertLeanReleaseChannel(r.data.beta),
        nightly: convertLeanReleaseChannel(r.data.nightly),
    };
}
async function queryLeanReleases(context) {
    const fetchJsonResult = await fetchJson(context);
    if (fetchJsonResult.kind !== 'Success') {
        return fetchJsonResult;
    }
    const json = fetchJsonResult.result;
    const releases = parseLeanReleases(json);
    if (releases === undefined) {
        return { kind: 'CannotParse' };
    }
    return { kind: 'Success', releases };
}
//# sourceMappingURL=releaseQuery.js.map