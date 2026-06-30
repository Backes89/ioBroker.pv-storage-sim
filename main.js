'use strict';

const utils = require('@iobroker/adapter-core');
const { stepBattery, splitSignedPower, unitFactor } = require('./lib/simulation');

// Definition aller vom Adapter angelegten States: [id, name, unit, role, type]
const STATE_DEFS = [
    ['info.connection', 'Verbindung / aktiv', '', 'indicator.connected', 'boolean'],

    ['battery.soc.kWh', 'Ladezustand', 'kWh', 'value.battery', 'number'],
    ['battery.soc.percent', 'Ladezustand', '%', 'value.battery', 'number'],
    ['battery.chargedToday.kWh', 'Geladen (heute)', 'kWh', 'value.power.consumption', 'number'],
    ['battery.dischargedToday.kWh', 'Entladen (heute)', 'kWh', 'value.power.consumption', 'number'],
    ['battery.chargedTotal.kWh', 'Geladen (gesamt)', 'kWh', 'value.power.consumption', 'number'],
    ['battery.dischargedTotal.kWh', 'Entladen (gesamt)', 'kWh', 'value.power.consumption', 'number'],

    ['grid.importOriginalToday.kWh', 'Netzbezug ohne Speicher (heute)', 'kWh', 'value', 'number'],
    ['grid.importSimulatedToday.kWh', 'Netzbezug mit Speicher (heute)', 'kWh', 'value', 'number'],
    ['grid.exportOriginalToday.kWh', 'Einspeisung ohne Speicher (heute)', 'kWh', 'value', 'number'],
    ['grid.exportSimulatedToday.kWh', 'Einspeisung mit Speicher (heute)', 'kWh', 'value', 'number'],

    ['economics.savingsToday.eur', 'Ersparnis (heute)', '€', 'value', 'number'],
    ['economics.savingsMonth.eur', 'Ersparnis (Monat)', '€', 'value', 'number'],
    ['economics.savingsYear.eur', 'Ersparnis (Jahr)', '€', 'value', 'number'],
    ['economics.savingsTotal.eur', 'Ersparnis (gesamt)', '€', 'value', 'number'],
    ['economics.batteryCoverageToday.percent', 'Speicher-Deckung des Bezugs (heute)', '%', 'value', 'number'],
    ['economics.amortizationYears', 'Amortisationsdauer (Schätzung)', 'Jahre', 'value', 'number'],
    ['economics._startTs', 'Startzeitpunkt der Simulation', 'ms', 'value.time', 'number'],

    // Momentane Leistungen (W) für die grafische Auswertung / WebUI – hier History-Logging aktivieren
    ['live.pvW', 'PV-Erzeugung (aktuell)', 'W', 'value.power.produced', 'number'],
    ['live.consumptionW', 'Hausverbrauch (aktuell)', 'W', 'value.power.consumption', 'number'],
    ['live.directUseW', 'Direktverbrauch (aktuell)', 'W', 'value.power', 'number'],
    // Netz-Saldo als EIN vorzeichenbehafteter Wert (+ = Bezug, − = Einspeisung) für die Visualisierung
    ['live.gridNetOrigW', 'Netz-Saldo ohne Speicher (+Bezug/−Einsp.)', 'W', 'value.power', 'number'],
    ['live.gridNetSimW', 'Netz-Saldo mit Speicher (+Bezug/−Einsp.)', 'W', 'value.power', 'number'],
    ['live.batteryPowerW', 'Speicher-Leistung (+lädt / −entlädt)', 'W', 'value.power', 'number'],
];

// States, die es in früheren Versionen gab und die beim Start entfernt werden (durch gridNet* ersetzt).
const OBSOLETE_STATES = [
    'live.gridImportOrigW', 'live.gridImportSimW', 'live.gridExportOrigW', 'live.gridExportSimW',
];

