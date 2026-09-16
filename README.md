# Invitación Digital Institucional — 38 Aniversario Base Aérea “Cnel. José Enrique Soto Cano”

Proyecto web protocolario, responsivo y ceremonial desarrollado con HTML5, CSS moderno y JavaScript Vanilla. Diseñado para enviarse por WhatsApp y redes sociales mediante enlaces personalizados con vista previa Open Graph en alta resolución.

---

## 🚀 Estructura del Proyecto

```text
pagina-invitacion/
├── index.html                 # Invitación oficial (con soporte de parámetros dinámicos)
├── admin.html                 # Panel protocolario y generador autónomo de enlaces/imágenes
├── login.html                 # Acceso protegido al panel
├── usuarios.html              # Gestión mínima de usuarios administrativos
├── css/
│   ├── invitation.css         # Estilos ceremoniales militares, diseño móvil y animaciones
│   └── admin.css              # Estilos del panel de administración y simulador WhatsApp
│   ├── auth.css               # Estilos del acceso administrativo
│   └── users.css              # Estilos de gestión de usuarios
├── js/
│   ├── app.js                 # Lógica interactiva de la invitación (video, sonido, navegación)
│   ├── auth.js                # Login, sesión y cierre de sesión
│   ├── og-canvas.js           # Generador programático de tarjetas WhatsApp (1200x630 px)
│   └── generator.js           # Lógica de creación de enlaces y exportación de archivos
│   └── users.js               # Alta y activación/desactivación de usuarios
├── assets/
│   ├── video/
│   │   └── invitacion-oficial.mp4  # Video institucional del 38 Aniversario
│   ├── images/
│   │   ├── emblema-soto-cano.png   # Emblema oficial aislado y transparente
│   │   ├── og-walter-paz.png       # Tarjeta Open Graph de alta resolución para WhatsApp
│   │   └── flyer-referencia.jpg    # Volante gráfico suministrado
│   └── data/
│       └── invitados.json          # Catálogo con invitados oficiales preconfigurados
└── README.md
```

---

## ⚙️ Cómo Funciona el Sistema

### 1. Invitación Oficial (`index.html`)
* Muestra por defecto la invitación de honor para el **General de Brigada Walter Yanuario Paz López** (Comandante General de la FAH).
* **Parámetros dinámicos en URL**: Se adapta instantáneamente para cualquier persona, fecha o año:
  `index.html?nombre=CORONEL+EJEMPLO&grado=CORONEL+DE+AVIACION&cargo=JEFE+DE+DEPARTAMENTO&fecha=24+de+Septiembre+de+2026&hora=10:00+am&aniversario=38`
* **Transición Ceremonial**: Al presionar **"VER INVITACIÓN"**, oculta suavemente la portada y revela el video oficial con audio interactivo, además de los datos de fecha, hora, lugar y vestimenta.

### 2. Sistema de Gestión de Invitaciones (`admin.html`)
* **Acceso protegido**: Requiere usuario y contraseña; las contraseñas se almacenan con PBKDF2-SHA-256 y la sesión usa cookie HttpOnly.
* **Gestión mínima de usuarios**: Desde `usuarios.html` un administrador puede crear usuarios, activarlos, desactivarlos y cambiar su propia contraseña. El sistema impide desactivar la propia cuenta o al último usuario activo.
* **Registro de Invitados con Buscador**: Tabla protocolaria con búsqueda interactiva en tiempo real por nombre, grado o cargo.
* **Control de Estados (Activar / Desactivar)**: Permite inhabilitar invitados del envío activo sin perder sus datos en el registro.
* **Integración con Excel (.xlsx)**:
  * 📥 **Descargar Formato Excel**: Descarga la plantilla estructurada lista para ser completada.
  * 📤 **Subir Archivo Excel**: Carga masivamente listas de invitados desde hojas de cálculo.
  * 💾 **Exportar a Excel**: Descarga el listado consolidado oficial.
* **Edición de Fecha, Hora y Aniversario**: Totalmente configurable para usarse en aniversarios y años posteriores.
* **Tarjeta Oficial de Gala (1200 × 630 px)**: Genera y descarga la tarjeta oficial en alta resolución lista para compartir junto al enlace.
* **Simulador en Vivo**: Vista previa de la tarjeta del mensaje en tiempo real.

---

## 🌐 Despliegue

La invitación pública puede servirse como archivos estáticos. El panel de administración y la persistencia de invitados requieren ejecutar `server.py`, que expone la API local sobre SQLite.

### Ejecución local

```powershell
python server.py
```

El servidor escucha en `127.0.0.1:8000` por defecto. Para cambiarlo se pueden definir `PROTOCOLO_HOST` y `PROTOCOLO_PORT` antes de iniciar el proceso.

En el primer arranque se crea el usuario definido por `PROTOCOLO_ADMIN_USER` (por defecto, `admin`). `PROTOCOLO_ADMIN_PASSWORD` solo se usa para crear esa cuenta inicial; defínala con una contraseña robusta antes del primer arranque. Si se omite, el servidor genera una contraseña aleatoria y la muestra una sola vez en la consola:

```powershell
$env:PROTOCOLO_ADMIN_USER = "admin"
$env:PROTOCOLO_ADMIN_PASSWORD = "una-clave-de-6-o-mas"
python server.py
```

Las sesiones duran 8 horas y se invalidan al reiniciar el proceso. En producción use HTTPS y defina `PROTOCOLO_COOKIE_SECURE=1` para que la cookie solo viaje por conexiones seguras.

### Requisitos antes de producción

1. Publicar la invitación por HTTPS y validar Open Graph desde la URL pública.
2. Definir `PROTOCOLO_ADMIN_PASSWORD` antes del primer arranque y cambiar cualquier credencial inicial generada.
3. Mantener el panel administrativo detrás de HTTPS, VPN o una red privada. `noindex` no es un mecanismo de seguridad.
4. No exponer `server.py` directamente a Internet sin un proxy HTTPS con límites de solicitudes y registro de accesos.
5. Respaldar `assets/data/protocolo.db` y `assets/data/*.json` antes de importar o editar registros.
6. Probar reproducción del MP4 y enlaces personalizados en los teléfonos de los destinatarios.

### Opción 1: Sitio público estático (solo invitación)
1. Crea un repositorio en GitHub (ej: `invitacion-38aniversario`).
2. Sube todos los archivos de esta carpeta.
3. Ve a **Settings** > **Pages**.
4. En **Build and deployment**, selecciona la rama `main` y la carpeta `/ (root)`.
5. Guarda los cambios. En 1-2 minutos tu enlace estará listo:
   `https://tu-usuario.github.io/invitacion-38aniversario/`

### Opción 2: Netlify (solo invitación pública)
1. Ingresa a [app.netlify.com](https://app.netlify.com).
2. Arrastra la carpeta completa `pagina-invitacion` al área de "Sites".
3. En 10 segundos tendrás una URL pública HTTPS gratuita lista para compartir por WhatsApp.

### Opción 3: Cloudflare Pages (solo invitación pública)
1. Conecta tu repositorio de GitHub en el panel de Cloudflare Pages.
2. Directorio de salida: `/` (dejar en blanco las configuraciones de build).
3. Publica de inmediato con CDN ultra rápida a nivel mundial.

Estas opciones sirven `index.html` y sus activos, pero no ejecutan la API Python ni guardan cambios del panel. Para usar el registro administrativo con persistencia se necesita un servicio Python protegido y una estrategia de respaldo.
