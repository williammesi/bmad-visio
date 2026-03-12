#!/usr/bin/env node

import path from "node:path";
import { parseBmadProject } from "./parser/index.js";
import { matchCommitsToStories } from "./git/index.js";
import { createServer } from "./server/index.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  bmad-visio — Visualize BMAD epics, stories & git history

  Usage:
    npx bmad-visio [path] [options]

  Arguments:
    path              Project root (default: .)

  Options:
    -p, --port <n>    Port number (default: 3333)
    --no-git          Skip git commit matching
    --debug           Dump parsed data as JSON and exit
    -h, --help        Show this help

  Detects BMAD structure automatically:
    _bmad-output/planning-artifacts/   (new BMAD)
    docs/sprint-artifacts/             (old BMAD)
  `);
  process.exit(0);
}

const portIdx = args.findIndex((a) => a === "-p" || a === "--port");
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3333;
const debug = args.includes("--debug");
const noGit = args.includes("--no-git");

const dir = path.resolve(
  args.find((a) => !a.startsWith("-") && a !== String(port)) ?? ".",
);

console.log(`\n  📂  Scanning: ${dir}`);

const project = parseBmadProject({ dir });

const storyCount = project.epics.reduce((n, e) => n + e.stories.length, 0);
console.log(`  ✅  Found ${project.epics.length} epics, ${storyCount} stories`);

if (debug) {
  console.log(JSON.stringify(project.epics, null, 2));
  process.exit(0);
}

// Git matching
if (!noGit) {
  try {
    const mappings = await matchCommitsToStories(project, dir);
    project.commitMappings = mappings;
  } catch (err: any) {
    console.log(`  ⚠️  Git matching skipped: ${err.message}`);
  }
} else {
  console.log("  ⏭️  Git matching skipped (--no-git)");
}

createServer(project, port);
