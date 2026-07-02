'use strict';

const utils = require('@iobroker/adapter-core');
const { stepBattery, splitSignedPower, unitFactor } = require('./lib/simulation');
const { periodResets, dayStart, previousDayStart } = require('./lib/period');
const { accumulateStep } = require('./lib/accumulation');
const { dayChartSvg, barsSvg, kpiCardSvg, fmtDE } = require('./lib/svg');
const { resolveStorage } = require('./lib/templates');

// Definition aller vom Adapter angelegten States: [id, name{en,de}, unit, role, type]
const STATE_DEFS = [
    ['info.connection', { en: 'Adapter active', de: 'Verbindung / aktiv' }, '', 'indicator.connected', 'boolean'],

    ['battery.soc.kWh', { en: 'State of charge', de: 'Ladezustand' }, 'kWh', 'value.energy', 'number'],
    ['battery.soc.percent', { en: 'State of charge', de: 'Ladezustand' }, '%', 'value.battery', 'number'],
    ['battery.chargedToday.kWh', { en: 'Charged (today)', de: 'Geladen (heute)' }, 'kWh', 'value.energy', 'number'],
    ['battery.dischargedToday.kWh', { en: 'Discharged (today)', de: 'Entladen (heute)' }, 'kWh', 'value.energy', 'number'],
    ['battery.chargedTotal.kWh', { en: 'Charged (total)', de: 'Geladen (gesamt)' }, 'kWh', 'value.energy', 'number'],
    ['battery.dischargedTotal.kWh', { en: 'Discharged (total)', de: 'Entladen (gesamt)' }, 'kWh', 'value.energy', 'number'],

    ['grid.importOriginalToday.kWh', { en: 'Grid import without storage (today)', de: 'Netzbezug ohne Speicher (heute)' }, 'kWh', 'value.energy', 'number'],
    ['grid.importSimulatedToday.kWh', { en: 'Grid import with storage (today)', de: 'Netzbezug mit Speicher (heute)' }, 'kWh', 'value.energy', 'number'],
    ['grid.exportOriginalToday.kWh', { en: 'Feed-in without storage (today)', de: 'Einspeisung ohne Speicher (heute)' }, 'kWh', 'value.energy', 'number'],
    ['grid.exportSimulatedToday.kWh', { en: 'Feed-in with storage (today)', de: 'Einspeisung mit Speicher (heute)' }, 'kWh', 'value.energy', 'number'],

    ['economics.savingsToday.eur', { en: 'Savings (today)', de: 'Ersparnis (heute)' }, '€', 'value', 'number'],
    ['economics.savingsMonth.eur', { en: 'Savings (month)', de: 'Ersparnis (Monat)' }, '€', 'value', 'number'],
    ['economics.savingsYear.eur', { en: 'Savings (year)', de: 'Ersparnis (Jahr)' }, '€', 'value', 'number'],
    ['economics.savingsTotal.eur', { en: 'Savings (total)', de: 'Ersparnis (gesamt)' }, '€', 'value', 'number'],
    ['economics.batteryCoverageToday.percent', { en: 'Storage coverage of import (today)', de: 'Speicher-Deckung des Bezugs (heute)' }, '%', 'value', 'number'],
    ['economics.amortizationYears', { en: 'Amortization (estimate)', de: 'Amortisationsdauer (Schätzung)' }, 'Jahre', 'value', 'number'],
    ['economics._startTs', { en: 'Simulation start time', de: 'Startzeitpunkt der Simulation' }, 'ms', 'value.time', 'number'],

    // Momentane Leistungen (W) für die grafische Auswertung / WebUI – hier History-Logging aktivieren
    ['live.pvW', { en: 'PV generation (current)', de: 'PV-Erzeugung (aktuell)' }, 'W', 'value.power.produced', 'number'],
    ['live.consumptionW', { en: 'House consumption (current)', de: 'Hausverbrauch (aktuell)' }, 'W', 'value.power.consumption', 'number'],
    ['live.directUseW', { en: 'Direct use (current)', de: 'Direktverbrauch (aktuell)' }, 'W', 'value.power', 'number'],
    // Netz-Saldo als EIN vorzeichenbehafteter Wert (+ = Bezug, − = Einspeisung) für die Visualisierung
    ['live.gridNetOrigW', { en: 'Grid balance without storage (+import/−feed-in)', de: 'Netz-Saldo ohne Speicher (+Bezug/−Einsp.)' }, 'W', 'value.power', 'number'],
    ['live.gridNetSimW', { en: 'Grid balance with storage (+import/−feed-in)', de: 'Netz-Saldo mit Speicher (+Bezug/−Einsp.)' }, 'W', 'value.power', 'number'],
    ['live.batteryPowerW', { en: 'Storage power (+charging/−discharging)', de: 'Speicher-Leistung (+lädt / −entlädt)' }, 'W', 'value.power', 'number'],

    // Fertige SVG-Charts als Datenpunkt – direkt in beliebigen Dashboards (VIS, eigene Web-Apps …) anzeigbar
    ['charts.todaySvg', { en: 'Day chart (SVG)', de: 'Tagesverlauf (SVG)' }, '', 'html', 'string'],
    ['charts.savingsMonthSvg', { en: 'Savings per day (SVG)', de: 'Ersparnis pro Tag (SVG)' }, '', 'html', 'string'],
    ['charts.kpiCardSvg', { en: 'KPI card (SVG)', de: 'Kennzahlen-Kachel (SVG)' }, '', 'html', 'string'],
    ['charts._dailyHistory', { en: 'Daily savings history (internal)', de: 'Tages-Ersparnis-Historie (intern)' }, '', 'json', 'string'],
    ['charts._intradayBuffer', { en: 'Intraday buffer today (internal)', de: 'Intraday-Puffer heute (intern)' }, '', 'json', 'string'],
];

