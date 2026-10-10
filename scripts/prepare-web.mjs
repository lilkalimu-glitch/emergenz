// Bereitet den Web-Teil für die Android-App vor (läuft im GitHub-Build nach "npm install"):
// kopiert Capacitor, bündelt die Plugins, kopiert die Schriften und schreibt die Versionsnummer.
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';

const PLUGINS = {
  App: '@capacitor/app',
  Haptics: '@capacitor/haptics',
  StatusBar: '@capacitor/status-bar',
};

mkdirSync('www/vendor', { recursive: true });
mkdirSync('www/fonts', { recursive: true });

const core = 'node_modules/@capacitor/core/dist/capacitor.js';
if (existsSync(core)) {
  writeFileSync('www/vendor/capacitor.js', readFileSync(core, 'utf8'));
  console.log('Capacitor-Kern kopiert');
} else {
  writeFileSync('www/vendor/capacitor.js', '/* Capacitor fehlt (nur Browser) */\n');
  console.warn('WARNUNG: Capacitor-Kern nicht gefunden, native Funktionen fehlen.');
}

let bundle = '/* Automatisch erzeugt von scripts/prepare-web.mjs */\n';
bundle += 'var synapse = typeof synapse !== "undefined" ? synapse : { exposeSynapse: function () {} };\n';
bundle += 'window.EPlugins = window.EPlugins || {};\n';
for (const [name, pkg] of Object.entries(PLUGINS)) {
  const file = `node_modules/${pkg}/dist/plugin.js`;
  if (!existsSync(file)) {
    console.warn('WARNUNG: fehlt', file);
    continue;
  }
  const src = readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const m = src.match(/var\s+([A-Za-z0-9_$]+)\s*=\s*\(function/);
  if (!m) {
    console.warn('WARNUNG: Format unbekannt', file);
    continue;
  }
  bundle += `\n/* ${pkg} */\ntry {\n${src}\n} catch (e) { console.warn('Plugin ${name} nicht geladen', e); }\n`;
  bundle += `try { if (typeof ${m[1]} !== 'undefined' && ${m[1]}.${name}) window.EPlugins.${name} = ${m[1]}.${name}; } catch (e) {}\n`;
  console.log(`Plugin ${name} eingebunden (${m[1]})`);
}
writeFileSync('www/vendor/plugins.js', bundle);

// Schriften (falls installiert): Fraunces für Titel und Artnamen, Instrument Sans für die Oberfläche
const FONTS = [
  ['@fontsource/fraunces/files/fraunces-latin-400-normal.woff2', 'fraunces-400.woff2'],
  ['@fontsource/fraunces/files/fraunces-latin-600-normal.woff2', 'fraunces-600.woff2'],
  ['@fontsource/fraunces/files/fraunces-latin-400-italic.woff2', 'fraunces-400-italic.woff2'],
  ['@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2', 'instrument-sans-400.woff2'],
  ['@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff2', 'instrument-sans-500.woff2'],
  ['@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff2', 'instrument-sans-600.woff2'],
];
for (const [src, dst] of FONTS) {
  const p = `node_modules/${src}`;
  if (existsSync(p)) {
    copyFileSync(p, `www/fonts/${dst}`);
    console.log('Schrift', dst);
  } else console.warn('WARNUNG: Schrift fehlt', src);
}

const run = process.env.GITHUB_RUN_NUMBER;
const major = process.env.APP_MAJOR || '0';
if (run) {
  writeFileSync('www/js/version.js', `// Automatisch beim Bauen gesetzt.\nexport const VERSION = '${major}.${run}';\n`);
  console.log(`Version ${major}.${run}`);
}
