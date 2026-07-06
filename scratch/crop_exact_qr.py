from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
with Image.open(img_path) as img:
    width, height = img.size
    gray = img.convert('L')
    
    # We know the white card is roughly in: Left=149, Top=252, Right=446, Bottom=549
    # Let's inspect this region and find the boundaries of the black pixels (values < 100)
    # to locate the exact QR code square.
    left_bound, right_bound = 149, 446
    top_bound, bottom_bound = 252, 549
    
    black_pixels = []
    for y in range(top_bound, bottom_bound):
        for x in range(left_bound, right_bound):
            if gray.getpixel((x, y)) < 80: # Dark pixels
                black_pixels.append((x, y))
                
    if black_pixels:
        xs = [p[0] for p in black_pixels]
        ys = [p[1] for p in black_pixels]
        
        qr_left = min(xs)
        qr_right = max(xs)
        qr_top = min(ys)
        qr_bottom = max(ys)
        
        print(f"Detected QR Code: Left={qr_left}, Top={qr_top}, Right={qr_right}, Bottom={qr_bottom}")
        print(f"QR Size: {qr_right - qr_left}x{qr_bottom - qr_top}")
        
        # Add some padding around the QR code (e.g. 15 pixels of white margin so scanners read it easily)
        pad = 15
        crop_box = (
            max(0, qr_left - pad),
            max(0, qr_top - pad),
            min(width, qr_right + pad),
            min(height, qr_bottom + pad)
        )
        
        cropped_img = img.crop(crop_box)
        cropped_img.save('/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg')
        print("Successfully cropped and saved the exact QR code!")
    else:
        print("No black pixels found in the specified range.")
