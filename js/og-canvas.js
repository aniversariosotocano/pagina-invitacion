/**
 * Generador de Tarjeta Protocolaria de Invitación Oficial (1200x630 px)
 * Estética institucional de gala: Base Aérea 'Cnel. José Enrique Soto Cano'
 */

function drawMilitaryOGCanvas(canvas, options = {}) {
  const {
    tratamiento = 'Al: Sr. Comandante General De La FAH',
    grado = 'GENERAL DE BRIGADA',
    nombre = 'WALTER YANUARIO PAZ LÓPEZ',
    cargo = 'Comandante General de la Fuerza Aérea Hondureña',
    aniversario = '38',
    nombreEvento = 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”',
    fecha = '24 DE SEPTIEMBRE 2026',
    hora = '10:00 AM',
    emblemImg = null,
    bgImg = null
  } = options;

  if (canvas.width !== 1200) canvas.width = 1200;
  if (canvas.height !== 630) canvas.height = 630;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1200, 630);

  // 1. Fondo (Imagen fotográfica o degradado radial clásico)
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    const isCutout = bgImg.src && (bgImg.src.includes('Supertucano') || bgImg.src.includes('Maule'));

    if (isCutout) {
      // Fondo radial naval institucional
      const bgGrad = ctx.createRadialGradient(600, 200, 50, 600, 315, 650);
      bgGrad.addColorStop(0, '#102a4e');
      bgGrad.addColorStop(0.65, '#061222');
      bgGrad.addColorStop(1, '#030811');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1200, 630);

      // Aeronave protagonista en el lienzo
      const maxW = 720;
      const maxH = 320;
      const scale = Math.min(maxW / bgImg.naturalWidth, maxH / bgImg.naturalHeight);
      const w = bgImg.naturalWidth * scale;
      const h = bgImg.naturalHeight * scale;
      const x = (1200 - w) / 2;
      const y = (630 - h) / 2 + 25;

      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.drawImage(bgImg, x, y, w, h);
      ctx.restore();
    } else {
      // Dibujo con cover fit para fotografías panorámicas
      const scale = Math.max(1200 / bgImg.naturalWidth, 630 / bgImg.naturalHeight);
      const w = bgImg.naturalWidth * scale;
      const h = bgImg.naturalHeight * scale;
      const x = (1200 - w) / 2;
      const y = (630 - h) / 2;
      ctx.drawImage(bgImg, x, y, w, h);

      // Velo naval profundo para garantizar legibilidad absoluta y contraste
      const darkOverlay = ctx.createLinearGradient(0, 0, 0, 630);
      darkOverlay.addColorStop(0, 'rgba(6, 17, 32, 0.84)');
      darkOverlay.addColorStop(0.4, 'rgba(4, 13, 26, 0.88)');
      darkOverlay.addColorStop(0.75, 'rgba(3, 10, 20, 0.93)');
      darkOverlay.addColorStop(1, 'rgba(2, 6, 14, 0.97)');
      ctx.fillStyle = darkOverlay;
      ctx.fillRect(0, 0, 1200, 630);

      // Viñeta perimetral
      const vignette = ctx.createRadialGradient(600, 315, 280, 600, 315, 760);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 1200, 630);
    }
  } else {
    // Fondo radial naval institucional clásico
    const bgGrad = ctx.createRadialGradient(600, 200, 50, 600, 315, 650);
    bgGrad.addColorStop(0, '#102a4e');
    bgGrad.addColorStop(0.65, '#061222');
    bgGrad.addColorStop(1, '#030811');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 630);
  }

  // 2. Marco exterior dorado
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 1140, 570);

  // Marco interior dorado fino
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(42, 42, 1116, 546);

  // Esquinas ornamentales
  const drawCorner = (x, y, dx, dy) => {
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + dx * 28, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 28);
    ctx.stroke();
  };
  drawCorner(30, 30, 1, 1);
  drawCorner(1170, 30, -1, 1);
  drawCorner(30, 600, 1, -1);
  drawCorner(1170, 600, -1, -1);

  // 3. Emblema central
  const emblemSize = 104;
  const emblemY = 44;
  if (emblemImg && emblemImg.complete && emblemImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(600, emblemY + emblemSize / 2, emblemSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(emblemImg, 600 - emblemSize / 2, emblemY, emblemSize, emblemSize);
    ctx.restore();

    // Borde dorado al emblema
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(600, emblemY + emblemSize / 2, emblemSize / 2 + 1, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0e2445';
    ctx.beginPath();
    ctx.arc(600, emblemY + emblemSize / 2, emblemSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f7e7a9';
    ctx.font = 'bold 24px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FAH', 600, emblemY + emblemSize / 2 + 8);
  }

  // 4. Estrellas doradas de mando con separación simétrica y aireada
  ctx.textAlign = 'center';
  const drawCanvasStar = (cx, cy, rOuter, rInner) => {
    ctx.fillStyle = '#fae69e';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  drawCanvasStar(580, 180, 8.5, 3.8);
  drawCanvasStar(620, 180, 8.5, 3.8);

  // Título de Aniversario / Evento dinámico con degradado dorado
  const goldTextGrad = ctx.createLinearGradient(300, 220, 900, 260);
  goldTextGrad.addColorStop(0, '#c49a32');
  goldTextGrad.addColorStop(0.5, '#fae69e');
  goldTextGrad.addColorStop(1, '#c89e35');
  ctx.fillStyle = goldTextGrad;

  const rawTitle = (nombreEvento || 'Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”').toUpperCase().trim();
  const anivNum = String(aniversario || '').trim();
  const anivPrefix = anivNum ? `${anivNum}.º ` : '';
  const fullTitle = (anivPrefix + rawTitle).replace(/\s+/g, ' ');

  // Se utiliza Cinzel / Times New Roman para garantizar que los números (38) estén alineados a la misma línea base y altura que las letras mayúsculas
  ctx.font = 'bold 27px "Cinzel", "Times New Roman", serif';
  const fullWidth = ctx.measureText(fullTitle).width;

  // Si cabe holgadamente en 1 línea (< 780px) se imprime directo
  if (fullWidth <= 780) {
    ctx.fillText(fullTitle, 600, 238);
  } else {
    // Si es extenso, dividirlo en 2 líneas equilibradas y proporcionadas
    let line1 = '';
    let line2 = '';

    if (fullTitle.includes(' DE LA ')) {
      const parts = fullTitle.split(' DE LA ');
      line1 = parts[0] + ' DE LA';
      line2 = parts.slice(1).join(' DE LA ');
    } else if (fullTitle.includes(' DEL ')) {
      const parts = fullTitle.split(' DEL ');
      line1 = parts[0] + ' DEL';
      line2 = parts.slice(1).join(' DEL ');
    } else if (fullTitle.includes(' DE ')) {
      const parts = fullTitle.split(' DE ');
      line1 = parts[0];
      line2 = 'DE ' + parts.slice(1).join(' DE ');
    } else {
      const words = fullTitle.split(' ');
      const mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
    }

    // Línea 1 (Aniversario / Tema principal)
    let s1 = 27;
    ctx.font = `bold ${s1}px "Cinzel", "Times New Roman", serif`;
    while (ctx.measureText(line1).width > 820 && s1 > 18) {
      s1--;
      ctx.font = `bold ${s1}px "Cinzel", "Times New Roman", serif`;
    }
    ctx.fillText(line1, 600, 224);

    // Línea 2 (Nombre de la Base o subtítulo de evento)
    let s2 = 22;
    ctx.font = `bold ${s2}px "Cinzel", "Times New Roman", serif`;
    while (ctx.measureText(line2).width > 820 && s2 > 16) {
      s2--;
      ctx.font = `bold ${s2}px "Cinzel", "Times New Roman", serif`;
    }
    ctx.fillText(line2, 600, 258);
  }

  // Línea divisoria ceremonial entre el evento y el invitado
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(380, 292);
  ctx.lineTo(820, 292);
  ctx.stroke();

  // 5. Caja ceremonial para el invitado
  ctx.fillStyle = 'rgba(4, 15, 29, 0.75)';
  ctx.fillRect(180, 318, 840, 164);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(180, 318, 840, 164);

  // Grado
  ctx.fillStyle = '#fae69e';
  ctx.font = 'bold 20px Montserrat, sans-serif';
  ctx.fillText((grado || '').toUpperCase(), 600, 354);

  // Nombre
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText((nombre || '').toUpperCase(), 600, 402);

  // Cargo
  ctx.fillStyle = '#c9d6e4';
  ctx.font = '500 18px Montserrat, sans-serif';
  ctx.fillText(cargo || '', 600, 445);

  // 6. Fecha y Hora dinámicas con espaciado limpio y elegante
  ctx.fillStyle = '#70b4e0';
  ctx.font = '600 17px Montserrat, sans-serif';
  const fechaHoraTexto = (fecha || '').toUpperCase() + ' · ' + (hora || '').toUpperCase();
  ctx.fillText(fechaHoraTexto, 600, 530);
}

if (typeof window !== 'undefined') {
  window.drawMilitaryOGCanvas = drawMilitaryOGCanvas;
}
