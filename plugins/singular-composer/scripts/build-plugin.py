"""Refresh the packaged skill from a Singular checkout. Maintainer-only build step."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path, help="Path to the source composer skill")
args = parser.parse_args()
source = args.source.resolve()
target = root / "skills" / "composer"
if not (source / "SKILL.md").is_file() or source == target.resolve():
    raise SystemExit("Provide the original Composer skill directory")
target.mkdir(parents=True, exist_ok=True)
inventory = {}
for file in source.rglob("*"):
    if file.is_file():
        relative = file.relative_to(source)
        if file.suffix not in (".md", ".js", ".mjs"):
            raise SystemExit(f"Unexpected source file type: {relative}")
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, destination)
        inventory[relative.as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()

def edit(relative, transform):
    file = target / relative
    original = file.read_text(encoding="utf-8")
    updated = transform(original)
    if updated == original:
        raise SystemExit(f"Expected packaging transformation missing: {relative}")
    file.write_text(updated, encoding="utf-8")

def client(text):
    for name in ("tinycolor2", "uuid", "ws"):
        old = f"require('{name}')"
        assert text.count(old) == 1, name
        text = text.replace(old, f"require('./runtime-dependencies').load('{name}')")
    return text
edit("scripts/composer-agent.js", client)

for filename in ("capture-composition-preview.js", "verifyComposition.mjs"):
    def playwright(text):
        pattern = r"function loadPlaywrightCore\(\) \{.*?\n\}"
        text, count = re.subn(pattern, "function loadPlaywrightCore() {\n  return require('./runtime-dependencies').load('playwright-core');\n}", text, count=1, flags=re.S)
        assert count == 1
        return text
    edit("scripts/" + filename, playwright)

edit("SKILL.md", lambda t: t.replace("# Singular Composer\n", """# Singular Composer

## Packaged runtime

This plugin includes the Composer helpers and their pinned npm dependencies, including
`playwright-core`. Do not run npm, npx, or install `@playwright/cli` to use this plugin.
Use Node.js 22 or newer. Resolve this skill directory from the installed SKILL.md path;
run the commands below from that directory, or use absolute paths to its scripts.
Before first use, run `node scripts/doctor.js`. For standalone capture or Player
verification, run `node scripts/doctor.js --browser` to check installed Chrome.
If a packaged dependency is missing, reinstall the complete plugin instead of repairing
it with npm. Chrome is a separate prerequisite; do not install or replace it silently.
Keep credentials, screenshots, and temporary files outside the installed plugin.

""", 1))
edit("references/capture.md", lambda t: re.sub(
    r"## Standalone prerequisites\n.*?(?=The headless browser)",
    """## Standalone prerequisites

Run `node scripts/doctor.js --browser` from the skill directory. The plugin includes
`playwright-core`; no Playwright CLI or npm installation is needed. Node.js 22+ and
installed Google Chrome are required. If a packaged dependency is missing, reinstall
the complete plugin. If Chrome is unavailable, report that specific prerequisite.

The bundled library starts a localhost-only headless Chrome worker. Subsequent captures
within its five-minute idle window reuse the process with a fresh context and page.
The worker accepts authenticated local requests only and exits after its idle window.
Do not substitute Chromium unless Chrome is unavailable and the user approves it.

""", t, count=1, flags=re.S))
edit("references/composition-scripts.md", lambda t: t.replace(
    "Ensure `@playwright/cli` and its Chrome browser are installed, then pipe",
    "Run `node scripts/doctor.js --browser` to check the packaged Playwright library and installed Chrome, then pipe"))

def debugging(t):
    t = re.sub(r"## Playwright installation\n.*?(?=### Screenshot output)", """## Packaged Playwright runtime

Run `node scripts/doctor.js --browser` from the installed skill directory. The plugin
ships `playwright-core`; do not install Playwright CLI or npm packages. Use Node.js 22+
and installed Chrome. Run the verifier in place:

```powershell
node scripts/composer-agent.js script-handoff --compact |
  node scripts/verifyComposition.mjs --handoff-file -
```

Prefer `--scenario-file` for declarative verification. If custom logic is essential,
copy the complete plugin directory (including skills and runtime) into a
writable task directory, customize that copy, and remove it after the task. Copying
only verifyComposition.mjs loses its sibling helpers and packaged dependencies.
Never change the installed plugin for a composition-specific test.

""", t, count=1, flags=re.S)
    t = re.sub(r"\*\*Custom scripts\*\*:.*?(?=## Verification workflow)",
        "**Custom scripts**: follow the complete-plugin copy procedure above. Keep custom scripts under that copy's skills/composer/scripts directory so local helper paths remain valid.\n\n", t, count=1, flags=re.S)
    t = t.replace("**Prerequisite**: `playwright` must be installed. See the [Playwright installation](#playwright-installation) section above.",
        "**Prerequisite**: the packaged runtime and installed Chrome must pass [the runtime check](#packaged-playwright-runtime) above.")
    return t
edit("references/composition-scripting/debugging-and-verification.md", debugging)
version = re.search(r"const SKILL_VERSION = (\d+);", (source / "scripts/composer-agent.js").read_text()).group(1)
(root / "source-manifest.json").write_text(json.dumps({"upstreamSkillVersion": int(version), "sourceFiles": inventory}, indent=2) + "\n")
print(f"Packaged {len(inventory)} source files; upstream contract version {version} preserved")
