"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const unicode_input_component_1 = require("@leanprover/unicode-input-component");
const vscodeApi = acquireVsCodeApi();
class LoogleQueryHistory {
    constructor() {
        this.history = [];
        this.historyIdx = 0;
    }
    isDuplicate(query) {
        return this.history.length > 0 && this.history[this.history.length - 1] === query;
    }
    add(query) {
        if (this.isDuplicate(query) || !query) {
            return;
        }
        this.history.push(query);
        this.historyIdx = this.history.length;
    }
    previousQuery(currentQuery) {
        if (this.historyIdx === this.history.length && currentQuery) {
            if (this.isDuplicate(currentQuery)) {
                this.historyIdx--;
            }
            else {
                this.history.push(currentQuery);
            }
        }
        if (this.historyIdx === -1) {
            return '';
        }
        if (this.historyIdx === 0) {
            this.historyIdx--;
            return '';
        }
        this.historyIdx--;
        return this.history[this.historyIdx];
    }
    nextQuery(currentQuery) {
        if (this.historyIdx === this.history.length) {
            this.add(currentQuery);
            return '';
        }
        this.historyIdx++;
        if (this.historyIdx === this.history.length) {
            return '';
        }
        return this.history[this.historyIdx];
    }
}
function getScriptArg(name) {
    return document.querySelector('script[data-id="loogleview-script"]').getAttribute(name);
}
class LoogleView {
    constructor() {
        this.queryInput = document.getElementById('query-text-field');
        this.findButton = document.getElementById('find-button');
        this.previousQueryButton = document.getElementById('previous-query-button');
        this.nextQueryButton = document.getElementById('next-query-button');
        this.closeTabTrigger = document.getElementById('close-tab');
        this.header = document.getElementById('header');
        this.error = document.getElementById('error');
        this.resultHeader = document.getElementById('result-header');
        this.results = document.getElementById('results');
        this.suggestionHeader = document.getElementById('suggestion-header');
        this.suggestions = document.getElementById('suggestions');
        this.spinner = document.getElementById('spinner');
        this.initialQuery = getScriptArg('initial-query');
        this.staticSuggestions = Array.from(document.getElementsByClassName('query-suggestion'));
        this.history = new LoogleQueryHistory();
        this.abbreviationConfig = JSON.parse(getScriptArg('abbreviation-config'));
        this.vscodeVersion = getScriptArg('vscode-version');
        this.extensionVersion = getScriptArg('extension-version');
        this.rewriter = new unicode_input_component_1.InputAbbreviationRewriter(this.abbreviationConfig, this.queryInput);
    }
    static initialize() {
        const view = new LoogleView();
        view.findButton.addEventListener('click', async () => {
            await view.runLoogleQuery(view.queryInput.innerText);
        });
        view.previousQueryButton.addEventListener('click', async () => {
            const previousQuery = view.history.previousQuery(view.queryInput.innerText);
            view.setQuery(previousQuery);
        });
        view.nextQueryButton.addEventListener('click', async () => {
            const nextQuery = view.history.nextQuery(view.queryInput.innerText);
            view.setQuery(nextQuery);
        });
        view.queryInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                view.findButton.click();
                event.preventDefault();
            }
            if (event.key === 'ArrowDown') {
                view.previousQueryButton.click();
                event.preventDefault();
            }
            if (event.key === 'ArrowUp') {
                view.nextQueryButton.click();
                event.preventDefault();
            }
        });
        for (const querySuggestionElement of view.staticSuggestions) {
            if (!(querySuggestionElement instanceof HTMLElement) || querySuggestionElement.tagName !== 'A') {
                continue;
            }
            const querySuggestion = querySuggestionElement.innerText;
            querySuggestionElement.addEventListener('click', () => view.runSuggestion(querySuggestion));
        }
        if (view.initialQuery) {
            view.runSuggestion(view.initialQuery);
        }
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                view.closeTabTrigger.click();
                event.preventDefault();
            }
        });
        view.queryInput.focus();
        return view;
    }
    setQuery(query) {
        this.rewriter.resetAbbreviations();
        this.queryInput.innerHTML = query;
    }
    async runLoogleQuery(query) {
        this.history.add(query);
        const response = await this.withSpinner(async () => {
            try {
                const headers = new Headers({
                    'User-Agent': `Code/${this.vscodeVersion} lean4/${this.extensionVersion}`,
                    'X-Loogle-Client': `Code/${this.vscodeVersion} lean4/${this.extensionVersion}`,
                });
                return await (await fetch(`https://loogle.lean-lang.org/json?q=${encodeURIComponent(query)}`, {
                    headers,
                })).json();
            }
            catch (e) {
                this.displayError(`Cannot fetch Loogle data: ${e}`);
                return undefined;
            }
        });
        if (response === undefined) {
            return;
        }
        response.hits = response.hits ?? [];
        response.error = response.error ?? '';
        response.suggestions = response.suggestions ?? [];
        response.header = response.header ?? '';
        this.displayHeader(response.header);
        this.displayError(response.error);
        this.displayResults(response.hits);
        this.displaySuggestions(response.suggestions);
    }
    runSuggestion(querySuggestion) {
        this.setQuery(querySuggestion);
        this.findButton.click();
        window.scrollTo(0, 0);
    }
    createQuerySuggestionNode(querySuggestion) {
        const link = document.createElement('a');
        link.href = 'javascript:void(0)';
        link.innerText = querySuggestion;
        link.addEventListener('click', () => this.runSuggestion(querySuggestion));
        return link;
    }
    createHitNameNode(name, module) {
        // This is not correct (consider e.g. escaped dots in french quotes) but it should be good enough for now.
        const docUrl = `https://leanprover-community.github.io/mathlib4_docs/${encodeURIComponent(module.replace(new RegExp(/\./, 'g'), '/'))}.html#${encodeURIComponent(name)}`;
        const link = document.createElement('a');
        link.innerText = name;
        link.setAttribute('href', `command:simpleBrowser.show?${encodeURIComponent(JSON.stringify([docUrl]))}`);
        return link;
    }
    displayHeader(headerText) {
        this.header.hidden = headerText.length === 0;
        this.header.innerText = headerText;
    }
    displayError(errorText) {
        this.error.hidden = errorText.length === 0;
        this.error.innerText = errorText;
    }
    displayResults(hits) {
        this.resultHeader.hidden = hits.length === 0;
        const resultNodes = hits.map(hit => {
            const entry = document.createElement('li');
            const paragraph = document.createElement('p');
            paragraph.appendChild(this.createHitNameNode(hit.name, hit.module));
            paragraph.appendChild(document.createTextNode(` @ ${hit.module}`));
            paragraph.appendChild(document.createElement('br'));
            paragraph.appendChild(document.createTextNode(hit.type));
            entry.appendChild(paragraph);
            return entry;
        });
        this.results.replaceChildren(...resultNodes);
    }
    displaySuggestions(suggestions) {
        this.suggestionHeader.hidden = suggestions.length === 0;
        const suggestionNodes = suggestions.map(suggestion => {
            const entry = document.createElement('li');
            entry.appendChild(this.createQuerySuggestionNode(suggestion));
            return entry;
        });
        this.suggestions.replaceChildren(...suggestionNodes);
    }
    async withSpinner(fn) {
        this.spinner.classList.remove('hidden');
        try {
            const r = await fn();
            return r;
        }
        finally {
            this.spinner.classList.add('hidden');
        }
    }
}
if (document.getElementById('query-text-field')) {
    LoogleView.initialize();
}
else {
    const observer = new MutationObserver(_ => {
        if (document.getElementById('query-text-field')) {
            observer.disconnect();
            LoogleView.initialize();
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
//# sourceMappingURL=index.js.map