import re
with open('/Users/sossa/IA/generador-licencias/index.html', 'r') as f:
    lines = f.readlines()
stack = []
for i, line in enumerate(lines):
    count_open = len(re.findall(r'<div\b', line))
    count_close = len(re.findall(r'</div', line))
    for _ in range(count_open):
        stack.append(i+1)
    for _ in range(count_close):
        if stack:
            popped = stack.pop()
            if popped == 206:
                print(f"landing-page closed at line {i+1}")
