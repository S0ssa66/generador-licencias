const fs = require('node:fs');
const vm = require('node:vm');

// Reuse the existing design tokens while moving Tailwind compilation from
// every visitor's browser into the production build.
const sandbox = { tailwind: {} };
vm.runInNewContext(
    fs.readFileSync('./tailwind-design-tokens.js', 'utf8'),
    sandbox,
    { filename: 'tailwind-design-tokens.js' }
);

module.exports = {
    ...sandbox.tailwind.config,
    content: [
        './index.html',
        './*.js',
        './dashboard_modules/**/*.js'
    ],
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries')
    ]
};
