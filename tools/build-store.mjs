// Builds the package for the Chrome Web Store: artifacts/sei-organizador-store.zip.
// Same files as the ZIP distributed in the unit, except for the manifest: the store rejects "key" and
// assigns its own ID, and the store build never asks GitHub for new versions (Chrome updates it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const out = path.resolve('artifacts/sei-organizador-store.zip');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sei-store-'));
try {
  fs.cpSync('extension', dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete manifest.key;
  manifest.host_permissions = manifest.host_permissions.filter((host) => !host.includes('api.github.com'));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  const config = path.join(dir, 'config.js');
  const text = fs.readFileSync(config, 'utf8').replace(/^.*(?:updateFeed|releasesPage|Latest release).*\r?\n/gm, '');
  if (/github/i.test(text)) throw Error('config.js ainda cita o GitHub');
  fs.writeFileSync(config, text);
  // What the store checks or what would be a problem there.
  for (const size of [16, 32, 48, 128]) if (!fs.existsSync(path.join(dir, manifest.icons?.[size] || '?'))) throw Error(`Ícone ${size} ausente`);
  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  if (!files.includes('manifest.json')) throw Error('manifest.json fora da raiz');
  const stray = files.filter((name) => /(^|[\/])\.|\.(map|md|zip|pem|env)$|users-data/i.test(name));
  if (stray.length) throw Error('Arquivos que não devem ir para a loja: ' + stray.join(', '));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  // Relative path from inside the folder: the files must be at the root of the ZIP.
  execFileSync('powershell', ['-NoProfile', '-Command', 'Compress-Archive -Path * -DestinationPath store.zip -Force'], { cwd: dir, stdio: 'inherit' });
  fs.copyFileSync(path.join(dir, 'store.zip'), out);
  console.log(`Pacote da loja: ${out} · versão ${manifest.version} · ${files.length} arquivos · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  console.log('Permissões:', manifest.permissions.join(', '), '| sites:', manifest.host_permissions.join(', '));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
