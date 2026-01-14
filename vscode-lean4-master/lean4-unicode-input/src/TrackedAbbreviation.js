"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackedAbbreviation = void 0;
/**
 * Represents an abbreviation that is tracked and currently typed by the user.
 * When the multi-cursor feature is used, multiple abbreviations can be tracked at once.
 */
class TrackedAbbreviation {
    get abbreviationRange() {
        return this._abbreviationRange;
    }
    get range() {
        return this.abbreviationRange.moveKeepEnd(-1);
    }
    get abbreviation() {
        return this._text;
    }
    get matchingSymbol() {
        return this.abbreviationProvider.getReplacementText(this.abbreviation);
    }
    /**
     * Does this abbreviation uniquely identify a symbol and is it complete?
     */
    get isAbbreviationUniqueAndComplete() {
        return (this.abbreviationProvider.findSymbolsByAbbreviationPrefix(this.abbreviation).length === 1 &&
            !!this.abbreviationProvider.getSymbolForAbbreviation(this.abbreviation));
    }
    /**
     * Indicates whether this abbreviation has been continued with non-abbreviation characters.
     * Such abbreviations should be replaced immediately.
     */
    get finished() {
        return this._finished;
    }
    constructor(abbreviationRange, _text, abbreviationProvider) {
        this._text = _text;
        this.abbreviationProvider = abbreviationProvider;
        this._finished = false;
        this._abbreviationRange = abbreviationRange;
    }
    processChange(range, newText) {
        if (this.abbreviationRange.containsRange(range)) {
            this._finished = false;
            if (this.abbreviationRange.isBefore(range)) {
                // `newText` is appended to `this.abbreviation`
                if (this.abbreviationProvider.findSymbolsByAbbreviationPrefix(this.abbreviation + newText).length === 0) {
                    // newText is not helpful anymore. Finish this and don't accept the change.
                    this._finished = true;
                    return {
                        shouldStopTracking: false,
                        isAffected: false,
                    };
                }
            }
            this._abbreviationRange = this.abbreviationRange.moveEnd(newText.length - range.length);
            const startStr = this.abbreviation.substr(0, range.offset - this.abbreviationRange.offset);
            const endStr = this.abbreviation.substr(range.offsetEnd + 1 - this.abbreviationRange.offset);
            this._text = startStr + newText + endStr;
            return { shouldStopTracking: false, isAffected: true };
        }
        else if (range.isBefore(this.range)) {
            // The changed happened before us. We need to move.
            this._abbreviationRange = this._abbreviationRange.move(newText.length - range.length);
            return { shouldStopTracking: false, isAffected: false };
        }
        else if (range.isAfter(this.range)) {
            // The change does not affect us.
            return { shouldStopTracking: false, isAffected: false };
        }
        else {
            // We cannot process the change. Abort tracking.
            return { shouldStopTracking: true, isAffected: false };
        }
    }
}
exports.TrackedAbbreviation = TrackedAbbreviation;
//# sourceMappingURL=TrackedAbbreviation.js.map