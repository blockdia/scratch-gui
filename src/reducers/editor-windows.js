const CHANGE = 'scratch-gui/editor-windows/CHANGE';
const initialState = {windows: {}, order: [], active: null};
const reducer = (state = initialState, action) => {
    if (action.type !== CHANGE) return state;
    return action.state;
};
const changeWindows = state => ({type: CHANGE, state});
export {initialState as editorWindowsInitialState, changeWindows};
export default reducer;
