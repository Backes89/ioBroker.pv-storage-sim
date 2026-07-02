# Geplante Erweiterungen / Ideen

Sammlung offener Punkte für `iobroker.pv-storage-sim`. Reihenfolge = grobe Priorität.

## 1. Einheit (W / kW) je Datenpunkt auswählbar

**Problem:** Datenpunkte liefern je nach Gerät die Leistung in **W** oder **kW** (bzw. im
Zählerstand-Modus in **Wh** oder **kWh**). Aktuell wird im `power`-Modus fest in W gerechnet.

**Idee:** Pro Eingangs-Datenpunkt (PV, Verbrauch, Netzbezug, Einspeisung, Netzleistung) ein
Einheiten-Auswahlfeld (W/kW bzw. Wh/kWh), das einen Umrechnungsfaktor setzt.

**Umsetzungs-Notizen:**
- Faktor zentral in `readEnergy()` / `readSignedEnergy()` (main.js) anwenden, bevor integriert
  bzw. das Delta gebildet wird.
- Einheit hängt vom `inputMode` ab: bei `power` → W vs. kW (×1000), bei `energy` → Wh vs. kWh.
- Sinnvolle Defaults: power=W, energy=kWh (entspricht heutigem Verhalten → abwärtskompatibel).
- jsonConfig.json: kleines `select` neben jedem `objectId`-Feld; io-package.json: native Defaults.

## 2. Visualisierung – Admin-Tab (MVP umgesetzt, v0.0.5)

**Umgesetzt:**
- ✅ `live.*`-Datenpunkte (momentane Leistungen in W) als Chart-Datenquelle
- ✅ History-Hinweis in der Admin-Config
- ✅ Admin-Tab „PV-Auswertung" (`admin/tab.html`, `common.adminTab`): Canvas-Chart ohne
  externe Libs, Daten via Admin-Socket (`getHistory`/`getState`), Instanz- & Tagesauswahl,
  KPI-Karten, modusabhängige Serien (PV-Modus: Erzeugung/Verbrauch/Direktverbrauch/Ladestand;
  Netz-Modus: Netzbezug real vs. simuliert + Ladestand).

**Mögliche Verbesserungen:**
- Auth-Fall: Verbindung über Admin-Socket bei aktivierter Authentifizierung absichern
  (Token), aktuell auf anonyme/lokale Verbindung ausgelegt.
- Vor-/Zurück-Buttons für Tage, Wochen-/Monatsansicht, Aggregation größerer Zeiträume.
- Optional zusätzlich eine standalone `www/`-Seite (web-Adapter) zum Teilen/Vollbild.
- Tooltips/Hover-Werte am Chart, Export als PNG/CSV.

## Geplante nächste Schritte

- **Instanz-Vergleich** (zwei Speichergrößen nebeneinander): heute schon über zwei Instanzen
  möglich; offen ist eine Vergleichsansicht im Auswertungs-Tab (Instanz A vs. B).
- **Dynamische Strompreise** (Tibber & Co.): Preis aus Datenpunkt statt Festwert — bewusst
  auf später verschoben (ändert auch die Speicherstrategie-Frage).
- Auswertungs-Tab (tab.html) übersetzen (aktuell deutsch; Admin-Config ist zweisprachig).
- Vorlagen-Specs mit echten Datenblatt-Werten verifizieren (aktuell Richtwerte).

## Bekannte Vereinfachungen im Rechenmodell

Bewusst offen gelassene Punkte:

- Leistungs-Modus (Polling) integriert rechteckig (aktueller Wert × Intervall); der
  ereignisbasierte Lesemodus integriert zeitgewichtet je Wertänderung
- keine Speicheralterung / Kapazitätsverlust über die Jahre
- keine Finanzierung/Darlehen in der Amortisation (Strompreissteigerung ist seit 0.0.37 drin)
- echter Autarkiegrad nur näherungsweise (`batteryCoverage`)

## Erledigt

- ✅ Datenquelle „ein Datenpunkt mit Vorzeichen" (`grid_signed`) — v0.0.2
- ✅ Einheit (W/kW bzw. kWh/Wh) je Datenpunkt auswählbar — v0.0.3

---
_Erfasst am 2026-06-30._
