import sys
from PIL import Image

def process_signature(input_path, output_path):
    try:
        img = Image.open(input_path).convert("RGBA")
        
        # Recortar al área donde está la firma 
        # (ancho: 576, alto: 1024)
        left = 100
        top = 450
        right = 480
        bottom = 750
        img = img.crop((left, top, right, bottom))
        
        data = img.getdata()
        
        new_data = []
        for item in data:
            # Calcular luminosidad
            lum = (item[0] + item[1] + item[2]) / 3
            
            # Si es claro (papel), hacerlo transparente
            if lum > 130:
                new_data.append((255, 255, 255, 0)) # Transparente
            else:
                # Hacer la firma negra y opaca o semitransparente según qué tan oscura es
                # Cuanto más oscura, más opaca
                alpha = int(255 - (lum * 255 / 130))
                new_data.append((20, 20, 50, alpha)) 

        img.putdata(new_data)
        
        # Eliminar bordes vacíos extra (bounding box)
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
            
        img.save(output_path, "PNG")
        print(f"Firma procesada y guardada en {output_path}")
        
    except Exception as e:
        print(f"Error procesando firma: {e}")

if __name__ == "__main__":
    process_signature(sys.argv[1], sys.argv[2])
