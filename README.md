# Singular.live Codex marketplace

Install Singular.live plugins in Codex directly from this Git repository.

## Install

Run these commands with the Codex CLI:

```sh
codex plugin marketplace add singularlive/codex-marketplace
codex plugin add singular-composer@singularlive
```

Start a new Codex task after installation to load the plugin's skills.

| Plugin | Description | Requirements |
| --- | --- | --- |
| [Singular Composer](plugins/singular-composer/README.md) | Create, inspect, and verify Singular Composer graphics. | Node.js 22+; installed Google Chrome for standalone capture and Player verification. |

The Composer plugin includes its JavaScript dependencies. End users do not need
to run npm. Pair with your authorized Composer session when using the skill.

## Update

```sh
codex plugin marketplace upgrade singularlive
codex plugin add singular-composer@singularlive
```

Start a new task after updating. Maintainers must change the plugin manifest
version when publishing changed plugin contents so installations can refresh.

## Repository layout

```text
.agents/plugins/marketplace.json        # Marketplace catalog
plugins/
  singular-composer/
    .codex-plugin/plugin.json           # Plugin metadata
    skills/composer/                    # Skill and helpers
    runtime/                           # Lockfile and vendored dependencies
scripts/validate-marketplace.py         # Catalog and package checks
```

Catalog source paths are relative to the repository root, even though the
catalog itself lives in `.agents/plugins/`.

## Maintain the marketplace

1. Add each plugin under `plugins/<plugin-name>/`, including its
   `.codex-plugin/plugin.json` manifest and the files required at runtime.
2. Append an entry to `.agents/plugins/marketplace.json`. Match the plugin name,
   use `./plugins/<plugin-name>` as its local source path, and include `category`
   and both policy fields. Keep installation `AVAILABLE` and authentication
   `ON_INSTALL` unless another policy is needed.
3. Run validation from the repository root:

   ```sh
   python scripts/validate-marketplace.py
   node plugins/singular-composer/scripts/smoke-test.cjs --browser
   ```

4. Commit and push the complete plugin, including its runtime dependencies and
   their license/notice files. Follow the plugin README for rebuilding.

For a local checkout, register the repository root with
`codex plugin marketplace add .` before installing from it. Use
`codex plugin marketplace list` to check which source is registered under
`singularlive`; remove that registration before switching between local and Git
sources with the same marketplace name.

GitHub Actions checks the catalog and runs the packaged runtime smoke test on
Windows. Authenticated Composer/Player behavior requires separate live testing.

## Licensing

This repository does not grant new licensing rights to the original Singular
code. Vendored dependencies retain their own license and notice files.
