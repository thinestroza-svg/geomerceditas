# GeoMerceditas

Visor de planos GeoPDF para Android: GPS sobre el plano, puntos, tracks en segundo plano
(con la pantalla apagada), exportación KML / GPX / CSV en CTM12 y respaldo completo.

## Cómo obtener el APK
Cada cambio en la rama `main` compila la app automáticamente (pestaña **Actions**).
La versión lista queda en **Releases** → `GeoMerceditas.apk`. Ábrala desde el celular,
descárguela e instálela (Android pedirá permitir "instalar apps de origen desconocido").

## Estructura
- `www/` — la app (HTML, JS y librerías). Es lo único que hay que editar.
- `android/` — proyecto Android generado con Capacitor 6.
- `.github/workflows/build-apk.yml` — compilación en la nube.
