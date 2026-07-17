'use strict';

// Reine SVG-Generatoren für die Chart-Datenpunkte (keine Browser-/ioBroker-Abhängigkeit).
// Ausgabe ist ein self-contained SVG-String, der in beliebigen Dashboards (VIS, eigene
// Web-Apps, Grafana-Text, …) direkt angezeigt werden kann.

function niceCeil(v) {
    if (v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v))), n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDE(v, dec) { return v == null ? '–' : v.toFixed(dec).replace('.', ','); }
function ddmm(ts) { const d = new Date(ts); return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.'; }

function downsample(arr, max) {
    if (!arr || arr.length <= max) return arr || [];
    const step = Math.ceil(arr.length / max), out = [];
    for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
    if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
    return out;
}
function polyline(arr, X, Y) {
    return arr.map((p, i) => (i ? 'L' : 'M') + ' ' + X(p.ts).toFixed(1) + ' ' + Y(p.val).toFixed(1)).join(' ');
}
function theme(opts) {
    opts = opts || {};
    return {
        bg: opts.bg || '#1f1f1f', fg: opts.fg || '#e6e6e6',
        grid: opts.grid || '#3a3a3a', muted: opts.muted || '#9a9a9a',
    };
}
const HEAD = (w, h) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
    '" preserveAspectRatio="xMidYMid meet" font-family="Segoe UI,Arial,sans-serif" font-size="11">';

/**
 * Tagesverlauf: Netz-Saldo (rot Bezug oben / blau Einspeisung unten, ohne + mit Speicher),
 * Speicherleistung (orange) und Ladestand (grün, rechte %-Achse).
 * @typedef {Array<{ts:number, val:number}>} Series
 * @typedef {{bg?:string, fg?:string, grid?:string, muted?:string}} ThemeOpts
 * @param {{start:number, end:number, netOrig:Series, netSim:Series, batt:Series, soc:Series}} d
 * @param {ThemeOpts} [opts]
 */
function dayChartSvg(d, opts) {
    const W = 820, H = 360, t = theme(opts);
    const padL = 46, padR = 40, padT = 14, padB = 46;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x0 = d.start, x1 = d.end;
    const netOrig = downsample(d.netOrig, 500), netSim = downsample(d.netSim, 500),
        batt = downsample(d.batt, 500), soc = downsample(d.soc, 500);

    let maxAbs = 100;
    [netOrig, netSim, batt].forEach((a) => a.forEach((p) => { if (Math.abs(p.val) > maxAbs) maxAbs = Math.abs(p.val); }));
    const hi = niceCeil(maxAbs), lo = -hi;
    const X = (ts) => padL + (ts - x0) / (x1 - x0) * plotW;
    const Yl = (v) => { v = Math.max(lo, Math.min(hi, v)); return padT + (hi - v) / (hi - lo) * plotH; };
    const Yr = (p) => { p = Math.max(0, Math.min(100, p)); return padT + plotH - p / 100 * plotH; };
    const zeroY = Yl(0);

    const s = [HEAD(W, H)];
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="' + t.bg + '"/>');
    s.push('<clipPath id="cp"><rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '"/></clipPath>');

    for (let i = 0; i <= 4; i++) {
        const yy = padT + plotH * i / 4, wv = hi - (hi - lo) * i / 4, isZero = Math.abs(wv) < 1e-6;
        s.push('<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + yy.toFixed(1) +
            '" stroke="' + (isZero ? t.muted : t.grid) + '" stroke-width="' + (isZero ? 1.3 : 1) + '"/>');
        s.push('<text x="' + (padL - 5) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" fill="' + t.muted + '">' + Math.round(wv) + ' W</text>');
        s.push('<text x="' + (padL + plotW + 5) + '" y="' + (yy + 3).toFixed(1) + '" fill="' + t.muted + '">' + Math.round(100 * (1 - i / 4)) + '%</text>');
    }
    for (let h = 0; h <= 24; h += 3) {
        const xx = X(x0 + (x1 - x0) * h / 24);
        s.push('<line x1="' + xx.toFixed(1) + '" y1="' + padT + '" x2="' + xx.toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="' + t.grid + '"/>');
        s.push('<text x="' + xx.toFixed(1) + '" y="' + (padT + plotH + 13) + '" text-anchor="middle" fill="' + t.muted + '">' + pad2(h) + ':00</text>');
    }

    s.push('<g clip-path="url(#cp)">');
    const splitArea = (arr, posColor, negColor) => {
        if (!arr.length) return;
        [[(v) => Math.max(v, 0), posColor], [(v) => Math.min(v, 0), negColor]].forEach((part) => {
            let dp = 'M ' + X(arr[0].ts).toFixed(1) + ' ' + zeroY.toFixed(1);
            arr.forEach((p) => { dp += ' L ' + X(p.ts).toFixed(1) + ' ' + Yl(part[0](p.val)).toFixed(1); });
            dp += ' L ' + X(arr[arr.length - 1].ts).toFixed(1) + ' ' + zeroY.toFixed(1) + ' Z';
            s.push('<path d="' + dp + '" fill="' + part[1] + '"/>');
        });
    };
    splitArea(netOrig, 'rgba(229,115,115,0.30)', 'rgba(120,170,220,0.30)');
    splitArea(netSim, 'rgba(211,47,47,0.55)', 'rgba(33,110,200,0.50)');
    if (batt.length) s.push('<path d="' + polyline(batt, X, Yl) + '" fill="none" stroke="#ff9800" stroke-width="1.6"/>');
    if (soc.length) s.push('<path d="' + polyline(soc, X, Yr) + '" fill="none" stroke="#4caf50" stroke-width="2"/>');
    s.push('</g>');
    s.push('<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="none" stroke="' + t.grid + '"/>');

    let lx = padL;
    const ly = padT + plotH + 30;
    [['#c62828', 'Netzbezug'], ['#1f6ec8', 'Einspeisung'], ['#ff9800', 'Speicher'], ['#4caf50', 'Ladestand']].forEach((it) => {
        s.push('<rect x="' + lx + '" y="' + (ly - 9) + '" width="10" height="10" rx="2" fill="' + it[0] + '"/>');
        s.push('<text x="' + (lx + 14) + '" y="' + ly + '" fill="' + t.muted + '">' + it[1] + '</text>');
        lx += 26 + it[1].length * 6.6;
    });
    s.push('</svg>');
    return s.join('');
}

/**
 * Balkendiagramm der täglichen Ersparnis.
 * @param {Array<{day:number, val:number}>} daily
 * @param {ThemeOpts} [opts]
 */
function barsSvg(daily, opts) {
    const W = 820, H = 300, t = theme(opts);
    const padL = 52, padR = 16, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    daily = daily || [];

    let maxAbs = 0.5, hasNeg = false;
    daily.forEach((x) => { if (Math.abs(x.val) > maxAbs) maxAbs = Math.abs(x.val); if (x.val < 0) hasNeg = true; });
    const hi = niceCeil(maxAbs), lo = hasNeg ? -hi : 0;
    const Y = (v) => padT + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * plotH;
    const zeroY = Y(0);

    const s = [HEAD(W, H)];
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="' + t.bg + '"/>');
    for (let i = 0; i <= 4; i++) {
        const yy = padT + plotH * i / 4, wv = hi - (hi - lo) * i / 4;
        s.push('<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + yy.toFixed(1) + '" stroke="' + t.grid + '"/>');
        s.push('<text x="' + (padL - 5) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" fill="' + t.muted + '">' + wv.toFixed(2) + ' €</text>');
    }
    const n = Math.max(daily.length, 1), bw = Math.max(2, plotW / n * 0.7), everyN = Math.max(1, Math.ceil(n / 10));
    daily.forEach((x, i) => {
        const cx = padL + plotW * (i + 0.5) / n, y = Y(x.val);
        s.push('<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + Math.min(y, zeroY).toFixed(1) + '" width="' + bw.toFixed(1) +
            '" height="' + Math.abs(y - zeroY).toFixed(1) + '" fill="' + (x.val >= 0 ? '#4caf50' : '#e57373') + '"/>');
        if (i % everyN === 0) s.push('<text x="' + cx.toFixed(1) + '" y="' + (padT + plotH + 14) + '" text-anchor="middle" fill="' + t.muted + '">' + ddmm(x.day) + '</text>');
    });
    s.push('<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + zeroY.toFixed(1) + '" stroke="' + t.muted + '"/>');
    s.push('<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="none" stroke="' + t.grid + '"/>');
    s.push('</svg>');
    return s.join('');
}

/**
 * Kompakte Kennzahlen-Kachel.
 * @param {Array<{label:string, value:string}>} items
 * @param {ThemeOpts} [opts]
 */
function kpiCardSvg(items, opts) {
    items = items || [];
    const t = theme(opts);
    const cellW = 190, H = 96, W = Math.max(cellW, cellW * items.length);
    const s = [HEAD(W, H)];
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="10" fill="' + t.bg + '"/>');
    items.forEach((it, i) => {
        const x = i * cellW + 18;
        if (i > 0) s.push('<line x1="' + (i * cellW) + '" y1="16" x2="' + (i * cellW) + '" y2="' + (H - 16) + '" stroke="' + t.grid + '"/>');
        s.push('<text x="' + x + '" y="38" fill="' + t.muted + '" font-size="13">' + escapeXml(it.label) + '</text>');
        s.push('<text x="' + x + '" y="70" fill="' + t.fg + '" font-size="26" font-weight="600">' + escapeXml(it.value) + '</text>');
    });
    s.push('</svg>');
    return s.join('');
}

function escapeXml(str) {
    return String(str).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

module.exports = { dayChartSvg, barsSvg, kpiCardSvg, fmtDE };
