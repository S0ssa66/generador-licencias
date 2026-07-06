from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
with Image.open(img_path) as img:
    width, height = img.size
    gray = img.convert('L')
    
    # Let's count vertical and horizontal transitions in the center of the image.
    # A transition is defined as a pixel value changing from light (>180) to dark (<100) or vice versa.
    
    # We restrict our search to the horizontal range of the white card (x from 150 to 450)
    # and vertical range (y from 200 to 600)
    left_x, right_x = 150, 450
    top_y, bottom_y = 200, 600
    
    # Calculate transitions per row
    row_transitions = []
    for y in range(top_y, bottom_y):
        transitions = 0
        for x in range(left_x + 1, right_x):
            p1 = gray.getpixel((x - 1, y))
            p2 = gray.getpixel((x, y))
            # If we cross from dark to light or light to dark
            if (p1 < 100 and p2 > 150) or (p1 > 150 and p2 < 100):
                transitions += 1
        row_transitions.append((y, transitions))
        
    # Calculate transitions per column
    col_transitions = []
    for x in range(left_x, right_x):
        transitions = 0
        for y in range(top_y + 1, bottom_y):
            p1 = gray.getpixel((x, y - 1))
            p2 = gray.getpixel((x, y))
            if (p1 < 100 and p2 > 150) or (p1 > 150 and p2 < 100):
                transitions += 1
        col_transitions.append((x, transitions))
        
    # Let's filter rows and columns that have a high number of transitions (e.g., > 10 transitions)
    active_rows = [y for y, t in row_transitions if t > 12]
    active_cols = [x for x, t in col_transitions if t > 12]
    
    if active_rows and active_cols:
        qr_top = min(active_rows)
        qr_bottom = max(active_rows)
        qr_left = min(active_cols)
        qr_right = max(active_cols)
        
        print(f"Transitions-based QR Code Detection:")
        print(f"Left={qr_left}, Top={qr_top}, Right={qr_right}, Bottom={qr_bottom}")
        print(f"Size: {qr_right - qr_left}x{qr_bottom - qr_top}")
        
        # Add a 15px padding for the quiet zone
        pad = 15
        crop_box = (
            max(0, qr_left - pad),
            max(0, qr_top - pad),
            min(width, qr_right + pad),
            min(height, qr_bottom + pad)
        )
        
        cropped_img = img.crop(crop_box)
        cropped_img.save('/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg')
        print("Cropped and saved perfectly!")
    else:
        print("Could not detect high-transition areas.")
