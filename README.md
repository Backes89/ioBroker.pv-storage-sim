# ioBroker.pv-storage-sim

Simuliert einen **PV-Batteriespeicher** auf Basis deiner realen PV-/Verbrauchsdaten, um zu
bewerten, ob sich der Kauf eines Speichers lohnen würde — ohne ihn tatsächlich zu besitzen.

## Idee

Der Adapter rechnet parallel zur Realität mit, was ein hypothetischer Speicher tun würde:
Überschüsse werden virtuell „geladen" statt eingespeist, Defizite virtuell aus dem Speicher
gedeckt statt aus dem Netz bezogen. Daraus ergeben sich Eigenverbrauch, simulierter Netzbezug
und die Ersparnis — und damit eine grobe Amortisationsschätzung.

## Eingangsdaten (umschaltbar)

**Eingabeart** (`inputMode`)
- `power` – momentane Leistung in **W**
- `energy` – kumulierter Zählerstand in **kWh** (Delta zwischen zwei Messungen)

**Datenquelle** (`sourceMode`)
- `pv_consumption` – Datenpunkte für PV-Erzeugung + Hausverbrauch
- `grid_meter` – zwei Datenpunkte für Netzbezug + Einspeisung (jeweils positiv)
- `grid_signed` – **ein** Datenpunkt mit Vorzeichen (Bezug/Einspeisung über das Vorzeichen),
  z. B. OBIS `16.7.0` „Gesamtwirkleistung". Über `gridSignPositive` lässt sich einstellen,
  ob positiv = Netzbezug (Standard) oder positiv = Einspeisung bedeutet.

So lassen sich die meisten Setups abbilden, egal ob Smartmeter, Wechselrichter oder Shelly 3EM.

**Einheit je Datenpunkt** – pro Datenpunkt ist wählbar, ob er in `W` bzw. `kWh` (Standard) oder
in `kW` bzw. `Wh` liefert. So lassen sich Geräte mit unterschiedlichen Einheiten mischen.

## Wichtige Ausgabe-Datenpunkte

| State | Bedeutung |
| --- | --- |
| `battery.soc.kWh` / `.percent` | simulierter Ladezustand |
| `battery.charged/dischargedToday/Total.kWh` | geladene / entladene Energie |
| `grid.importOriginalToday` vs. `grid.importSimulatedToday` | Netzbezug ohne vs. mit Speicher |
| `grid.exportOriginalToday` vs. `grid.exportSimulatedToday` | Einspeisung ohne vs. mit Speicher |
| `economics.savingsToday/Month/Year/Total.eur` | Ersparnis |
| `economics.batteryCoverageToday.percent` | wie viel des Bezugs der Speicher deckt |
| `economics.amortizationYears` | grobe Amortisationsschätzung |
| `live.pvW` / `live.consumptionW` / `live.directUseW` | momentane Leistungen (nur Modus PV+Verbrauch) |
| `live.gridNetOrigW` / `live.gridNetSimW` | Netz-Saldo als ein vorzeichenbehafteter Wert (+Bezug/−Einspeisung), ohne/mit Speicher |
| `live.batteryPowerW` | momentane Speicherleistung (+lädt / −entlädt) |

> **Hinweis für die grafische Auswertung:** Die `live.*`-Datenpunkte liefern momentane
> Leistungen in W. Für Verlaufs-Diagramme muss auf diesen States (und `battery.soc.percent`)
> ein History-Logging (`history`, `sql` oder `influxdb`) aktiviert werden.

## Auswertung (Admin-Tab)

Der Adapter bringt einen eigenen Reiter **„PV-Auswertung"** im ioBroker-Admin mit
(Tageskurven im bekannten Stil: Erzeugung, Verbrauch, Direktverbrauch, Ladestand bzw. im
Netz-Modus Netzbezug real vs. simuliert). Voraussetzung ist aktiviertes History-Logging auf
den oben genannten Datenpunkten. Über Instanz- und Datums-Auswahl lassen sich auch vergangene
Tage anzeigen.

