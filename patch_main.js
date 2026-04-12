const fs = require('fs');
let code = fs.readFileSync('media/main.js', 'utf8');

// Expose blocksState setter so offline exported files can easily load files
const exposePattern = `        if (message.command === 'update') {
            // Single assignment: empty array = clear, populated array = render.
            blocksState.val = message.blocks || [];`;
const exposeReplacement = `        if (message.command === 'update') {
            // Single assignment: empty array = clear, populated array = render.
            blocksState.val = message.blocks || [];
        }
    });

    // Expose global for HTML Exporter offline navigation
    window.loadBlocks = (blocks) => {
        blocksState.val = blocks;
    };`;

code = code.replace(`        if (message.command === 'update') {
            // Single assignment: empty array = clear, populated array = render.
            blocksState.val = message.blocks || [];`, exposeReplacement);

// Make sure that MathJax in main.js will not fail if "typesetMath" is skipped (it's safe).
fs.writeFileSync('media/main.js', code);
console.log('Patched main.js');
