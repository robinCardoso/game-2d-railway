/** Renderiza árvore HTML de subpastas (estilo terminal). */
export function renderFolderTree(
    rootLabel: string,
    folders: string[],
    emptyMessage = '(nenhuma subpasta — salve na raiz)'
): string {
    const sorted = folders
        .map((f) => f.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt'));

    if (sorted.length === 0) {
        return `<span class="char-folder-tree__root">${rootLabel}/</span><span class="char-folder-tree__empty"> ${emptyMessage}</span>`;
    }

    type TreeNode = { children: Map<string, TreeNode> };
    const root: TreeNode = { children: new Map() };

    for (const folder of sorted) {
        const parts = folder.split('/').filter(Boolean);
        let node = root;
        for (const part of parts) {
            if (!node.children.has(part)) {
                node.children.set(part, { children: new Map() });
            }
            node = node.children.get(part)!;
        }
    }

    const lines: string[] = [`<span class="char-folder-tree__root">${rootLabel}/</span>`];

    function walk(node: TreeNode, depth: number, prefix: string): void {
        const entries = [...node.children.entries()].sort(([a], [b]) =>
            a.localeCompare(b, 'pt')
        );
        entries.forEach(([name, child], index) => {
            const isLast = index === entries.length - 1;
            const branch = isLast ? '└─ ' : '├─ ';
            const indent = '&nbsp;&nbsp;'.repeat(depth);
            const folderPath = prefix ? `${prefix}/${name}` : name;
            lines.push(
                `${indent}${branch}<span class="char-folder-tree__folder" data-folder-path="${folderPath}">${name}/</span>`
            );
            walk(child, depth + 1, folderPath);
        });
    }

    walk(root, 0, '');
    return lines.join('<br>');
}