## Rechenmodell

Pro Intervall:
- Überschuss = `max(PV − Verbrauch, 0)` bzw. Einspeisung des Zählers
- Defizit = `max(Verbrauch − PV, 0)` bzw. Netzbezug des Zählers
- Speicher lädt aus Überschuss (begrenzt durch Kapazität & Ladeleistung), Rest wird eingespeist
- Speicher deckt Defizit (begrenzt durch Ladezustand & Entladeleistung), Rest kommt aus dem Netz
- **Nutzen** = gesparter Netzbezug × Bezugspreis − entgangene Einspeisung × Vergütung

Wirkungsgrad wird je zur Hälfte (√η) beim Laden und Entladen angesetzt.

## Installation (Entwicklung)

```bash
npm install
npm test                       # Unit-Tests der Simulationslogik
# Adapter lokal in eine ioBroker-Instanz einbinden:
# iobroker url . / bzw. dev-server (https://github.com/ioBroker/dev-server)
```

## Bekannte Vereinfachungen / TODO

Offene Punkte und geplante Erweiterungen werden in [TODO.md](TODO.md) gepflegt
(u. a. bekannte Vereinfachungen des Rechenmodells und Ideen wie eine Web-Visualisierung).

## Changelog

### 0.0.28 (2026-06-30)
- KPI „Ersparnis" bezieht sich beim Blättern auf den **angezeigten Tag** (berechnet aus der
  `savingsTotal`-Historie); für heute weiterhin der Live-Wert

### 0.0.27 (2026-06-30)
- Paketvalidierungs-Tests (`test/package.test.js`): Versions-/Namens-Konsistenz, News-Eintrag,
  Pflichtfelder, Existenz referenzierter Dateien, Abgleich jsonConfig ↔ native-Defaults

### 0.0.26 (2026-06-30)
- Akkumulations-Logik (Tages-/Gesamtsummen, Speicher-Deckung, Amortisation) in
  `lib/accumulation.js` als reine Funktion ausgelagert und mit Unit-Tests abgesichert

### 0.0.25 (2026-06-30)
- Perioden-Reset-Logik (Tages-/Monats-/Jahresgrenze beim Neustart) in `lib/period.js`
  ausgelagert und mit Unit-Tests abgesichert

