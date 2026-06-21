import sys
import os
import threading
import time

# Agregar ruta base al path
sys.path.append("/Users/sossa/IA/generador-licencias")

import sri_contingency

def test_sqlite_flow():
    print("[*] Iniciando prueba de la base de datos de contingencia del SRI...")
    
    # 1. Inicializar BD
    sri_contingency.init_db()
    db_path = sri_contingency.DB_PATH
    if os.path.exists(db_path):
        print(f"[+] Base de datos SQLite inicializada correctamente en: {db_path}")
    else:
        print("[-] Error: El archivo de base de datos no existe.")
        sys.exit(1)

    # Limpiar posibles registros previos de prueba
    conn = sri_contingency.sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contingency_queue WHERE purchase_id LIKE 'test_purchase_%'")
    conn.commit()
    conn.close()

    # 2. Guardar facturas de prueba
    print("[*] Guardando comprobantes de prueba...")
    sri_contingency.save_to_queue(
        purchase_id="test_purchase_1",
        user_uid="test_user_123",
        xml_firmado="<xml>factura_firmada_1</xml>",
        clave_acceso="1234567890123456789012345678901234567890123456789",
        secuencial=1,
        status="PENDING_RECEPCION",
        error_msg="Error de red simulado en recepción"
    )

    sri_contingency.save_to_queue(
        purchase_id="test_purchase_2",
        user_uid="test_user_123",
        xml_firmado="<xml>factura_firmada_2</xml>",
        clave_acceso="9876543210987654321098765432109876543210987654321",
        secuencial=2,
        status="PENDING_AUTORIZACION",
        error_msg="Error de red simulado en autorizacion"
    )

    # 3. Obtener pendientes y verificar
    pending = sri_contingency.get_pending()
    test_pending = [item for item in pending if item["purchase_id"].startswith("test_purchase_")]
    print(f"[+] Comprobantes de prueba pendientes encontrados: {len(test_pending)}")
    for item in test_pending:
        print(f"    - ID: {item['purchase_id']}, Secuencial: {item['secuencial']}, Estado: {item['status']}, Intentos: {item['attempts']}")

    assert len(test_pending) == 2, "Deberían haber exactamente 2 facturas de prueba pendientes."

    # 4. Incrementar intentos
    print("[*] Incrementando intentos para test_purchase_1...")
    sri_contingency.mark_attempt("test_purchase_1", "Segundo error de red simulado")
    
    pending = sri_contingency.get_pending()
    test_pending = [item for item in pending if item["purchase_id"].startswith("test_purchase_")]
    p1 = next(item for item in test_pending if item["purchase_id"] == "test_purchase_1")
    print(f"[+] Intentos para test_purchase_1 actualizados a: {p1['attempts']}")
    assert p1["attempts"] == 1, "Los intentos para test_purchase_1 deberían ser 1."

    # 5. Eliminar de la cola (simulando éxito)
    print("[*] Eliminando test_purchase_2 de la cola...")
    sri_contingency.remove_from_queue("test_purchase_2")
    
    pending = sri_contingency.get_pending()
    test_pending = [item for item in pending if item["purchase_id"].startswith("test_purchase_")]
    print(f"[+] Comprobantes de prueba restantes: {len(test_pending)}")
    assert len(test_pending) == 1, "Debería quedar exactamente 1 comprobante de prueba en la cola."
    assert test_pending[0]["purchase_id"] == "test_purchase_1", "La factura restante debería ser test_purchase_1."

    # Limpiar base de datos tras la prueba exitosa
    conn = sri_contingency.sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contingency_queue WHERE purchase_id = 'test_purchase_1'")
    conn.commit()
    conn.close()

    print("[✅] Prueba de flujo de base de datos completada exitosamente!")

def test_thread_safety():
    print("[*] Iniciando prueba de concurrencia y thread-safety...")
    
    sri_contingency.init_db()
    db_path = sri_contingency.DB_PATH

    num_threads = 10
    num_inserts_per_thread = 5
    threads = []

    def worker(thread_idx):
        for i in range(num_inserts_per_thread):
            pid = f"test_purchase_thread_{thread_idx}_{i}"
            sri_contingency.save_to_queue(
                purchase_id=pid,
                user_uid="thread_user",
                xml_firmado="<xml>thread_xml</xml>",
                clave_acceso=f"clave_{thread_idx}_{i}",
                secuencial=i,
                status="PENDING_RECEPCION",
                error_msg="thread error"
            )
            time.sleep(0.01)

    # Crear e iniciar hilos
    for t_idx in range(num_threads):
        t = threading.Thread(target=worker, args=(t_idx,))
        threads.append(t)
        t.start()

    # Esperar a que terminen
    for t in threads:
        t.join()

    # Contar cuántas se guardaron
    pending = sri_contingency.get_pending()
    thread_pending = [item for item in pending if item["purchase_id"].startswith("test_purchase_thread_")]
    expected = num_threads * num_inserts_per_thread
    print(f"[+] Hilos completados. Comprobantes insertados concurrentemente: {len(thread_pending)} / {expected}")
    
    # Limpiar registros
    conn = sri_contingency.sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contingency_queue WHERE purchase_id LIKE 'test_purchase_thread_%'")
    conn.commit()
    conn.close()

    assert len(thread_pending) == expected, f"Deberían haber {expected} registros guardados concurrentemente."
    print("[✅] Prueba de thread-safety de base de datos completada exitosamente!")

if __name__ == "__main__":
    test_sqlite_flow()
    test_thread_safety()
