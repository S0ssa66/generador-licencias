from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
try:
    with Image.open(img_path) as img:
        print(f"Dimensions: {img.width}x{img.height}, Mode: {img.mode}")
except Exception as e:
    print(f"Error: {e}")
