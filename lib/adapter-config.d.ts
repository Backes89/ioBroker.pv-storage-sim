// Typisiert this.config (ioBroker.AdapterConfig) mit den native-Feldern aus io-package.json.
// Wird nur vom Typecheck (npm run check) genutzt, nicht zur Laufzeit.
declare global {
    // eslint-disable-next-line no-unused-vars
    namespace ioBroker {
        interface AdapterConfig {
            inputMode: 'power' | 'energy';
            sourceMode: 'pv_consumption' | 'grid_meter' | 'grid_signed';
            idPv: string;
            idConsumption: string;
            idGridImport: string;
            idGridExport: string;
            idGridPower: string;
            gridSignPositive: 'import' | 'export';
            unitPvPower: string;
            unitPvEnergy: string;
            unitConsumptionPower: string;
            unitConsumptionEnergy: string;
            unitGridImportPower: string;
            unitGridImportEnergy: string;
            unitGridExportPower: string;
            unitGridExportEnergy: string;
            unitGridPowerPower: string;
            unitGridPowerEnergy: string;
            intervalSec: number;
            readMode: 'poll' | 'subscribe';
            storageTemplate: string;
            capacityKwh: number;
            minSocPercent: number;
            roundTripEff: number;
            maxChargeW: number;
            maxDischargeW: number;
            standbyW: number;
            priceImportSource: 'fixed' | 'datapoint';
            idPriceImport: string;
            unitPriceImport: 'eur_kwh' | 'ct_kwh';
            priceFeedInSource: 'fixed' | 'datapoint';
            idPriceFeedIn: string;
            unitPriceFeedIn: 'eur_kwh' | 'ct_kwh';
            priceImportCt: number;
            priceFeedInCt: number;
            investmentEur: number;
            priceIncreasePercent: number;
        }
    }
}

export {};
