#!/usr/bin/env python3
"""Проверяет, что сайт собран без пропусков:
   * каждый файл из index.html (styles/…, scripts/…) существует и есть в CORE у sw.js;
   * в styles/ и scripts/ нет файлов, которые никуда не подключены;
   * в CORE нет лишнего.
   Запуск из корня репозитория: python3 tools/check_site.py"""
import os, re, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
sw = open(os.path.join(root, 'sw.js'), encoding='utf-8').read()

linked = re.findall(r'(?:href|src)="((?:styles|scripts)/[^"]+)"', html)
core_block = re.search(r'const CORE = \[(.*?)\];', sw, re.S)
core = re.findall(r"'\./([^']*)'", core_block.group(1)) if core_block else []
on_disk = sorted(
    os.path.relpath(os.path.join(d, f), root).replace(os.sep, '/')
    for top in ('styles', 'scripts')
    for d, _, fs in os.walk(os.path.join(root, top)) for f in fs
)

errors = []
for f in linked:
    if not os.path.isfile(os.path.join(root, f)): errors.append(f'index.html ссылается на несуществующий файл: {f}')
    if f not in core: errors.append(f'нет в CORE у sw.js: {f}')
for f in on_disk:
    if f not in linked: errors.append(f'файл не подключён в index.html: {f}')
for f in core:
    if f and not os.path.isfile(os.path.join(root, f)): errors.append(f'в CORE у sw.js лишний файл: {f}')
if len(set(linked)) != len(linked): errors.append('в index.html файл подключён дважды')

if errors:
    print('\n'.join(errors)); sys.exit(1)
print(f'ok: {len(linked)} файлов стилей и скриптов, все на месте и в кэше')
