"""Validate this repository's local-source plugin catalog with the Python stdlib."""

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    catalog = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text(encoding='utf-8'))
    require(re.fullmatch(r'[A-Za-z0-9_-]+', catalog['name']), 'Invalid marketplace name')
    require(catalog['interface']['displayName'].strip(), 'Missing marketplace display name')
    require(isinstance(catalog['plugins'], list) and catalog['plugins'], 'Catalog must contain plugins')
    seen = set()
    for entry in catalog['plugins']:
        name = entry['name']
        require(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name), f'Invalid plugin name: {name}')
        require(name not in seen, f'Duplicate plugin: {name}')
        seen.add(name)
        require(entry['source'] == {'source': 'local', 'path': f'./plugins/{name}'}, f'{name}: invalid source')
        require(entry['policy']['installation'] in {'AVAILABLE', 'NOT_AVAILABLE', 'INSTALLED_BY_DEFAULT'}, f'{name}: invalid installation policy')
        require(entry['policy']['authentication'] in {'ON_INSTALL', 'ON_USE'}, f'{name}: invalid authentication policy')
        require(entry['category'].strip(), f'{name}: missing category')
        plugin = (ROOT / 'plugins' / name).resolve()
        require(plugin.is_relative_to(ROOT), f'{name}: source escapes repository')
        manifest = json.loads((plugin / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
        require(manifest['name'] == name, f'{name}: manifest name mismatch')
        require(manifest['version'].strip(), f'{name}: missing version')
        require(manifest['description'].strip(), f'{name}: missing description')
        if 'skills' in manifest:
            skills = (plugin / manifest['skills']).resolve()
            require(skills.is_relative_to(plugin), f'{name}: skills path escapes plugin')
            require(skills.is_dir() and any(skills.glob('*/SKILL.md')), f'{name}: missing skills')
        runtime = plugin / 'runtime'
        if (runtime / 'package.json').exists():
            package = json.loads((runtime / 'package.json').read_text(encoding='utf-8'))
            lock = json.loads((runtime / 'package-lock.json').read_text(encoding='utf-8'))
            for dependency, version in package.get('dependencies', {}).items():
                bundled = runtime / 'node_modules' / dependency
                installed = json.loads((bundled / 'package.json').read_text(encoding='utf-8'))
                require(installed['version'] == version, f'{name}: bundled version mismatch for {dependency}')
                require(lock['packages'][f'node_modules/{dependency}']['version'] == version, f'{name}: lockfile mismatch for {dependency}')
                require(any(p.name.upper().startswith(('LICENSE', 'COPYING')) for p in bundled.iterdir()), f'{name}: missing dependency license for {dependency}')
        print(f'OK {name} {manifest["version"]}')
    print(f'Validated {len(seen)} plugin(s) in {catalog["name"]}.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f'Validation failed: {error}', file=sys.stderr)
        sys.exit(1)
