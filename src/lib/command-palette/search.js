const symbolFilters = {
    v: 'variable',
    l: 'list',
    c: 'procedure',
    e: 'event',
    b: 'broadcast'
};

export const parseQuery = value => {
    const prefix = value.charAt(0);
    const filter = prefix === '@' && /^@([vlceb])\s+/i.exec(value);
    if (filter) {
        return {
            mode: 'symbols',
            kind: symbolFilters[filter[1].toLowerCase()],
            query: value.slice(filter[0].length).trim()
                .toLocaleLowerCase()
        };
    }
    return {mode: prefix === '>' ? 'commands' : prefix === '@' ? 'symbols' : 'targets',
        query: (prefix === '>' || prefix === '@' ? value.slice(1) : value).trim().toLocaleLowerCase()};
};

export const score = (text, query) => {
    text = text.toLocaleLowerCase();
    if (!query) return 0;
    if (text === query) return 0;
    if (text.startsWith(query)) return 1;
    const start = text.indexOf(query);
    if (start !== -1) return 2 + (start / (text.length + 1));
    let at = -1;
    for (const char of query) {
        at = text.indexOf(char, at + 1);
        if (at === -1) return Infinity;
    }
    return 3 + (at / (text.length + 1));
};

export const filterResults = (items, query) => items.map((item, index) => ({item,
    index,
    rank: score(item.label, query)})).filter(item => Number.isFinite(item.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(result => result.item);
