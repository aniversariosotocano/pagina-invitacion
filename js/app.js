/**
 * Lógica principal de la Invitación Web Ceremonial
 * Maneja parámetros dinámicos de invitado, transiciones suaves y reproducción de video
 */

document.addEventListener('DOMContentLoaded', () => {
  initGuestData();
  initVideoPlayer();
});

// Valores por defecto del invitado de honor
const DEFAULT_GUEST = {
  tratamiento: 'Al: Sr. Comandante General De La FAH',
  grado: 'GENERAL DE BRIGADA',
  nombre: 'WALTER YANUARIO PAZ LÓPEZ',
  cargo: 'Comandante General de la Fuerza Aérea Hondureña',
  vestimenta: 'Militar Uniforme D (Kepi) / Invitados Especiales Formal',
  aniversario: '38',
  fecha: '24 de Septiembre de 2026',
  hora: '10:00 am',
  nombre_evento: 'Aniversario de la Base Aérea<br>“Cnel. José Enrique Soto Cano”'
};

async function fetchJsonWithFallback(apiUrl, fallbackUrl) {
  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (response.ok) return response;
  } catch (_) {}

  try {
    const response = await fetch(fallbackUrl, { headers: { Accept: 'application/json' } });
    return response.ok ? response : null;
  } catch (_) {
    return null;
  }
}

/**
 * Carga los datos del invitado desde URL o catálogo y la configuración global
 */
async function initGuestData() {
  const urlParams = new URLSearchParams(window.location.search);
  const guestId = urlParams.get('id');
  const paramNombre = urlParams.get('nombre');
  const paramGrado = urlParams.get('grado');
  const paramCargo = urlParams.get('cargo');
  const paramTratamiento = urlParams.get('tratamiento');
  const paramVestimenta = urlParams.get('vestimenta');
  const paramAniversario = urlParams.get('aniversario');
  const paramFecha = urlParams.get('fecha');
  const paramHora = urlParams.get('hora');
  const paramTema = urlParams.get('tema');
  const paramNombreEvento = urlParams.get('nombre_evento');

  const THEME_MAP = {
    'tucano-sunset': 'assets/images/tucano-atardecer.webp',
    'supertucano': 'assets/images/Supertucano.webp',
    'maule': 'assets/images/Maule.webp',
    'tucanos-formacion': 'assets/images/tucanos-formacion.webp',
    'soto-cano-pista': 'assets/images/soto-cano-pista.webp',
    'tucano-vuelo': 'assets/images/tucano-vuelo.webp'
  };

  let activeGuest = { ...DEFAULT_GUEST };

  // Cargar configuración global actualizada
  try {
    const cfgRes = await fetchJsonWithFallback('/api/config', 'assets/data/config.json');
    if (cfgRes && cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.nombre_evento) activeGuest.nombre_evento = cfg.nombre_evento;
      if (cfg.aniversario) activeGuest.aniversario = String(cfg.aniversario);
      if (cfg.fecha_evento) activeGuest.fecha = cfg.fecha_evento;
      if (cfg.hora_evento) activeGuest.hora = cfg.hora_evento;
      if (cfg.vestimenta) activeGuest.vestimenta = cfg.vestimenta;
      if (cfg.plantilla_predeterminada && !paramTema) {
        const defaultBg = THEME_MAP[cfg.plantilla_predeterminada];
        if (defaultBg) document.documentElement.style.setProperty('--custom-theme-bg', `url('../${defaultBg}')`);
      }
    }
  } catch (_) {}

  // Aplicar tema específico de la invitación si viene por URL
  if (paramTema && THEME_MAP[paramTema]) {
    document.documentElement.style.setProperty('--custom-theme-bg', `url('../${THEME_MAP[paramTema]}')`);
  }

  if (paramNombre) {
    activeGuest.nombre = paramNombre;
    if (paramGrado) activeGuest.grado = paramGrado;
    if (paramCargo) activeGuest.cargo = paramCargo;
    if (paramTratamiento) activeGuest.tratamiento = paramTratamiento;
    if (paramVestimenta) activeGuest.vestimenta = paramVestimenta;
    if (paramAniversario) activeGuest.aniversario = paramAniversario;
    if (paramFecha) activeGuest.fecha = paramFecha;
    if (paramHora) activeGuest.hora = paramHora;
    if (paramNombreEvento) activeGuest.nombre_evento = paramNombreEvento;
    renderGuestUI(activeGuest);
  } else if (guestId) {
    try {
      const res = await fetchJsonWithFallback(`/api/invitado?id=${encodeURIComponent(guestId)}`, 'assets/data/invitados.json');
      if (res && res.ok) {
        const payload = await res.json();
        const found = Array.isArray(payload) ? payload.find(g => g.id === guestId) : payload;
        if (found) {
          activeGuest = { ...activeGuest, ...found };
          if (!paramTema && found.plantilla_id && THEME_MAP[found.plantilla_id]) {
            document.documentElement.style.setProperty('--custom-theme-bg', `url('../${THEME_MAP[found.plantilla_id]}')`);
          }
        }
      }
    } catch (_) {}
    if (paramAniversario) activeGuest.aniversario = paramAniversario;
    if (paramFecha) activeGuest.fecha = paramFecha;
    if (paramHora) activeGuest.hora = paramHora;
    if (paramNombreEvento) activeGuest.nombre_evento = paramNombreEvento;
    renderGuestUI(activeGuest);
  } else {
    if (paramAniversario) activeGuest.aniversario = paramAniversario;
    if (paramFecha) activeGuest.fecha = paramFecha;
    if (paramHora) activeGuest.hora = paramHora;
    if (paramNombreEvento) activeGuest.nombre_evento = paramNombreEvento;
    renderGuestUI(activeGuest);
  }
}

