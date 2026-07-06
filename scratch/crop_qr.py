from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
with Image.open(img_path) as img:
    width, height = img.size
    # Convert to grayscale to easily detect the white QR container
    gray = img.convert('L')
    
    # We know the QR code is in the middle, surrounded by purple.
    # Let's look for a square of high intensity (white) in the middle 30% to 70% of height and width.
    min_x, max_x = int(width * 0.25), int(width * 0.75)
    min_y, max_y = int(height * 0.3), int(height * 0.7)
    
    # Let's find pixels that are very bright (e.g. value > 240)
    white_pixels = []
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            if gray.getpixel((x, y)) > 240:
                white_pixels.append((x, y))
                
    if white_pixels:
        xs = [p[0] for p in white_pixels]
        ys = [p[1] for p in white_pixels]
        
        # The bounding box of the white area
        left = min(xs)
        right = max(xs)
        top = min(ys)
        bottom = max(ys)
        
        print(f"Detected White Square: Left={left}, Top={top}, Right={right}, Bottom={bottom}")
        print(f"Size: {right - left}x{bottom - top}")
        
        # Crop with some small padding (e.g. 5 pixels)
        pad = 5
        crop_box = (
            max(0, left - pad),
            max(0, top - pad),
            min(width, right + pad),
            min(height, bottom + pad)
        )
        
        cropped_img = img.crop(crop_box)
        cropped_img.save('/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg')
        print("Successfully cropped and saved deuna-qr.jpg!")
    else:
        print("No white pixels detected in the center region.")
