# NOREMA — Tienda online para Venezuela

## Estructura
```text
norema-store/
├── index.html
├── styles.css
├── app.js
├── products.json
├── package.json
├── netlify.toml
├── assets/
│   └── norema-logo.png
└── netlify/
    └── functions/
        └── bcv.js
```

## Publicar en Netlify
1. Descomprime el ZIP y sube la carpeta `norema-store` a un repositorio GitHub.
2. En Netlify selecciona **Add new site → Import an existing project** y conecta el repositorio.
3. Build command: déjalo vacío. Publish directory: `.`. Netlify detectará `netlify.toml`.
4. Netlify instalará `@netlify/blobs` desde `package.json` para la función BCV.
5. En **Site configuration → Environment variables**, crea `BCV_FALLBACK_RATE` con la última tasa BCV conocida. Cambia el valor de ejemplo `450` en `app.js` por el mismo respaldo.
6. Despliega. Comprueba `https://TU-SITIO.netlify.app/.netlify/functions/bcv`.

## Tasa BCV
La función consulta `https://ve.dolarapi.com/v1/dolares/oficial`, fuente pública agregada de la tasa oficial. Guarda la última lectura en Netlify Blobs y la reutiliza hasta 24 horas. La función tiene una ejecución programada diaria a las 12:15 UTC (8:15 a. m. Venezuela); una visita también provoca la consulta si la tasa guardada venció. El navegador muestra la tasa guardada como **Tasa de referencia** si la consulta actual falla. La fuente es externa y puede cambiar su formato o disponibilidad; verifica la tasa antes de operar.

Para forzar actualización manual: abre `https://TU-SITIO.netlify.app/.netlify/functions/bcv?refresh=1`. El parámetro `refresh=1` omite la comprobación de vigencia y consulta la fuente pública inmediatamente; si falla, conserva la última tasa guardada o el fallback.

## Editar productos
Edita `products.json`. Cada producto acepta:
- `id`: identificador único sin espacios.
- `name`, `description`, `priceUSD`, `images` (arreglo de URLs), `category`, `stock`.
- `badge`: etiqueta opcional; `freeShipping`: `true` o `false`.

Usa imágenes propias con URL HTTPS. Puedes reemplazar `assets/norema-logo.png` por tu logo manteniendo el mismo nombre.

## Personalización antes de publicar
- Sustituye el correo `hola@tutienda.com` por el correo real.
- Sustituye los testimonios de ejemplo por reseñas reales y autorizadas.
- Ajusta el fallback a la tasa BCV vigente.
- Revisa disponibilidad real de cada método de envío, tiempos, condiciones y política de cambios.
- Verifica precios, inventario, descripciones y derechos de uso de imágenes.

## Notas importantes
- El pedido se prepara en el navegador y abre WhatsApp al número `+58 414 8804424`. No se guarda en una base de datos.
- El mensaje se abre en WhatsApp; el cliente todavía debe pulsar **Enviar** en esa aplicación. La pantalla de confirmación del sitio indica que se abrió el flujo, no que el mensaje fue entregado.
- La tasa mostrada es de referencia. Confirma el monto en bolívares con el cliente antes de cobrar.
- La modalidad Delivery Express valida Distrito Capital; el envío a domicilio con pago al recibir valida los estados configurados en `app.js`.
