#!/usr/bin/env node
import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const entry = resolve(process.cwd(), 'dist/index.js');
await chmod(entry, 0o755);
console.log(`postbuild: chmod +x ${entry}`);
