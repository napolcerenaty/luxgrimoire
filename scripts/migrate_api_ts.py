import re

path = r'C:\Users\renat\Documents\luxgrimoire\apps\web\src\lib\api.ts'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

skip_patterns = [
    re.compile(r"localStorage\.getItem\('luxgrimoire_token'\)"),
    re.compile(r"if\s*\(!token\)"),
    re.compile(r"Authorization:\s*`Bearer"),
    re.compile(r"headers:\s*\{\s*Authorization"),
    re.compile(r"^\s*\.\.\.\(token"),
]

output = []
i = 0
while i < len(lines):
    line = lines[i]

    # Skip lines that match token patterns
    should_skip = any(p.search(line) for p in skip_patterns)
    if should_skip:
        i += 1
        continue

    # Add credentials:include after "await fetch(..., {"
    stripped = line.rstrip()
    if re.search(r'await fetch\(', stripped) and stripped.endswith(', {'):
        output.append(line)
        if i + 1 < len(lines):
            next_line = lines[i + 1]
            indent = len(next_line) - len(next_line.lstrip())
            output.append(' ' * indent + "credentials: 'include',\n")
        i += 1
        continue

    output.append(line)
    i += 1

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(output)

print('Done. Lines:', len(lines), '->', len(output))
