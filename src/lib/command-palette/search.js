import {createSearchAliases} from '../../addons/libraries/block-search/search-aliases';

export {createSearchAliases};

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

export const filterResults = (items, query, getAliases = createSearchAliases()) => {
    query = query.toLocaleLowerCase();
    if (!query) return items.slice();
    return items.map((item, index) => ({item,
        index,
        // Each spelling keeps exact/prefix/substring/subsequence ordering.
        // Literal matches always precede full pinyin, then initials.
        rank: Math.min(...getAliases(item.label).map(alias => (alias.rank * 4) +
            (alias.rank ? score(alias.text.replace(/\s+/g, ''), query.replace(/\s+/g, '')) : score(alias.text, query))))
    })).filter(item => Number.isFinite(item.rank))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(result => result.item);
};

// Apply after search so unavailable commands stay last even for exact matches.
export const sortCommands = (items, recentActions) => {
    const recent = new Map(recentActions.map((id, index) => [id, index]));
    const rank = item => (recent.has(item.id) ? recent.get(item.id) : recent.size);
    return items.map((item, index) => ({item, index}))
        .sort((a, b) => Number(a.item.available === false) - Number(b.item.available === false) ||
            rank(a.item) - rank(b.item) || a.index - b.index)
        .map(result => result.item);
};
