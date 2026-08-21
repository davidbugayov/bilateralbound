#!/usr/bin/env node
/**
 * Version Manager - Auto-increment version on each commit
 * Updates version across all package.json files and injects into HTML/JS
 *
 * Architecture:
 * - Version is stored ONLY in package.json files and HTML meta tags
 * - Locale files (common.json) use {{VERSION}} placeholder
 * - i18n.js dynamically injects version from <meta name="version"> at runtime
 * - This ensures single source of truth and prevents version drift
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Generate version with timestamp for unique tracking
function generateVersion() {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  const [major, minor] = rootPackage.version.split('.').map(Number);

  // Auto-increment patch version
  const patch = (parseInt(rootPackage.version.split('.')[2]) || 0) + 1;

  return `${major}.${minor}.${patch}`;
}

// Get current git hash
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (err) {
    // Fallback to 'dev' if git is not available or command fails
    console.warn('Unable to get git hash:', err.message);
    return 'dev';
  }
}

// Update version in package.json
function updatePackageJson(filePath, version) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  // Храним только чистую семантическую версию без хешей
  content.version = version;
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log(`✅ Updated ${path.relative(ROOT, filePath)}: ${version}`);
}

// Update version in HTML files - FIXED VERSION
function updateHtmlFiles(version, hash) {
  const versionString = `${version}-${hash}`;
  const publicDir = path.join(ROOT, 'packages/web-client/public');

  const htmlFiles = [
    'index.html',
    'session-controller.html',
    'viewer.html',
    'breathing.html',
    'privacy.html',
    'offer.html',
    'about.html',
    'paywall.html',
  ];

  htmlFiles.forEach((file) => {
    const filePath = path.join(publicDir, file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // STEP 1: Remove ALL version meta tags (including duplicates)
    content = content.replace(
      /<meta name="version" content="[^"]*"\s*\/?>\s*/g,
      '',
    );
    // STEP 2: Update existing version query parameter in all resource URLs
    content = content.replace(/\?v=[^"'\s]*/g, `?v=${versionString}`);

    // STEP 2.1: Add ?v= to script/link tags that are missing it (local assets only)
    content = content.replace(
      /((?:src|href)=["'])(\/(?:js|css|dist|manifest\.json|favicon)[^"'?]*)(["'])/g,
      (match, prefix, p, quote) => `${prefix}${p}?v=${versionString}${quote}`,
    );

    // STEP 2.2: Specifically ensure /sw.js has a version query param in registrations
    content = content.replace(
      /\/sw\.js(?:\?v=[^"']*)?/g,
      `/sw.js?v=${versionString}`,
    );

    // STEP 3: Add single meta version tag (before theme-color for consistency)
    content = content.replace(
      /<meta name="theme-color"/,
      `<meta name="version" content="${versionString}" />\n    <meta name="theme-color"`,
    );

    // STEP 4: Update version display in page content (BilateralBound footer)
    content = content.replace(
      /(?:⚡\s*)?BilateralBound v?\d+\.\d+\.\d+(?:-[a-f0-9]+)?/g,
      `BilateralBound v${versionString}`,
    );

    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${file}: v${versionString}`);
  });

  // Update sw.js — CACHE_NAME and CACHE_VERSION must stay in sync with app version
  const swPath = path.join(publicDir, 'sw.js');
  if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');
    const shortVersion = `${version}-${hash}`;
    swContent = swContent.replace(
      /const CACHE_NAME = 'bilateralbound-[^']*'/,
      `const CACHE_NAME = 'bilateralbound-v3-${shortVersion}'`,
    );
    swContent = swContent.replace(
      /const CACHE_VERSION = '[^']*'/,
      `const CACHE_VERSION = '${shortVersion}'`,
    );
    swContent = swContent.replace(
      /\/\*\* Build: [^*]*\*\//,
      `/** Build: ${new Date().toISOString()} */`,
    );
    fs.writeFileSync(swPath, swContent);
    console.log(`✅ Updated sw.js: v${shortVersion}`);
  }
}

// Locale files now use {{VERSION}} placeholder - no update needed
// Version is injected dynamically by i18n.js from meta tag

// Main update function
function updateVersion() {
  console.log('\n🔄 Auto-updating version...\n');

  const version = generateVersion();
  const hash = getGitHash();

  console.log(`📦 New version: ${version}`);
  console.log(`🔗 Git hash: ${hash}\n`);

  // Update all package.json files
  const packageFiles = [
    'package.json',
    'packages/shared/package.json',
    'packages/server-core/package.json',
    'packages/web-client/package.json',
  ];

  packageFiles.forEach((file) => {
    const filePath = path.join(ROOT, file);
    if (fs.existsSync(filePath)) {
      updatePackageJson(filePath, version);
    }
  });

  // Update HTML files
  updateHtmlFiles(version, hash);

  console.log(`\n✅ Version updated to ${version}-${hash}`);
  console.log('📝 Files staged for commit\n');
}

// Run if called directly
if (require.main === module) {
  updateVersion();
}

module.exports = { updateVersion, generateVersion, getGitHash };
