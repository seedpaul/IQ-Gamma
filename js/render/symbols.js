import { clamp } from "../engine/utils.js";

export function symbolToSvg(sym, size=86){
  const s = size;
  const pad = 10;
  const cx = s/2;
  const cy = s/2;
  const count = sym.count ?? 1;

  const shape = sym.shape ?? "circle";
  const fill = sym.fill ?? "none";
  const rot = sym.rot ?? 0;
  const invert = sym.invert ?? 0;

  const stroke = invert ? "#0b0f17" : "#e5e7eb";
  const bg = invert ? "#e5e7eb" : "transparent";

  const fillStyle = (fill === "solid") ? (invert ? "#0b0f17" : "#e5e7eb") : "none";

  // stripe pattern
  const pattern = `
    <defs>
      <pattern id="stripe" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="3" height="6" fill="${stroke}" opacity="0.65"></rect>
      </pattern>
    </defs>
  `;

  const fillAttr = fill === "stripe" ? 'url(#stripe)' : fillStyle;

  const unit = 18;
  const offsets = count === 1
    ? [[0,0]]
    : count === 2
      ? [[-unit/1.2,0],[unit/1.2,0]]
      : [[-unit,0],[0,0],[unit,0]];

  const shapePath = (x,y) => {
    if (shape === "circle"){
      return `<circle cx="${cx+x}" cy="${cy+y}" r="14" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"></circle>`;
    }
    if (shape === "square"){
      return `<rect x="${cx+x-14}" y="${cy+y-14}" width="28" height="28" fill="${fillAttr}" stroke="${stroke}" stroke-width="3" rx="4"></rect>`;
    }
    if (shape === "triangle"){
      return `<path d="M ${cx+x} ${cy+y-16} L ${cx+x-16} ${cy+y+14} L ${cx+x+16} ${cy+y+14} Z" fill="${fillAttr}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"></path>`;
    }
    // diamond
    return `<path d="M ${cx+x} ${cy+y-18} L ${cx+x-18} ${cy+y} L ${cx+x} ${cy+y+18} L ${cx+x+18} ${cy+y} Z" fill="${fillAttr}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"></path>`;
  };

  const body = offsets.map(([x,y]) => shapePath(x,y)).join("");

  return `
  <svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
    ${pattern}
    <rect x="0" y="0" width="${s}" height="${s}" fill="${bg}" opacity="0.18"></rect>
    <g transform="rotate(${rot} ${cx} ${cy})">
      ${body}
    </g>
  </svg>
  `;
}

export function renderSymbolGrid(canvas, symbols, cols=2){
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const rows = Math.ceil(symbols.length / cols);
  const cellW = w / cols;
  const cellH = h / rows;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0,0,w,h);
  ctx.restore();

  // We render SVG by drawing simplified shapes directly on canvas
  for (let i = 0; i < symbols.length; i++){
    const sym = symbols[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x0 = col * cellW;
    const y0 = row * cellH;
    drawSymbolCanvas(ctx, sym, x0 + cellW/2, y0 + cellH/2, Math.min(cellW, cellH) * 0.42);
  }
}

function drawSymbolCanvas(ctx, sym, cx, cy, r){
  const stroke = sym.invert ? "#0b0f17" : "#e5e7eb";
  const fillMode = sym.fill ?? "none";

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((sym.rot ?? 0) * Math.PI) / 180);

  const count = sym.count ?? 1;
  const offsets = count === 1
    ? [[0,0]]
    : count === 2
      ? [[-r*0.6,0],[r*0.6,0]]
      : [[-r*0.8,0],[0,0],[r*0.8,0]];

  for (const [ox,oy] of offsets){
    ctx.save();
    ctx.translate(ox, oy);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = stroke;

    if (fillMode === "solid"){
      ctx.fillStyle = sym.invert ? "#0b0f17" : "#e5e7eb";
    }else{
      ctx.fillStyle = "rgba(0,0,0,0)";
    }

    const shape = sym.shape ?? "circle";
    if (shape === "circle"){
      ctx.beginPath();
      ctx.arc(0,0, r*0.55, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }else if (shape === "square"){
      const s = r*1.05;
      roundRect(ctx, -s/2, -s/2, s, s, r*0.18);
      ctx.fill();
      ctx.stroke();
    }else if (shape === "triangle"){
      ctx.beginPath();
      ctx.moveTo(0, -r*0.75);
      ctx.lineTo(-r*0.75, r*0.62);
      ctx.lineTo(r*0.75, r*0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }else{
      ctx.beginPath();
      ctx.moveTo(0, -r*0.8);
      ctx.lineTo(-r*0.8, 0);
      ctx.lineTo(0, r*0.8);
      ctx.lineTo(r*0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (fillMode === "stripe"){
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = stroke;
      for (let k = -6; k <= 6; k++){
        ctx.beginPath();
        ctx.moveTo(-r + k*6, -r);
        ctx.lineTo(r + k*6, r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  const rr = clamp(r, 0, Math.min(w,h)/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
