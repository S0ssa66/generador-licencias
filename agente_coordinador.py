#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys

# Re-exponer para compatibilidad con scripts externos
from agent_manager import run_agent_pipeline
from memory_manager import SESSION_MEMORY_FILE, SUBAGENT_MEMORIES_FILE

from llm_utils import (
    C_RESET,
    C_BOLD,
    C_CYAN,
    C_GREEN,
    C_MAGENTA,
    C_YELLOW,
    C_RED,
    C_WHITE,
    C_GRAY,
    C_BLUE
)


def main():
    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}   BEATSS - SISTEMA DE ORQUESTACIÓN MULTI-AGENTE AUTÓNOMO      {C_RESET}")
    print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_GRAY}Gemini API conectada (soporte de 21 subagentes, memorias y search_grep).{C_RESET}")
    print(f"Escribe tus requerimientos. Los agentes recordarán el historial de conversación.")
    print(f"Comandos especiales: {C_GREEN}'limpiar'{C_RESET} (reinicia memorias de sesión y subagentes) o {C_RED}'salir'{C_RESET}.\n")

    while True:
        try:
            user_input = input(f"{C_BOLD}{C_WHITE}Tú: {C_RESET}")
            if user_input.strip().lower() == "salir":
                print(f"\n{C_CYAN}¡Hasta luego!{C_RESET}")
                break
            
            if user_input.strip().lower() in ["limpiar", "reset", "clear"]:
                if os.path.exists(SESSION_MEMORY_FILE):
                    os.remove(SESSION_MEMORY_FILE)
                if os.path.exists(SUBAGENT_MEMORIES_FILE):
                    os.remove(SUBAGENT_MEMORIES_FILE)
                print(f"\n{C_GREEN}✓ Memorias del Agent OS (sesión y subagentes) reiniciadas correctamente.{C_RESET}\n")
                continue
            
            if not user_input.strip():
                continue
            
            # Callback para mostrar los avances en la interfaz CLI
            def cli_progress_callback(msg):
                print(f"{C_CYAN}➔ {msg}{C_RESET}")
                
            final_response = run_agent_pipeline(user_input, cli_progress_callback)
            
            print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
            print(f"{C_CYAN}{C_BOLD}   RESPUESTA DEL DIRECTOR DE PROYECTO (BEATSS)                 {C_RESET}")
            print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
            print(f"{C_WHITE}{final_response}{C_RESET}")
            print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}\n")
            
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n{C_CYAN}Programa finalizado. ¡Hasta luego!{C_RESET}")
            break


if __name__ == "__main__":
    main()
