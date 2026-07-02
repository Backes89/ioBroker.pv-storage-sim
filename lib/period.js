'use strict';

/**
 * Vergleicht zwei Zeitpunkte und liefert, welche Perioden-Akkumulatoren bei einem
 * Wechsel zurückgesetzt werden müssen (Tag / Monat / Jahr). Grundlage sind die lokalen
 * Kalenderfelder: Ein Jahreswechsel impliziert einen Monats- und Tageswechsel, ein
 * Monatswechsel impliziert einen Tageswechsel.
 *
 * Wird beim Adapterstart genutzt, um persistierte Tages-/Monats-/Jahreswerte zu verwerfen,
 * falls der Adapter über eine Periodengrenze hinweg nicht lief.
 *
 * @param {number} lastTs  Zeitstempel des letzten Schreibvorgangs (ms seit Epoch)
 * @param {number} nowTs   aktueller Zeitstempel (ms seit Epoch)
 * @returns {{day:boolean, month:boolean, year:boolean}}
 */
function periodResets(lastTs, nowTs) {
    const a = new Date(lastTs);
    const b = new Date(nowTs);
    const year = a.getFullYear() !== b.getFullYear();
    const month = year || a.getMonth() !== b.getMonth();
    const day = month || a.getDate() !== b.getDate();
    return { day, month, year };
}

/**
 * Mitternacht des Kalendertags von d (lokal).
 * @param {Date} d
 * @returns {number} Zeitstempel (ms)
 */
function dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Mitternacht des VORTAGS von d – kalenderbasiert statt „minus 24 h", damit es auch an
 * Tagen mit Zeitumstellung (23/25 Stunden) auf dem richtigen Datum landet.
 * @param {Date} d
 * @returns {number} Zeitstempel (ms)
 */
function previousDayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
}

module.exports = { periodResets, dayStart, previousDayStart };