/**
 * Pinta en el DOM los datos del invitado y del evento
 */
function renderGuestUI(guest) {
  const elTratamiento = document.getElementById('guestTratamiento');
  const elGrado = document.getElementById('guestGrado');
  const elNombre = document.getElementById('guestNombre');
  const elCargo = document.getElementById('guestCargo');
  const elVestimenta = document.getElementById('eventVestimenta');
  const elAniversarioNum = document.getElementById('anniversaryNumber');
  const elAniversarioHeading = document.getElementById('anniversaryHeading');
  const elFecha = document.getElementById('eventFecha');
  const elHora = document.getElementById('eventHora');

  if (elTratamiento) elTratamiento.textContent = guest.tratamiento || 'INVITADO ESPECIAL';
  if (elGrado) elGrado.textContent = guest.grado || '';
  if (elNombre) elNombre.textContent = guest.nombre || '';
  if (elCargo) {
    const rawCargo = (guest.cargo || '').trim();
    const rawTrat = (guest.tratamiento || '').trim();

    // Normalizar texto para verificar coincidencia semántica
    const normalize = str => (str || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\bfah\b/g, 'fuerza aerea hondurena')
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const cNorm = normalize(rawCargo);
    const tNorm = normalize(rawTrat);

    // Si el cargo ya está incluido en el tratamiento superior (ej: "Al: Sr. Comandante General De La FAH"),
    // evitar que se repita abajo: solo debe mostrarse una vez.
    const isRepeated = Boolean(cNorm && (
      tNorm.includes(cNorm) ||
      (tNorm.length > 5 && cNorm.includes(tNorm.replace(/^al\s+sr\s+|^a\s+la\s+sra\s+|^a\s+la\s+|^al\s+/g, '').trim()))
    ));

    if (!rawCargo || isRepeated) {
      elCargo.textContent = '';
      elCargo.style.display = 'none';
    } else {
      elCargo.textContent = rawCargo;
      elCargo.style.display = '';
    }
  }
  if (elVestimenta && guest.vestimenta) elVestimenta.textContent = guest.vestimenta;
  
  if (elAniversarioNum && guest.aniversario) {
    elAniversarioNum.textContent = guest.aniversario;
  }
  if (elAniversarioHeading) {
    let rawName = guest.nombre_evento || 'Aniversario de la Base Aérea<br>“Cnel. José Enrique Soto Cano”';
    // Quitar el número de aniversario del párrafo (ej. "38 ", "38.º ", "38vo ") para evitar redundancia con el número destacado arriba
    rawName = rawName.replace(/^\s*\d+(\.?[ºoª]|\s*vo|\s*to)?\s*/i, '');
    // El nombre del evento puede venir desde la URL o del panel. Usar textContent evita inyección HTML.
    const readableName = rawName.replace(/<br\s*\/?\s*>/gi, '\n');
    elAniversarioHeading.textContent = readableName.includes('\n') ? readableName : readableName.replace(/“/, '\n“');
  }
  if (elFecha && guest.fecha) {
    elFecha.textContent = guest.fecha;
  }
  if (elHora && guest.hora) {
    elHora.textContent = guest.hora;
  }

  // Actualizar título de la ventana
  if (guest.nombre) {
    document.title = 'Invitación Oficial — ' + guest.nombre;
  }
}

/**
 * Configuración de transición y reproductor de video
 */
function initVideoPlayer() {
  const btnVerInvitacion = document.getElementById('btnVerInvitacion');
  const coverSection = document.getElementById('coverSection');
  const videoSection = document.getElementById('videoSection');
  const videoPlayer = document.getElementById('invitationVideo');
  const btnReplay = document.getElementById('btnReplay');
  const btnToggleCover = document.getElementById('btnToggleCover');

  if (!btnVerInvitacion || !videoSection || !videoPlayer) return;

  btnVerInvitacion.addEventListener('click', () => {
    // 1. Transición de salida suave para portada
    coverSection.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    coverSection.style.opacity = '0';
    coverSection.style.transform = 'translateY(-15px)';

    setTimeout(() => {
      coverSection.style.display = 'none';
      videoSection.style.display = 'flex';
      
      // Forzar reflow para animación CSS
      void videoSection.offsetWidth;
      videoSection.classList.add('active');

      // 2. Iniciar reproducción con audio tras el clic interactivo
      videoPlayer.currentTime = 0;
      videoPlayer.muted = false;
      videoPlayer.play().catch(err => {
        console.warn('Autoplay con audio restringido por el navegador, activando fallback silencioso:', err);
        videoPlayer.muted = true;
        videoPlayer.play().catch(e => console.error('Error al reproducir video:', e));
      });

      // Scroll suave centrado
      videoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 380);
  });

  if (btnReplay) {
    btnReplay.addEventListener('click', () => {
      videoPlayer.currentTime = 0;
      videoPlayer.play();
    });
  }

  if (btnToggleCover) {
    btnToggleCover.addEventListener('click', () => {
      videoPlayer.pause();
      videoSection.classList.remove('active');
      setTimeout(() => {
        videoSection.style.display = 'none';
        coverSection.style.display = 'block';
        void coverSection.offsetWidth;
        coverSection.style.opacity = '1';
        coverSection.style.transform = 'translateY(0)';
      }, 300);
    });
  }
}
