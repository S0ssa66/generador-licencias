import cv2
import numpy as np

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
try:
    img = cv2.imread(img_path)
    detector = cv2.QRCodeDetector()
    data, bbox, straight_qrcode = detector.detectAndDecode(img)
    if bbox is not None:
        print(f"QR Code decoded successfully!")
        print(f"Content: {data}")
    else:
        print("Could not decode the QR code. It might be blurry or lack quiet zone.")
except Exception as e:
    print(f"Error: {e}")
