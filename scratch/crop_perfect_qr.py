from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
with Image.open(img_path) as img:
    # Crop coordinates: Left=210, Top=235, Right=389, Bottom=414
    # This yields a perfect 179x179 square around the QR code, with standard padding.
    crop_box = (210, 235, 389, 414)
    cropped_img = img.crop(crop_box)
    cropped_img.save('/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg')
    print("Cropped perfect QR square successfully!")
