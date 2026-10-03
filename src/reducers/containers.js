const UPDATE_CONTAINERS = 'scratch-gui/containers/UPDATE_CONTAINERS';
const initialState = {};

const reducer = (state = initialState, action) => {
    if (action.type === UPDATE_CONTAINERS) {
        return Object.fromEntries(action.containers.map(container => [container.path, container]));
    }
    return state;
};

const updateContainers = containers => ({type: UPDATE_CONTAINERS, containers});

export {reducer as default, initialState as containersInitialState, updateContainers};
