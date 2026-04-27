# PT Bienes Raíces · Estimador preliminar

Aplicación web (pantalla única) para automatizar avalúos preliminares en zonas urbanas de Coahuila:

- Saltillo
- Ramos Arizpe
- Arteaga

Incluye:

- Formulario inmobiliario completo para asesores.
- Estimación híbrida (mercado + reposición).
- Comparables simulados multi-fuente (portales, marketplace y API comercial).
- Rango de precio, confianza, escenarios de venta rápida y precio óptimo.
- Recomendaciones automáticas y auditoría del cálculo.
- Descarga de reporte en PDF.
- Autocompletado de dirección con Nominatim + sugerencias locales.

## Archivos

- `index.html`: estructura de la app.
- `styles.css`: estilos responsive para mobile y desktop.
- `script.js`: lógica de estimación, comparables, auditoría, autocompletado y PDF.

## Ejecutar localmente

```bash
python3 -m http.server 8000
```

Abrir en navegador:

- `http://localhost:8000`

## Nota importante

Por restricciones de presupuesto/licenciamiento (costo 0), los comparables se muestran en modo simulación. Para producción en tiempo real se requiere backend con conectores a APIs o fuentes licenciadas.
