import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist/esm');
const indexPath = path.join(distDir, 'index.js');

function addJsIfNeeded(specifier) {
  if (!specifier.startsWith('.')) return specifier; // external package
  if (specifier.endsWith('.js')) return specifier;
  return `${specifier}.js`;
}

try {
  let content = fs.readFileSync(indexPath, 'utf8');
  // Handle export * from '...'
  content = content.replace(/export\s+\*\s+from\s+'([^']+)'/g, (m, p1) => `export * from '${addJsIfNeeded(p1)}'`);
  // Handle other from '...'
  content = content.replace(/from\s+'([^']+)'/g, (m, p1) => `from '${addJsIfNeeded(p1)}'`);
  fs.writeFileSync(indexPath, content);
  console.log('Patched ESM export paths in dist/esm/index.js');
} catch (e) {
  console.error('Failed to patch ESM exports:', e.message);
  process.exit(1);
}


