# ioBroker.pv-storage-sim

![Test](https://github.com/Backes89/ioBroker.pv-storage-sim/actions/workflows/test-and-release.yml/badge.svg)

Simulates a **PV battery storage** based on your real PV/consumption data to evaluate
whether buying one would pay off — without actually owning it.

Deutsche Dokumentation: [docs/de/README.md](docs/de/README.md)

## Idea

The adapter calculates in parallel to reality what a hypothetical battery would do:
surpluses are virtually "charged" instead of fed into the grid, deficits are virtually
covered from the battery instead of imported. This yields self-consumption, simulated
grid import/export, the savings in € — and a rough amortization estimate.

The adapter is **read-only**: it reads foreign datapoints and only writes states below
its own instance (`pv-storage-sim.0.*`). It is safe to run on a production system.

## Input data (switchable)

**Input type** (`inputMode`)
- `power` – momentary power in **W**
- `energy` – cumulative meter reading in **kWh** (delta between two readings)

**Data source** (`sourceMode`)
- `pv_consumption` – datapoints for PV generation + house consumption
- `grid_meter` – two datapoints for grid import + feed-in (each positive)
- `grid_signed` – **one** signed datapoint (import/feed-in via sign), e.g. OBIS `16.7.0`
  "total active power". The sign convention is configurable (`gridSignPositive`).

**Unit per datapoint** – each input can deliver `W`/`kW` (power mode) or `kWh`/`Wh`
(meter mode), so devices with different units can be mixed.

**Reading mode** (`readMode`)
- `poll` (default) – reads the momentary value once per simulation interval
- `subscribe` – subscribes to the source datapoints and integrates every value change
  time-weighted; more accurate with fast-changing meters

## Storage templates

Pick a manufacturer/model (Huawei LUNA2000 & S1, BYD HVS, Tesla Powerwall 2, LG RESU,
sonnen, E3/DC …) and the technical specs — usable capacity, max. charge/discharge power,
round-trip efficiency and **standby consumption** — are applied automatically and shown
below the dropdown. The values are **representative, please verify against the datasheet**.
Choose "Custom values" to enter your own. The investment cost is always entered manually.

## Key output states

| State | Meaning |
| --- | --- |
| `battery.soc.kWh` / `.percent` | simulated state of charge |
| `battery.charged/dischargedToday/Total.kWh` | charged / discharged energy |
| `grid.importOriginalToday` vs. `grid.importSimulatedToday` | grid import without vs. with storage |
| `grid.exportOriginalToday` vs. `grid.exportSimulatedToday` | feed-in without vs. with storage |
| `economics.savingsToday/Month/Year/Total.eur` | savings |
| `economics.batteryCoverageToday.percent` | share of import covered by the battery |
| `economics.amortizationYears` | rough amortization estimate (shown after ≥ 14 days of data) |
| `live.gridNetOrigW` / `live.gridNetSimW` | grid balance as one signed value (+import/−feed-in), without/with storage |
| `live.batteryPowerW` | momentary storage power (+charging/−discharging) |
| `live.pvW` / `live.consumptionW` / `live.directUseW` | momentary powers (PV+consumption mode only) |
| `charts.todaySvg` / `charts.savingsMonthSvg` / `charts.kpiCardSvg` | ready-made SVG charts for any dashboard (VIS, custom web apps, …) |

> **Note for the charts:** the trend charts need time series. Enable history logging
> (`history`, `sql` or `influxdb`) on the `live.*` states and `battery.soc.percent`
> (for the monthly view additionally on `economics.savingsTotal.eur`). The SVG chart
> states and the "today" chart work without history logging.

## Evaluation (admin tab)

The adapter ships its own admin tab **"PV-Auswertung"**: day curves (grid balance with/
without storage, storage power, state of charge), a monthly bar view of daily savings and
an amortization forecast (cumulative savings vs. investment with break-even point).
Features: compare/with/without-storage view switch, series toggling via legend, optional
smoothing, brush-to-zoom (drag a time range, double-click to reset), day navigation,
value table with hover crosshair and KPI cards.

## Calculation model

Per interval:
- surplus = `max(PV − consumption, 0)` resp. the meter's feed-in
- deficit = `max(consumption − PV, 0)` resp. the meter's import
- the battery charges from surplus (limited by capacity & charge power), the rest is fed in
- the battery covers the deficit (limited by SoC & discharge power), the rest is imported
- **standby consumption** of the storage system is covered from the battery (otherwise
  from the grid)
- **benefit** = saved import × import price − lost feed-in × feed-in tariff
  − grid-covered standby × import price

Efficiency is applied half each (√η) on charge and discharge. The amortization estimate
can take an annual **electricity price increase** into account (geometric series) and is
only shown once at least 14 days of data have been collected.

**Dynamic electricity prices:** both the import price and the feed-in tariff can
optionally be read from a datapoint (e.g. the Tibber adapter's `CurrentPrice.total`)
instead of using a fixed value — each simulation step is then valued at the tariff in
effect at that moment, which matters a lot for dynamic tariffs where a battery
systematically discharges during expensive evening hours. The datapoint unit is
selectable (€/kWh or ct/kWh), the configured fixed value serves as fallback if the
datapoint is unavailable, and the currently applied prices are exposed as
`economics.currentImportPrice` / `economics.currentFeedInPrice`. Note: the simulated
battery still behaves like a standard storage (charge on surplus, discharge on deficit) —
only the valuation is dynamic, not the charging strategy.

## Installation

Beta (not yet in the official repository) — install from GitHub:

```bash
iobroker url Backes89/ioBroker.pv-storage-sim#v0.0.38
iobroker upload pv-storage-sim
```

Development:

```bash
npm install
npm test                 # unit + package tests (node:test)
npm run test:package     # official ioBroker package validation (mocha)
npm run test:integration # official integration test with a real js-controller
```

## Known simplifications / roadmap

Open items and planned features are tracked in [TODO.md](TODO.md)
(e.g. instance comparison view, dynamic electricity prices, model simplifications).

## Changelog

### 0.0.45 (2026-07-17)
- Adopted the ioBroker-Bot template pull requests (content re-implemented on current main,
  PRs #2–#10 superseded): Dependabot for npm and GitHub Actions incl. auto-merge rules,
  Node.js 20 support dropped (End of Life — adapter now requires **Node >= 22**, CI tests
  on 22/24), admin dependency raised to >= 7.8.23, `CHANGELOG_OLD.md` added

### 0.0.44 (2026-07-16)
- Dynamic electricity prices (community request): import price and feed-in tariff can
  optionally come from a datapoint (e.g. Tibber), unit selectable (€/kWh or ct/kWh),
  fixed value as fallback, currently applied prices exposed as states
  (`economics.currentImportPrice` / `currentFeedInPrice`)

### 0.0.43 (2026-07-16)
- Repository checker (issue #1), round 2: admin UI translated into all 11 ioBroker
  languages using the official i18n file structure (`admin/i18n/<lang>.json`,
  maintained via `@iobroker/adapter-dev` / `translate-adapter`); io-package texts
  (titleLang, description, news) available in all languages; new package tests enforce
  i18n completeness

### 0.0.42 (2026-07-15)
- Repository checker (issue #1), round 1: minimum versions raised (Node >= 20,
  js-controller >= 6.0.11, admin >= 7.6.17, @iobroker/testing >= 5.2.2, adapter-core
  updated), deprecated `common.main` removed, `adminTab.name` multilingual, news capped
  at 7 entries (repository builder limit), workflow renamed to "Test and Release" with
  conventional job names (`check-and-lint`, `adapter-tests`) and semver tag patterns,
  responsive width attributes (xs/lg/xl) for all jsonConfig fields, `.commitinfo` ignored

### 0.0.41 (2026-07-06)
- Code quality: ESLint (bug-focused flat config) and TypeScript type checking of the
  JavaScript sources (`checkJs` incl. typed adapter config) — both enforced by a new CI job
- CI: superseded runs are cancelled (`concurrency`), commits with `[skip ci]` skip the
  pipeline, integration test pinned to the released js-controller (`latest`)

### 0.0.40 (2026-07-03)
- Config: reading mode now comes before the interval; the interval help text explains its
  role in both modes (polling: sampling + accounting; event-based: accounting only)

### 0.0.39 (2026-07-03)
- Monthly view: hovering a savings bar highlights it, shows a tooltip (date, savings,
  cumulative) and marks the matching table row — same interaction as in the day view

### 0.0.38 (2026-07-02)
- English main documentation (German version moved to `docs/de/README.md`)
- Fixed broken `master` branch URLs in io-package.json (repository uses `main`)
- package.json description in English

### 0.0.37 (2026-07-02)
- Standby consumption of the storage system (parameter + templates), electricity price
  increase for the amortization forecast, amortization only shown after 14 days of data,
  optional event-based reading (subscribe), warning for stale input datapoints, bilingual
  admin UI and state names (en/de), GitHub Actions CI with integration test

### 0.0.36 (2026-07-02)
- Release hygiene: energy states use role `value.energy` (existing objects migrated),
  `common.licenseInformation` added, news trimmed, deprecated fields removed

### 0.0.35 (2026-07-02)
- Bugfixes: daily savings no longer lost on restarts spanning midnight; intraday buffer
  survives restarts; zero balance in power mode updates live values; DST-safe day
  handling; SoC clamped to capacity; warning for unknown storage template

### 0.0.34 (2026-06-30)
- Day chart for today uses the adapter's dense intraday buffer (gap-free); storage
  template specs shown below the dropdown

### 0.0.33 (2026-06-30)
- Storage template dropdown shows the stored specs in the option label

### 0.0.32 (2026-06-30)
- Added Huawei LUNA2000 S1 templates (7/14/21 kWh)

### 0.0.31 (2026-06-30)
- Storage templates: pick a manufacturer/model to prefill technical specs

### 0.0.30 (2026-06-30)
- New SVG chart states (`charts.todaySvg`, `savingsMonthSvg`, `kpiCardSvg`) for easy
  display in any dashboard

### 0.0.29 (2026-06-30)
- Day chart: brush-to-zoom (drag a time range; reset via button or double-click)

### 0.0.28 (2026-06-30)
- KPI "savings" reflects the selected day instead of always today

### 0.0.27 (2026-06-30)
- Added package validation tests

### 0.0.26 (2026-06-30)
- Accumulation logic extracted into a pure, tested function

### 0.0.25 (2026-06-30)
- Period-reset logic extracted into a pure function with unit tests

### 0.0.24 (2026-06-30)
- Unit selection matches the input type: W/kW for power, kWh/Wh for meter readings

### 0.0.23 (2026-06-30)
- Removal of obsolete/mode-specific states only happens if they exist and is logged

Older entries (0.0.1 – 0.0.22, in German) are archived in
[docs/de/README.md](docs/de/README.md).

Older changelog entries are moved to [CHANGELOG_OLD.md](CHANGELOG_OLD.md).

## License

MIT License

Copyright (c) 2026 Dominik Kremer <dom.kremer@gmail.com>

The full license text is available in [LICENSE](LICENSE).