### 0.0.24 (2026-06-30)
- Einheiten-Auswahl je Datenpunkt passt nun zur Eingabeart: `W`/`kW` im Leistungs-Modus,
  `kWh`/`Wh` im Zählerstand-Modus (keine gemischten Dimensionen wie „W / kWh" mehr)

### 0.0.23 (2026-06-30)
- Entfernen veralteter/modusspezifischer Datenpunkte erfolgt nur noch, wenn sie existieren,
  und wird im Log vermerkt

### 0.0.22 (2026-06-30)
- Fehlende Datenpunkte werden bei jedem Start automatisch angelegt (wie bisher) und nun zur
  Transparenz im Log vermerkt

### 0.0.21 (2026-06-30)
- Modusabhängige Datenpunkte: `live.pvW`/`live.consumptionW`/`live.directUseW` werden nur im
  Modus PV+Verbrauch angelegt; in den Netz-Modi entfallen sie (waren dort immer 0)

### 0.0.20 (2026-06-30)
- Optionale seichte Glättung der Tageskurve per Schalter (gleitender Mittelwert); Tabelle und
  Tooltip zeigen weiterhin die exakten Rohwerte

### 0.0.19 (2026-06-30)
- Aufräumen: die redundanten `live.gridImport*/Export*W`-States entfernt (durch `live.gridNet*`
  ersetzt); alte Objekte werden beim Adapterstart automatisch gelöscht

### 0.0.18 (2026-06-30)
- Bugfix: Tages-/Monats-/Jahreswerte werden nach einem Neustart über eine Datumsgrenze hinweg
  korrekt zurückgesetzt, statt veraltete Werte in die neue Periode zu übernehmen

### 0.0.17 (2026-06-30)
- Prognose-Zeitachse auf max. 40 Jahre begrenzt (verhindert unbrauchbare Darstellung bei
  sehr kleiner hochgerechneter Jahresersparnis)

### 0.0.16 (2026-06-30)
- Neue einzelne Netz-Saldo-Datenpunkte `live.gridNetOrigW` / `live.gridNetSimW`
  (+Bezug/−Einspeisung); der Netz-Chart zeichnet jetzt eine Saldo-Reihe (rot über 0 =
  Bezug, blau unter 0 = Einspeisung) und umgeht das Zwei-Reihen-Zusammenführen komplett

### 0.0.15 (2026-06-30)
- Tabelle/Tooltip führen die Reihen per „letztem gültigen Wert" (Carry-forward) statt
  „nächstem Wert" zusammen – Bezug und Einspeisung erscheinen nicht mehr zusammen in einer Zeile

### 0.0.14 (2026-06-30)
- Tagesansicht nutzt Rohwerte statt Mittelung – Netzbezug und Einspeisung erscheinen nicht
  mehr scheinbar gleichzeitig (war ein Mittelungs-Artefakt, kein Logikfehler)

### 0.0.13 (2026-06-30)
- Auswertungs-Tab: Tagesnavigation (◀ ▶ / Heute), erweiterte Kennzahlen (Speicher-Deckung,
  geladen/entladen heute, Vollzyklen), Monats-Balkenansicht der täglichen Ersparnis und
  Amortisations-Prognose (kumulierte Ersparnis vs. Investition mit Break-even)

### 0.0.12 (2026-06-30)
- Ansichts-Umschalter im Auswertungs-Tab: Vergleich / Mit Speicher / Ohne Speicher
  (blendet die jeweils passenden Serien automatisch ein/aus)

### 0.0.11 (2026-06-30)
- Serien per Klick auf die Legende ein-/ausblendbar (Chart, Tabelle, Tooltip, Achsenskalierung)
- Speicher-Lade-/Entladeleistung (`live.batteryPowerW`) als Linie ergänzt

### 0.0.10 (2026-06-30)
- Netz-Chart bidirektional: Einspeisung unterhalb der Null-Linie, zusätzlich Einspeisung
  mit/ohne Speicher; Null-Linie in der Mitte, Tabelle/Tooltip zeigen Einspeisung negativ

### 0.0.9 (2026-06-30)
- Auswertungs-Tab nutzt die volle Fensterbreite und einen höheren Chart

### 0.0.8 (2026-06-30)
- Auswertungs-Tab: größerer Chart, Werte-Tabelle rechts, Hover-Fadenkreuz mit Tooltip,
  das die passende Tabellenzeile hervorhebt

### 0.0.7 (2026-06-30)
- Fix: Auswertungs-Tab fragt die Historie nur bis „jetzt" ab (kein flacher Verlauf bis 24:00 mehr)

### 0.0.6 (2026-06-30)
- Fix: Zeitachse im Auswertungs-Tab läuft immer über den vollen Tag (00:00–24:00)

### 0.0.5 (2026-06-30)
- Admin-Tab „PV-Auswertung" mit Canvas-Chart (Tageskurven, KPI-Karten, Instanz-/Tagesauswahl)

### 0.0.4 (2026-06-30)
- `live.*`-Datenpunkte mit momentanen Leistungen (W) als Grundlage der Visualisierung
- Hinweis in der Konfiguration, dass History-Logging für die Diagramme nötig ist

### 0.0.3 (2026-06-30)
- Einheit (W/kW bzw. kWh/Wh) je Datenpunkt auswählbar

### 0.0.2 (2026-06-30)
- Datenquelle „ein Datenpunkt mit Vorzeichen" (`grid_signed`) für Zähler mit saldierter Netzleistung

### 0.0.1 (2026-06-30)
- Erstveröffentlichung: Speicher-Simulation, Datenquellen PV+Verbrauch und Zweirichtungszähler,
  Wirtschaftlichkeitsberechnung (Ersparnis, Amortisation)

## Lizenz

MIT
