/**
 * One-Click Bug Reporter - Zero-Dependency Extension ZIP Packager
 * Packages extension source files into dist/one-click-bug-reporter-v1.0.0.zip for Chrome & Edge store submissions.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

// Read version from manifest.json
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const version = manifest.version || '1.0.0';
const ZIP_NAME = `one-click-bug-reporter-v${version}.zip`;
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

// Files and directories to include in zip package
const INCLUDED_PATTERNS = [
  'manifest.json',
  'README.md',
  'background',
  'scripts',
  'lib',
  'popup',
  'icons'
];

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

function collectAllFiles() {
  let files = [];
  INCLUDED_PATTERNS.forEach(item => {
    const itemPath = path.join(ROOT_DIR, item);
    if (!fs.existsSync(itemPath)) return;

    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      files = files.concat(getFilesRecursively(itemPath));
    } else {
      files.push(itemPath);
    }
  });
  return files;
}

// Minimal pure Node ZIP Archive Generator
function createZipArchive(fileList, outputPath) {
  const localHeaders = [];
  const centralDirectories = [];
  let offset = 0;

  fileList.forEach(filePath => {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const fileData = fs.readFileSync(filePath);
    const compressedData = zlib.deflateRawSync(fileData);

    const crc = crc32(fileData);
    const compressedSize = compressedData.length;
    const uncompressedSize = fileData.length;
    const fileNameBuf = Buffer.from(relativePath, 'utf8');

    // Local File Header
    const lfh = Buffer.alloc(30 + fileNameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0); // Local header signature
    lfh.writeUInt16LE(20, 4);          // Version needed
    lfh.writeUInt16LE(0, 6);           // General purpose bit flag
    lfh.writeUInt16LE(8, 8);           // Compression method (Deflate)
    lfh.writeUInt16LE(0, 10);          // Last mod time
    lfh.writeUInt16LE(0, 12);          // Last mod date
    lfh.writeUInt32LE(crc, 14);        // CRC32
    lfh.writeUInt32LE(compressedSize, 18);
    lfh.writeUInt32LE(uncompressedSize, 22);
    lfh.writeUInt16LE(fileNameBuf.length, 26); // File name length
    lfh.writeUInt16LE(0, 28);          // Extra field length
    fileNameBuf.copy(lfh, 30);

    localHeaders.push(lfh);
    localHeaders.push(compressedData);

    // Central Directory Header
    const cdh = Buffer.alloc(46 + fileNameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0); // Central header signature
    cdh.writeUInt16LE(20, 4);          // Version made by
    cdh.writeUInt16LE(20, 6);          // Version needed
    cdh.writeUInt16LE(0, 8);           // Flags
    cdh.writeUInt16LE(8, 10);          // Compression method (Deflate)
    cdh.writeUInt16LE(0, 12);          // Mod time
    cdh.writeUInt16LE(0, 14);          // Mod date
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressedSize, 20);
    cdh.writeUInt32LE(uncompressedSize, 24);
    cdh.writeUInt16LE(fileNameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);          // Extra field length
    cdh.writeUInt16LE(0, 32);          // File comment length
    cdh.writeUInt16LE(0, 34);          // Disk number start
    cdh.writeUInt16LE(0, 36);          // Internal attributes
    cdh.writeUInt32LE(0, 38);          // External attributes
    cdh.writeUInt32LE(offset, 42);     // Relative offset of local header
    fileNameBuf.copy(cdh, 46);

    centralDirectories.push(cdh);

    offset += lfh.length + compressedData.length;
  });

  const centralDirOffset = offset;
  let centralDirSize = 0;
  centralDirectories.forEach(cdh => {
    centralDirSize += cdh.length;
  });

  // End of Central Directory Record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);                 // End of central dir signature
  eocd.writeUInt16LE(0, 4);                          // Number of this disk
  eocd.writeUInt16LE(0, 6);                          // Disk where central dir starts
  eocd.writeUInt16LE(fileList.length, 8);            // Number of central dir records on this disk
  eocd.writeUInt16LE(fileList.length, 10);           // Total number of central dir records
  eocd.writeUInt32LE(centralDirSize, 12);            // Size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16);          // Offset of central dir
  eocd.writeUInt16LE(0, 20);                         // Comment length

  const zipBuffers = [...localHeaders, ...centralDirectories, eocd];
  fs.writeFileSync(outputPath, Buffer.concat(zipBuffers));
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

// Execute Build
console.log(`📦 Packaging One-Click Bug Reporter v${version}...`);

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const filesToZip = collectAllFiles();
console.log(`Found ${filesToZip.length} extension files to package.`);

createZipArchive(filesToZip, ZIP_PATH);

const stat = fs.statSync(ZIP_PATH);
console.log(`\n✅ Build Complete! ZIP archive generated at:`);
console.log(`   ${ZIP_PATH} (${(stat.size / 1024).toFixed(2)} KB)`);
console.log(`\nReady for Chrome Web Store & Microsoft Edge Add-ons store submission! 🚀`);
