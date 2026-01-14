"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorConnection = void 0;
const util_1 = require("./util");
/** Provides higher-level wrappers around functionality provided by the editor,
 * e.g. to insert a comment. See also {@link EditorApi}. */
class EditorConnection {
    constructor(api, events) {
        this.api = api;
        this.events = events;
    }
    /** Highlights the given range in a document in the editor. */
    async revealLocation(loc) {
        const show = {
            uri: loc.uri,
            selection: loc.range,
        };
        await this.api.showDocument(show);
    }
    async revealPosition(pos) {
        const loc = {
            uri: pos.uri,
            range: {
                start: pos,
                end: pos,
            },
        };
        await this.revealLocation(loc);
    }
    /** Copies the text to a comment at the cursor position. */
    async copyToComment(text) {
        await this.api.insertText(`/-\n${text}\n-/`, 'above');
    }
    requestPlainGoal(pos) {
        const params = util_1.DocumentPosition.toTdpp(pos);
        return this.api.sendClientRequest(pos.uri, '$/lean/plainGoal', params);
    }
    requestPlainTermGoal(pos) {
        const params = util_1.DocumentPosition.toTdpp(pos);
        return this.api.sendClientRequest(pos.uri, '$/lean/plainTermGoal', params);
    }
}
exports.EditorConnection = EditorConnection;
//# sourceMappingURL=editorConnection.js.map