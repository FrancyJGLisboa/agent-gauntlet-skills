// `npm publish` normalizes package.json more strictly than `npm pack`, warns about
// what it rewrote, and publishes anyway. A leading "./" in a bin path is silently
// dropped, so the package installs with no command in it — which `npm pack` and the
// clean-install smoke test both fail to reproduce, because they never normalize.
// These are the fields where a warning at publish time becomes a broken release.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const failures = [];

for (const field of ['name', 'version', 'description', 'license', 'repository', 'files', 'engines']) {
  if (!pkg[field]) failures.push(`package.json is missing ${field}, which publishing needs`);
}

const owned = (target) => (pkg.files ?? []).some((entry) => target === entry || target.startsWith(`${entry.replace(/\/$/, '')}/`));

for (const [command, target] of Object.entries(pkg.bin ?? {})) {
  if (typeof target !== 'string' || !target) { failures.push(`bin.${command} is not a path`); continue; }
  if (target.startsWith('./') || target.startsWith('/')) {
    failures.push(`bin.${command} is "${target}"; npm publish drops a bin path that is not plainly relative, shipping a package with no ${command} command. Use "${target.replace(/^\.?\//, '')}".`);
  }
  const clean = target.replace(/^\.?\//, '');
  if (!fs.existsSync(path.join(root, clean))) failures.push(`bin.${command} points at ${clean}, which does not exist`);
  else if (!fs.readFileSync(path.join(root, clean), 'utf8').startsWith('#!')) failures.push(`bin.${command} target ${clean} has no shebang and will not run when installed`);
  if (!owned(clean)) failures.push(`bin.${command} points at ${clean}, which the files list does not ship`);
}

if (!Object.keys(pkg.bin ?? {}).length) failures.push('package.json declares no bin, so nothing is installed on the PATH');

if (failures.length) { for (const failure of failures) console.error(failure); process.exit(1); }
console.log('Package metadata survives publish normalization');
