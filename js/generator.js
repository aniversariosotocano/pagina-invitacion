/**
 * Controlador de Protocolo Militar — Gestión de Invitaciones y SQLite
 * Base Aérea 'Cnel. José Enrique Soto Cano' — FAH
 * Diseño Sobrio, Anti-Slop y Modales Nativos (<dialog>)
 */

// Estado Global del Evento
let globalConfig = {
  nombre_evento: 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”',
  fecha_fundacion: '1988-09-01',
  aniversario: 38,
  aniversario_auto: true,
  fecha_evento: '24 de Septiembre de 2026',
  hora_evento: '10:00 am',
  vestimenta: 'Militar Uniforme D (Kepi) / Invitados Especiales Formal'
};

let guestList = [];
let currentFilter = 'activos'; // Por requerimiento oficial: filtro por defecto en ACTIVOS
let searchQuery = '';
let activeGuestForPreview = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Carga de Recursos Gráficos
const emblemImage = new Image();
emblemImage.src = 'assets/images/emblema-soto-cano.webp';
emblemImage.onload = () => {
  if (activeGuestForPreview) {
    drawCurrentPreview();
  }
};

const CARD_THEMES = {
  'tucano-sunset': 'assets/images/tucano-atardecer.webp',
  'supertucano': 'assets/images/Supertucano.webp',
  'maule': 'assets/images/Maule.webp',
  'tucanos-formacion': 'assets/images/tucanos-formacion.webp',
  'soto-cano-pista': 'assets/images/soto-cano-pista.webp',
  'tucano-vuelo': 'assets/images/tucano-vuelo.webp',
  'classic': null
};

const loadedBgImages = {};
Object.entries(CARD_THEMES).forEach(([key, src]) => {
  if (src) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      loadedBgImages[key] = img;
      if (activeGuestForPreview) {
        drawCurrentPreview();
      }
    };
  }
});

// Inicialización Principal
document.addEventListener('DOMContentLoaded', async () => {
  await initGlobalConfig();
  await initGuestList();
  initModals();
  initSearchAndFilter();
  initExcelTools();
});

/**
 * 1. CONFIGURACIÓN GLOBAL DEL EVENTO & CARGA DE PARÁMETROS
 */
async function initGlobalConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      globalConfig = await res.json();
    } else {
      const fallbackRes = await fetch('assets/data/config.json');
      if (fallbackRes.ok) globalConfig = await fallbackRes.json();
    }
  } catch (e) {
    console.warn('API no disponible, usando configuración local:', e);
    try {
      const fallbackRes = await fetch('assets/data/config.json');
      if (fallbackRes.ok) globalConfig = await fallbackRes.json();
    } catch (_) {}
  }
}

/**
 * 2. CARGA INICIAL DEL REGISTRO DE INVITADOS
 */
async function initGuestList() {
  try {
    const res = await fetch('/api/invitados?filtro=todos');
    if (res.status === 401 || res.status === 403) {
      window.location.replace('/login.html?next=' + encodeURIComponent(window.location.pathname));
      return;
    }
    if (res.ok) {
      const data = await res.json();
      processLoadedGuests(data);
      return;
    }
  } catch (e) {
    console.warn('API /api/invitados inaccesible, intentando JSON estático:', e);
  }

  // Fallback a JSON estático
  try {
    const res = await fetch('assets/data/invitados.json');
    const data = await res.json();
    processLoadedGuests(data);
  } catch (err) {
    console.error('No se pudo cargar la lista de invitados:', err);
  }
}

function processLoadedGuests(data) {
  guestList = data.map((item, idx) => ({
    no: item.no || idx + 1,
    id: item.id || 'invitado-' + (idx + 1),
    categoria: item.categoria || 'Invitado Especial',
    tratamiento: item.tratamiento || 'Al:',
    grado: item.grado || '',
    nombre: item.nombre || '',
    cargo: item.cargo || '',
    observaciones: item.observaciones || '',
    plantilla_id: item.plantilla_id || 'tucano-sunset',
    plantilla_version: item.plantilla_version || 1,
    updated_at: item.updated_at || '',
    activo: item.activo === true || item.activo === 1
  }));

  renderGuestTable();
  updateFilterCounts();

  // Seleccionar primer invitado activo para la vista previa
  const firstActive = guestList.find(g => g.activo) || guestList[0];
  if (firstActive) {
    activeGuestForPreview = firstActive;
  }
}

/**
 * 3. RENDERIZACIÓN DE LA TABLA A ANCHO COMPLETO
 */
