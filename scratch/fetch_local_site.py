import urllib.request
import urllib.error

try:
    url = "http://127.0.0.1:5173/?catalogo=1"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    print("✅ Successfully fetched 127.0.0.1:5173")
    if "Stitch Redesign" in html:
        print("🎉 The server is serving the NEW Stitch design!")
    else:
        print("❌ The server is serving the OLD design!")
        # Print a snippet of the modal-backdrop from what it served
        idx = html.find('id="beat-checkout-modal"')
        if idx != -1:
            print("Modal snippet from server:", html[max(0, idx-100):idx+300])
        else:
            print("Could not find beat-checkout-modal in served HTML.")
except urllib.error.URLError as e:
    print(f"❌ Failed to connect to server: {e}")
except Exception as e:
    print(f"💥 Error: {e}")
