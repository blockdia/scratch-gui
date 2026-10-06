// Adapt upstream messages during bundling, keeping the source translations intact.
module.exports = source => {
    const messages = JSON.parse(source);
    const cloneLimit = 'debugger/log-msg-clone-cap';
    const template = messages[cloneLimit];
    if (typeof template === 'string' && !template.includes('{limit}')) {
        if ((template.match(/300/g) || []).length !== 1) {
            throw new Error(`${cloneLimit}: expected exactly one "300" or an existing "{limit}" placeholder`);
        }
        messages[cloneLimit] = template.replace('300', '{limit}');
    }
    return JSON.stringify(messages);
};
