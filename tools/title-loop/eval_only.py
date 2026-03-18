#!/usr/bin/env python3
"""Standalone evaluation script - runs without launching Claude."""
import glob, subprocess, re, unicodedata
from pathlib import Path

INPUT_DIR = Path('tools/title-loop/input')
EXTRACT_SCRIPT = Path('tools/title-loop/extract-title.ts')

def normalize(s):
    return re.sub(r'\s+', ' ', s.strip()).upper()

def normalize_separators(s):
    return s.replace('-', ' ').replace('_', ' ')

def _strip_diacritics(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def _ocr_normalize(s):
    return s.replace('0', 'O').replace('1', 'I').replace('5', 'S')

def titles_match(extracted, expected):
    if not extracted:
        return False
    extracted_norm = _ocr_normalize(_strip_diacritics(normalize_separators(normalize(extracted))))
    expected_parts = [
        _ocr_normalize(_strip_diacritics(normalize_separators(normalize(p))))
        for p in expected.split('+')
    ]
    return all(part in extracted_norm for part in expected_parts)

def extract_expected_title(filename):
    name = Path(filename).name
    cleaned = re.sub(r'\.(real|generated)\.txt$', '', name)
    return cleaned

def run_extraction(file_path):
    result = subprocess.run(
        ['npx', 'tsx', str(EXTRACT_SCRIPT), file_path],
        capture_output=True, text=True, timeout=30, cwd='.'
    )
    if result.returncode != 0:
        return ''
    return result.stdout.strip()

real_files = sorted(glob.glob(str(INPUT_DIR / '*.real.txt')))
gen_files = sorted(glob.glob(str(INPUT_DIR / '*.generated.txt')))

print(f'Real files: {len(real_files)}, Generated files: {len(gen_files)}')

print('\n--- REAL FILES ---')
real_results = []
for fp in real_files:
    expected = extract_expected_title(fp)
    extracted = run_extraction(fp)
    match = titles_match(extracted, expected)
    real_results.append({'expected': expected, 'extracted': extracted, 'match': match})
    status = 'YES' if match else 'NO'
    print(f'  {status}: expected={expected!r} got={extracted!r}')

print('\n--- GENERATED FILES ---')
gen_results = []
for fp in gen_files:
    expected = extract_expected_title(fp)
    extracted = run_extraction(fp)
    match = titles_match(extracted, expected)
    gen_results.append({'expected': expected, 'extracted': extracted, 'match': match})
    status = 'YES' if match else 'NO'
    print(f'  {status}: expected={expected!r} got={extracted!r}')

real_pass = sum(1 for r in real_results if r['match'])
gen_pass = sum(1 for r in gen_results if r['match'])
all_pass = real_pass + gen_pass
total = len(real_results) + len(gen_results)

real_acc = real_pass / len(real_results) if real_results else 0
gen_acc = gen_pass / len(gen_results) if gen_results else 0
combined_acc = all_pass / total if total else 0

print()
print(f'Real: {real_pass}/{len(real_results)} = {real_acc:.1%}')
print(f'Generated: {gen_pass}/{len(gen_results)} = {gen_acc:.1%}')
print(f'Combined: {all_pass}/{total} = {combined_acc:.1%}')

# Show failures
failures = [r for r in real_results + gen_results if not r['match']]
if failures:
    print(f'\nFAILURES ({len(failures)}):')
    for r in failures:
        print(f'  expected={r["expected"]!r} got={r["extracted"]!r}')
else:
    print('\nAll tests passed!')
