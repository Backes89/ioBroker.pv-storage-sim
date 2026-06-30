'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { periodResets } = require('../lib/period');

// Hilfsfunktion: lokaler Zeitstempel (Monat 0-basiert)
const at = (y, m, d, h = 12) => new Date(y, m, d, h, 0, 0, 0).getTime();

test('gleicher Tag (nur andere Uhrzeit) → kein Reset', () => {
    assert.deepStrictEqual(
        periodResets(at(2026, 5, 30, 8), at(2026, 5, 30, 20)),
        { day: false, month: false, year: false },
    );
});

test('identischer Zeitstempel → kein Reset', () => {
    const t = at(2026, 5, 30);
    assert.deepStrictEqual(periodResets(t, t), { day: false, month: false, year: false });
});

test('nächster Tag im selben Monat → nur Tag', () => {
    assert.deepStrictEqual(
        periodResets(at(2026, 5, 29), at(2026, 5, 30)),
        { day: true, month: false, year: false },
    );
});

test('Monatswechsel (30. Juni → 1. Juli) → Tag + Monat', () => {
    assert.deepStrictEqual(
        periodResets(at(2026, 5, 30), at(2026, 6, 1)),
        { day: true, month: true, year: false },
    );
});

test('Jahreswechsel (31. Dez → 1. Jan) → Tag + Monat + Jahr', () => {
    assert.deepStrictEqual(
        periodResets(at(2026, 11, 31), at(2027, 0, 1)),
        { day: true, month: true, year: true },
    );
});

test('gleicher Tag/Monat, aber ein Jahr später → alle drei (Adapter lief ein Jahr nicht)', () => {
    assert.deepStrictEqual(
        periodResets(at(2025, 5, 30), at(2026, 5, 30)),
        { day: true, month: true, year: true },
    );
});

test('gleicher Monatstag im Folgemonat → Tag + Monat (kein Jahr)', () => {
    assert.deepStrictEqual(
        periodResets(at(2026, 4, 15), at(2026, 5, 15)),
        { day: true, month: true, year: false },
    );
});
