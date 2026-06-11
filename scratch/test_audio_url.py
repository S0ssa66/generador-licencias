import requests

url = "https://docs.google.com/uc?export=download&id=13avdUPihfoO-dWFoaJ8Q4vThbdWKthQ1"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

try:
    print(f"Fetching: {url}")
    response = requests.get(url, headers=headers, allow_redirects=True, stream=True)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    
    # Print the first 100 bytes or content type
    content_type = response.headers.get('Content-Type', '')
    print(f"Content-Type: {content_type}")
    
    if 'text/html' in content_type:
        print("Wait, this is an HTML page!")
        # Print the first 1000 characters
        print(response.text[:1000])
    else:
        print("Success! Got binary data.")
except Exception as e:
    print(f"Error: {e}")
