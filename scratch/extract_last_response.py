import json
import os

memory_path = '/Users/sossa/IA/generador-licencias/session_memory.json'
output_path = '/Users/sossa/IA/generador-licencias/scratch/last_security_response.md'

if os.path.exists(memory_path):
    with open(memory_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if data:
        last_turn = data[-1]
        asistente_content = last_turn.get('asistente', 'No response found.')
        with open(output_path, 'w', encoding='utf-8') as out_f:
            out_f.write(asistente_content)
        print(f"Successfully extracted last response to {output_path}")
    else:
        print("Data is empty.")
else:
    print("Memory path does not exist.")
