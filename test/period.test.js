'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { periodResets, dayStart, previousDayStart } = require('../lib/period');

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

test('dayStart liefert Mitternacht desselben Kalendertags', () => {
    const r = new Date(dayStart(new Date(2026, 5, 30, 18, 42, 13)));
    assert.deepStrictEqual(
        [r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes()],
        [2026, 5, 30, 0, 0],
    );
});

test('previousDayStart liefert Mitternacht des Vortags (kalenderbasiert)', () => {
    // normaler Tag
    let r = new Date(previousDayStart(new Date(2026, 5, 30, 0, 0, 30)));
    assert.deepStrictEqual([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()], [2026, 5, 29, 0]);
    // Monatsgrenze
    r = new Date(previousDayStart(new Date(2026, 6, 1, 0, 1)));
    assert.deepStrictEqual([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()], [2026, 5, 30, 0]);
    // Jahresgrenze
    r = new Date(previousDayStart(new Date(2027, 0, 1, 0, 1)));
    assert.deepStrictEqual([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()], [2026, 11, 31, 0]);
    // Tag nach der Frühjahrs-Zeitumstellung (Europa: 23-h-Tag am 29.03.2026) –
    // kalenderbasiert muss trotzdem der 29.03. herauskommen (nicht der 28.03. wie bei "-24h")
    r = new Date(previousDayStart(new Date(2026, 2, 30, 0, 0, 30)));
    assert.deepStrictEqual([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours()], [2026, 2, 29, 0]);
});
