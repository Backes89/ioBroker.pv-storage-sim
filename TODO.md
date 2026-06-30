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

## 2. Eigene Web-Seite zur Visualisierung (in Arbeit)

**Idee:** Aufrufbare Web-Oberfläche im bekannten ASUE-Stil (Tageskurven: Erzeugung gelb,
Verbrauch-Linie, Direktverbrauch hellblau, Ladestand), dazu Ersparnis/Amortisation.

**Fundament steht (v0.0.4):**
- ✅ `live.*`-Datenpunkte mit momentanen Leistungen (W) als Chart-Datenquelle
- ✅ History-Hinweis in der Admin-Config (User muss Logging aktivieren)

**Noch offen – das eigentliche UI:**
- **Variante A – Admin-Tab:** Reiter über `common.adminTab` / `tab_m.html`. Bleibt im Admin,
  nutzt dessen Socket, kein extra Webserver. Schnellster Weg zum funktionierenden Chart.
- **Variante B – eigenes `www/`-Verzeichnis:** standalone Seite, vom `web`-Adapter unter
  `http://<ip>:8082/pv-storage-sim/` ausgeliefert; Live-Werte via socket.io.
- Charts mit Chart.js. Historie via `getHistory`/`sendTo` an den History-Adapter.
- Chart passt sich dem `sourceMode` an: voller Erzeugung/Verbrauch/Direktverbrauch-Chart nur
  bei `pv_consumption`; bei Netz-Modi Netzbezug real vs. simuliert + Ladestand.

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
