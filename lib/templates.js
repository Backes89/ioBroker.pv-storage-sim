'use strict';

/**
 * Speicher-Vorlagen mit technischen Richtwerten gängiger Heimspeicher.
 *
 * ACHTUNG: Die Werte sind REPRÄSENTATIV und NICHT verbindlich – bitte am jeweiligen
 * Datenblatt prüfen und ggf. über „Eigene Werte" anpassen. Insbesondere die maximale
 * Lade-/Entladeleistung hängt oft vom Wechselrichter/der Konfiguration ab.
 *
 * Felder je Vorlage:
 *   capacityKwh    nutzbare Kapazität (kWh)
 *   maxChargeW     max. Ladeleistung (W)
 *   maxDischargeW  max. Entladeleistung (W)
 *   minSocPercent  reservierter Mindest-Ladezustand (%) – bei „nutzbarer" Kapazität i. d. R. 0
 *   roundTripEff   Roundtrip-Wirkungsgrad (%)
 *   standbyW       Standby-/Eigenverbrauch des Speichersystems (W, Dauerlast)
 */
const TEMPLATES = {
    huawei_luna2000_5:  { label: 'Huawei LUNA2000 – 5 kWh',        capacityKwh: 5,    maxChargeW: 2500,  maxDischargeW: 2500,  minSocPercent: 0, roundTripEff: 95, standbyW: 5 },
    huawei_luna2000_10: { label: 'Huawei LUNA2000 – 10 kWh',       capacityKwh: 10,   maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 95, standbyW: 8 },
    huawei_luna2000_15: { label: 'Huawei LUNA2000 – 15 kWh',       capacityKwh: 15,   maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 95, standbyW: 10 },
    huawei_luna2000_7_s1:  { label: 'Huawei LUNA2000 S1 – 7 kWh',  capacityKwh: 7,    maxChargeW: 3500,  maxDischargeW: 3500,  minSocPercent: 0, roundTripEff: 95, standbyW: 6 },
    huawei_luna2000_14_s1: { label: 'Huawei LUNA2000 S1 – 14 kWh', capacityKwh: 14,   maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 95, standbyW: 9 },
    huawei_luna2000_21_s1: { label: 'Huawei LUNA2000 S1 – 21 kWh', capacityKwh: 21,   maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 95, standbyW: 12 },
    byd_hvs_5_1:        { label: 'BYD Battery-Box HVS 5.1',        capacityKwh: 5.1,  maxChargeW: 3000,  maxDischargeW: 3000,  minSocPercent: 0, roundTripEff: 95, standbyW: 5 },
    byd_hvs_7_7:        { label: 'BYD Battery-Box HVS 7.7',        capacityKwh: 7.7,  maxChargeW: 4500,  maxDischargeW: 4500,  minSocPercent: 0, roundTripEff: 95, standbyW: 6 },
    byd_hvs_10_2:       { label: 'BYD Battery-Box HVS 10.2',       capacityKwh: 10.2, maxChargeW: 6000,  maxDischargeW: 6000,  minSocPercent: 0, roundTripEff: 95, standbyW: 7 },
    tesla_powerwall_2:  { label: 'Tesla Powerwall 2',             capacityKwh: 13.5, maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 90, standbyW: 15 },
    lg_resu10h:         { label: 'LG RESU10H',                    capacityKwh: 9.8,  maxChargeW: 5000,  maxDischargeW: 5000,  minSocPercent: 0, roundTripEff: 95, standbyW: 5 },
    sonnen_10_11:       { label: 'sonnenBatterie 10 (11 kWh)',    capacityKwh: 11,   maxChargeW: 4600,  maxDischargeW: 4600,  minSocPercent: 0, roundTripEff: 90, standbyW: 15 },
    e3dc_s10_e_13:      { label: 'E3/DC S10 E (13 kWh)',          capacityKwh: 13,   maxChargeW: 4500,  maxDischargeW: 4500,  minSocPercent: 0, roundTripEff: 90, standbyW: 25 },
};

/**
 * Liefert die Specs einer Vorlage oder null bei „Eigene Werte" / unbekanntem Key.
 * @param {string} key
 * @returns {?{capacityKwh:number,maxChargeW:number,maxDischargeW:number,minSocPercent:number,roundTripEff:number,label:string}}
 */
function resolveStorage(key) {
    if (!key || key === 'custom') return null;
    return TEMPLATES[key] || null;
}

module.exports = { TEMPLATES, resolveStorage };