class PvStorageSim extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'pv-storage-sim' });
        this.timer = null;
        this.lastValues = {}; // letzte Rohwerte je Quelle (für Zähler-Delta bzw. Leistungs-Integration)
        this.lastTick = null;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', { val: false, ack: true }).catch(() => {});

        const c = this.config;
        const capWh = (Number(c.capacityKwh) || 10) * 1000;
        const eff = Math.sqrt(Math.min(Math.max(Number(c.roundTripEff) || 90, 1), 100) / 100);

        this.p = {
            capacityWh: capWh,
            minSocWh: ((Number(c.minSocPercent) || 5) / 100) * capWh,
            maxChargeW: Number(c.maxChargeW) || 3000,
            maxDischargeW: Number(c.maxDischargeW) || 3000,
            maxChargeWh: 0,    // wird je Intervall gesetzt
            maxDischargeWh: 0, // wird je Intervall gesetzt
            chargeEff: eff,
            dischargeEff: eff,
        };

        this.priceImport = (Number(c.priceImportCt) || 0) / 100; // €/kWh
        this.priceFeedIn = (Number(c.priceFeedInCt) || 0) / 100; // €/kWh
        this.investment = Number(c.investmentEur) || 0;
        this.inputMode = c.inputMode === 'energy' ? 'energy' : 'power';
        this.sourceMode = ['grid_meter', 'grid_signed'].includes(c.sourceMode) ? c.sourceMode : 'pv_consumption';
        this.intervalSec = Math.max(Number(c.intervalSec) || 30, 5);
        // bei einem vorzeichenbehafteten Zähler: ist positiv = Netzbezug (Standard) oder = Einspeisung?
        this.gridSignImportPositive = c.gridSignPositive !== 'export';

        // Umrechnungsfaktor je Datenpunkt (W/kW bzw. kWh/Wh), abhängig vom Eingabe-Modus
        const f = (unitCfgKey) => unitFactor(c[unitCfgKey], this.inputMode);
        if (this.sourceMode === 'grid_meter') {
            this.ids = { import: c.idGridImport, export: c.idGridExport };
            this.factors = { import: f('unitGridImport'), export: f('unitGridExport') };
        } else if (this.sourceMode === 'grid_signed') {
            this.ids = { grid: c.idGridPower };
            this.factors = { grid: f('unitGridPower') };
        } else {
            this.ids = { pv: c.idPv, cons: c.idConsumption };
            this.factors = { pv: f('unitPv'), cons: f('unitConsumption') };
        }

        const missing = Object.entries(this.ids).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length) {
            this.log.error(`Fehlende Datenpunkt-IDs in der Konfiguration: ${missing.join(', ')}. Adapter wird angehalten.`);
            return;
        }

        await this.createStates();
        for (const id of OBSOLETE_STATES) await this.delObjectAsync(id).catch(() => {});

        // persistierte Werte wiederherstellen (Neustart mitten am Tag soll Werte nicht verlieren)
        this.socWh = (await this.getNumber('battery.soc.kWh')) * 1000 || this.p.minSocWh;
        this.totals = {
            chargedTotal: await this.getNumber('battery.chargedTotal.kWh'),
            dischargedTotal: await this.getNumber('battery.dischargedTotal.kWh'),
            savingsTotal: await this.getNumber('economics.savingsTotal.eur'),
        };
        this.acc = {
            chargedToday: await this.getNumber('battery.chargedToday.kWh'),
            dischargedToday: await this.getNumber('battery.dischargedToday.kWh'),
            importOrigToday: await this.getNumber('grid.importOriginalToday.kWh'),
            importSimToday: await this.getNumber('grid.importSimulatedToday.kWh'),
            exportOrigToday: await this.getNumber('grid.exportOriginalToday.kWh'),
            exportSimToday: await this.getNumber('grid.exportSimulatedToday.kWh'),
            savingsToday: await this.getNumber('economics.savingsToday.eur'),
            savingsMonth: await this.getNumber('economics.savingsMonth.eur'),
            savingsYear: await this.getNumber('economics.savingsYear.eur'),
        };

        this.startTs = (await this.getNumber('economics._startTs')) || Date.now();
        await this.setStateAsync('economics._startTs', { val: this.startTs, ack: true });

        const now = new Date();
        this.today = now.getDate();
        this.curMonth = now.getMonth();
        this.curYear = now.getFullYear();
        this.lastTick = Date.now();

        // Lief der Adapter über eine Tages-/Monats-/Jahresgrenze hinweg nicht, dürfen die
        // persistierten Perioden-Werte nicht in die neue Periode übernommen werden.
        const lastSt = await this.getStateAsync('economics.savingsToday.eur').catch(() => null);
        const lastD = new Date(lastSt && lastSt.ts ? lastSt.ts : this.startTs);
        if (lastD.getFullYear() !== this.curYear) this.acc.savingsYear = 0;
        if (lastD.getMonth() !== this.curMonth || lastD.getFullYear() !== this.curYear) this.acc.savingsMonth = 0;
        if (lastD.getDate() !== this.today || lastD.getMonth() !== this.curMonth || lastD.getFullYear() !== this.curYear) {
            this.acc.chargedToday = 0;
            this.acc.dischargedToday = 0;
            this.acc.importOrigToday = 0;
            this.acc.importSimToday = 0;
            this.acc.exportOrigToday = 0;
            this.acc.exportSimToday = 0;
            this.acc.savingsToday = 0;
            this.log.debug('Persistierte Tageswerte stammen aus einer vergangenen Periode – zurückgesetzt.');
        }

        await this.setStateAsync('info.connection', { val: true, ack: true });
        this.timer = this.setInterval(
            () => this.tick().catch(e => this.log.error(`tick: ${e.message}`)),
            this.intervalSec * 1000,
        );

        this.log.info(
            `PV-Speicher-Simulation gestartet (inputMode=${this.inputMode}, sourceMode=${this.sourceMode}, ` +
            `Kapazität=${this.p.capacityWh / 1000} kWh, Intervall=${this.intervalSec}s).`,
        );
    }

    async tick() {
        const now = Date.now();
        const dtH = (now - this.lastTick) / 3600000; // Stunden seit letztem Tick
        this.lastTick = now;
        if (dtH <= 0) return;

        const d = new Date();
        if (d.getDate() !== this.today) {
            await this.resetDaily(d);
            this.today = d.getDate();
        }

        // Leistungsgrenzen in Energie pro Intervall umrechnen
        this.p.maxChargeWh = this.p.maxChargeW * dtH;
        this.p.maxDischargeWh = this.p.maxDischargeW * dtH;

        // Überschuss & Defizit für dieses Intervall ermitteln (Wh)
        let surplusWh = 0;
        let deficitWh = 0;
        let pvWh = null;   // nur im Modus PV+Verbrauch bekannt (für die Visualisierung)
        let consWh = null;
        if (this.sourceMode === 'grid_meter') {
            surplusWh = await this.readEnergy('export', this.ids.export, dtH);
            deficitWh = await this.readEnergy('import', this.ids.import, dtH);
        } else if (this.sourceMode === 'grid_signed') {
            const netWh = await this.readSignedEnergy('grid', this.ids.grid, dtH);
            ({ surplusWh, deficitWh } = splitSignedPower(netWh, this.gridSignImportPositive));
        } else {
            pvWh = await this.readEnergy('pv', this.ids.pv, dtH);
            consWh = await this.readEnergy('cons', this.ids.cons, dtH);
            const net = pvWh - consWh;
            surplusWh = Math.max(net, 0);
            deficitWh = Math.max(-net, 0);
        }

        if (surplusWh === 0 && deficitWh === 0) return;

        const r = stepBattery({ surplusWh, deficitWh, socWh: this.socWh }, this.p);
        this.socWh = r.socWh;

        const chargedKwh = r.chargedWh / 1000;
        const dischargedKwh = r.dischargedWh / 1000;
        // Wirtschaftlicher Nutzen des Speichers = gesparter Netzbezug minus entgangene Einspeisevergütung
        const benefit = dischargedKwh * this.priceImport - chargedKwh * this.priceFeedIn;

        await this.accumulate(r, chargedKwh, dischargedKwh, benefit, surplusWh, deficitWh);
        await this.publishLive(r, dtH, pvWh, consWh, surplusWh, deficitWh);
    }

    /**
     * Liest einen Eingangs-Datenpunkt und liefert die Energie (Wh) für dieses Intervall.
     * - inputMode 'power':  Wert wird als Leistung in W interpretiert -> W * Stunden = Wh
     * - inputMode 'energy': Wert wird als kumulierter Zählerstand in kWh interpretiert -> Delta * 1000 = Wh
     */
    async readEnergy(key, id, dtH) {
        const st = await this.getForeignStateAsync(id);
        const raw = st && typeof st.val === 'number' ? st.val : null;
        if (raw === null) {
            this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`);
            return 0;
        }
        // auf interne Basis-Einheit umrechnen (W bzw. kWh)
        const val = raw * (this.factors[key] || 1);

        if (this.inputMode === 'power') {
            return Math.max(val, 0) * dtH;
        }

        // energy: Differenz zum letzten Zählerstand
        const last = this.lastValues[key];
        this.lastValues[key] = val;
        if (last === undefined) return 0; // erster Messwert: noch keine Basis -> kein Delta
        const deltaKwh = val - last;
        return deltaKwh > 0 ? deltaKwh * 1000 : 0; // Zählerreset / negative Werte ignorieren
    }

    /**
     * Wie readEnergy, aber für einen vorzeichenbehafteten Netz-Datenpunkt (ein Zähler für
     * beide Richtungen). Liefert die Netto-Energie (Wh) MIT Vorzeichen; das Aufteilen in
     * Bezug/Einspeisung übernimmt splitSignedPower().
     */
    async readSignedEnergy(key, id, dtH) {
        const st = await this.getForeignStateAsync(id);
        const raw = st && typeof st.val === 'number' ? st.val : null;
        if (raw === null) {
            this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`);
            return 0;
        }
        // auf interne Basis-Einheit umrechnen (W bzw. kWh), Vorzeichen bleibt erhalten
        const val = raw * (this.factors[key] || 1);

        if (this.inputMode === 'power') {
            return val * dtH; // signierte Leistung -> signierte Energie
        }

        // energy: signiertes Delta des (Netto-)Zählerstands
        const last = this.lastValues[key];
        this.lastValues[key] = val;
        if (last === undefined) return 0;
        return (val - last) * 1000;
    }

    async accumulate(r, chargedKwh, dischargedKwh, benefit, surplusWh, deficitWh) {
        const a = this.acc;
        a.chargedToday += chargedKwh;
        a.dischargedToday += dischargedKwh;
        a.importOrigToday += deficitWh / 1000;
        a.importSimToday += r.gridImportWh / 1000;
        a.exportOrigToday += surplusWh / 1000;
        a.exportSimToday += r.gridExportWh / 1000;
        a.savingsToday += benefit;
        a.savingsMonth += benefit;
        a.savingsYear += benefit;

        this.totals.chargedTotal += chargedKwh;
        this.totals.dischargedTotal += dischargedKwh;
        this.totals.savingsTotal += benefit;

        const coverage = a.importOrigToday > 0 ? (a.dischargedToday / a.importOrigToday) * 100 : 0;
        const daysElapsed = Math.max((Date.now() - this.startTs) / 86400000, 1 / 24);
        const annualSavings = (this.totals.savingsTotal / daysElapsed) * 365;
        const amort = annualSavings > 0 && this.investment > 0 ? this.investment / annualSavings : 0;

        const round = (v, dec) => Math.round(v * 10 ** dec) / 10 ** dec;
        const set = (id, val, dec = 3) => this.setStateAsync(id, { val: round(val, dec), ack: true });

        await Promise.all([
            set('battery.soc.kWh', this.socWh / 1000),
            set('battery.soc.percent', (this.socWh / this.p.capacityWh) * 100, 1),
            set('battery.chargedToday.kWh', a.chargedToday),
            set('battery.dischargedToday.kWh', a.dischargedToday),
            set('battery.chargedTotal.kWh', this.totals.chargedTotal),
            set('battery.dischargedTotal.kWh', this.totals.dischargedTotal),
            set('grid.importOriginalToday.kWh', a.importOrigToday),
            set('grid.importSimulatedToday.kWh', a.importSimToday),
            set('grid.exportOriginalToday.kWh', a.exportOrigToday),
            set('grid.exportSimulatedToday.kWh', a.exportSimToday),
            set('economics.savingsToday.eur', a.savingsToday, 2),
            set('economics.savingsMonth.eur', a.savingsMonth, 2),
            set('economics.savingsYear.eur', a.savingsYear, 2),
            set('economics.savingsTotal.eur', this.totals.savingsTotal, 2),
            set('economics.batteryCoverageToday.percent', coverage, 1),
            set('economics.amortizationYears', amort, 1),
        ]);
    }

    /**
     * Schreibt die momentanen Leistungen (W) für die grafische Auswertung.
     * pvWh/consWh sind nur im Modus PV+Verbrauch bekannt; sonst 0 (Netz-Modi liefern nur das Saldo).
     */
    async publishLive(r, dtH, pvWh, consWh, surplusWh, deficitWh) {
        if (dtH <= 0) return;
        const w = (wh) => Math.round(wh / dtH);
        const pvW = pvWh !== null ? w(pvWh) : 0;
        const consW = consWh !== null ? w(consWh) : 0;
        const directW = pvWh !== null ? w(Math.min(pvWh, consWh)) : 0;

        await Promise.all([
            this.setStateAsync('live.pvW', { val: pvW, ack: true }),
            this.setStateAsync('live.consumptionW', { val: consW, ack: true }),
            this.setStateAsync('live.directUseW', { val: directW, ack: true }),
            this.setStateAsync('live.gridNetOrigW', { val: w(deficitWh - surplusWh), ack: true }),
            this.setStateAsync('live.gridNetSimW', { val: w(r.gridImportWh - r.gridExportWh), ack: true }),
            this.setStateAsync('live.batteryPowerW', { val: w(r.chargedWh - r.dischargedWh), ack: true }),
        ]);
    }

    async resetDaily(d) {
        this.acc.chargedToday = 0;
        this.acc.dischargedToday = 0;
        this.acc.importOrigToday = 0;
        this.acc.importSimToday = 0;
        this.acc.exportOrigToday = 0;
        this.acc.exportSimToday = 0;
        this.acc.savingsToday = 0;
        if (d.getMonth() !== this.curMonth) {
            this.acc.savingsMonth = 0;
            this.curMonth = d.getMonth();
        }
        if (d.getFullYear() !== this.curYear) {
            this.acc.savingsYear = 0;
            this.curYear = d.getFullYear();
        }
        this.log.debug('Tageswerte zurückgesetzt.');
    }

    async createStates() {
        for (const [id, name, unit, role, type] of STATE_DEFS) {
            await this.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    name,
                    type,
                    role,
                    unit: unit || undefined,
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
    }

    async getNumber(id) {
        try {
            const s = await this.getStateAsync(id);
            return s && typeof s.val === 'number' ? s.val : 0;
        } catch {
            return 0;
        }
    }

    onUnload(callback) {
        try {
            if (this.timer) this.clearInterval(this.timer);
            this.setState('info.connection', { val: false, ack: true });
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new PvStorageSim(options);
} else {
    new PvStorageSim();
}