// States, die es in früheren Versionen gab und die beim Start entfernt werden (durch gridNet* ersetzt).
const OBSOLETE_STATES = [
    'live.gridImportOrigW', 'live.gridImportSimW', 'live.gridExportOrigW', 'live.gridExportSimW',
];

// Nur im Modus PV+Verbrauch sinnvoll; in den Netz-Modi werden sie nicht angelegt (dort immer 0).
const PV_ONLY_STATES = ['live.pvW', 'live.consumptionW', 'live.directUseW'];

class PvStorageSim extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'pv-storage-sim' });
        this.timer = null;
        this.lastValues = {}; // letzte Rohwerte je Quelle (für Zähler-Delta bzw. Leistungs-Integration)
        this.lastTick = null;
        this.sub = null;        // Ereignis-Puffer je Quelle (nur im Subscribe-Modus)
        this.sourceTs = {};     // letzter Aktualisierungs-Zeitstempel je Eingangs-Datenpunkt
        this.staleWarnedAt = {}; // Drosselung der Stale-Warnungen

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', { val: false, ack: true }).catch(() => {});

        const c = this.config;
        // Speicher-Vorlage (Hersteller/Modell) oder eigene Werte
        const tpl = resolveStorage(c.storageTemplate);
        if (!tpl && c.storageTemplate && c.storageTemplate !== 'custom') {
            this.log.warn(`Unbekannte Speicher-Vorlage '${c.storageTemplate}' – es werden die manuellen Werte verwendet.`);
        }
        const spec = tpl || {
            capacityKwh: Number(c.capacityKwh) || 10,
            maxChargeW: Number(c.maxChargeW) || 3000,
            maxDischargeW: Number(c.maxDischargeW) || 3000,
            minSocPercent: Number(c.minSocPercent) || 5,
            roundTripEff: Number(c.roundTripEff) || 90,
            standbyW: Number(c.standbyW) || 0,
        };
        const capWh = spec.capacityKwh * 1000;
        const eff = Math.sqrt(Math.min(Math.max(spec.roundTripEff, 1), 100) / 100);

        this.p = {
            capacityWh: capWh,
            minSocWh: (spec.minSocPercent / 100) * capWh,
            maxChargeW: spec.maxChargeW,
            maxDischargeW: spec.maxDischargeW,
            standbyW: spec.standbyW || 0,
            maxChargeWh: 0,    // wird je Intervall gesetzt
            maxDischargeWh: 0, // wird je Intervall gesetzt
            standbyWh: 0,      // wird je Intervall gesetzt
            chargeEff: eff,
            dischargeEff: eff,
        };
        if (tpl) this.log.info(`Speicher-Vorlage aktiv: ${tpl.label} (${spec.capacityKwh} kWh, Laden/Entladen ${spec.maxChargeW}/${spec.maxDischargeW} W, Standby ${this.p.standbyW} W).`);

        this.priceImport = (Number(c.priceImportCt) || 0) / 100; // €/kWh
        this.priceFeedIn = (Number(c.priceFeedInCt) || 0) / 100; // €/kWh
        this.investment = Number(c.investmentEur) || 0;
        this.priceIncreasePct = Math.max(Number(c.priceIncreasePercent) || 0, 0);
        this.inputMode = c.inputMode === 'energy' ? 'energy' : 'power';
        this.sourceMode = ['grid_meter', 'grid_signed'].includes(c.sourceMode) ? c.sourceMode : 'pv_consumption';
        this.readMode = c.readMode === 'subscribe' ? 'subscribe' : 'poll';
        this.intervalSec = Math.max(Number(c.intervalSec) || 30, 5);
        // bei einem vorzeichenbehafteten Zähler: ist positiv = Netzbezug (Standard) oder = Einspeisung?
        this.gridSignImportPositive = c.gridSignPositive !== 'export';

        // Umrechnungsfaktor je Datenpunkt; je nach Eingabeart wird das passende Einheitenfeld gelesen
        const suffix = this.inputMode === 'power' ? 'Power' : 'Energy';
        const f = (base) => unitFactor(c[base + suffix]);
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
        // veraltete + im aktuellen Modus nutzlose States entfernen (nur falls vorhanden)
        const toRemove = OBSOLETE_STATES.concat(this.sourceMode === 'pv_consumption' ? [] : PV_ONLY_STATES);
        let removed = 0;
        for (const id of toRemove) {
            const ex = await this.getObjectAsync(id).catch(() => null);
            if (ex) { await this.delObjectAsync(id).catch(() => {}); removed++; }
        }
        if (removed) this.log.info(`${removed} nicht mehr benötigte(r) Datenpunkt(e) entfernt.`);

        // persistierte Werte wiederherstellen (Neustart mitten am Tag soll Werte nicht verlieren);
        // auf die aktuelle Kapazität geklemmt, falls zwischenzeitlich ein kleinerer Speicher gewählt wurde
        this.socWh = Math.min((await this.getNumber('battery.soc.kWh')) * 1000 || this.p.minSocWh, this.p.capacityWh);
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

        // Chart-Daten: persistierte Tages-Ersparnis-Historie laden (VOR dem Perioden-Reset,
        // damit ein bei Neustart über Mitternacht beendeter Tag noch gerettet werden kann)
        this.lastSvgTs = 0;
        const dh = await this.getStateAsync('charts._dailyHistory').catch(() => null);
        try { this.dailySavings = JSON.parse(dh && dh.val ? dh.val : '[]'); } catch { this.dailySavings = []; }
        if (!Array.isArray(this.dailySavings)) this.dailySavings = [];

        // Intraday-Puffer aus dem State wiederherstellen (nur Punkte von heute) – so bleibt
        // der "heute"-Chart nach einem Neustart mitten am Tag lückenlos.
        this.dayBuffer = [];
        const ib = await this.getStateAsync('charts._intradayBuffer').catch(() => null);
        try {
            const pts = JSON.parse(ib && ib.val ? ib.val : '[]');
            const todayStart = dayStart(now);
            if (Array.isArray(pts)) this.dayBuffer = pts.filter(p => p && typeof p.ts === 'number' && p.ts >= todayStart);
        } catch { /* Puffer bleibt leer */ }

        // Lief der Adapter über eine Tages-/Monats-/Jahresgrenze hinweg nicht, dürfen die
        // persistierten Perioden-Werte nicht in die neue Periode übernommen werden.
        const lastSt = await this.getStateAsync('economics.savingsToday.eur').catch(() => null);
        const lastTs = lastSt && lastSt.ts ? lastSt.ts : this.startTs;
        const reset = periodResets(lastTs, now.getTime());
        if (reset.year) this.acc.savingsYear = 0;
        if (reset.month) this.acc.savingsMonth = 0;
        if (reset.day) {
            // resetDaily() lief für den beendeten Tag nicht – seine Ersparnis noch in die
            // Historie übernehmen, bevor die Tageswerte genullt werden (Duplikate vermeiden).
            const endedDay = dayStart(new Date(lastTs));
            if (!this.dailySavings.some(e => e && e.day === endedDay)) {
                this.dailySavings.push({ day: endedDay, val: Math.round(this.acc.savingsToday * 100) / 100 });
                if (this.dailySavings.length > 60) this.dailySavings.shift();
                await this.setStateAsync('charts._dailyHistory', { val: JSON.stringify(this.dailySavings), ack: true }).catch(() => {});
            }
            this.acc.chargedToday = 0;
            this.acc.dischargedToday = 0;
            this.acc.importOrigToday = 0;
            this.acc.importSimToday = 0;
            this.acc.exportOrigToday = 0;
            this.acc.exportSimToday = 0;
            this.acc.savingsToday = 0;
            this.log.debug('Persistierte Tageswerte stammen aus einer vergangenen Periode – zurückgesetzt.');
        }

        // Ereignisbasiertes Lesen: auf die Quell-Datenpunkte abonnieren; zwischen den Ticks
        // wird jede Änderung zeitgewichtet aufintegriert (genauer als der Momentanwert je Intervall).
        if (this.readMode === 'subscribe') {
            this.sub = {};
            for (const [key, sid] of Object.entries(this.ids)) {
                const st = await this.getForeignStateAsync(sid).catch(() => null);
                const val = st && typeof st.val === 'number' ? st.val * (this.factors[key] || 1) : null;
                this.sub[key] = { id: sid, val, ts: Date.now(), accWh: 0 };
                if (st && st.ts) this.sourceTs[key] = st.ts;
                await this.subscribeForeignStatesAsync(sid);
            }
            this.log.info('Ereignisbasiertes Lesen aktiv (Subscribe).');
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

        // Leistungsgrenzen und Standby in Energie pro Intervall umrechnen
        this.p.maxChargeWh = this.p.maxChargeW * dtH;
        this.p.maxDischargeWh = this.p.maxDischargeW * dtH;
        this.p.standbyWh = this.p.standbyW * dtH;

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

        this.checkStaleInputs(now);

        // energy-Modus: Delta 0 bedeutet "keine neuen Zählerdaten" -> nichts verrechnen.
        // Im power-Modus ist eine Null-Bilanz dagegen ein echter Messwert und wird normal
        // verarbeitet (sonst blieben live.*-Werte, Puffer und SVG-Charts auf altem Stand stehen).
        if (this.inputMode === 'energy' && surplusWh === 0 && deficitWh === 0) return;

        const r = stepBattery({ surplusWh, deficitWh, socWh: this.socWh }, this.p);
        this.socWh = r.socWh;

        const chargedKwh = r.chargedWh / 1000;
        const dischargedKwh = r.dischargedWh / 1000;
        // Wirtschaftlicher Nutzen des Speichers = gesparter Netzbezug minus entgangene
        // Einspeisevergütung minus netzgedeckter Standby-Verbrauch (der batteriegedeckte
        // Anteil wirkt indirekt: er verbraucht geladene Energie ohne Bezugs-Ersparnis)
        const benefit = dischargedKwh * this.priceImport - chargedKwh * this.priceFeedIn
            - (r.standbyGridWh / 1000) * this.priceImport;

        await this.accumulate(r, chargedKwh, dischargedKwh, benefit, surplusWh, deficitWh);
        await this.publishLive(r, dtH, pvWh, consWh, surplusWh, deficitWh);

        // Chart-Tagespuffer füllen und die SVG-Datenpunkte gedrosselt (alle 2 Min.) aktualisieren
        const wNow = (wh) => Math.round(wh / dtH);
        this.dayBuffer.push({
            ts: now,
            netOrig: wNow(deficitWh - surplusWh),
            netSim: wNow(r.gridImportWh - r.gridExportWh),
            batt: wNow(r.chargedWh - r.dischargedWh - r.standbyBattWh),
            soc: Math.round((this.socWh / this.p.capacityWh) * 1000) / 10,
            pv: pvWh !== null ? wNow(pvWh) : null,
            cons: consWh !== null ? wNow(consWh) : null,
            direct: pvWh !== null ? wNow(Math.min(pvWh, consWh)) : null,
        });
        if (now - this.lastSvgTs >= 120000) {
            this.lastSvgTs = now;
            await this.renderCharts().catch(e => this.log.warn(`renderCharts: ${e.message}`));
        }
    }

    /**
     * Liefert den aktuellen (bereits auf die Basis-Einheit umgerechneten) Wert einer Quelle –
     * je nach Lesemodus aus dem Ereignis-Puffer oder per getForeignState. null = kein Wert.
     */
    async readInput(key, id) {
        if (this.readMode === 'subscribe') {
            const s = this.sub && this.sub[key];
            return s && typeof s.val === 'number' ? s.val : null;
        }
        const st = await this.getForeignStateAsync(id);
        if (st && st.ts) this.sourceTs[key] = st.ts;
        const raw = st && typeof st.val === 'number' ? st.val : null;
        return raw === null ? null : raw * (this.factors[key] || 1);
    }

    /**
     * Subscribe-Modus, power: entnimmt die seit dem letzten Tick zeitgewichtet
     * aufintegrierte Energie (Wh, signiert) und setzt den Integrator zurück.
     */
    drainSubscribedWh(key) {
        const s = this.sub && this.sub[key];
        if (!s || typeof s.val !== 'number') return null;
        const now = Date.now();
        s.accWh += s.val * Math.max(now - s.ts, 0) / 3600000;
        s.ts = now;
        const wh = s.accWh;
        s.accWh = 0;
        return wh;
    }

    /**
     * Liest einen Eingangs-Datenpunkt und liefert die Energie (Wh) für dieses Intervall.
     * - inputMode 'power':  Leistung in W -> W * Stunden = Wh (Subscribe: zeitgewichtetes Integral)
     * - inputMode 'energy': kumulierter Zählerstand in kWh -> Delta * 1000 = Wh
     */
    async readEnergy(key, id, dtH) {
        if (this.readMode === 'subscribe' && this.inputMode === 'power') {
            const wh = this.drainSubscribedWh(key);
            if (wh === null) { this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`); return 0; }
            return Math.max(wh, 0);
        }
        const val = await this.readInput(key, id);
        if (val === null) {
            this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`);
            return 0;
        }

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
        if (this.readMode === 'subscribe' && this.inputMode === 'power') {
            const wh = this.drainSubscribedWh(key);
            if (wh === null) { this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`); return 0; }
            return wh; // signiert
        }
        const val = await this.readInput(key, id);
        if (val === null) {
            this.log.warn(`Datenpunkt ${id} liefert keinen numerischen Wert.`);
            return 0;
        }

        if (this.inputMode === 'power') {
            return val * dtH; // signierte Leistung -> signierte Energie
        }

        // energy: signiertes Delta des (Netto-)Zählerstands
        const last = this.lastValues[key];
        this.lastValues[key] = val;
        if (last === undefined) return 0;
        return (val - last) * 1000;
    }

    /** Subscribe-Modus: Wertänderung eines Quell-Datenpunkts zeitgewichtet aufintegrieren. */
    onStateChange(id, state) {
        if (!this.sub || !state || typeof state.val !== 'number') return;
        for (const [key, s] of Object.entries(this.sub)) {
            if (s.id !== id) continue;
            const now = state.ts || Date.now();
            if (this.inputMode === 'power' && typeof s.val === 'number') {
                s.accWh += s.val * Math.max(now - s.ts, 0) / 3600000;
            }
            s.val = state.val * (this.factors[key] || 1);
            s.ts = now;
            this.sourceTs[key] = now;
        }
    }

    /** Warnt (gedrosselt, 1×/h), wenn ein Eingangs-Datenpunkt längere Zeit nicht aktualisiert wurde. */
    checkStaleInputs(now) {
        const staleMs = Math.max(this.intervalSec * 5000, 10 * 60000); // mind. 10 Min bzw. 5 Intervalle
        for (const [key, id] of Object.entries(this.ids)) {
            const ts = this.sourceTs[key];
            if (!ts || now - ts <= staleMs) continue;
            if (this.staleWarnedAt[key] && now - this.staleWarnedAt[key] < 3600000) continue;
            this.staleWarnedAt[key] = now;
            this.log.warn(`Eingangs-Datenpunkt ${id} wurde seit ${Math.round((now - ts) / 60000)} Minuten nicht aktualisiert – die Simulation rechnet mit dem letzten bekannten Wert.`);
        }
    }

    async accumulate(r, chargedKwh, dischargedKwh, benefit, surplusWh, deficitWh) {
        const daysElapsed = Math.max((Date.now() - this.startTs) / 86400000, 1 / 24);
        const res = accumulateStep(
            { acc: this.acc, totals: this.totals },
            { chargedKwh, dischargedKwh, benefit, deficitWh, surplusWh, gridImportWh: r.gridImportWh, gridExportWh: r.gridExportWh },
            { daysElapsed, investment: this.investment, priceIncreasePct: this.priceIncreasePct, minDays: 14 },
        );
        // neue Werte in die bestehenden Objekte übernehmen (Identität bleibt erhalten)
        Object.assign(this.acc, res.acc);
        Object.assign(this.totals, res.totals);
        const a = this.acc;
        const coverage = res.coverage;
        const amort = res.amortizationYears;

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

        const writes = [
            this.setStateAsync('live.gridNetOrigW', { val: w(deficitWh - surplusWh), ack: true }),
            this.setStateAsync('live.gridNetSimW', { val: w(r.gridImportWh - r.gridExportWh), ack: true }),
            this.setStateAsync('live.batteryPowerW', { val: w(r.chargedWh - r.dischargedWh - r.standbyBattWh), ack: true }),
        ];
        // PV/Verbrauch/Direktverbrauch nur im Modus PV+Verbrauch (sonst nicht bekannt)
        if (pvWh !== null) {
            writes.push(
                this.setStateAsync('live.pvW', { val: w(pvWh), ack: true }),
                this.setStateAsync('live.consumptionW', { val: w(consWh), ack: true }),
                this.setStateAsync('live.directUseW', { val: w(Math.min(pvWh, consWh)), ack: true }),
            );
        }
        await Promise.all(writes);
    }

    /** Rendert die SVG-Chart-Datenpunkte aus dem Tagespuffer + der Ersparnis-Historie. */
    async renderCharts() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const map = (k) => this.dayBuffer.map(b => ({ ts: b.ts, val: b[k] }));
        const daySvg = dayChartSvg({
            start, end: start + 86400000,
            netOrig: map('netOrig'), netSim: map('netSim'), batt: map('batt'), soc: map('soc'),
        });

        const daily = this.dailySavings.slice(-29).concat([{ day: start, val: Math.round(this.acc.savingsToday * 100) / 100 }]);
        const monthSvg = barsSvg(daily);

        const amort = await this.getNumber('economics.amortizationYears');
        const kpiSvg = kpiCardSvg([
            { label: 'Ladestand', value: Math.round((this.socWh / this.p.capacityWh) * 100) + ' %' },
            { label: 'Ersparnis heute', value: fmtDE(this.acc.savingsToday, 2) + ' €' },
            { label: 'Ersparnis gesamt', value: fmtDE(this.totals.savingsTotal, 2) + ' €' },
            { label: 'Amortisation', value: amort ? fmtDE(amort, 1) + ' J' : '–' },
        ]);

        // dichten Intraday-Puffer (heute) für den Admin-Chart bereitstellen – auf max. 720 Punkte reduziert
        const maxPts = 720;
        let stored = this.dayBuffer;
        if (stored.length > maxPts) {
            const step = Math.ceil(stored.length / maxPts);
            stored = stored.filter((_, i) => i % step === 0);
            if (stored[stored.length - 1] !== this.dayBuffer[this.dayBuffer.length - 1]) stored.push(this.dayBuffer[this.dayBuffer.length - 1]);
        }

        await Promise.all([
            this.setStateAsync('charts.todaySvg', { val: daySvg, ack: true }),
            this.setStateAsync('charts.savingsMonthSvg', { val: monthSvg, ack: true }),
            this.setStateAsync('charts.kpiCardSvg', { val: kpiSvg, ack: true }),
            this.setStateAsync('charts._intradayBuffer', { val: JSON.stringify(stored), ack: true }),
        ]);
    }

    async resetDaily(d) {
        // abgeschlossenen Tag in die persistente Ersparnis-Historie schreiben (für die Monats-Balken);
        // kalenderbasiert statt "-24h", damit das Datum auch an Zeitumstellungs-Tagen stimmt
        const endedDay = previousDayStart(d);
        this.dailySavings.push({ day: endedDay, val: Math.round(this.acc.savingsToday * 100) / 100 });
        if (this.dailySavings.length > 60) this.dailySavings.shift();
        await this.setStateAsync('charts._dailyHistory', { val: JSON.stringify(this.dailySavings), ack: true }).catch(() => {});
        this.dayBuffer = [];

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
        const isPv = this.sourceMode === 'pv_consumption';
        let created = 0;
        let migrated = 0;
        for (const [id, name, unit, role, type] of STATE_DEFS) {
            if (!isPv && PV_ONLY_STATES.includes(id)) continue; // im Netz-Modus nicht anlegen
            const common = { name, type, role, unit: unit || undefined, read: true, write: false };
            const existed = await this.getObjectAsync(id).catch(() => null);
            if (!existed) {
                await this.setObjectNotExistsAsync(id, { type: 'state', common, native: {} });
                created++;
            } else {
                // Definition geändert (z. B. Rolle)? -> Objekt migrieren; extendObject
                // merged nur common und lässt custom-Einstellungen (History) unangetastet.
                const cc = existed.common || {};
                if (cc.role !== role || cc.type !== type || (cc.unit || '') !== (unit || '') || JSON.stringify(cc.name) !== JSON.stringify(name)) {
                    await this.extendObjectAsync(id, { common });
                    migrated++;
                }
            }
        }
        if (created) this.log.info(`${created} fehlende(r) Datenpunkt(e) angelegt.`);
        if (migrated) this.log.info(`${migrated} Datenpunkt(e) auf die aktuelle Definition migriert.`);
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
