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

## Lizenz

MIT
