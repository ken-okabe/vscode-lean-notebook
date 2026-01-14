"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbbreviationProvider = void 0;
const abbreviations_json_1 = require("./abbreviations.json");
/**
 * Answers queries to a database of abbreviations.
 */
class AbbreviationProvider {
    constructor(config) {
        this.config = config;
        this.replacementTextCache = {};
        this.symbolsByAbbreviation = {};
        this.symbolsByAbbreviation = {
            ...abbreviations_json_1.default,
            ...this.config.customTranslations,
        };
    }
    getSymbolsByAbbreviation() {
        return this.symbolsByAbbreviation;
    }
    collectAllAbbreviations(symbol) {
        return Object.entries(this.symbolsByAbbreviation)
            .filter(([abbr, sym]) => sym === symbol)
            .map(([abbr]) => abbr);
    }
    findAutoClosingAbbreviations(openingSymbol) {
        return Object.entries(this.symbolsByAbbreviation)
            .filter(([_, sym]) => sym.startsWith(`${openingSymbol}$CURSOR`))
            .map(([abbr, sym]) => [abbr, sym.replace(`${openingSymbol}$CURSOR`, '')]);
    }
    findSymbolsIn(symbolPlusUnknown) {
        const result = new Set();
        for (const [abbr, sym] of Object.entries(this.symbolsByAbbreviation)) {
            if (symbolPlusUnknown.startsWith(sym)) {
                result.add(sym);
            }
        }
        return [...result.values()];
    }
    /**
     * Computes the replacement text for a typed abbreviation (excl. leader).
     * This converts the longest non-empty prefix with the best-matching abbreviation.
     *
     * For example:
     *   getReplacementText("alp") returns "α"
     *   getReplacementText("alp7") returns "α7"
     *   getReplacementText("") returns undefined
     */
    getReplacementText(abbrev) {
        if (abbrev in this.replacementTextCache) {
            return this.replacementTextCache[abbrev];
        }
        const result = this.findReplacementText(abbrev);
        this.replacementTextCache[abbrev] = result;
        return result;
    }
    findReplacementText(abbrev) {
        if (abbrev.length === 0) {
            return undefined;
        }
        const matchingSymbol = this.findSymbolsByAbbreviationPrefix(abbrev)[0];
        if (matchingSymbol) {
            return matchingSymbol;
        }
        // Convert the `alp` in `\alp7`
        const prefixReplacement = this.getReplacementText(abbrev.slice(0, abbrev.length - 1));
        if (prefixReplacement) {
            return prefixReplacement + abbrev.slice(abbrev.length - 1);
        }
        return undefined;
    }
    getSymbolForAbbreviation(abbrev) {
        return this.symbolsByAbbreviation[abbrev];
    }
    findSymbolsByAbbreviationPrefix(abbrevPrefix) {
        const matchingAbbreviations = Object.keys(this.symbolsByAbbreviation).filter(abbrev => abbrev.startsWith(abbrevPrefix));
        matchingAbbreviations.sort((a, b) => a.length - b.length);
        return matchingAbbreviations.map(abbr => this.symbolsByAbbreviation[abbr]);
    }
}
exports.AbbreviationProvider = AbbreviationProvider;
//# sourceMappingURL=AbbreviationProvider.js.map