/**
 * Codegen: src/i18n/*.js → public/js/i18n/*.js (IIFE wrappers for static HTML pages)
 *
 * Static HTML pages (index, about, privacy, offer, breathing) load i18n via
 * <script> tags, not webpack. They need IIFE-wrapped versions that expose
 * globals. This script generates those from the canonical src/i18n/ source.
 *
 * Run: node scripts/generate-i18n-iife.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_I18N = path.join(ROOT, 'packages', 'web-client', 'src', 'i18n');
const PUBLIC_I18N_JS = path.join(
  ROOT,
  'packages',
  'web-client',
  'public',
  'js',
  'i18n',
);

function generateI18n() {
  // Read src (canonical source for webpack)
  const lines = fs
    .readFileSync(path.join(SRC_I18N, 'i18n.js'), 'utf8')
    .split('\n');
  const output = [];

  let inExportBlock = false;

  for (const line of lines) {
    // Skip the export block at the bottom:
    //   // Export for CommonJS or attach to root
    //   if (typeof module !== 'undefined' ...
    //   ...
    // We replace it with inline IIFE wrapping
    if (line.startsWith('// Export for CommonJS or attach to root')) {
      inExportBlock = true;
      continue;
    }
    if (inExportBlock) {
      // Consume lines until we reach the auto-init section
      if (line.startsWith('  // Auto-initialize i18n')) {
        inExportBlock = false;
        output.push(line);
        continue;
      }
      if (line.startsWith('  // We need to start')) {
        output.push(line);
        continue;
      }
      if (
        line.includes(
          "typeof globalThis !== 'undefined' && globalThis.document",
        )
      ) {
        output.push(
          line.replace(
            "globalThis !== 'undefined' && globalThis.document",
            "root !== 'undefined' && root.document",
          ),
        );
        inExportBlock = false;
        continue;
      }
      // Skip the export if/else and any empty lines between export and auto-init
      continue;
    }

    // Skip final module.exports and globalThis.i18n lines at the very end
    // We handle these ourselves in the IIFE wrapper
    if (line === 'globalThis.i18n = I18n' || line === 'module.exports = I18n') {
      continue;
    }

    output.push(line);
  }

  // Remove trailing empty lines before wrapping
  while (output.length > 0 && output[output.length - 1] === '') {
    output.pop();
  }

  // Wrap in IIFE with 2-space indent
  const inner = output.map((l) => (l ? `  ${l}` : l)).join('\n');
  const result = `(function (root) {\n${inner}\n\n  root.i18n = I18n\n  globalThis.i18n = I18n\n})(typeof globalThis !== 'undefined' ? globalThis : window)\n`;

  fs.writeFileSync(path.join(PUBLIC_I18N_JS, 'i18n.js'), result, 'utf8');
  console.log('Generated public/js/i18n/i18n.js');
}

function generateLanguageSelector() {
  const src = fs.readFileSync(
    path.join(SRC_I18N, 'language-selector.js'),
    'utf8',
  );

  // Remove module.exports (last non-empty line)
  let content = src.replace(/\nmodule\.exports = LanguageSelector\n$/, '\n');

  // csrfFetch is only available in webpack context; static pages use plain fetch
  content = content.replace('globalThis.csrfFetch', 'fetch');

  fs.writeFileSync(
    path.join(PUBLIC_I18N_JS, 'language-selector.js'),
    content,
    'utf8',
  );
  console.log('Generated public/js/i18n/language-selector.js');
}

// Ensure target directory exists
fs.mkdirSync(PUBLIC_I18N_JS, { recursive: true });

generateI18n();
generateLanguageSelector();
console.log('i18n IIFE generation complete.');
