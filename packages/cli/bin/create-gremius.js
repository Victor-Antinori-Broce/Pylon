#!/usr/bin/env node

/**
 * create-gremius — npx create-gremius my-app
 *
 * Thin wrapper that runs `gremius init` in vibecoder mode.
 * This enables the `npx create-gremius` pattern that vibe-coders expect.
 */

import { initCommand } from '../dist/commands/init.js';

const projectName = process.argv[2];
const templateFlag = process.argv.find(arg => arg.startsWith('--template='));
const template = templateFlag ? templateFlag.split('=')[1] : 'default';

initCommand(projectName, {
    template,
    mode: 'vibecoder',
    database: 'postgres',
    autoStart: true,
});
