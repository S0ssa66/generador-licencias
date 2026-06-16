#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os

PROJECT_DIR = "/Users/sossa/IA/generador-licencias"
OBSIDIAN_DIR = "/Users/sossa/Documents/COSAS DE IA/BeatSS"

MAX_CODE_SIZE_KB = 20.0
MAX_NOTE_SIZE_KB = 10.0

C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_RED = "\033[31m"
C_GREEN = "\033[32m"
C_YELLOW = "\033[33m"
C_CYAN = "\033[36m"
C_GRAY = "\033[90m"

def check_files():
    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}   BEATSS - AUDITORÍA DE TAMAÑO DE ARCHIVOS (TOKENS)            {C_RESET}")
    print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")

    large_code_files = []
    large_notes = []

    # 1. Auditar archivos de código en el proyecto
    print(f"\n{C_BOLD}🔍 Analizando archivos de código en: {PROJECT_DIR}...{C_RESET}")
    for root, dirs, files in os.walk(PROJECT_DIR):
        # Evitar directorios ruidosos
        if any(d in root for d in [".git", "node_modules", ".venv", ".vercel", "dist"]):
            continue
            
        for file in files:
            if file.endswith((".js", ".html", ".css", ".py", ".rules")):
                file_path = os.path.join(root, file)
                size_kb = os.path.getsize(file_path) / 1024.0
                
                if size_kb > MAX_CODE_SIZE_KB:
                    large_code_files.append((file, size_kb, file_path))

    if large_code_files:
        print(f"\n{C_RED}⚠️  Archivos de código que superan el límite sugerido ({MAX_CODE_SIZE_KB} KB):{C_RESET}")
        for file, size, path in sorted(large_code_files, key=lambda x: x[1], reverse=True):
            rel_path = os.path.relpath(path, PROJECT_DIR)
            print(f"  ❌ {C_YELLOW}{rel_path}{C_RESET} - {C_BOLD}{size:.1f} KB{C_RESET}")
        print(f"\n{C_GRAY}👉 Recomendación: Divide estos archivos en submódulos para ahorrar miles de tokens por lectura.{C_RESET}")
    else:
        print(f"  ✅ Todos los archivos de código están dentro del límite ({MAX_CODE_SIZE_KB} KB).")

    # 2. Auditar notas en el vault de Obsidian
    if os.path.exists(OBSIDIAN_DIR):
        print(f"\n{C_BOLD}🔍 Analizando notas de Obsidian en: {OBSIDIAN_DIR}...{C_RESET}")
        for root, dirs, files in os.walk(OBSIDIAN_DIR):
            if ".obsidian" in root:
                continue
            for file in files:
                if file.endswith(".md"):
                    file_path = os.path.join(root, file)
                    size_kb = os.path.getsize(file_path) / 1024.0
                    
                    if size_kb > MAX_NOTE_SIZE_KB:
                        large_notes.append((file, size_kb, file_path))

        if large_notes:
            print(f"\n{C_RED}⚠️  Notas de Obsidian que superan el límite sugerido ({MAX_NOTE_SIZE_KB} KB):{C_RESET}")
            for file, size, path in sorted(large_notes, key=lambda x: x[1], reverse=True):
                rel_path = os.path.relpath(path, OBSIDIAN_DIR)
                print(f"  ❌ {C_YELLOW}{rel_path}{C_RESET} - {C_BOLD}{size:.1f} KB{C_RESET}")
            print(f"\n{C_GRAY}👉 Recomendación: Divide estas notas en notas secundarias vinculadas para mantener la atomicidad.{C_RESET}")
        else:
            print(f"  ✅ Todas las notas de Obsidian están dentro del límite ({MAX_NOTE_SIZE_KB} KB).")
    else:
        print(f"\n⚠️  No se encontró la bóveda de Obsidian en {OBSIDIAN_DIR}")

    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}\n")

if __name__ == "__main__":
    check_files()
