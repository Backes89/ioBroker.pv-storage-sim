'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { dayChartSvg, barsSvg, kpiCardSvg } = require('../lib/svg');

function isSvg(str) {
    assert.ok(typeof str === 'string', 'kein String');
    assert.ok(str.startsWith('<svg'), 'kein <svg>-Start');
    assert.ok(str.trim().endsWith('</svg>'), 'kein </svg>-Ende');
    assert.ok(/viewBox="0 0 \d+ \d+"/.test(str), 'kein viewBox');
}

const start = new Date(2026, 5, 30).getTime();
const end = start + 86400000;
function series(vals) { return vals.map((v, i) => ({ ts: start + i * 3600000, val: v })); }

test('dayChartSvg liefert gültiges SVG mit Legende und Pfaden', () => {
    const svg = dayChartSvg({
        start, end,
        netOrig: series([1000, -2000, 500]),
        netSim: series([300, -800, 100]),
        batt: series([0, 1500, -400]),
        soc: series([10, 60, 40]),
    });
    isSvg(svg);
    assert.ok(svg.includes('Netzbezug') && svg.includes('Einspeisung') && svg.includes('Ladestand'), 'Legende fehlt');
    assert.ok(svg.includes('<path'), 'keine Pfade');
    assert.ok(svg.includes('%'), 'keine %-Achse');
});

test('dayChartSvg verträgt leere Daten', () => {
    const svg = dayChartSvg({ start, end, netOrig: [], netSim: [], batt: [], soc: [] });
    isSvg(svg);
});

test('barsSvg zeichnet Balken und €-Achse', () => {
    const daily = [
        { day: start, val: 0.5 }, { day: start + 86400000, val: -0.2 }, { day: start + 2 * 86400000, val: 1.1 },
    ];
    const svg = barsSvg(daily);
    isSvg(svg);
    assert.ok(svg.includes('<rect'), 'keine Balken');
    assert.ok(svg.includes('€'), 'keine €-Achse');
});

test('barsSvg verträgt leere Daten', () => { isSvg(barsSvg([])); });

test('kpiCardSvg zeigt Label und Wert, escapt Sonderzeichen', () => {
    const svg = kpiCardSvg([{ label: 'Ladestand', value: '67 %' }, { label: 'A & B', value: '<x>' }]);
    isSvg(svg);
    assert.ok(svg.includes('Ladestand') && svg.includes('67 %'), 'KPI fehlt');
    assert.ok(svg.includes('A &amp; B') && svg.includes('&lt;x&gt;'), 'nicht escaped');
});
