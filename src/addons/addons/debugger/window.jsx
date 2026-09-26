/* eslint-disable react/no-multi-comp, react/jsx-no-bind */
import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

const tabMessageIds = ['addons.debugger.tab-logs', 'addons.debugger.tab-threads', 'addons.debugger.tab-performance'];

// DOM views retain log buffers and chart history independently of window lifetime.
const DomSlot = ({elements, className}) => {
    const ref = React.useRef(null);
    React.useLayoutEffect(() => {
        const container = ref.current;
        elements.forEach(element => container.appendChild(element));
        return () => elements.forEach(element => {
            if (element.parentNode === container) container.removeChild(element);
        });
    }, [elements]);
    return (<div
        className={className}
        ref={ref}
    />);
};
DomSlot.propTypes = {elements: PropTypes.array.isRequired, className: PropTypes.string};

const createDebuggerWindow = ({addon, vm, tabs, unpauseButton}) => {
    const DebuggerWindow = ({visible, locale, direction}) => {
        const [selected, setSelected] = React.useState(0);
        const [compilerEnabled, setCompilerEnabled] = React.useState(vm.runtime.compilerOptions.enabled);
        const active = tabs[selected];
        const content = React.useMemo(() => [active.content], [active]);
        const buttons = React.useMemo(() => [unpauseButton.element, ...active.buttons.map(button => button.element)],
            [active]);
        React.useEffect(() => {
            const refresh = () => setCompilerEnabled(vm.runtime.compilerOptions.enabled);
            vm.on('COMPILER_OPTIONS_CHANGED', refresh);
            refresh();
            return () => vm.removeListener('COMPILER_OPTIONS_CHANGED', refresh);
        }, []);
        React.useLayoutEffect(() => {
            if (!visible) return;
            active.show();
            return () => active.hide();
        }, [active, visible]);
        return (
            <div
                className="sa-debugger-managed-content"
                lang={locale}
                dir={direction}
            >
                <div className={addon.tab.scratchClass('card_header-buttons')}>
                    <ul
                        className="sa-debugger-tabs"
                        role="tablist"
                    >
                        {tabs.map((tab, index) => (
                            <li
                                key={index}
                                id={`sa-debugger-tab-${index}`}
                                role="tab"
                                aria-selected={selected === index}
                                aria-controls="sa-debugger-panel"
                                tabIndex={selected === index ? 0 : -1}
                                className={selected === index ? 'sa-debugger-tab-selected' : ''}
                                onClick={() => setSelected(index)}
                                onKeyDown={event => {
                                    let next = index;
                                    if (event.key === 'ArrowRight') next += direction === 'rtl' ? -1 : 1;
                                    else if (event.key === 'ArrowLeft') next += direction === 'rtl' ? 1 : -1;
                                    else if (event.key === 'Home') next = 0;
                                    else if (event.key === 'End') next = tabs.length - 1;
                                    else if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    next = (next + tabs.length) % tabs.length;
                                    setSelected(next);
                                    event.currentTarget.parentNode.children[next].focus();
                                }}
                            >
                                <span
                                    className="sa-debugger-action-icon"
                                    aria-hidden="true"
                                    style={{'--debugger-icon': `url("${tab.tab.icon}")`}}
                                />
                                <FormattedMessage id={tabMessageIds[index]} />
                            </li>
                        ))}
                    </ul>
                    <DomSlot
                        className={addon.tab.scratchClass('card_header-buttons-right',
                            {others: 'sa-debugger-header-buttons'})}
                        elements={buttons}
                    />
                </div>
                {compilerEnabled ? <button
                    type="button"
                    className="sa-debugger-log sa-debugger-compiler-warning"
                    onClick={() => addon.tab.redux.dispatch({
                        type: 'scratch-gui/modals/OPEN_MODAL', modal: 'settingsModal'
                    })}
                >
                    <FormattedMessage
                        id="addons.debugger.compiler-warning"
                    />
                </button> : null}
                <div
                    id="sa-debugger-panel"
                    role="tabpanel"
                    aria-labelledby={`sa-debugger-tab-${selected}`}
                    className="sa-debugger-tab-content"
                >
                    <DomSlot
                        className="sa-debugger-tab-content"
                        elements={content}
                    />
                </div>
            </div>
        );
    };
    DebuggerWindow.propTypes = {visible: PropTypes.bool, locale: PropTypes.string, direction: PropTypes.string};
    return DebuggerWindow;
};

export default createDebuggerWindow;
