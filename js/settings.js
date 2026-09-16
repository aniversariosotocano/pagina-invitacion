/**
 * Controlador de la Página de Ajustes Globales y Plantilla Predeterminada
 * Base Aérea 'Cnel. José Enrique Soto Cano' — FAH
 * Arquitectura Sólida de Alto Rendimiento: Caché GPU (ImageBitmap), Cero Congelamiento
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettingsConfig();
  initSettingsListeners();
  initThemeSelector();
  initializeRenderEngine();
});

let currentConfig = {
  nombre_evento: 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”',
  fecha_fundacion: '1988-09-01',
  aniversario: 38,
  aniversario_auto: true,
  fecha_evento: '24 de Septiembre de 2026',
  hora_evento: '10:00 am',
  vestimenta: 'Militar Uniforme D (Kepi) / Invitados Especiales Formal',
  plantilla_predeterminada: 'tucano-sunset',
  plantilla_version: 1
};

let selectedTheme = 'tucano-sunset';
let initialConfigSnapshot = null;

// Mapa de rutas de imágenes oficiales para cada plantilla
const THEMES = {
  'tucano-sunset': 'assets/images/tucano-atardecer.webp',
  'supertucano': 'assets/images/Supertucano.webp',
  'maule': 'assets/images/Maule.webp',
  'tucanos-formacion': 'assets/images/tucanos-formacion.webp',
  'soto-cano-pista': 'assets/images/soto-cano-pista.webp',
  'tucano-vuelo': 'assets/images/tucano-vuelo.webp',
  'classic': null
};

// Recursos cacheados y decodificados fuera del hilo principal
let emblemImg = null;
const loadedThemeImages = {};

// Caché de mapas de bits pre-renderizados en GPU (ImageBitmap / Canvas)
const themeCache = new Map();
const pendingThemeRenders = new Map();
const themeRenderQueue = [];
let themeRenderQueueRunning = false;
let cacheBuildToken = 0;
let renderGeneration = 0;
let inputDebounceTimer = null;

/**
 * Predecodificación asíncrona de recursos (WebP) en hilos de fondo del navegador
 */
async function preloadAndDecodeAssets() {
  const emb = new Image();
  emb.src = 'assets/images/emblema-soto-cano.webp';
  try {
    if (typeof emb.decode === 'function') {
      await emb.decode();
    }
  } catch (_) {}
  emblemImg = emb;

  const promises = Object.entries(THEMES).map(async ([key, src]) => {
    if (!src) return;
    const img = new Image();
    img.src = src;
    try {
      if (typeof img.decode === 'function') {
        await img.decode();
      }
    } catch (_) {}
    loadedThemeImages[key] = img;
  });

  await Promise.allSettled(promises);
}

/**
 * Inicializador del motor gráfico con garantía tipográfica y predecodificación
 */
async function initializeRenderEngine() {
  const fontsPromise = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const assetsPromise = preloadAndDecodeAssets();

  await Promise.all([fontsPromise, assetsPromise]);
  await buildAllThemeCaches(selectedTheme);
}

/**
 * Renderiza una plantilla hacia un ImageBitmap (o canvas offscreen) de forma aislada
 */
async function renderThemeToBitmap(themeKey) {
  const offscreen = document.createElement('canvas');
  offscreen.width = 1200;
  offscreen.height = 630;

  const elNombre = document.getElementById('settingNombreEvento');
  const elAniv = document.getElementById('settingAniversario');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');

  const bgImg = loadedThemeImages[themeKey] || null;

  if (typeof window.drawMilitaryOGCanvas === 'function') {
    window.drawMilitaryOGCanvas(offscreen, {
      tratamiento: 'Al: Sr. Comandante General De La FAH',
      grado: 'GENERAL DE BRIGADA',
      nombre: 'WALTER YANUARIO PAZ LÓPEZ',
      cargo: 'Comandante General de la Fuerza Aérea Hondureña',
      nombreEvento: elNombre ? elNombre.value.trim() : (currentConfig.nombre_evento || 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”'),
      aniversario: elAniv ? elAniv.value : (currentConfig.aniversario || '38'),
      fecha: elFecha ? elFecha.value.toUpperCase() : (currentConfig.fecha_evento || '24 DE SEPTIEMBRE 2026').toUpperCase(),
      hora: elHora ? elHora.value.toUpperCase() : (currentConfig.hora_evento || '10:00 AM').toUpperCase(),
      emblemImg: emblemImg,
      bgImg: bgImg
    });
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(offscreen);
      return bmp;
    } catch (_) {
      return offscreen;
    }
  }
  return offscreen;
}

