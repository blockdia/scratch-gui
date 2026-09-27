import actions from '../../../src/lib/editor-actions';
import {StageHeader} from '../../../src/containers/stage-header.jsx';

jest.mock('../../../src/components/stage-header/stage-header.jsx', () => () => null);

const originalDocument = global.document;
beforeEach(() => {
    global.document = {addEventListener: jest.fn(), removeEventListener: jest.fn()};
});
afterEach(() => {
    global.document = originalDocument;
});

const makeHeader = (stageSizeMode = 'full', width = 800) => {
    const props = {
        stageSizeMode,
        customStageSize: {width, height: 600},
        isFullScreen: false,
        isPlayerOnly: false,
        isEmbedded: false,
        onSetStageSmall: jest.fn(),
        onSetStageLarge: jest.fn(),
        onSetStageFull: jest.fn()
    };
    const header = new StageHeader(props);
    header.componentDidMount();
    return {header, props};
};

test('small-stage action restores the previous full or large size', () => {
    const {header, props} = makeHeader();
    try {
        expect(actions.execute('builtin/toggle-small-stage')).toBe(true);
        expect(props.onSetStageSmall).toHaveBeenCalledTimes(1);
        header.props = {...props, stageSizeMode: 'small'};
        header.componentDidUpdate();
        actions.execute('builtin/toggle-small-stage');
        expect(props.onSetStageFull).toHaveBeenCalledTimes(1);

        header.props = {...props, stageSizeMode: 'large'};
        header.componentDidUpdate();
        actions.execute('builtin/toggle-small-stage');
        header.props = {...props, stageSizeMode: 'small'};
        header.componentDidUpdate();
        actions.execute('builtin/toggle-small-stage');
        expect(props.onSetStageLarge).toHaveBeenCalledTimes(1);
    } finally {
        header.componentWillUnmount();
    }
    expect(actions.execute('builtin/toggle-small-stage')).toBe(false);
});

test('small-stage action falls back to full size when large is unavailable', () => {
    const {header, props} = makeHeader('large');
    try {
        header.props = {...props, stageSizeMode: 'small', customStageSize: {width: 480, height: 360}};
        header.componentDidUpdate();
        actions.execute('builtin/toggle-small-stage');
        expect(props.onSetStageFull).toHaveBeenCalledTimes(1);
        expect(props.onSetStageLarge).not.toHaveBeenCalled();
    } finally {
        header.componentWillUnmount();
    }
});
