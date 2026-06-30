'use strict';

/**
 * Verrechnet die Ergebnisse eines Simulations-Ticks in die laufenden Akkumulatoren und
 * berechnet die abgeleiteten Kennzahlen. Reine Funktion: mutiert die Eingaben nicht und
 * hat keine ioBroker-Abhängigkeit (dadurch testbar).
 *
 * Einheiten: Akkumulatoren/Totals in kWh bzw. €, die Tick-Energien (deficitWh, surplusWh,
 * gridImportWh, gridExportWh) in Wh.
 *
 * @param {object} state
 * @param {object} state.acc     Tages-/Monats-/Jahres-Akkumulatoren
 * @param {object} state.totals  Gesamtwerte (chargedTotal, dischargedTotal, savingsTotal)
 * @param {object} tick
 * @param {number} tick.chargedKwh       in den Speicher geladene Energie (kWh)
 * @param {number} tick.dischargedKwh    aus dem Speicher gelieferte Energie (kWh)
 * @param {number} tick.benefit          wirtschaftlicher Nutzen dieses Ticks (€, kann negativ sein)
 * @param {number} tick.deficitWh        Netzbezug ohne Speicher (Wh)
 * @param {number} tick.surplusWh        Einspeisung ohne Speicher (Wh)
 * @param {number} tick.gridImportWh     Netzbezug mit Speicher (Wh)
 * @param {number} tick.gridExportWh     Einspeisung mit Speicher (Wh)
 * @param {object} ctx
 * @param {number} ctx.daysElapsed       Tage seit Simulationsstart (Aufrufer stellt > 0 sicher)
 * @param {number} ctx.investment        Anschaffungskosten (€); 0 = keine Amortisationsrechnung
 * @returns {{acc:object, totals:object, coverage:number, amortizationYears:number}}
 */
function accumulateStep(state, tick, ctx) {
    const acc = {
        chargedToday: state.acc.chargedToday + tick.chargedKwh,
        dischargedToday: state.acc.dischargedToday + tick.dischargedKwh,
        importOrigToday: state.acc.importOrigToday + tick.deficitWh / 1000,
        importSimToday: state.acc.importSimToday + tick.gridImportWh / 1000,
        exportOrigToday: state.acc.exportOrigToday + tick.surplusWh / 1000,
        exportSimToday: state.acc.exportSimToday + tick.gridExportWh / 1000,
        savingsToday: state.acc.savingsToday + tick.benefit,
        savingsMonth: state.acc.savingsMonth + tick.benefit,
        savingsYear: state.acc.savingsYear + tick.benefit,
    };
    const totals = {
        chargedTotal: state.totals.chargedTotal + tick.chargedKwh,
        dischargedTotal: state.totals.dischargedTotal + tick.dischargedKwh,
        savingsTotal: state.totals.savingsTotal + tick.benefit,
    };

    // Anteil des (ursprünglichen) Netzbezugs, den der Speicher deckt
    const coverage = acc.importOrigToday > 0 ? (acc.dischargedToday / acc.importOrigToday) * 100 : 0;
    // lineare Hochrechnung der Jahresersparnis -> grobe Amortisationsdauer
    const annualSavings = (totals.savingsTotal / ctx.daysElapsed) * 365;
    const amortizationYears = annualSavings > 0 && ctx.investment > 0 ? ctx.investment / annualSavings : 0;

    return { acc, totals, coverage, amortizationYears };
}

module.exports = { accumulateStep };
