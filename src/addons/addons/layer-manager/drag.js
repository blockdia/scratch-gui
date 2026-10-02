// Rectangles follow the visible tree's preorder. A container occupies its whole subtree.
export const locateLayerDrop = (rows, id, rectangles, y) => {
    const source = rows.find(row => row.id === id);
    if (!source || source.stage) return null;
    const subtreeEnd = index => {
        let end = index + 1;
        while (end < rows.length && rows[end].depth > rows[index].depth) end++;
        return end;
    };
    const rects = new Map(rectangles.map(rect => [rect.id, rect]));
    let end = rows.length;
    if (source.parent !== null) {
        const parentIndex = rows.findIndex(row => row.id === source.parent);
        end = subtreeEnd(parentIndex);
        const parentRect = rects.get(source.parent);
        const lastRect = rects.get(rows[end - 1].id);
        if (!parentRect || !lastRect || y < parentRect.bottom || y > lastRect.bottom) return null;
    }
    let afterId = null;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.stage || row.parent !== source.parent || row.id === id) continue;
        const first = rects.get(row.id);
        const last = rects.get(rows[subtreeEnd(i) - 1].id);
        if (!first || !last) continue;
        if (y < (first.top + last.bottom) / 2) return {afterId, beforeId: row.id};
        afterId = row.id;
    }
    return {afterId,
        beforeId: source.parent === null ?
            (rows.find(row => row.stage) || {}).id : (rows[end] || {}).id};
};
