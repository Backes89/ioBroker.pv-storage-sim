'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { stepBattery } = require('../lib/simulation');

const base = {
    capacityWh: 10000,
    minSocWh: 500,
    maxChargeWh: 100000,
    maxDischargeWh: 100000,
    chargeEff: 1,
    dischargeEff: 1,
};

test('Überschuss lädt den Speicher und reduziert die Einspeisung', () => {
    const r = stepBattery({ surplusWh: 2000, deficitWh: 0, socWh: 0 }, base);
    assert.strictEqual(r.socWh, 2000);
    assert.strictEqual(r.chargedWh, 2000);
    assert.strictEqual(r.gridExportWh, 0);
});

test('Überschuss über Kapazität wird teilweise eingespeist', () => {
    const r = stepBattery({ surplusWh: 12000, deficitWh: 0, socWh: 0 }, base);
    assert.strictEqual(r.socWh, 10000);
    assert.strictEqual(r.chargedWh, 10000);
    assert.strictEqual(r.gridExportWh, 2000);
});

test('Defizit wird aus dem Speicher gedeckt und reduziert den Netzbezug', () => {
    const r = stepBattery({ surplusWh: 0, deficitWh: 1500, socWh: 5000 }, base);
    assert.strictEqual(r.dischargedWh, 1500);
    assert.strictEqual(r.socWh, 3500);
    assert.strictEqual(r.gridImportWh, 0);
});

test('Mindest-Ladezustand wird respektiert', () => {
    const r = stepBattery({ surplusWh: 0, deficitWh: 5000, socWh: 1000 }, base);
    // verfügbar: 1000 - 500 = 500 Wh
    assert.strictEqual(r.dischargedWh, 500);
    assert.strictEqual(r.socWh, 500);
    assert.strictEqual(r.gridImportWh, 4500);
});

test('Ladeleistung pro Intervall begrenzt das Laden', () => {
    const r = stepBattery({ surplusWh: 5000, deficitWh: 0, socWh: 0 }, { ...base, maxChargeWh: 1000 });
    assert.strictEqual(r.chargedWh, 1000);
    assert.strictEqual(r.gridExportWh, 4000);
});

test('Wirkungsgrad verringert die nutzbare Energie', () => {
    const p = { ...base, chargeEff: 0.95, dischargeEff: 0.95 };
    const charged = stepBattery({ surplusWh: 1000, deficitWh: 0, socWh: 0 }, p);
    // 1000 Wh aus dem Überschuss -> nur 950 Wh im Speicher
    assert.ok(Math.abs(charged.socWh - 950) < 1e-6);
});