/**
 * Libera memoria GPU de bitmaps anteriores
 */
function clearThemeCache() {
  for (const [, item] of themeCache.entries()) {
    if (item && typeof item.close === 'function') {
      try { item.close(); } catch (_) {}
    }
  }
  themeCache.clear();
}

function waitForRenderSlot() {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(resolve, { timeout: 120 });
    } else if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/**
 * Ejecuta como máximo un render de tarjeta a la vez. El dibujo de Canvas es
 * síncrono y no se puede cancelar a mitad; serializarlo evita que varios
 * clics rápidos creen varios Canvas/ImageBitmap simultáneamente.
 */
async function pumpThemeRenderQueue() {
  if (themeRenderQueueRunning) return;
  themeRenderQueueRunning = true;

  const isStale = job => job.generation !== renderGeneration ||
    (job.background && job.buildToken !== cacheBuildToken) ||
    (!job.background && job.themeKey !== selectedTheme);

  while (themeRenderQueue.length) {
    const job = themeRenderQueue.shift();
    const jobKey = `${job.generation}:${job.themeKey}`;

    if (isStale(job)) {
      const pendingEntry = pendingThemeRenders.get(jobKey);
      if (pendingEntry && pendingEntry.job === job) pendingThemeRenders.delete(jobKey);
      job.resolve(null);
      continue;
    }

    await waitForRenderSlot();
    if (isStale(job)) {
      const pendingEntry = pendingThemeRenders.get(jobKey);
      if (pendingEntry && pendingEntry.job === job) pendingThemeRenders.delete(jobKey);
      job.resolve(null);
      continue;
    }

    // Otro trabajo pudo haber generado el mismo bitmap mientras este estaba
    // esperando; reutilizarlo evita un segundo render innecesario.
    const alreadyCached = themeCache.get(job.themeKey);
    if (alreadyCached) {
      const pendingEntry = pendingThemeRenders.get(jobKey);
      if (pendingEntry && pendingEntry.job === job) pendingThemeRenders.delete(jobKey);
      job.resolve(alreadyCached);
      continue;
    }

    let bitmap = null;
    try {
      bitmap = await renderThemeToBitmap(job.themeKey);
    } catch (_) {}

    const pendingEntry = pendingThemeRenders.get(jobKey);
    if (pendingEntry && pendingEntry.job === job) pendingThemeRenders.delete(jobKey);
    if (!bitmap) {
      job.resolve(null);
      continue;
    }
    if (job.generation !== renderGeneration) {
      if (typeof bitmap.close === 'function') bitmap.close();
      job.resolve(null);
      continue;
    }

    themeCache.set(job.themeKey, bitmap);
    job.resolve(bitmap);
  }

  themeRenderQueueRunning = false;
}

function requestThemeRender(themeKey, generation = renderGeneration, background = false, buildToken = cacheBuildToken) {
  const cached = themeCache.get(themeKey);
  if (cached) return Promise.resolve(cached);

  const jobKey = `${generation}:${themeKey}`;
  const pendingEntry = pendingThemeRenders.get(jobKey);
  if (pendingEntry) {
    // Si el precargado perdió prioridad por un clic, reemplazarlo por un
    // trabajo prioritario en lugar de devolver una promesa que será cancelada.
    if (!background && pendingEntry.job.background && pendingEntry.job.buildToken !== cacheBuildToken) {
      pendingThemeRenders.delete(jobKey);
    } else {
      return pendingEntry.promise;
    }
  }

  let resolveJob;
  const promise = new Promise(resolve => { resolveJob = resolve; });
  const job = { themeKey, generation, background, buildToken, resolve: resolveJob };
  pendingThemeRenders.set(jobKey, { promise, job });
  // La plantilla que el operador acaba de elegir siempre tiene prioridad.
  if (background) themeRenderQueue.push(job);
  else themeRenderQueue.unshift(job);
  pumpThemeRenderQueue();
  return promise;
}

/**
 * Construye la caché completa de plantillas:
 * Primero la activa (muestra inmediata), luego el resto en cortes de animación RAF
 */
