// UI entry point shared by menus, registered actions and block gestures.
let host = null;
export default {
    attach (next) {
        host = next;
        return () => {
            if (host === next) host = null;
        };
    },
    open (options = {}) {
        return host ? host.open(options) : false;
    },
    close () {
        if (host) host.close();
    }
};
