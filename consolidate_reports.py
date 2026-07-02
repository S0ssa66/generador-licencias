#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import csv
import glob

def main():
    print("=" * 60)
    # Buscamos todos los archivos *_backup_sincronizado.json en el directorio actual
    backup_files = glob.glob("*_backup_sincronizado.json")
    
    if not backup_files:
        print("[-] No se encontraron archivos de respaldo (*_backup_sincronizado.json).")
        return
        
    print(f"[+] Procesando {len(backup_files)} archivo(s) de respaldo...")
    
    all_producers_stats = []
    global_transactions = []
    
    for file_path in backup_files:
        filename = os.path.basename(file_path)
        prefix = filename.replace("_backup_sincronizado.json", "")
        print(f"\n➔ Leyendo respaldo de: {prefix.upper()} ({filename})")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  [!] Error al abrir {filename}: {e}")
            continue
            
        # Extraer configuración y licencias
        config_key = f"{prefix}_producer_config"
        history_key = f"{prefix}_license_history"
        
        # En caso de que no use el prefijo sino el UID en local (hacemos un fallback buscando las llaves que terminen con config e history)
        if config_key not in data:
            for k in data.keys():
                if k.endswith("_producer_config"):
                    config_key = k
                    break
        if history_key not in data:
            for k in data.keys():
                if k.endswith("_license_history"):
                    history_key = k
                    break
                    
        config_str = data.get(config_key, "{}")
        history_str = data.get(history_key, "[]")
        
        # Parsear
        try:
            config = json.loads(config_str) if isinstance(config_str, str) else config_str
        except Exception:
            config = {}
            
        try:
            history = json.loads(history_str) if isinstance(history_str, str) else history_str
        except Exception:
            history = []
            
        producer_name = config.get("name", "N/A")
        producer_aka = config.get("aka", prefix.capitalize())
        producer_email = config.get("email", "N/A")
        producer_phone = config.get("phone", "N/A")
        producer_plan = config.get("plan", "inicial").upper()
        
        print(f"  Productor: {producer_name} ({producer_aka})")
        print(f"  Plan: {producer_plan} | Licencias en historial: {len(history)}")
        
        # Métricas individuales
        total_revenue = 0.0
        beats_sales = {}
        buyer_ltv = {}
        payment_methods = {}
        license_types = {}
        
        for item in history:
            # Sumar ingresos
            val = item.get("value")
            try:
                price = float(val) if val is not None else 0.0
            except (ValueError, TypeError):
                price = 0.0
            total_revenue += price
            
            # Beat más vendido
            beat = item.get("beatName", "Desconocido")
            beats_sales[beat] = beats_sales.get(beat, 0) + 1
            
            # Comprador LTV
            buyer = item.get("buyerName", "Desconocido")
            buyer_ltv[buyer] = buyer_ltv.get(buyer, 0.0) + price
            
            # Métodos de pago
            method = item.get("paymentMethod", "Transferencia Bancaria")
            payment_methods[method] = payment_methods.get(method, 0) + 1
            
            # Tipos de licencias
            lic_type = item.get("type", "basic").upper()
            license_types[lic_type] = license_types.get(lic_type, 0) + 1
            
            # Transacción unificada global
            fd = item.get("formData", {})
            global_transactions.append({
                "Productor": producer_aka,
                "Referencia": item.get("refCode", ""),
                "Fecha": item.get("date", ""),
                "Beat": beat,
                "Comprador": buyer,
                "Cedula_DNI": fd.get("buyerId", item.get("buyerId", "")),
                "Email": fd.get("buyerEmail", item.get("buyerEmail", "")),
                "Telefono": fd.get("buyerPhone", item.get("buyerPhone", "")),
                "Ciudad": fd.get("buyerCity", item.get("buyerCity", "")),
                "Pais": fd.get("buyerCountry", item.get("buyerCountry", "")),
                "Tipo_Licencia": lic_type,
                "Valor_USD": price,
                "Metodo_Pago": method
            })
            
        avg_value = total_revenue / len(history) if history else 0.0
        
        top_beat = "N/A"
        if beats_sales:
            top_beat = sorted(beats_sales.items(), key=lambda x: x[1], reverse=True)[0][0]
            
        top_buyer = "N/A"
        if buyer_ltv:
            best_buyer, best_val = sorted(buyer_ltv.items(), key=lambda x: x[1], reverse=True)[0]
            top_buyer = f"{best_buyer} (${best_val:.2f})"
            
        producer_stats = {
            "prefix": prefix,
            "aka": producer_aka,
            "name": producer_name,
            "email": producer_email,
            "phone": producer_phone,
            "plan": producer_plan,
            "total_licenses": len(history),
            "total_revenue": total_revenue,
            "avg_value": avg_value,
            "top_beat": top_beat,
            "top_buyer": top_buyer,
            "payment_methods": payment_methods,
            "license_types": license_types
        }
        
        all_producers_stats.append(producer_stats)
        
    # --- EXPORTAR ARCHIVOS ---
    
    # 1. reporte_consolidado_productores.csv
    csv_prod_path = "reporte_consolidado_productores.csv"
    try:
        with open(csv_prod_path, "w", newline="", encoding="utf-8-sig") as f: # utf-8-sig añade BOM para Excel
            writer = csv.writer(f)
            writer.writerow(["Productor", "Nombre Real", "Email", "Telefono", "Plan", "Total Licencias", "Ingresos Totales (USD)", "Valor Promedio (USD)", "Beat Mas Vendido", "Cliente Estrella (LTV)"])
            for p in all_producers_stats:
                writer.writerow([
                    p["aka"], p["name"], p["email"], p["phone"], p["plan"],
                    p["total_licenses"], f"{p['total_revenue']:.2f}", f"{p['avg_value']:.2f}",
                    p["top_beat"], p["top_buyer"]
                ])
        print(f"\n[+] Archivo creado: {csv_prod_path}")
    except Exception as e:
        print(f"[!] Error al escribir {csv_prod_path}: {e}")
        
    # 2. transacciones_consolidadas_globales.csv
    csv_trans_path = "transacciones_consolidadas_globales.csv"
    try:
        with open(csv_trans_path, "w", newline="", encoding="utf-8-sig") as f:
            if global_transactions:
                writer = csv.DictWriter(f, fieldnames=global_transactions[0].keys())
                writer.writeheader()
                writer.writerows(global_transactions)
            else:
                writer = csv.writer(f)
                writer.writerow(["Mensaje"])
                writer.writerow(["No hay transacciones registradas"])
        print(f"[+] Archivo creado: {csv_trans_path}")
    except Exception as e:
        print(f"[!] Error al escribir {csv_trans_path}: {e}")
        
    # 3. reporte_consolidado_productores.md
    md_report_path = "reporte_consolidado_productores.md"
    try:
        with open(md_report_path, "w", encoding="utf-8") as f:
            f.write("# 📈 Reporte Consolidado Global de Productores — BEATSS\n\n")
            f.write("Este informe consolida las estadísticas contables recopiladas de los respaldos locales sincronizados de los productores musicales.\n\n")
            
            # Tabla Resumen General
            f.write("## 📊 Resumen de Rendimiento General\n\n")
            f.write("| Productor (AKA) | Nombre Real | Plan | Total Licencias | Ingresos Totales | Ticket Promedio | Beat Más Vendido |\n")
            f.write("| --- | --- | --- | --- | --- | --- | --- |\n")
            
            grand_total_revenue = 0.0
            grand_total_licenses = 0
            
            for p in all_producers_stats:
                f.write(f"| **{p['aka']}** | {p['name']} | `{p['plan']}` | {p['total_licenses']} | **${p['total_revenue']:.2f}** | ${p['avg_value']:.2f} | *{p['top_beat']}* |\n")
                grand_total_revenue += p["total_revenue"]
                grand_total_licenses += p["total_licenses"]
                
            f.write(f"| **TOTAL GLOBAL** | - | - | **{grand_total_licenses}** | **${grand_total_revenue:.2f}** | **${(grand_total_revenue/grand_total_licenses if grand_total_licenses else 0.0):.2f}** | - |\n\n")
            
            # Desglose Individual por Productor
            f.write("## 👤 Detalle por Productor\n\n")
            for p in all_producers_stats:
                f.write(f"### 🎵 {p['aka']} ({p['name']})\n")
                f.write(f"*   **Email:** {p['email']}\n")
                f.write(f"*   **Teléfono:** {p['phone']}\n")
                f.write(f"*   **Plan Activo:** `{p['plan']}`\n")
                f.write(f"*   **Licencias Generadas:** {p['total_licenses']}\n")
                f.write(f"*   **Ingresos Acumulados:** ${p['total_revenue']:.2f} USD\n")
                f.write(f"*   **Valor Promedio Transacción:** ${p['avg_value']:.2f} USD\n")
                f.write(f"*   **Beat Más Vendido:** *{p['top_beat']}*\n")
                f.write(f"*   **Cliente Estrella (LTV):** {p['top_buyer']}\n\n")
                
                # Distribución de Licencias
                f.write("#### Distribución de Licencias:\n")
                if p["license_types"]:
                    f.write("| Tipo de Licencia | Cantidad |\n")
                    f.write("| --- | --- |\n")
                    for k, v in sorted(p["license_types"].items(), key=lambda x: x[1], reverse=True):
                        f.write(f"| {k} | {v} |\n")
                else:
                    f.write("*Sin datos*\n")
                f.write("\n")
                
                # Métodos de Pago
                f.write("#### Métodos de Pago utilizados:\n")
                if p["payment_methods"]:
                    f.write("| Método de Pago | Transacciones |\n")
                    f.write("| --- | --- |\n")
                    for k, v in sorted(p["payment_methods"].items(), key=lambda x: x[1], reverse=True):
                        f.write(f"| {k} | {v} |\n")
                else:
                    f.write("*Sin datos*\n")
                f.write("\n---\n\n")
                
        print(f"[+] Archivo creado: {md_report_path}")
    except Exception as e:
        print(f"[!] Error al escribir {md_report_path}: {e}")
        
    print("\n" + "=" * 60)
    print("[+] ¡Procesamiento completado con éxito!")
    print("=" * 60)

if __name__ == "__main__":
    main()
