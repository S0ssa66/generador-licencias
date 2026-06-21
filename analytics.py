"""Analytics de ventas — módulo extraído de server.py"""
import json
import os
import datetime

DIRECTORY = os.path.dirname(os.path.abspath(__file__))


def get_sales_analytics(user='sossa', period='all'):
    backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
    if not os.path.exists(backup_path):
        return {"error": f"No backup file found for user {user}"}
        
    with open(backup_path, 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
        
    history_str = backup_data.get(f'{user}_license_history', '[]')
    licenses = json.loads(history_str)
    
    now = datetime.datetime.now()
    current_year = now.year
    current_month_prefix = f"{current_year}-{now.month:02d}"
    current_year_prefix = f"{current_year}"
    
    filtered_licenses = []
    for lic in licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
            
        try:
            lic_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
            
        if period == '30':
            diff_days = (now - lic_date).days
            if diff_days <= 30:
                filtered_licenses.append(lic)
        elif period == 'month':
            if date_str.startswith(current_month_prefix):
                filtered_licenses.append(lic)
        elif period == 'year':
            if date_str.startswith(current_year_prefix):
                filtered_licenses.append(lic)
        else:
            filtered_licenses.append(lic)
            
    total_revenue = 0.0
    beats_sold = set()
    buyers_map = {}
    
    for lic in filtered_licenses:
        val = 0.0
        try:
            val = float(lic.get('value', 0))
        except (ValueError, TypeError):
            pass
        total_revenue += val
        
        beat_name = lic.get('beatName')
        if beat_name:
            beats_sold.add(beat_name)
            
        buyer_name = lic.get('buyerName')
        if buyer_name:
            if buyer_name not in buyers_map:
                form_data = lic.get('formData', {})
                email = form_data.get('buyerEmail', '') if isinstance(form_data, dict) else ''
                buyers_map[buyer_name] = {
                    "count": 0,
                    "total": 0.0,
                    "email": email
                }
            buyers_map[buyer_name]["count"] += 1
            buyers_map[buyer_name]["total"] += val
            
    top_buyer_name = 'N/A'
    top_buyer_val = 0.0
    for name, b_info in buyers_map.items():
        if b_info["total"] > top_buyer_val:
            top_buyer_val = b_info["total"]
            top_buyer_name = name
            
    monthly_sales = []
    month_keys = []
    for i in range(5, -1, -1):
        m_offset = now.month - i
        y_offset = now.year
        while m_offset <= 0:
            m_offset += 12
            y_offset -= 1
        month_keys.append((y_offset, m_offset))
        
    month_names_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    
    for y, m in month_keys:
        prefix = f"{y}-{m:02d}"
        label = f"{month_names_es[m-1]}"
        monthly_sales.append({
            "prefix": prefix,
            "label": label,
            "revenue": 0.0,
            "count": 0
        })
        
    for lic in filtered_licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
        lic_prefix = date_str[:7]
        for m_data in monthly_sales:
            if m_data["prefix"] == lic_prefix:
                val = 0.0
                try:
                    val = float(lic.get('value', 0))
                except (ValueError, TypeError):
                    pass
                m_data["revenue"] += val
                m_data["count"] += 1
                
    license_types_count = {}
    for lic in filtered_licenses:
        l_type = lic.get('type') or lic.get('licenseType') or 'basic'
        l_type_title = l_type.capitalize()
        if l_type.lower() == 'basic':
            l_type_title = 'Básica'
        elif l_type.lower() == 'premium':
            l_type_title = 'Premium'
        elif l_type.lower() in ['unlimited', 'unlimited_flp', 'ilimitada']:
            l_type_title = 'Ilimitada'
        elif l_type.lower() == 'exclusive' or l_type.lower() == 'exclusiva':
            l_type_title = 'Exclusiva'
            
        license_types_count[l_type_title] = license_types_count.get(l_type_title, 0) + 1
        
    total_lic_count = len(filtered_licenses)
    license_types = []
    colors_map = {
        "Básica": "#3b82f6",
        "Premium": "#10b981",
        "Ilimitada": "#f59e0b",
        "Exclusiva": "#a855f7"
    }
    
    for l_type, count in license_types_count.items():
        pct = (count / total_lic_count * 100) if total_lic_count > 0 else 0
        license_types.append({
            "type": l_type,
            "count": count,
            "pct": pct,
            "color": colors_map.get(l_type, "#718096")
        })
        
    beats_count = {}
    for lic in filtered_licenses:
        b_name = lic.get('beatName')
        if b_name:
            beats_count[b_name] = beats_count.get(b_name, 0) + 1
            
    top_beats = sorted(
        [{"name": k, "count": v} for k, v in beats_count.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:5]
    
    top_buyers = sorted(
        [
            {
                "name": k,
                "count": v["count"],
                "total": v["total"],
                "email": v["email"]
            }
            for k, v in buyers_map.items()
        ],
        key=lambda x: x["total"],
        reverse=True
    )[:5]
    
    avg_ltv = (total_revenue / len(buyers_map)) if len(buyers_map) > 0 else 0.0
    
    mrr = 0.0
    try:
        # Escanear todos los archivos de respaldo para sumar suscripciones activas
        for filename in os.listdir(DIRECTORY):
            if filename.endswith('_backup_sincronizado.json'):
                path = os.path.join(DIRECTORY, filename)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        b_data = json.load(f)
                    
                    config_str = None
                    for k, v in b_data.items():
                        if k.endswith('_producer_config'):
                            config_str = v
                            break
                            
                    if config_str:
                        config = json.loads(config_str) if isinstance(config_str, str) else config_str
                        plan = str(config.get('plan', '')).lower()
                        if plan == 'pro':
                            mrr += 10.0
                        elif plan == 'elite':
                            mrr += 30.0
                except Exception:
                    continue
    except Exception:
        pass

    return {
        "totalRevenue": total_revenue,
        "totalLicenses": len(filtered_licenses),
        "uniqueBeats": len(beats_sold),
        "topBuyerName": top_buyer_name,
        "topBuyerVal": top_buyer_val,
        "monthlySales": monthly_sales,
        "licenseTypes": license_types,
        "topBeats": top_beats,
        "topBuyers": top_buyers,
        "avgLtv": avg_ltv,
        "mrr": mrr
    }
