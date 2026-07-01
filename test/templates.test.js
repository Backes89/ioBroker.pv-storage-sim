'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { TEMPLATES, resolveStorage } = require('../lib/templates');

test("resolveStorage: 'custom'/leer/unbekannt liefert null", () => {
    assert.strictEqual(resolveStorage('custom'), null);
    assert.strictEqual(resolveStorage(''), null);
    assert.strictEqual(resolveStorage(undefined), null);
    assert.strictEqual(resolveStorage('gibt_es_nicht'), null);
});

test('resolveStorage: bekannte Vorlage liefert Specs', () => {
    const s = resolveStorage('huawei_luna2000_10');
    assert.ok(s, 'Vorlage nicht gefunden');
    assert.strictEqual(s.capacityKwh, 10);
    assert.ok(s.maxChargeW > 0 && s.maxDischargeW > 0);
});

test('alle Vorlagen haben plausible, vollständige Felder', () => {
    for (const [key, s] of Object.entries(TEMPLATES)) {
        assert.ok(typeof s.label === 'string' && s.label.length, `${key}: label fehlt`);
        assert.ok(s.capacityKwh > 0, `${key}: capacityKwh`);
        assert.ok(s.maxChargeW > 0, `${key}: maxChargeW`);
        assert.ok(s.maxDischargeW > 0, `${key}: maxDischargeW`);
        assert.ok(s.minSocPercent >= 0 && s.minSocPercent <= 50, `${key}: minSocPercent`);
        assert.ok(s.roundTripEff >= 1 && s.roundTripEff <= 100, `${key}: roundTripEff`);
    }
});
