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

## 2. Eigene Web-Seite zur Visualisierung

**Idee:** Wie manche Adapter eine aufrufbare Web-Oberfläche mit schöner Darstellung
(SoC-Verlauf, Ersparnis über Zeit, Bezug mit/ohne Speicher, Amortisations-Prognose).

**Umsetzungs-Notizen / Optionen:**
- **Variante A – Admin-Tab:** zusätzlicher Reiter über `common.adminTab` / `tab_m.html`.
  Bleibt im Admin, kein extra Webserver nötig.
- **Variante B – eigenes `www/`-Verzeichnis:** statische Seite, vom `web`-Adapter unter
  `http://<ip>:8082/pv-storage-sim/` ausgeliefert; Live-Werte via socket.io (iobroker-ws).
- Charts z. B. mit Chart.js (leichtgewichtig). Für historische Verläufe braucht es Logging
  der States (history/influxdb/sql-Adapter) bzw. eigenes Ringbuffer-Logging.
- Pragmatischer erster Schritt: Admin-Tab mit aktuellen Kennzahlen + einfachem Tages-Chart.

## Bekannte Vereinfachungen im Rechenmodell

Bewusst offen gelassene Punkte (aus dem README hierher übernommen):

- Leistungs-Modus integriert rechteckig (aktueller Wert × Intervall), keine Trapez-Mittelung
- keine Speicheralterung / Kapazitätsverlust über die Jahre
- keine Strompreissteigerung, keine Finanzierung/Darlehen (Amortisation ist linear geschätzt)
- echter Autarkiegrad nur näherungsweise (`batteryCoverage`)

## Erledigt

- ✅ Datenquelle „ein Datenpunkt mit Vorzeichen" (`grid_signed`) — v0.0.2
- ✅ Einheit (W/kW bzw. kWh/Wh) je Datenpunkt auswählbar — v0.0.3

---
_Erfasst am 2026-06-30._
