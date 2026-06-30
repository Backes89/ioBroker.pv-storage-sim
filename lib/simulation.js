'use strict';

/**
 * Reine Simulations-Funktion für einen Speicher-Schritt (ohne ioBroker-Abhängigkeiten,
 * dadurch gut testbar). Alle Energiewerte beziehen sich auf EIN Simulationsintervall und
 * sind in Wattstunden (Wh) angegeben.
 *
 * Modell:
 *   - Überschuss (PV - Verbrauch, bzw. Netzeinspeisung) lädt den Speicher, der Rest wird eingespeist.
 *   - Defizit (Verbrauch - PV, bzw. Netzbezug) wird zuerst aus dem Speicher gedeckt, der Rest aus dem Netz.
 *   - Wirkungsgrad wird je zur Hälfte (sqrt) beim Laden und Entladen angesetzt -> Produkt = Roundtrip-Wirkungsgrad.
 *
 * @param {object} io
 * @param {number} io.surplusWh   Energie, die zum Laden zur Verfügung steht
 * @param {number} io.deficitWh   Energie, die aus dem Netz/Speicher gedeckt werden müsste
 * @param {number} io.socWh       aktueller Ladezustand in Wh
 * @param {object} p              Speicher-Parameter
 * @param {number} p.capacityWh   nutzbare Kapazität (brutto) in Wh
 * @param {number} p.minSocWh     minimaler Ladezustand (Reserve) in Wh
 * @param {number} p.maxChargeWh  max. Ladeenergie pro Intervall (maxChargeW * Stunden)
 * @param {number} p.maxDischargeWh max. Entladeenergie pro Intervall
 * @param {number} p.chargeEff    Ladewirkungsgrad 0..1
 * @param {number} p.dischargeEff Entladewirkungsgrad 0..1
 * @returns {{socWh:number, chargedWh:number, dischargedWh:number, gridImportWh:number, gridExportWh:number}}
 *   chargedWh    = dem Überschuss entnommene Energie (verringert die Einspeisung)
 *   dischargedWh = an den Haushalt gelieferte Energie (verringert den Netzbezug)
 */
function stepBattery({ surplusWh, deficitWh, socWh }, p) {
    let chargedWh = 0;
    let dischargedWh = 0;
    let gridImportWh = deficitWh;
    let gridExportWh = surplusWh;

    // --- Laden aus Überschuss ---
    if (surplusWh > 0) {
        const room = Math.max(p.capacityWh - socWh, 0);
        // begrenzt durch Überschuss, freien Platz (unter Berücksichtigung des Wirkungsgrads) und Ladeleistung
        const maxByRoom = p.chargeEff > 0 ? room / p.chargeEff : 0;
        chargedWh = Math.min(surplusWh, maxByRoom, p.maxChargeWh);
        socWh += chargedWh * p.chargeEff;
        gridExportWh = surplusWh - chargedWh;
    }

    // --- Entladen zur Deckung des Defizits ---
    if (deficitWh > 0) {
        const available = Math.max(socWh - p.minSocWh, 0);
        const neededFromCells = p.dischargeEff > 0 ? deficitWh / p.dischargeEff : 0;
        const pulledWh = Math.min(neededFromCells, available, p.maxDischargeWh);
        dischargedWh = pulledWh * p.dischargeEff; // tatsächlich beim Haushalt ankommende Energie
        socWh -= pulledWh;
        gridImportWh = deficitWh - dischargedWh;
    }

    return { socWh, chargedWh, dischargedWh, gridImportWh, gridExportWh };
}

/**
 * Zerlegt eine vorzeichenbehaftete Netzleistung/-energie (ein einzelner Zähler-Datenpunkt)
 * in Überschuss (Einspeisung) und Defizit (Netzbezug) für die Simulation.
 *
 * @param {number} netWh            Netto-Energie dieses Intervalls in Wh (mit Vorzeichen)
 * @param {boolean} importIsPositive  true: positiv = Netzbezug, negativ = Einspeisung (Standard, OBIS 16.7.0)
 *                                     false: umgekehrt
 * @returns {{surplusWh:number, deficitWh:number}}
 */
function splitSignedPower(netWh, importIsPositive) {
    const importWh = Math.max(importIsPositive ? netWh : -netWh, 0);
    const exportWh = Math.max(importIsPositive ? -netWh : netWh, 0);
    return { surplusWh: exportWh, deficitWh: importWh };
}

/**
 * Umrechnungsfaktor eines Eingangs-Datenpunkts auf die interne Basis-Einheit.
 * Basis ist im Leistungs-Modus W, im Zählerstand-Modus kWh.
 *
 * @param {'auto_w_kwh'|'kw_wh'} unit       'auto_w_kwh' = W bzw. kWh (Standard), 'kw_wh' = kW bzw. Wh
 * @param {'power'|'energy'} inputMode
 * @returns {number} Faktor, mit dem der Rohwert multipliziert wird
 */
function unitFactor(unit, inputMode) {
    const isK = unit === 'kw_wh';
    if (inputMode === 'power') return isK ? 1000 : 1; // kW -> W
    return isK ? 0.001 : 1;                           // Wh -> kWh
}

module.exports = { stepBattery, splitSignedPower, unitFactor };