async function buildAllThemeCaches(activeFirst = selectedTheme) {
  const currentToken = ++cacheBuildToken;
  const currentGeneration = ++renderGeneration;
  clearThemeCache();

  // 1. Renderizar y mostrar inmediatamente la plantilla activa
  const activeBmp = await requestThemeRender(activeFirst, currentGeneration);
  if (currentToken !== cacheBuildToken || currentGeneration !== renderGeneration || !activeBmp) return;
  displayThemeFromCache(activeFirst);

  // 2. Renderizar las demás en segundo plano, una por una y solo en huecos de la UI
  const allThemes = Object.keys(THEMES);
  const remaining = allThemes.filter(themeKey => themeKey !== activeFirst);
  const buildNext = async () => {
    if (currentToken !== cacheBuildToken || currentGeneration !== renderGeneration || !remaining.length) return;
    await waitForRenderSlot();
    if (currentToken !== cacheBuildToken || currentGeneration !== renderGeneration) return;
    await requestThemeRender(remaining.shift(), currentGeneration, true, currentToken);
    if (currentToken === cacheBuildToken && currentGeneration === renderGeneration) {
      setTimeout(buildNext, 0);
    }
  };
  setTimeout(buildNext, 0);
}

/**
 * Dibuja la plantilla en el canvas visible mediante transferencia instantánea de textura (<0.1ms)
 */
function displayThemeFromCache(themeKey) {
  const canvas = document.getElementById('settingsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const cached = themeCache.get(themeKey);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
  } else {
    const generation = renderGeneration;
    requestThemeRender(themeKey, generation).then(bitmap => {
      if (bitmap && generation === renderGeneration && selectedTheme === themeKey) {
        const currentCtx = canvas.getContext('2d');
        currentCtx.drawImage(bitmap, 0, 0);
      }
    });
  }
}

/**
 * Función de compatibilidad
 */
function drawSettingsPreview() {
  displayThemeFromCache(selectedTheme);
}

/**
 * Programador de recálculo con debounce exclusivo para inputs de texto
 */
function scheduleCacheRebuild(delay = 250) {
  if (inputDebounceTimer) {
    clearTimeout(inputDebounceTimer);
  }
  inputDebounceTimer = setTimeout(() => {
    inputDebounceTimer = null;
    buildAllThemeCaches(selectedTheme);
  }, delay);
}

/**
 * Carga de configuración desde SQLite / API
 */
async function loadSettingsConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      currentConfig = await res.json();
    } else {
      const fb = await fetch('assets/data/config.json');
      if (fb.ok) currentConfig = await fb.json();
    }
  } catch (_) {
    try {
      const fb = await fetch('assets/data/config.json');
      if (fb.ok) currentConfig = await fb.json();
    } catch (_) {}
  }

  // Poblar formulario
  const elNombre = document.getElementById('settingNombreEvento');
  const elAniv = document.getElementById('settingAniversario');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');
  const elVest = document.getElementById('settingVestimenta');
  const elVer = document.getElementById('lblPlantillaVersion');

  if (elNombre) elNombre.value = currentConfig.nombre_evento || 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”';
  if (elAniv) elAniv.value = currentConfig.aniversario || 38;
  if (elAuto) elAuto.checked = currentConfig.aniversario_auto !== false;
  if (elFecha) elFecha.value = currentConfig.fecha_evento || '24 de Septiembre de 2026';
  if (elHora) elHora.value = currentConfig.hora_evento || '10:00 am';
  if (elVest) elVest.value = currentConfig.vestimenta || 'Militar Uniforme D (Kepi) / Invitados Especiales Formal';
  if (elVer) elVer.textContent = `Versión ${currentConfig.plantilla_version || 1}`;

  selectedTheme = currentConfig.plantilla_predeterminada || 'tucano-sunset';
  updateActiveThemeCardUI(selectedTheme);
  updateAnniversaryLogic();
  drawSettingsPreview();
  captureInitialSnapshot();
}

/**
 * Cálculo automático de aniversario institucional (Fundación: 1 de Septiembre de 1988)
 */
function updateAnniversaryLogic() {
  const elAniv = document.getElementById('settingAniversario');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elNotice = document.getElementById('settingCalcNotice');
  if (!elAniv || !elAuto) return;

  const foundationYear = 1988;
  let targetYear = new Date().getFullYear();

  if (elFecha && elFecha.value) {
    const match = elFecha.value.match(/\b(19\d\d|20\d\d)\b/);
    if (match) targetYear = parseInt(match[1], 10);
  }

  if (elAuto.checked) {
    const calc = targetYear - foundationYear;
    elAniv.value = calc > 0 ? calc : 38;
    elAniv.readOnly = true;
    elAniv.style.opacity = '0.9';
    if (elNotice) {
      elNotice.textContent = `Cálculo automático: ${targetYear} − ${foundationYear} = ${elAniv.value}.º Aniversario (Fundada el 1 de Septiembre de 1988)`;
      elNotice.style.color = 'var(--admin-gold-light)';
    }
  } else {
    elAniv.readOnly = false;
    elAniv.style.opacity = '1';
    if (elNotice) {
      elNotice.textContent = 'Cálculo manual habilitado por el operador de protocolo.';
      elNotice.style.color = 'var(--admin-text-sub)';
    }
  }
}

