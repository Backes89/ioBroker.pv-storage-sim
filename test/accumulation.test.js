'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { accumulateStep } = require('../lib/accumulation');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function zeroState() {
    return {
        acc: {
            chargedToday: 0, dischargedToday: 0,
            importOrigToday: 0, importSimToday: 0, exportOrigToday: 0, exportSimToday: 0,
            savingsToday: 0, savingsMonth: 0, savingsYear: 0,
        },
        totals: { chargedTotal: 0, dischargedTotal: 0, savingsTotal: 0 },
    };
}

test('einzelner Tick: Laden/Einspeisen, negativer Benefit', () => {
    const r = accumulateStep(
        zeroState(),
        { chargedKwh: 2, dischargedKwh: 0, benefit: -0.16, deficitWh: 0, surplusWh: 5000, gridImportWh: 0, gridExportWh: 3000 },
        { daysElapsed: 1, investment: 7000 },
    );
    close(r.acc.chargedToday, 2);
    close(r.acc.exportOrigToday, 5);   // 5000 Wh -> 5 kWh
    close(r.acc.exportSimToday, 3);    // 3000 Wh -> 3 kWh
    close(r.acc.savingsToday, -0.16);
    close(r.acc.savingsMonth, -0.16);
    close(r.acc.savingsYear, -0.16);
    close(r.totals.chargedTotal, 2);
    close(r.totals.savingsTotal, -0.16);
    close(r.coverage, 0);              // kein Netzbezug -> keine Deckung
    close(r.amortizationYears, 0);     // negative Ersparnis -> keine Amortisation
});

test('mehrere Ticks akkumulieren korrekt (Ergebnis zurückspeisen)', () => {
    let s = zeroState();
    const tick = { chargedKwh: 0, dischargedKwh: 1, benefit: 0.30, deficitWh: 2000, surplusWh: 0, gridImportWh: 500, gridExportWh: 0 };
    const ctx = { daysElapsed: 1, investment: 0 };
    let r;
    for (let i = 0; i < 2; i++) { r = accumulateStep(s, tick, ctx); s = { acc: r.acc, totals: r.totals }; }
    close(r.acc.dischargedToday, 2);
    close(r.acc.importOrigToday, 4);   // 2 * 2000 Wh
    close(r.acc.importSimToday, 1);    // 2 * 500 Wh
    close(r.acc.savingsToday, 0.60);
    close(r.totals.dischargedTotal, 2);
    close(r.coverage, 50);             // 2 kWh entladen / 4 kWh Originalbezug
});

test('Speicher-Deckung deckelt nicht künstlich, bleibt aber plausibel', () => {
    const r = accumulateStep(
        zeroState(),
        { chargedKwh: 0, dischargedKwh: 0.9, benefit: 0.3, deficitWh: 1000, surplusWh: 0, gridImportWh: 100, gridExportWh: 0 },
        { daysElapsed: 1, investment: 0 },
    );
    close(r.coverage, 90);             // 0.9 kWh / 1.0 kWh
});

test('Amortisation: investment / hochgerechnete Jahresersparnis', () => {
    const r = accumulateStep(
        zeroState(),
        { chargedKwh: 0, dischargedKwh: 0, benefit: 20, deficitWh: 0, surplusWh: 0, gridImportWh: 0, gridExportWh: 0 },
        { daysElapsed: 10, investment: 7000 },
    );
    // annualSavings = 20/10*365 = 730 €/Jahr -> 7000/730 ≈ 9.589 Jahre
    close(r.amortizationYears, 7000 / 730, 1e-6);
});

test('Amortisation 0 ohne Investition', () => {
    const r = accumulateStep(
        zeroState(),
        { chargedKwh: 0, dischargedKwh: 0, benefit: 20, deficitWh: 0, surplusWh: 0, gridImportWh: 0, gridExportWh: 0 },
        { daysElapsed: 10, investment: 0 },
    );
    close(r.amortizationYears, 0);
});

test('reine Funktion: Eingaben werden nicht mutiert', () => {
    const s = zeroState();
    accumulateStep(s, { chargedKwh: 5, dischargedKwh: 3, benefit: 1, deficitWh: 1000, surplusWh: 2000, gridImportWh: 100, gridExportWh: 200 },
        { daysElapsed: 1, investment: 1000 });
    close(s.acc.chargedToday, 0);
    close(s.acc.savingsToday, 0);
    close(s.totals.chargedTotal, 0);
});
