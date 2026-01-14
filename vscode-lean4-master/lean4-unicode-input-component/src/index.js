"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputAbbreviationRewriter = void 0;
const unicode_input_1 = require("@leanprover/unicode-input");
function computeTextOffsetFromNodeOffset(searchNode, target, offsetInTarget = 0) {
    if (searchNode === target) {
        return offsetInTarget;
    }
    if (!searchNode.contains(target)) {
        return undefined;
    }
    let totalOffset = 0;
    for (const childNode of Array.from(searchNode.childNodes)) {
        const childOffset = computeTextOffsetFromNodeOffset(childNode, target, offsetInTarget);
        if (childOffset !== undefined) {
            totalOffset += childOffset;
            return totalOffset;
        }
        totalOffset += childNode.textContent?.length ?? 0;
    }
    return undefined;
}
function computeTextRangeFromNodeRange(searchNode, rangeStart, rangeEnd) {
    let start;
    let end;
    if (rangeStart) {
        start = computeTextOffsetFromNodeOffset(searchNode, rangeStart.node, rangeStart.offset);
    }
    if (rangeEnd) {
        end = computeTextOffsetFromNodeOffset(searchNode, rangeEnd.node, rangeEnd.offset);
    }
    if (start === undefined) {
        if (end === undefined) {
            return undefined;
        }
        else {
            return new unicode_input_1.Range(end, 0);
        }
    }
    else {
        if (end === undefined) {
            return new unicode_input_1.Range(start, 0);
        }
        else {
            if (end < start) {
                ;
                [start, end] = [end, start];
            }
            return new unicode_input_1.Range(start, end - start);
        }
    }
}
function findTextCursorSelection(searchNode) {
    const sel = window.getSelection();
    if (sel === null) {
        return undefined;
    }
    let rangeStart;
    if (sel.anchorNode) {
        rangeStart = { node: sel.anchorNode, offset: sel.anchorOffset };
    }
    let rangeEnd;
    if (sel.focusNode) {
        rangeStart = { node: sel.focusNode, offset: sel.focusOffset };
    }
    return computeTextRangeFromNodeRange(searchNode, rangeStart, rangeEnd);
}
function computeNodeOffsetFromTextOffset(searchNode, offset) {
    const childNodes = Array.from(searchNode.childNodes);
    if (childNodes.length === 0) {
        const textContentLength = searchNode.textContent?.length ?? 0;
        if (offset > textContentLength) {
            return { found: false, remainingOffset: offset - textContentLength };
        }
        return { found: true, node: searchNode, offset };
    }
    for (const childNode of Array.from(searchNode.childNodes)) {
        const result = computeNodeOffsetFromTextOffset(childNode, offset);
        if (result.found) {
            return result;
        }
        offset = result.remainingOffset;
    }
    return { found: false, remainingOffset: offset };
}
function setTextCursorSelection(searchNode, offset) {
    const result = computeNodeOffsetFromTextOffset(searchNode, offset);
    if (!result.found) {
        return;
    }
    const sel = window.getSelection();
    if (sel === null) {
        return;
    }
    const range = document.createRange();
    range.setStart(result.node, result.offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}
function replaceAt(str, updates) {
    updates.sort((u1, u2) => u1.range.offset - u2.range.offset);
    let newStr = '';
    let lastUntouchedPos = 0;
    for (const u of updates) {
        newStr += str.slice(lastUntouchedPos, u.range.offset);
        newStr += u.update(str.slice(u.range.offset, u.range.offsetEnd + 1));
        lastUntouchedPos = u.range.offset + u.range.length;
    }
    newStr += str.slice(lastUntouchedPos);
    return newStr;
}
class InputAbbreviationRewriter {
    constructor(config, textInput) {
        this.config = config;
        this.textInput = textInput;
        this.isInSelectionChange = false;
        if (!textInput.isContentEditable) {
            throw new Error();
        }
        const provider = new unicode_input_1.AbbreviationProvider(config);
        this.rewriter = new unicode_input_1.AbbreviationRewriter(config, provider, this);
        textInput.addEventListener('beforeinput', async (ev) => {
            const inputEvent = ev;
            const targetRange = inputEvent.getTargetRanges()[0];
            if (targetRange === undefined) {
                return;
            }
            const range = computeTextRangeFromNodeRange(textInput, { node: targetRange.startContainer, offset: targetRange.startOffset }, { node: targetRange.endContainer, offset: targetRange.endOffset });
            if (range === undefined) {
                return;
            }
            const newText = inputEvent.data ?? '';
            const change = { range, newText };
            this.rewriter.changeInput([change]);
        });
        textInput.addEventListener('input', async (_) => {
            await this.rewriter.triggerAbbreviationReplacement();
            await this.updateSelection();
            this.updateState();
        });
        document.addEventListener('selectionchange', async () => {
            // This happens when updating the state itself triggers a selection change.
            if (this.isInSelectionChange) {
                return;
            }
            this.isInSelectionChange = true;
            await this.updateSelection();
            this.updateState();
            this.isInSelectionChange = true;
        });
        textInput.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Tab' && this.rewriter.getTrackedAbbreviations().size > 0) {
                await this.rewriter.replaceAllTrackedAbbreviations();
                this.updateState();
                // Don't send event to any other listeners, it was handled here.
                ev.stopImmediatePropagation();
                // Don't move focus to the next element.
                ev.preventDefault();
            }
        });
    }
    resetAbbreviations() {
        this.rewriter.resetTrackedAbbreviations();
        this.updateState();
    }
    async updateSelection() {
        const selection = this.getSelection();
        if (selection === undefined) {
            return;
        }
        await this.rewriter.changeSelections([selection]);
    }
    getSelection() {
        return findTextCursorSelection(this.textInput);
    }
    updateState() {
        const query = this.getInput();
        const queryHtml = this.textInput.innerHTML;
        const updates = Array.from(this.rewriter.getTrackedAbbreviations()).map(a => ({
            range: a.range,
            update: (old) => `<u>${old}</u>`,
        }));
        const newQueryHtml = replaceAt(query, updates);
        if (queryHtml === newQueryHtml) {
            return;
        }
        const selectionBeforeChange = this.getSelection();
        this.setInputHTML(newQueryHtml);
        if (selectionBeforeChange !== undefined) {
            this.setSelections([selectionBeforeChange]);
        }
    }
    async replaceAbbreviations(changes) {
        const updates = changes.map(c => ({
            range: c.range,
            update: _ => c.newText,
        }));
        this.setInputHTML(replaceAt(this.getInput(), updates));
        return true;
    }
    selectionMoveMode() {
        return { kind: 'MoveAllSelections' };
    }
    collectSelections() {
        const selection = this.getSelection();
        if (selection === undefined) {
            return [];
        }
        return [selection];
    }
    setSelections(selections) {
        const primarySelection = selections[0];
        if (primarySelection === undefined) {
            return;
        }
        setTextCursorSelection(this.textInput, primarySelection.offset);
    }
    setInputHTML(html) {
        this.textInput.innerHTML = html;
    }
    getInput() {
        return this.textInput.innerText;
    }
}
exports.InputAbbreviationRewriter = InputAbbreviationRewriter;
//# sourceMappingURL=index.js.map