import requests

url = "https://drive.google.com/uc?export=download&id=13avdUPihfoO-dWFoaJ8Q4vThbdWKthQ1"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

try:
    print(f"Fetching: {url}")
    response = requests.get(url, headers=headers, allow_redirects=True, stream=True)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"Content-Type: {response.headers.get('Content-Type', '')}")
except Exception as e:
    print(f"Error: {e}")
