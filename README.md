# bmad-visio

Visualize [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) epics and user stories from structured `.md` files on a localhost dashboard. Optionally uses local AI (Transformers.js) to match git commits to stories.

## Quick Start

```bash
npx bmad-visio
```

Run from your project root. Auto-detects BMAD structure:

- `_bmad-output/planning-artifacts/` + `_bmad-output/implementation-artifacts/` (new BMAD)
- `docs/sprint-artifacts/epics/` + `docs/sprint-artifacts/stories/` (old BMAD)

## Features

- **Epic overview** — Grid of all epics with story counts and progress
- **Kanban board** — Stories in 4 columns: To Do → Active → Review → Done
- **Drag & drop** — Move stories between columns, writes status back to `.md` files
- **Story detail** — Acceptance criteria, tasks with checkboxes, progress ring
- **Live editing** — Toggle AC and tasks directly, updates files on disk
- **Git commit matching** — AI-powered mapping of commits to stories (optional)

## AI Commit Matching

Install the optional dependency for commit-to-story matching:

```bash
npm install @huggingface/transformers
```

The dashboard will then:

1. Parse your git history
2. Embed stories and commits with `all-MiniLM-L6-v2`
3. Re-rank ambiguous matches with zero-shot NLI (`mobilebert-uncased-mnli`)
4. Persist mappings in `bmad-visio/gitmap.json`
5. Show related commits on each story's detail page

First run downloads models (~180MB total). Everything runs locally, no API keys needed.

## Options

```
npx bmad-visio [path] [options]

Arguments:
  path              Project root (default: .)

Options:
  -p, --port <n>    Port number (default: 3333)
  --no-git          Skip git commit matching
  --debug           Dump parsed data as JSON and exit
  -h, --help        Show help
```

## Status Mapping

| BMAD Status                | Board Column     |
| -------------------------- | ---------------- |
| `backlog`, `ready-for-dev` | To Do            |
| `in-progress`              | Active           |
| `review`                   | Ready for Review |
| `done`                     | Done             |

## License

MIT
