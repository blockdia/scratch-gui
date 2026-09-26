import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import log from '../lib/log';

class WindowErrorBoundary extends React.Component {
    constructor (props) {
        super(props);
        this.state = {failed: false};
    }
    componentDidCatch (error, info) {
        log.error('Addon window failed', error, info.componentStack);
        this.setState({failed: true});
    }
    render () {
        if (this.state.failed) {
            return (<div
                role="alert"
                style={{padding: 16}}
            >
                <FormattedMessage
                    id="gui.windows.addonError"
                    defaultMessage="This tool could not be displayed. Close and reopen its window to try again."
                />
            </div>);
        }
        return this.props.children;
    }
}
WindowErrorBoundary.propTypes = {children: PropTypes.node};

// Keep addon views in the host React tree, with its existing providers and runtime.
const reactWindow = definition => {
    if (!definition.component) return definition;
    if (definition.content || definition.render) {
        throw new Error('A React addon window cannot also provide content or render');
    }
    const {component: Component, ...options} = definition;
    return {...options,
        render: ({status, ...props}) => (status === 'closed' ? null : (
            <WindowErrorBoundary><Component {...props} /></WindowErrorBoundary>
        ))};
};

export default reactWindow;
