#!/usr/bin/env node

import path from 'path';
import open from 'open';
import { fileURLToPath } from 'url';

// Setup cross-platform workspace path to current execution directory
process.env.JUSTCODE_WORKSPACE = process.cwd();

// Setup relative path imports for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`\n==========================================`);
console.log(`🚀 Starting JustCode Agent Workspace...`);
console.log(`📂 Workspace Path: ${process.env.JUSTCODE_WORKSPACE}`);
console.log(`==========================================\n`);

// Import and start the express backend server
import(path.join(__dirname, '../backend/server.js'))
  .then(() => {
    const port = process.env.PORT || 5001;
    console.log(`\nJustCode console successfully started!`);
    console.log(`Opening dashboard at http://localhost:${port} ...\n`);
    // Open in default browser
    open(`http://localhost:${port}`).catch(() => {
      // Ignore open errors (e.g. headless environment)
    });
  })
  .catch(err => {
    console.error('Failed to launch JustCode Backend:', err);
    process.exit(1);
  });
