from PIL import Image

img_path = '/Users/sossa/IA/generador-licencias/public/deuna-qr.jpg'
with Image.open(img_path) as img:
    # Let's generate 4 different candidate crops around the center area of the flyer.
    # The flyer is 596x843.
    # The white box is between x=149 and x=446 (width 297).
    # The QR is in the upper part of the white box.
    
    # Candidate 1: standard crop
    c1 = img.crop((195, 335, 400, 540))
    c1.save('/Users/sossa/IA/generador-licencias/public/crop_1.jpg')
    
    # Candidate 2: slightly higher and wider
    c2 = img.crop((185, 320, 410, 545))
    c2.save('/Users/sossa/IA/generador-licencias/public/crop_2.jpg')
    
    # Candidate 3: even higher
    c3 = img.crop((200, 310, 395, 505))
    c3.save('/Users/sossa/IA/generador-licencias/public/crop_3.jpg')
    
    # Candidate 4: wider scan
    c4 = img.crop((170, 300, 425, 555))
    c4.save('/Users/sossa/IA/generador-licencias/public/crop_4.jpg')
    
    print("Generated 4 crop candidates in public/ directory.")
