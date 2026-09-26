import React from 'react';
import PropTypes from 'prop-types';
import {IntlProvider as ReactIntlProvider, injectIntl} from 'react-intl';
import {englishAddonMessages, loadAddonMessages, namespaceAddonMessages} from './translations';
import log from '../lib/log';

export const AddonIntlProvider = ({locale, messages, children, ...props}) => {
    const [loaded, setLoaded] = React.useState(null);
    React.useEffect(() => {
        let current = true;
        loadAddonMessages(locale).then(translations => {
            if (current) setLoaded({locale, messages: namespaceAddonMessages(translations)});
        })
            .catch(error => log.warn('Could not load addon translations', error));
        return () => {
            current = false;
        };
    }, [locale]);
    const addonMessages = loaded && loaded.locale === locale ? loaded.messages : englishAddonMessages;
    const merged = React.useMemo(() => ({...messages, ...addonMessages}), [messages, addonMessages]);
    return (
        <ReactIntlProvider
            {...props}
            locale={locale}
            messages={merged}
        >
            {children}
        </ReactIntlProvider>
    );
};
AddonIntlProvider.propTypes = {
    locale: PropTypes.string.isRequired,
    messages: PropTypes.object,
    children: PropTypes.node
};

// Place the provider below Redux's pure wrappers: react-intl 2 uses legacy
// context, whose async updates otherwise stop at those wrappers.
const withAddonIntl = Component => {
    const Wrapper = ({intl, ...props}) => (
        <AddonIntlProvider
            locale={intl.locale}
            messages={intl.messages}
        >
            <Component {...props} />
        </AddonIntlProvider>
    );
    Wrapper.propTypes = {intl: PropTypes.object.isRequired};
    return injectIntl(Wrapper);
};
export default withAddonIntl;
