"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorBoundary = void 0;
const React = require("react");
const util_1 = require("./util");
/** Error boundary as described in https://reactjs.org/docs/error-boundaries.html */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: undefined };
    }
    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { error: error.toString() };
    }
    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        return;
    }
    render() {
        if (this.state.error) {
            // You can render any custom fallback UI
            return (<div>
                    <h1>Error:</h1>
                    {this.state.error}
                    <br />
                    <br />
                    <a className="link pointer dim " onClick={(0, util_1.withPreventedClickOnTextSelection)(() => this.setState({ error: undefined }))}>
                        Click to reload.
                    </a>
                </div>);
        }
        return this.props.children;
    }
}
exports.ErrorBoundary = ErrorBoundary;
//# sourceMappingURL=errors.js.map