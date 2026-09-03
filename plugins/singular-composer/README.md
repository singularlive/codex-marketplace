# Singular Composer plugin

A Codex plugin containing the Composer skill, its CLI helpers, and pinned
runtime dependencies. Users do not need npm or Playwright CLI setup. This package
uses the existing CLI workflow; it does not introduce an MCP server or companion app.

## Use

Install **singular-composer** from the Singular.live marketplace:

```sh
codex plugin marketplace add singularlive/codex-marketplace
codex plugin add singular-composer@singularlive
```

Start a new task and invoke its Composer skill. Open the composition you want to work on
and follow the skill's normal pairing flow.

Requirements: Node.js 22 or newer. Standalone capture and Player verification also
require installed Google Chrome. Browser-owned Composer capture follows the
existing skill's browser-control workflow. No credentials are included.

From the installed `skills/composer` directory:

```sh
node scripts/doctor.js
node scripts/doctor.js --browser
node scripts/composer-agent.js <command> [options]
```

The browser check uses an isolated headless browser and an in-memory test page.
It does not open Composer or install a browser. A successful check proves local
browser startup and screenshot support, not authenticated Composer/Player behavior.
Store credentials and output outside the installed plugin. If files are missing,
reinstall the whole plugin; do not run npm to repair a user's installation.

## What is packaged

- The source Composer skill and references, with packaging-specific setup guidance.
- Private copies of tinycolor2, uuid, ws, and playwright-core under
  `runtime/node_modules` with exact versions and a lockfile. Dependencies live
  outside the skills directory so their bundled documentation is not exposed as skills.
- One shared loader that uses these copies explicitly, never a global CLI installation.
- A runtime doctor and a maintainer-only isolated packaging smoke test.

The upstream skill/server contract version is retained because this local package
does not change that protocol. `source-manifest.json` records the upstream file
hashes and contract version. Plugin package versioning is independent. The ws client
uses version 8 in this package; authenticated live compatibility remains a separate
verification step.

## Rebuild (maintainers only)

Run these commands from the plugin root; Python and npm are build prerequisites,
not prerequisites for end users:

```sh
python scripts/build-plugin.py /path/to/singular/.agents/skills/composer
npm ci --prefix runtime --ignore-scripts --omit=optional --no-audit --no-fund
node scripts/smoke-test.cjs --browser
```

Refresh a clean source snapshot when upstream files are removed; the refresh script
does not delete existing files. Review source changes and packaging transforms before
releasing an update. Keep the entire runtime directory in the distributed plugin.
Retain each vendored dependency's license and notice files. This local package does
not grant new licensing rights to the original Singular code.

Windows verification is recorded in `verification.json`. macOS/Linux and authenticated
Composer/Player verification are pending. This plugin is distributed through the
Singular.live Git marketplace; it is not an OpenAI directory submission.
