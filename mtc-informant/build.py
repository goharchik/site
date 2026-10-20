"""Сборка: python3 build.py -> dist/MTC_Informant_<версия>.mcaddon
Проверяет JSON и то, что все звуки из config.js есть в sound_definitions.json."""
import json, re, sys, zipfile
from pathlib import Path

root = Path(__file__).parent
bp, rp = root / 'MTC Informant BP', root / 'MTC Informant RP'
errors = []
for f in list(bp.rglob('*.json')) + list(rp.rglob('*.json')):
    try:
        json.loads(f.read_text(encoding='utf-8'))
    except Exception as e:
        errors.append(f'{f.relative_to(root)}: {e}')

defs = json.loads((rp / 'sounds/sound_definitions.json').read_text(encoding='utf-8'))['sound_definitions']
config = (bp / 'scripts/config.js').read_text(encoding='utf-8')
code = '\n'.join(l for l in config.splitlines() if not l.strip().startswith('//'))
for sid in re.findall(r"id:\s*'(mtcinformant:[^']+)'", code):
    if sid not in defs:
        errors.append(f'config.js: звука {sid} нет в sound_definitions.json')
for sid, d in defs.items():
    for s in d.get('sounds', []):
        name = s['name'] if isinstance(s, dict) else s
        if not any((rp / (name + ext)).exists() for ext in ('.ogg', '.wav', '.fsb')):
            errors.append(f'sound_definitions.json: нет файла для {sid}: {name}.ogg')

if errors:
    print('Ошибки:\n  ' + '\n  '.join(errors))
    sys.exit(1)

version = '.'.join(map(str, json.loads((bp / 'manifest.json').read_text())['header']['version']))
out = root / 'dist' / f'MTC_Informant_{version}.mcaddon'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for pack in (bp, rp):
        for f in sorted(pack.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(root).as_posix())
print(f'Готово: {out.relative_to(root)} ({out.stat().st_size // 1024} КБ)')
