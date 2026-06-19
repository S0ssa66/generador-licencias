import os
import sys

# Asegurar que el directorio del proyecto esté en el path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import agente_coordinador

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    prompts_dir = os.path.join(base_dir, "prompts")
    subagents_dir = os.path.join(prompts_dir, "subagents")
    
    os.makedirs(subagents_dir, exist_ok=True)
    print(f"Directorio de prompts creado en: {prompts_dir}")
    
    # 1. Guardar Router Prompt
    router_path = os.path.join(prompts_dir, "router_agent.txt")
    with open(router_path, "w", encoding="utf-8") as f:
        f.write(agente_coordinador.ROUTER_AGENT_PROMPT.strip())
    print(f"✓ Guardado: {router_path}")
    
    # 2. Guardar Main Agent Prompt
    main_path = os.path.join(prompts_dir, "main_agent.txt")
    with open(main_path, "w", encoding="utf-8") as f:
        f.write(agente_coordinador.MAIN_AGENT_PROMPT.strip())
    print(f"✓ Guardado: {main_path}")
    
    # 3. Guardar Subagent Base Prompt
    base_path = os.path.join(prompts_dir, "subagent_base.txt")
    with open(base_path, "w", encoding="utf-8") as f:
        f.write(agente_coordinador.SUBAGENT_BASE_PROMPT.strip())
    print(f"✓ Guardado: {base_path}")
    
    # 4. Guardar Synthesis Prompt
    synthesis_path = os.path.join(prompts_dir, "synthesis.txt")
    with open(synthesis_path, "w", encoding="utf-8") as f:
        f.write(agente_coordinador.SYNTHESIS_PROMPT.strip())
    print(f"✓ Guardado: {synthesis_path}")
    
    # 5. Guardar cada uno de los subagentes
    for rol, prompt in agente_coordinador.SUBAGENT_PROMPTS.items():
        rol_clean = rol.lower().strip()
        subagent_path = os.path.join(subagents_dir, f"{rol_clean}.txt")
        with open(subagent_path, "w", encoding="utf-8") as f:
            f.write(prompt.strip())
        print(f"  [Subagent] ✓ Guardado: {rol_clean}.txt")
        
    print("\n¡Todos los prompts han sido extraídos exitosamente!")

if __name__ == "__main__":
    main()
