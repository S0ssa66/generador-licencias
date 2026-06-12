import os
import json
import urllib.request
import urllib.parse
import urllib.error

def get_token():
    path = os.path.expanduser('~/.config/configstore/firebase-tools.json')
    if not os.path.exists(path):
        raise FileNotFoundError("Firebase credentials file not found.")
    
    with open(path, 'r') as f:
        data = json.load(f)
    
    tokens = data.get('tokens', {})
    access_token = tokens.get('access_token')
    refresh_token = tokens.get('refresh_token')
    
    return access_token, refresh_token

def refresh_token_if_needed(refresh_token):
    client_id = "563577306548-6eb303cj7c92s1kr4ntodclslod8g969.apps.googleusercontent.com"
    client_secret = "MWbt7432746473647347377"
    
    url = "https://oauth2.googleapis.com/token"
    data = urllib.parse.urlencode({
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token'
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data)
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            return res_data.get('access_token')
    except Exception as e:
        print("Failed to refresh token:", e)
        return None

def query_beats(access_token):
    url = "https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents:runQuery"
    
    body = {
        "structuredQuery": {
            "from": [
                {
                    "collectionId": "beats",
                    "allDescendants": True
                }
            ]
        }
    }
    
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {access_token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            beats = []
            for item in res_data:
                doc = item.get('document')
                if not doc:
                    continue
                name_path = doc.get('name', '')
                fields = doc.get('fields', {})
                parsed_fields = {}
                for k, v in fields.items():
                    val_type = list(v.keys())[0]
                    parsed_fields[k] = v[val_type]
                beats.append({
                    'path': name_path,
                    'fields': parsed_fields
                })
            return True, beats
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        return False, f"HTTP {e.code}: {body_err}"
    except Exception as e:
        return False, str(e)

def main():
    try:
        access_token, refresh_token = get_token()
        success, beats = query_beats(access_token)
        if not success and "HTTP 401" in str(beats):
            print("Token expired. Refreshing...")
            access_token = refresh_token_if_needed(refresh_token)
            if access_token:
                success, beats = query_beats(access_token)
        
        if success:
            print(f"Total beats documents found: {len(beats)}")
            for idx, beat in enumerate(beats):
                print(f"\n--- Beat {idx + 1} ---")
                print(f"Path: {beat['path']}")
                print(f"Data: {json.dumps(beat['fields'], indent=2)}")
        else:
            print(f"Error querying beats: {beats}")
            
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
