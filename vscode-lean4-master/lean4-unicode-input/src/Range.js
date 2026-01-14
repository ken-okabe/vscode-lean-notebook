"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Range = void 0;
/**
 * A general purpose range implementation.
 * Is offset/length based in contrast to `vscode.Range` which is line/column based.
 */
class Range {
    constructor(offset, length) {
        this.offset = offset;
        this.length = length;
        if (length < 0) {
            throw new Error();
        }
    }
    contains(offset) {
        return this.offset <= offset && offset <= this.offsetEnd;
    }
    get offsetEnd() {
        return this.offset + this.length - 1;
    }
    get isEmpty() {
        return this.length === 0;
    }
    toString() {
        return `[${this.offset}, +${this.length})`;
    }
    move(delta) {
        return new Range(this.offset + delta, this.length);
    }
    moveKeepEnd(delta) {
        if (delta > this.length) {
            throw new Error();
        }
        const result = new Range(this.offset + delta, this.length - delta);
        return result;
    }
    moveEnd(delta) {
        return new Range(this.offset, this.length + delta);
    }
    withLength(newLength) {
        return new Range(this.offset, newLength);
    }
    containsRange(other) {
        /*
         *     0  1  2  3  4  5
         *       |#  #  #       this            { offset: 1, end: 3, len: 3 }
         *    |              |  other: false    { offset: 0, end: -1, len: 0 }
         *       |  |  |  |     other: true     { offset: i, end: i - 1, len: 0 }
         *       |# |# |#       other: true
         *    |#  #    |#  #    other: false
         *       |#  #  #       other: true
         */
        // If other is non-empty, this must contain all its points.
        return this.offset <= other.offset && other.offsetEnd <= this.offsetEnd;
    }
    /**
     * Check whether this range if after `range`.
     */
    isAfter(range) {
        /*
         *     0  1  2  3  4  5
         *       |#  #  #       this
         *    |  |              other: true
         *    |#                other: true
         *       |#             other: false
         *    |#  #             other: false
         */
        return range.offsetEnd < this.offset;
    }
    /**
     * Check whether this range if before `range`.
     */
    isBefore(range) {
        /*
         *     0  1  2  3  4  5
         *       |#  #  #       this
         *                |  |  other: true
         *                |#    other: true
         *             |#       other: false
         *             |        other: false
         *             |#  #    other: false
         */
        return range.offset > this.offsetEnd;
    }
    equals(other) {
        return this.offset === other.offset && this.length === other.length;
    }
}
exports.Range = Range;
//# sourceMappingURL=Range.js.map