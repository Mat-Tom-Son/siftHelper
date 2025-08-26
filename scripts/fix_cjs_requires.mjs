import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist/cjs');
const indexPath = path.join(distDir, 'index.cjs');

function addCjsIfNeeded(specifier) {
  if (!specifier.startsWith('./')) return specifier;
  if (specifier.endsWith('.cjs')) return specifier;
  return `${specifier}.cjs`;
}

try {
  let content = fs.readFileSync(indexPath, 'utf8');
  content = content.replace(/require\((['"])(\.\/[\w_-]+)\1\)/g, (m, q, p1) => `require(${q}${addCjsIfNeeded(p1)}${q})`);
  fs.writeFileSync(indexPath, content);
  console.log('Patched CJS require paths in dist/cjs/index.cjs');
} catch (e) {
  console.error('Failed to patch CJS requires:', e.message);
  process.exit(1);
}