function renderGuestTable() {
  const tbody = document.getElementById('guestsTableBody');
  const emptyNotice = document.getElementById('tableEmptyNotice');
  if (!tbody) return;

  tbody.innerHTML = '';

  const q = searchQuery.toLowerCase().trim();

  const filtered = guestList.filter(guest => {
    // Filtro oficial: 'activos' solo muestra los activados, 'inactivos' solo desactivados
    if (currentFilter === 'activos' && !guest.activo) return false;
    if (currentFilter === 'inactivos' && guest.activo) return false;

    if (q) {
      const matchName = (guest.nombre || '').toLowerCase().includes(q);
      const matchGrade = (guest.grado || '').toLowerCase().includes(q);
      const matchRole = (guest.cargo || '').toLowerCase().includes(q);
      const matchCat = (guest.categoria || '').toLowerCase().includes(q);
      const matchNo = String(guest.no).includes(q);
      return matchName || matchGrade || matchRole || matchCat || matchNo;
    }
    return true;
  });

  if (filtered.length === 0) {
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  } else {
    if (emptyNotice) emptyNotice.style.display = 'none';
  }

  // Requerimiento: Mostrar en inactivos desde más reciente a menos reciente
  if (currentFilter === 'inactivos') {
    filtered.sort((a, b) => {
      const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.no || 0) - (a.no || 0);
    });
  }

  filtered.forEach(guest => {
    const tr = document.createElement('tr');
    if (!guest.activo) tr.classList.add('row-inactive');

    // La fecha y hora en formato compacto
    const compactDT = formatCompactDateTime(globalConfig.fecha_evento, globalConfig.hora_evento);
    const safeGuest = {
      no: escapeHtml(guest.no),
      categoria: escapeHtml(guest.categoria || 'Invitado'),
      tratamiento: escapeHtml(guest.tratamiento || ''),
      grado: escapeHtml(guest.grado || ''),
      nombre: escapeHtml(guest.nombre),
      cargo: escapeHtml(guest.cargo || ''),
      observaciones: escapeHtml(guest.observaciones || ''),
      fecha: escapeHtml(compactDT.fecha),
      hora: escapeHtml(compactDT.hora)
    };

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700; color: var(--admin-gold);">${safeGuest.no}</td>
      <td style="max-width: 105px;"><span class="badge-category" title="${safeGuest.categoria}">${safeGuest.categoria}</span></td>
      <td>
        <div style="font-size: 0.72rem; color: var(--admin-sky);">${safeGuest.tratamiento}</div>
        <strong>${safeGuest.grado}</strong>
      </td>
      <td class="cell-name">
        <strong>${safeGuest.nombre}</strong>
        ${guest.observaciones ? `<div style="font-size: 0.7rem; color: #8ea4ba; margin-top: 2px;">${safeGuest.observaciones}</div>` : ''}
      </td>
      <td><span style="font-size: 0.8rem; color: var(--admin-text-sub);">${safeGuest.cargo}</span></td>
      <td style="white-space: nowrap;">
        <div style="font-size: 0.78rem; font-weight: 600; color: #f1f5f9; line-height: 1.25;">${safeGuest.fecha}</div>
        <small style="color: var(--admin-sky); font-size: 0.71rem;">${safeGuest.hora}</small>
      </td>
      <td style="text-align: center;">
        <span class="badge-status ${guest.activo ? 'badge-status-active' : 'badge-status-inactive'}">
          ${guest.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="text-align: center;">
        <div class="tbl-actions">
          <button type="button" class="btn-tbl btn-tbl-edit" title="Editar datos del invitado" aria-label="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-tbl btn-tbl-view" title="Ver tarjeta oficial" aria-label="Tarjeta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <button type="button" class="btn-tbl btn-tbl-copy" title="Copiar enlace de invitación" aria-label="Copiar Enlace">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </button>
          <button type="button" class="btn-tbl btn-tbl-download" title="Descargar tarjeta de invitación" aria-label="Descargar Tarjeta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </td>
    `;

    // Asignar eventos de fila (4 botones optimizados)
    tr.querySelector('.btn-tbl-edit').addEventListener('click', () => {
      openEditModal(guest);
    });

    tr.querySelector('.btn-tbl-view').addEventListener('click', () => {
      openPreviewModal(guest);
    });

    tr.querySelector('.btn-tbl-copy').addEventListener('click', () => {
      const url = buildGuestUrl(guest);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast(`Enlace copiado: ${guest.nombre}`);
        }).catch(() => {
          copyFallback(url, guest.nombre);
        });
      } else {
        copyFallback(url, guest.nombre);
      }
    });

    tr.querySelector('.btn-tbl-download').addEventListener('click', () => {
      downloadGuestCardDirect(guest);
    });

    tbody.appendChild(tr);
  });
}

function formatCompactDateTime(fechaStr, horaStr) {
  let f = String(fechaStr || '').trim();
  const meses = {
    'enero': 'Ene', 'febrero': 'Feb', 'marzo': 'Mar', 'abril': 'Abr',
    'mayo': 'May', 'junio': 'Jun', 'julio': 'Jul', 'agosto': 'Ago',
    'septiembre': 'Sep', 'octubre': 'Oct', 'noviembre': 'Nov', 'diciembre': 'Dic'
  };
  for (const [full, abbrev] of Object.entries(meses)) {
    const reg = new RegExp(`\\bde\\s+${full}\\b(\\s+de)?`, 'i');
    if (reg.test(f)) {
      f = f.replace(reg, abbrev);
      break;
    }
  }
  let h = String(horaStr || '').trim();
  return { fecha: f || fechaStr, hora: h };
}

function copyFallback(text, label) {
  const tempInput = document.createElement('input');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    document.execCommand('copy');
    showToast(`Enlace copiado: ${label || ''}`);
  } catch (err) {
    showToast('No se pudo copiar el enlace automáticamente');
  }
  document.body.removeChild(tempInput);
}

let guestPendingDeactivation = null;

function openConfirmDeactivateModal(guest) {
  guestPendingDeactivation = guest;
  const elName = document.getElementById('confirmDeactivateName');
  const elCargo = document.getElementById('confirmDeactivateCargo');
  if (elName) {
    elName.textContent = `${guest.grado ? guest.grado + ' ' : ''}${guest.nombre}`;
  }
  if (elCargo) {
    elCargo.textContent = guest.cargo ? `${guest.cargo} · ${guest.categoria || ''}` : (guest.categoria || 'Invitado Especial');
  }

  const dialog = document.getElementById('dialogConfirmDeactivate');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

let guestPendingDeletion = null;

function openConfirmDeleteModal(guest) {
  guestPendingDeletion = guest;
  const elName = document.getElementById('confirmDeleteGuestName');
  const elCargo = document.getElementById('confirmDeleteGuestCargo');
  if (elName) {
    elName.textContent = `${guest.grado ? guest.grado + ' ' : ''}${guest.nombre}`;
  }
  if (elCargo) {
    elCargo.textContent = guest.cargo ? `${guest.cargo} · ${guest.categoria || ''}` : (guest.categoria || 'Invitado Especial');
  }

  const dialog = document.getElementById('dialogConfirmDeleteGuest');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

async function deleteGuest(guestId) {
  try {
    const res = await fetch('/api/invitados/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId })
    });
    if (!res.ok) {
      showToast('No se pudo eliminar el invitado en el servidor');
      return;
    }
  } catch (e) {
    console.warn('API no disponible para eliminar:', e);
    showToast('No se pudo conectar al servidor; el registro no fue eliminado');
    return;
  }

  guestList = guestList.filter(g => g.id !== guestId);
  renderGuestTable();
  updateFilterCounts();
  showToast('Invitado eliminado definitivamente del registro');
}

async function toggleGuestActive(guest) {
  try {
    const res = await fetch('/api/invitados/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guest.id })
    });
    if (res.ok) {
      const data = await res.json();
      guest.activo = data.activo;
      guest.updated_at = data.updated_at || new Date().toISOString();
    } else {
      showToast('No se pudo actualizar el estado en el servidor');
      return;
    }
  } catch (error) {
    console.warn('API no disponible para actualizar estado:', error);
    showToast('No se pudo conectar al servidor; el estado no cambió');
    return;
  }

  renderGuestTable();
  updateFilterCounts();
  showToast(guest.activo ? `Invitación activada: ${guest.nombre}` : `Invitación desactivada: ${guest.nombre}`);
}

function updateFilterCounts() {
  const total = guestList.length;
  const activos = guestList.filter(g => g.activo).length;
  const inactivos = total - activos;

  const elTotal = document.getElementById('countTotal');
  const elActivos = document.getElementById('countActivos');
  const elInactivos = document.getElementById('countInactivos');

  if (elTotal) elTotal.textContent = total;
  if (elActivos) elActivos.textContent = activos;
  if (elInactivos) elInactivos.textContent = inactivos;
}

/**
 * 4. GESTIÓN DE MODALES NATIVOS (<dialog>)
 */
function initModals() {
  // Cerrar modales con atributo [data-close-dialog]
  document.querySelectorAll('[data-close-dialog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialogId = btn.getAttribute('data-close-dialog');
      const dialog = document.getElementById(dialogId);
      if (dialog && typeof dialog.close === 'function') {
        dialog.close();
      }
    });
  });

  // Botón: Registrar Nuevo Invitado
  const btnNew = document.getElementById('btnOpenNewGuestModal');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openEditModal({
        no: guestList.length + 1,
        id: 'invitado-' + (guestList.length + 1),
        categoria: 'Invitado Especial',
        tratamiento: 'Al:',
        grado: '',
        nombre: '',
        cargo: '',
        observaciones: '',
        plantilla_id: globalConfig.plantilla_predeterminada || 'tucano-sunset',
        plantilla_version: globalConfig.plantilla_version || 1,
        activo: false
      }, true);
    });
  }

  // Switch de estado en el modal de edición
  const modalActivo = document.getElementById('modalActivo');
  if (modalActivo) {
    modalActivo.addEventListener('change', (e) => {
      updateModalStatusLabel(e.target.checked);
    });
  }

  // Formulario del Modal de Edición
  const formGuest = document.getElementById('modalGuestForm');
  if (formGuest) {
    formGuest.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveModalGuest();
    });
  }

  // Botón Copiar Enlace dentro del modal de edición
  const btnModalCopy = document.getElementById('btnModalCopyLink');
  if (btnModalCopy) {
    btnModalCopy.addEventListener('click', () => {
      const data = getModalFormData();
      const url = buildGuestUrl(data);
      navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace copiado al portapapeles');
      });
    });
  }

  // Botón Ver Tarjeta dentro del modal de edición
  const btnModalPreview = document.getElementById('btnModalPreviewCard');
  if (btnModalPreview) {
    btnModalPreview.addEventListener('click', () => {
      const data = getModalFormData();
      document.getElementById('dialogEditGuest').close();
      openPreviewModal(data);
    });
  }

  // Botones dentro del modal de Preview
  const btnDl = document.getElementById('btnDownloadCardImage');
  if (btnDl) {
    btnDl.addEventListener('click', () => {
      downloadPreviewCardPNG();
    });
  }

  const btnPrevCopy = document.getElementById('btnPreviewCopyLink');
  if (btnPrevCopy) {
    btnPrevCopy.addEventListener('click', () => {
      if (!activeGuestForPreview) return;
      const url = buildGuestUrl(activeGuestForPreview);
      navigator.clipboard.writeText(url).then(() => {
        showToast('Enlace copiado al portapapeles');
      });
    });
  }

  const btnPrevTab = document.getElementById('btnPreviewOpenTab');
  if (btnPrevTab) {
    btnPrevTab.addEventListener('click', () => {
      if (!activeGuestForPreview) return;
      const url = buildGuestUrl(activeGuestForPreview);
      window.open(url, '_blank');
    });
  }

  // Botón Confirmar Desactivación en Modal de Confirmación
  const btnConfirmDeact = document.getElementById('btnConfirmDeactivateAction');
  if (btnConfirmDeact) {
    btnConfirmDeact.addEventListener('click', async () => {
      if (guestPendingDeactivation) {
        const target = guestPendingDeactivation;
        guestPendingDeactivation = null;
        const dialog = document.getElementById('dialogConfirmDeactivate');
        if (dialog && typeof dialog.close === 'function') {
          dialog.close();
        }
        await toggleGuestActive(target);
      }
    });
  }

  // Botón Eliminar dentro del modal de edición
  const btnModalDelete = document.getElementById('btnModalDeleteGuest');
  if (btnModalDelete) {
    btnModalDelete.addEventListener('click', () => {
      const guestId = document.getElementById('modalGuestId').value;
      const currentGuest = guestList.find(g => g.id === guestId) || {
        id: guestId,
        nombre: document.getElementById('modalNombre').value,
        grado: document.getElementById('modalGrado').value,
        cargo: document.getElementById('modalCargo').value
      };
      if (!currentGuest.id) return;
      openConfirmDeleteModal(currentGuest);
    });
  }

  // Botón Confirmar Eliminación en Modal de Confirmación
  const btnConfirmDelete = document.getElementById('btnConfirmDeleteGuestAction');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      if (guestPendingDeletion) {
        const target = guestPendingDeletion;
        guestPendingDeletion = null;

        const dlgConfirm = document.getElementById('dialogConfirmDeleteGuest');
        if (dlgConfirm && typeof dlgConfirm.close === 'function') {
          dlgConfirm.close();
        }

        const dlgEdit = document.getElementById('dialogEditGuest');
        if (dlgEdit && typeof dlgEdit.close === 'function') {
          dlgEdit.close();
        }

        await deleteGuest(target.id);
      }
    });
  }
}

function openEditModal(guest, isNew = false) {
  document.getElementById('modalGuestId').value = guest.id || '';
  document.getElementById('modalGuestNo').value = guest.no || '';
  document.getElementById('modalCategoria').value = guest.categoria || 'Invitado Especial';
  document.getElementById('modalTratamiento').value = guest.tratamiento || 'Al:';
  document.getElementById('modalGrado').value = guest.grado || '';
  document.getElementById('modalNombre').value = guest.nombre || '';
  document.getElementById('modalCargo').value = guest.cargo || '';
  
  const btnModalDelete = document.getElementById('btnModalDeleteGuest');
  if (btnModalDelete) {
    btnModalDelete.style.display = isNew ? 'none' : 'inline-flex';
  }

  const elObs = document.getElementById('modalObservaciones');
  if (elObs) elObs.value = guest.observaciones || '';

  const isActivo = guest.activo === true || guest.activo === 1;
  const elActivo = document.getElementById('modalActivo');
  if (elActivo) {
    elActivo.checked = isActivo;
    updateModalStatusLabel(isActivo);
  }

  const subtitle = document.getElementById('dialogSubtitle');
  if (subtitle) {
    subtitle.textContent = isNew 
      ? 'Ingrese los datos del nuevo invitado para incorporarlo al registro oficial.' 
      : `Modificando registro de: ${guest.nombre}`;
  }

  const dialog = document.getElementById('dialogEditGuest');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function updateModalStatusLabel(isActive) {
  const label = document.getElementById('modalLabelStatus');
  if (label) {
    label.textContent = isActive ? 'Invitación Habilitada (Activa)' : 'Invitación Deshabilitada (Inactiva)';
    label.style.color = isActive ? '#7de894' : '#f8949e';
  }
}

function getModalFormData() {
  const elObs = document.getElementById('modalObservaciones');
  const guestId = document.getElementById('modalGuestId').value.trim() || 'invitado-' + Date.now();
  const existing = guestList.find(g => g.id === guestId);

  return {
    id: guestId,
    no: parseInt(document.getElementById('modalGuestNo').value, 10) || guestList.length + 1,
    categoria: document.getElementById('modalCategoria').value.trim() || 'Invitado Especial',
    tratamiento: document.getElementById('modalTratamiento').value.trim(),
    grado: document.getElementById('modalGrado').value.trim(),
    nombre: document.getElementById('modalNombre').value.trim(),
    cargo: document.getElementById('modalCargo').value.trim(),
    observaciones: elObs ? elObs.value.trim() : '',
    plantilla_id: existing ? (existing.plantilla_id || globalConfig.plantilla_predeterminada || 'tucano-sunset') : (globalConfig.plantilla_predeterminada || 'tucano-sunset'),
    plantilla_version: existing ? (existing.plantilla_version || globalConfig.plantilla_version || 1) : (globalConfig.plantilla_version || 1),
    activo: document.getElementById('modalActivo').checked
  };
}

function getThemeDisplayName(themeKey) {
  const names = {
    'tucano-sunset': 'Tucano al Atardecer',
    'supertucano': 'A-29B Super Tucano',
    'maule': 'Maule M-7 Táctico',
    'tucanos-formacion': 'Escuadrilla Tucano',
    'soto-cano-pista': 'Base Aérea Soto Cano',
    'tucano-vuelo': 'Tucano en Vuelo Rasante',
    'classic': 'Fondo Institucional Azul'
  };
  return names[themeKey] || 'Tucano al Atardecer';
}

async function saveModalGuest() {
  const data = getModalFormData();
  if (!data.nombre || data.nombre.length < 3) {
    showToast('El nombre del invitado debe tener al menos 3 caracteres.');
    const el = document.getElementById('modalNombre');
    if (el) el.focus();
    return;
  }
  if (!data.categoria || data.categoria.length < 3) {
    showToast('La categoría del invitado es obligatoria.');
    const el = document.getElementById('modalCategoria');
    if (el) el.focus();
    return;
  }

  try {
    const res = await fetch('/api/invitados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      showToast('No se pudo guardar el invitado en el servidor');
      return;
    }
  } catch (e) {
    console.warn('API no disponible para guardar invitado:', e);
    showToast('No se pudo conectar al servidor; los cambios no se guardaron');
    return;
  }

  const existingIdx = guestList.findIndex(g => g.id === data.id || (g.nombre && g.nombre.toLowerCase() === data.nombre.toLowerCase()));

  if (existingIdx >= 0) {
    guestList[existingIdx] = { ...guestList[existingIdx], ...data };
    showToast(`Registro actualizado: ${data.nombre}`);
  } else {
    guestList.push(data);
    showToast(`Registrado con éxito: ${data.nombre}`);
  }

  renderGuestTable();
  updateFilterCounts();
  document.getElementById('dialogEditGuest').close();
}

/**
 * 5. MODAL DE VISTA PREVIA BAJO DEMANDA (1200 x 630 px)
 */
function openPreviewModal(guest) {
  activeGuestForPreview = guest;

  const themeKey = guest.plantilla_id || globalConfig.plantilla_predeterminada || 'tucano-sunset';
  const badgeTheme = document.getElementById('previewCardThemeName');
  if (badgeTheme) {
    badgeTheme.textContent = getThemeDisplayName(themeKey);
  }

  drawCurrentPreview();

  const previewSubtitle = document.getElementById('previewSubtitle');
  if (previewSubtitle) {
    previewSubtitle.textContent = `Invitación Oficial para: ${guest.grado ? guest.grado + ' ' : ''}${guest.nombre}`;
  }

  const dialog = document.getElementById('dialogPreviewCard');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function drawCurrentPreview() {
  if (!activeGuestForPreview) return;

  const canvas = document.getElementById('ogCanvas');
  const themeKey = activeGuestForPreview.plantilla_id || globalConfig.plantilla_predeterminada || 'tucano-sunset';
  const bgImg = loadedBgImages[themeKey] || null;

  if (canvas && typeof window.drawMilitaryOGCanvas === 'function') {
    window.drawMilitaryOGCanvas(canvas, {
      tratamiento: activeGuestForPreview.tratamiento,
      grado: activeGuestForPreview.grado,
      nombre: activeGuestForPreview.nombre,
      cargo: activeGuestForPreview.cargo,
      nombreEvento: globalConfig.nombre_evento || 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”',
      aniversario: String(globalConfig.aniversario || '38'),
      fecha: (globalConfig.fecha_evento || '24 de Septiembre de 2026').toUpperCase(),
      hora: (globalConfig.hora_evento || '10:00 am').toUpperCase(),
      emblemImg: emblemImage,
      bgImg: bgImg
    });

    const wsImg = document.getElementById('wsPreviewImg');
    if (wsImg) {
      wsImg.src = canvas.toDataURL('image/png');
    }
  }

  const wsTitle = document.getElementById('wsPreviewTitle');
  if (wsTitle) {
    wsTitle.textContent = `Invitación Oficial — ${activeGuestForPreview.grado ? activeGuestForPreview.grado + ' ' : ''}${activeGuestForPreview.nombre}`;
  }

  const wsDesc = document.getElementById('wsPreviewDesc');
  if (wsDesc) {
    const anivText = globalConfig.aniversario ? `${globalConfig.aniversario}.º ` : '';
    const eventoText = globalConfig.nombre_evento || 'Aniversario de la Base Aérea Soto Cano';
    wsDesc.textContent = `Invitación de honor al ${anivText}${eventoText}. ${globalConfig.fecha_evento}, ${globalConfig.hora_evento}.`;
  }
}

function downloadPreviewCardPNG() {
  const canvas = document.getElementById('ogCanvas');
  if (!canvas || !activeGuestForPreview) return;

  const slug = (activeGuestForPreview.nombre || 'invitado').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const link = document.createElement('a');
  link.download = `tarjeta-oficial-${slug}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Tarjeta de gala descargada');
}

/**
 * Descarga directa e individual de la tarjeta oficial de un invitado desde la columna de acciones
 */
function downloadGuestCardDirect(guest) {
  if (!guest) return;

  const themeKey = guest.plantilla_id || globalConfig.plantilla_predeterminada || 'tucano-sunset';
  const bgSrc = CARD_THEMES[themeKey];

  const doRenderAndDownload = (bgImg) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;

    if (typeof window.drawMilitaryOGCanvas === 'function') {
      window.drawMilitaryOGCanvas(canvas, {
        tratamiento: guest.tratamiento,
        grado: guest.grado,
        nombre: guest.nombre,
        cargo: guest.cargo,
        nombreEvento: globalConfig.nombre_evento || 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”',
        aniversario: String(globalConfig.aniversario || '38'),
        fecha: (globalConfig.fecha_evento || '24 de Septiembre de 2026').toUpperCase(),
        hora: (globalConfig.hora_evento || '10:00 am').toUpperCase(),
        emblemImg: emblemImage,
        bgImg: bgImg
      });

      const slug = (guest.nombre || 'invitado').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const link = document.createElement('a');
      link.download = `tarjeta-invitacion-${slug}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`Tarjeta descargada: ${guest.nombre}`);
    }
  };

  if (bgSrc && (!loadedBgImages[themeKey] || !loadedBgImages[themeKey].complete)) {
    const tempImg = new Image();
    tempImg.src = bgSrc;
    tempImg.onload = () => {
      loadedBgImages[themeKey] = tempImg;
      doRenderAndDownload(tempImg);
    };
    tempImg.onerror = () => {
      doRenderAndDownload(null);
    };
  } else {
    doRenderAndDownload(loadedBgImages[themeKey] || null);
  }
}

/**
 * 6. CONSTRUCCIÓN DE ENLACE PERSONALIZADO
 * Aplica los parámetros de identidad y hereda los globales
 */
function buildGuestUrl(guest) {
  const base = window.location.origin + window.location.pathname.replace('admin.html', '').replace(/\/$/, '') + '/index.html';
  const params = new URLSearchParams();

  if (guest.nombre) params.set('nombre', guest.nombre);
  if (guest.grado) params.set('grado', guest.grado);
  if (guest.cargo) params.set('cargo', guest.cargo);
  if (guest.tratamiento) params.set('tratamiento', guest.tratamiento);
  if (globalConfig.nombre_evento) params.set('nombre_evento', globalConfig.nombre_evento);
  if (globalConfig.fecha_evento) params.set('fecha', globalConfig.fecha_evento);
  if (globalConfig.hora_evento) params.set('hora', globalConfig.hora_evento);
  if (globalConfig.aniversario) params.set('aniversario', globalConfig.aniversario);
  if (globalConfig.vestimenta) params.set('vestimenta', globalConfig.vestimenta);
  if (guest.plantilla_id) params.set('tema', guest.plantilla_id);

  return `${base}?${params.toString()}`;
}

/**
 * 7. BÚSQUEDA Y FILTROS EN TIEMPO REAL
 */
function initSearchAndFilter() {
  const inputSearch = document.getElementById('inputSearchGuests');
  const btnClear = document.getElementById('btnClearSearch');

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (btnClear) btnClear.style.display = searchQuery ? 'block' : 'none';
      renderGuestTable();
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      inputSearch.value = '';
      searchQuery = '';
      btnClear.style.display = 'none';
      renderGuestTable();
    });
  }

  document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderGuestTable();
    });
  });
}

/**
 * 8. HERRAMIENTAS DE EXCEL
 * REGLA ESTRICTA DE PROTOCOLO: La plantilla NO incluye Estado, Hora, Vestimenta ni Aniversario.
 */
function initExcelTools() {
  const btnDlTemplate = document.getElementById('btnDownloadTemplate');
  if (btnDlTemplate) {
    btnDlTemplate.addEventListener('click', () => {
      downloadExcelTemplate();
    });
  }

  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      handleExcelUpload(file);
      fileInput.value = '';
    });
  }

  const btnExport = document.getElementById('btnExportExcel');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportCurrentListToExcel();
    });
  }

  const btnTemplate = document.getElementById('btnDownloadTemplate');
  if (btnTemplate) {
    btnTemplate.addEventListener('click', () => {
      downloadExcelTemplate();
    });
  }
}

/**
 * Genera la plantilla de Excel limpia solicitada
 * Sin estado, hora, vestimenta ni aniversario (definidos de forma global)
 */
function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    alert('Librería XLSX no disponible');
    return;
  }

  const templateData = [
    {
      'N.°': 1,
      'Grupo / Categoría': 'Alto Mando FAH',
      'Tratamiento': 'Al: Sr. Comandante General De La FAH',
      'Grado / Título': 'GENERAL DE BRIGADA',
      'Nombre Completo': 'WALTER YANUARIO PAZ LÓPEZ',
      'Cargo / Dependencia': 'Comandante General de la Fuerza Aérea Hondureña',
      'Observaciones': 'Mando Principal'
    },
    {
      'N.°': 2,
      'Grupo / Categoría': 'Fuerzas Aliadas JTF-Bravo',
      'Tratamiento': 'Al: Sr. Comandante de la FTC-Bravo',
      'Grado / Título': 'CORONEL',
      'Nombre Completo': 'DAVID A. WEBB',
      'Cargo / Dependencia': 'Comandante de la Fuerza de Tarea Conjunta Bravo (JTF-B)',
      'Observaciones': 'Aliado Estratégico'
    },
    {
      'N.°': 3,
      'Grupo / Categoría': 'Invitado Especial Civil',
      'Tratamiento': 'Al distinguido señor: Director Ejecutivo',
      'Grado / Título': 'DOCTOR',
      'Nombre Completo': 'JORGE LEONARDO TORRES',
      'Cargo / Dependencia': 'Director Ejecutivo Hospital Santa Teresa, Comayagua',
      'Observaciones': 'Sector Salud'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Invitados');
  XLSX.writeFile(wb, 'plantilla_oficial_invitados_sotocano.xlsx');
  showToast('Plantilla oficial de Excel descargada');
}

/**
 * Importa archivo Excel y lo incorpora al registro
 */
function handleExcelUpload(file) {
  if (typeof XLSX === 'undefined') {
    alert('Librería XLSX no disponible');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      if (!rows || rows.length === 0) {
        alert('El archivo no contiene filas legibles.');
        return;
      }

      let count = 0;
      const importedGuests = [];

      rows.forEach((row, idx) => {
        const nombre = row['Nombre Completo'] || row['NOMBRE COMPLETO'] || row['Nombre'] || row['NOMBRE'] || row['nombre'];
        if (!nombre) return;

        const no = parseInt(row['N.°'] || row['No.'] || row['NO'] || row['No'] || (guestList.length + count + 1), 10);
        const categoria = row['Grupo / Categoría'] || row['Ámbito'] || row['Ambito'] || row['CATEGORIA'] || 'Invitado Especial';
        const grado = row['Grado / Título'] || row['Grado'] || row['GRADO'] || '';
        const cargo = row['Cargo / Dependencia'] || row['CARGO'] || row['Cargo'] || '';
        const tratamiento = row['Tratamiento'] || row['TRATAMIENTO'] || 'Al:';
        const observaciones = row['Observaciones'] || row['OBSERVACIONES'] || '';

        // Por defecto inactivos salvo que se activen manualmente en el panel
        const activo = false;

        const guestObj = {
          no,
          id: 'invitado-' + no,
          categoria: String(categoria).trim(),
          tratamiento: String(tratamiento).trim(),
          grado: String(grado).trim(),
          nombre: String(nombre).trim(),
          cargo: String(cargo).trim(),
          observaciones: String(observaciones).trim(),
          plantilla_id: globalConfig.plantilla_predeterminada || 'tucano-sunset',
          plantilla_version: globalConfig.plantilla_version || 1,
          activo
        };

        importedGuests.push(guestObj);
        count++;
      });

      // Enviar a SQLite en lote si el backend está activo
      try {
        await fetch('/api/invitados/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitados: importedGuests })
        });
      } catch (err) {
        console.warn('Importación directa a API falló, integrando localmente:', err);
      }

      // Actualizar listado en memoria
      importedGuests.forEach(newG => {
        const idx = guestList.findIndex(g => g.nombre.toLowerCase() === newG.nombre.toLowerCase());
        if (idx >= 0) {
          guestList[idx] = { ...guestList[idx], ...newG };
        } else {
          guestList.push(newG);
        }
      });

      renderGuestTable();
      updateFilterCounts();
      showToast(`Se incorporaron ${count} registros desde Excel`);

    } catch (err) {
      console.error('Error al procesar archivo:', err);
      alert('Error al leer el archivo Excel.');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Exporta el listado actual respetando configuración global
 */
function exportCurrentListToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Librería XLSX no disponible');
    return;
  }

  const exportData = guestList.map(g => ({
    'N.°': g.no,
    'Grupo / Categoría': g.categoria,
    'Tratamiento': g.tratamiento,
    'Grado / Título': g.grado,
    'Nombre Completo': g.nombre,
    'Cargo / Dependencia': g.cargo,
    'Observaciones': g.observaciones,
    'Estado': g.activo ? 'Activo' : 'Inactivo',
    'Fecha Evento (Global)': globalConfig.fecha_evento,
    'Hora Evento (Global)': globalConfig.hora_evento,
    'Vestimenta (Global)': globalConfig.vestimenta,
    'Aniversario (Global)': globalConfig.aniversario
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Registro Oficial');
  XLSX.writeFile(wb, 'registro_invitados_soto_cano_protocolo.xlsx');
  showToast('Listado oficial exportado a Excel');
}

/**
 * Notificación Toast
 */
function showToast(msg) {
  const toast = document.getElementById('adminToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}
