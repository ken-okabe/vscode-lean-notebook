const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  });

  const parserCtx = await esbuild.context({
    entryPoints: ['src/leanCommentParser.ts'],
    bundle: true,
    outfile: 'media/leanCommentParser.js',
    format: 'iife',
    globalName: 'LeanParser',
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
  });

  if (watch) {
    await Promise.all([ctx.watch(), parserCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([ctx.rebuild(), parserCtx.rebuild()]);
    await Promise.all([ctx.dispose(), parserCtx.dispose()]);
    console.log('Build complete!');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