/**
 * Escuchadores de eventos para recálculo y preview dinámico
 */
function initSettingsListeners() {
  const elNombre = document.getElementById('settingNombreEvento');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');
  const elAniv = document.getElementById('settingAniversario');
  const btnSave = document.getElementById('btnSaveSettings');
  const btnDownload = document.getElementById('btnDownloadSampleCard');

  if (elNombre) {
    elNombre.addEventListener('input', () => scheduleCacheRebuild(250));
  }

  if (elAuto) {
    elAuto.addEventListener('change', () => {
      updateAnniversaryLogic();
      scheduleCacheRebuild(150);
    });
  }

  if (elFecha) {
    elFecha.addEventListener('input', () => {
      if (elAuto && elAuto.checked) updateAnniversaryLogic();
      scheduleCacheRebuild(250);
    });
  }

  if (elHora) {
    elHora.addEventListener('input', () => scheduleCacheRebuild(250));
  }

  if (elAniv) {
    elAniv.addEventListener('input', () => scheduleCacheRebuild(250));
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      await saveSettings();
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      downloadSampleCard();
    });
  }

  // Cerrar modales con [data-close-dialog]
  document.querySelectorAll('[data-close-dialog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialogId = btn.getAttribute('data-close-dialog');
      const dialog = document.getElementById(dialogId);
      if (dialog && typeof dialog.close === 'function') {
        dialog.close();
      }
    });
  });

  // Interceptar navegación al salir de configuración (Volver al Registro)
  const btnBack = document.getElementById('btnBackToAdmin') || document.querySelector('a[href="admin.html"]');
  if (btnBack) {
    btnBack.addEventListener('click', (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        const dlg = document.getElementById('dialogUnsavedChanges');
        if (dlg && typeof dlg.showModal === 'function') {
          dlg.showModal();
        } else if (confirm('¿Desea salir sin guardar los cambios realizados en la configuración?')) {
          initialConfigSnapshot = null;
          window.location.href = 'admin.html';
        }
      }
    });
  }

  // Botón Salir sin Guardar en el Modal
  const btnDiscard = document.getElementById('btnDiscardAndLeave');
  if (btnDiscard) {
    btnDiscard.addEventListener('click', () => {
      const dlg = document.getElementById('dialogUnsavedChanges');
      if (dlg && typeof dlg.close === 'function') dlg.close();
      initialConfigSnapshot = null;
      window.location.href = 'admin.html';
    });
  }

  // Botón Guardar y Salir en el Modal
  const btnSaveLeave = document.getElementById('btnSaveAndLeave');
  if (btnSaveLeave) {
    btnSaveLeave.addEventListener('click', async () => {
      const saved = await saveSettings();
      if (saved) {
        const dlg = document.getElementById('dialogUnsavedChanges');
        if (dlg && typeof dlg.close === 'function') dlg.close();
        initialConfigSnapshot = null;
        window.location.href = 'admin.html';
      }
    });
  }

  // Protección ante cierre o recarga de pestaña en el navegador
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/**
 * Captura instantánea de los valores para detectar cambios sin guardar
 */
function captureInitialSnapshot() {
  const elNombre = document.getElementById('settingNombreEvento');
  const elAniv = document.getElementById('settingAniversario');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');
  const elVest = document.getElementById('settingVestimenta');

  initialConfigSnapshot = {
    nombre_evento: elNombre ? elNombre.value.trim() : '',
    aniversario: elAniv ? String(elAniv.value).trim() : '',
    aniversario_auto: elAuto ? elAuto.checked : true,
    fecha_evento: elFecha ? elFecha.value.trim() : '',
    hora_evento: elHora ? elHora.value.trim() : '',
    vestimenta: elVest ? elVest.value.trim() : '',
    theme: selectedTheme
  };
}

/**
 * Determina si el usuario modificó algún ajuste sin haberlo guardado
 */
