const iconShapes = {
    AlertCircle: [['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }], ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }]],
    AlertTriangle: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
    ArrowLeft: [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
    ArrowRight: [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
    Badge: [['path', { d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z' }]],
    ChevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
    Check: [['path', { d: 'm20 6-11 11-5-5' }]],
    CheckCircle2: [['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['path', { d: 'm9 11 3 3L22 4' }]],
    Mail: [['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }], ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }]],
    MessageCircle: [['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }]],
    Music2: [['circle', { cx: '8', cy: '18', r: '4' }], ['path', { d: 'M12 18V2l7 4' }]],
    Play: [['polygon', { points: '5 3 19 12 5 21 5 3' }]],
    PlusCircle: [['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '12', x2: '12', y1: '8', y2: '16' }], ['line', { x1: '8', x2: '16', y1: '12', y2: '12' }]],
    RefreshCw: [['path', { d: 'M21 12a9 9 0 0 0-15.2-6.5L3 8' }], ['path', { d: 'M3 3v5h5' }], ['path', { d: 'M3 12a9 9 0 0 0 15.2 6.5L21 16' }], ['path', { d: 'M16 16h5v5' }]],
    Search: [['circle', { cx: '11', cy: '11', r: '8' }], ['path', { d: 'm21 21-4.3-4.3' }]],
    ShieldCheck: [['path', { d: 'M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    Share2: [['circle', { cx: '18', cy: '5', r: '3' }], ['circle', { cx: '6', cy: '12', r: '3' }], ['circle', { cx: '18', cy: '19', r: '3' }], ['line', { x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49' }], ['line', { x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49' }]],
    ShoppingCart: [['circle', { cx: '8', cy: '21', r: '1' }], ['circle', { cx: '19', cy: '21', r: '1' }], ['path', { d: 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12' }]],
    User: [['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }], ['circle', { cx: '12', cy: '7', r: '4' }]]
};

const svgAttributes = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
};

function renderRootIcons(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-lucide]').forEach((element) => {
        if (element instanceof SVGElement && element.classList.contains('lucide')) return;
        const iconName = element.getAttribute('data-lucide');
        if (!iconName) return;
        const componentName = iconName.replace(/(\w)(\w*)(_|-|\s*)/g, (_, first, rest) => first.toUpperCase() + rest.toLowerCase());
        const shapes = iconShapes[componentName];
        if (!shapes) return;
        const icon = document.createElementNS(svgAttributes.xmlns, 'svg');
        Object.entries(svgAttributes).forEach(([name, value]) => icon.setAttribute(name, value));
        Array.from(element.attributes).forEach(({ name, value }) => icon.setAttribute(name, value));
        icon.classList.add('lucide', `lucide-${iconName}`);
        shapes.forEach(([tag, attrs]) => {
            const child = document.createElementNS(svgAttributes.xmlns, tag);
            Object.entries(attrs).forEach(([name, value]) => child.setAttribute(name, value));
            icon.appendChild(child);
        });
        element.parentNode?.replaceChild(icon, element);
    });
}

export function renderPublicIcons(root) {
    if (root) return renderRootIcons(root);
    ['global-catalog-view', 'public-store-view'].forEach((id) => renderRootIcons(document.getElementById(id)));
}

let fullIconsPromise = null;

export function ensureFullPublicIcons() {
    if (window.lucide?.__beatssFullIconSet) return Promise.resolve(window.lucide);
    if (!fullIconsPromise) {
        fullIconsPromise = import('lucide').then(({ createIcons, icons }) => {
            window.lucide = {
                __beatssFullIconSet: true,
                createIcons(options = {}) {
                    const { root: _root, ...lucideOptions } = options;
                    return createIcons({ icons, ...lucideOptions });
                }
            };
            return window.lucide;
        });
    }
    return fullIconsPromise;
}
