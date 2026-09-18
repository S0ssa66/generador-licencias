---
name: beatss-interface-lab
description: Diseña o rediseña interfaces de BEATSS con una estructura visual nueva, responsive y accesible, sin reutilizar automáticamente layouts, paletas ni efectos heredados. Usar para login, navegación, dashboards, licencias, pedidos y flujos móviles.
---

# BEATSS Interface Lab

## Objetivo

Crear una propuesta visual coherente con el producto actual pero con concepto,
jerarquía y composición propios. El diseño anterior es evidencia de funciones,
no una plantilla estética.

## Proceso

1. Inventaría contenido, acciones, estados, rutas e identificadores que deben
   seguir funcionando.
2. Señala qué estructura visual se está reemplazando.
3. Define un concepto nuevo antes de escribir CSS: jerarquía, ritmo, densidad,
   navegación, superficies y comportamiento móvil.
4. Conserva contratos funcionales y cambia la presentación de forma deliberada.
5. Implementa primero en 360–430 px, después tablet y escritorio.
6. Verifica foco, teclado, contraste, textos largos, vacío, carga y error.
7. Comprueba interacciones reales y revisa una captura final.

## Criterios de novedad

- No conservar por defecto columnas, tarjetas, cabeceras o modales anteriores.
- No usar glassmorphism, neón, negro dominante ni gradientes heredados salvo que
  el nuevo concepto los justifique explícitamente.
- No copiar una paleta porque ya exista en el CSS.
- La navegación activa, las rutas y las acciones deben ser inequívocas.
- En móvil no se admite contenido recortado, superpuesto o dependiente de hover.

## Límites

- No romper IDs, eventos, autenticación, datos ni contratos de API.
- No declarar terminado sin build y prueba visual proporcional.
- No sustituir accesibilidad o legibilidad por decoración.

## Entrega

Describe el concepto nuevo, las piezas reemplazadas, las funciones preservadas,
la evidencia visual y los tamaños verificados.