function hasUnsavedChanges() {
  if (!initialConfigSnapshot) return false;

  const elNombre = document.getElementById('settingNombreEvento');
  const elAniv = document.getElementById('settingAniversario');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');
  const elVest = document.getElementById('settingVestimenta');

  const currentSnapshot = {
    nombre_evento: elNombre ? elNombre.value.trim() : '',
    aniversario: elAniv ? String(elAniv.value).trim() : '',
    aniversario_auto: elAuto ? elAuto.checked : true,
    fecha_evento: elFecha ? elFecha.value.trim() : '',
    hora_evento: elHora ? elHora.value.trim() : '',
    vestimenta: elVest ? elVest.value.trim() : '',
    theme: selectedTheme
  };

  return JSON.stringify(initialConfigSnapshot) !== JSON.stringify(currentSnapshot);
}

/**
 * Selector interactivo de plantillas de alta velocidad (Zero-Freeze)
 */
function initThemeSelector() {
  const cards = document.querySelectorAll('.theme-card-option');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const newTheme = card.dataset.theme;
      if (selectedTheme === newTheme) return;
      selectedTheme = newTheme;
      // Detener el precargado de fondos no prioritarios; el clic actual gana.
      cacheBuildToken++;
      updateActiveThemeCardUI(selectedTheme);

      // La vista usa caché si existe; si no, el render entra en una cola de un solo trabajo.
      displayThemeFromCache(selectedTheme);
    });
  });
}

function updateActiveThemeCardUI(themeKey) {
  const currentActive = document.querySelector('.theme-card-option.active');
  if (currentActive && currentActive.dataset.theme === themeKey) return;
  if (currentActive) currentActive.classList.remove('active');
  const target = document.querySelector(`.theme-card-option[data-theme="${themeKey}"]`);
  if (target) target.classList.add('active');
}

/**
 * Guardar configuración global en SQLite
 */
async function saveSettings() {
  const elNombre = document.getElementById('settingNombreEvento');
  const elAniv = document.getElementById('settingAniversario');
  const elAuto = document.getElementById('checkSettingAuto');
  const elFecha = document.getElementById('settingFechaEvento');
  const elHora = document.getElementById('settingHoraEvento');
  const elVest = document.getElementById('settingVestimenta');
  const elVer = document.getElementById('lblPlantillaVersion');

  const nombreEvento = elNombre ? elNombre.value.trim() : '';
  const fechaEvento = elFecha ? elFecha.value.trim() : '';
  const horaEvento = elHora ? elHora.value.trim() : '';
  const vestimenta = elVest ? elVest.value.trim() : '';

  // Validaciones básicas de formulario
  if (!nombreEvento || nombreEvento.length < 4) {
    showToast('El nombre del evento debe tener al menos 4 caracteres.');
    if (elNombre) elNombre.focus();
    return false;
  }
  if (!fechaEvento) {
    showToast('La fecha del evento es obligatoria.');
    if (elFecha) elFecha.focus();
    return false;
  }
  if (!horaEvento) {
    showToast('La hora del evento es obligatoria.');
    if (elHora) elHora.focus();
    return false;
  }

  const payload = {
    nombre_evento: nombreEvento,
    fecha_fundacion: currentConfig.fecha_fundacion || '1988-09-01',
    aniversario: parseInt(elAniv ? elAniv.value : 38, 10) || 38,
    aniversario_auto: elAuto ? elAuto.checked : true,
    fecha_evento: fechaEvento,
    hora_evento: horaEvento,
    vestimenta: vestimenta || currentConfig.vestimenta,
    plantilla_predeterminada: selectedTheme
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      currentConfig = { ...currentConfig, ...payload };
      if (data.plantilla_version) {
        currentConfig.plantilla_version = data.plantilla_version;
        if (elVer) elVer.textContent = `Versión ${data.plantilla_version}`;
      }
      captureInitialSnapshot();
      showToast('Ajustes y plantilla oficial guardados. Regirá para nuevas invitaciones emitidas.');
      return true;
    } else {
      showToast('Error al guardar ajustes en el servidor');
      return false;
    }
  } catch (err) {
    console.warn('API inaccesible, guardando en memoria:', err);
    currentConfig = { ...currentConfig, ...payload };
    captureInitialSnapshot();
    showToast('Ajustes guardados localmente');
    return true;
  }
}

function downloadSampleCard() {
  const canvas = document.getElementById('settingsCanvas');
  if (!canvas) return;

  // Asegurar que el canvas visible tenga dibujado el bitmap activo actual
  const cached = themeCache.get(selectedTheme);
  if (cached) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cached, 0, 0);
  }

  const link = document.createElement('a');
  link.download = `plantilla-oficial-${selectedTheme}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Muestra oficial de tarjeta descargada');
}

function showToast(msg) {
  const toast = document.getElementById('settingsToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
