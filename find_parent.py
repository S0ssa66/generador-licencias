import re

with open('/Users/sossa/IA/generador-licencias/index.html', 'r') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    # This is a very naive HTML parser just to get an idea
    if '<div' in line:
        # Find all <div
        count = len(re.findall(r'<div\b', line))
        for _ in range(count):
            stack.append(i+1)
            
    if 'id="login-modal"' in line:
        print(f"login-modal found at line {i+1}")
        print(f"Current stack depth: {len(stack)}")
        print(f"Parent div started at line: {stack[-2] if len(stack) > 1 else 'None'}")
        
    if '</div' in line:
        count = len(re.findall(r'</div', line))
        for _ in range(count):
            if stack:
                stack.pop()

