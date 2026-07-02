'use strict';

// Paketvalidierung: prüft Konsistenz von package.json, io-package.json und admin/jsonConfig.json
// sowie das Vorhandensein referenzierter Dateien. Läuft im node:test-Runner (kein Mocha nötig).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const io = require('../io-package.json');
const jsonConfig = require('../admin/jsonConfig.json');
const { TEMPLATES } = require('../lib/templates');

test('Versionen in package.json und io-package.json stimmen überein', () => {
    assert.strictEqual(pkg.version, io.common.version, 'version mismatch package.json <-> io-package.json');
});

test('Adaptername ist konsistent (iobroker.<name>)', () => {
    assert.strictEqual(pkg.name, 'iobroker.' + io.common.name);
});

test('common.news enthält einen Eintrag für die aktuelle Version', () => {
    assert.ok(io.common.news && io.common.news[io.common.version],
        `kein news-Eintrag für ${io.common.version}`);
});

test('news-Einträge haben en und de', () => {
    for (const [v, entry] of Object.entries(io.common.news || {})) {
        assert.ok(entry.en, `news ${v}: en fehlt`);
        assert.ok(entry.de, `news ${v}: de fehlt`);
    }
});

test('Pflichtfelder in common sind vorhanden', () => {
    for (const f of ['name', 'version', 'titleLang', 'desc', 'authors', 'licenseInformation', 'type', 'mode', 'main', 'tier']) {
        assert.ok(io.common[f] !== undefined && io.common[f] !== '', `common.${f} fehlt`);
    }
    assert.ok(io.common.titleLang.en && io.common.titleLang.de, 'titleLang braucht en+de');
    assert.ok(io.common.desc.en && io.common.desc.de, 'desc braucht en+de');
    assert.ok(Array.isArray(io.common.authors) && io.common.authors.length, 'authors fehlt');
    assert.ok(io.common.licenseInformation.type && io.common.licenseInformation.license, 'licenseInformation braucht type+license');
});

test('deprecated Felder (title, license) sind entfernt', () => {
    assert.strictEqual(io.common.title, undefined, 'common.title ist deprecated (titleLang nutzen)');
    assert.strictEqual(io.common.license, undefined, 'common.license ist deprecated (licenseInformation nutzen)');
});

test('news hat höchstens 20 Einträge (Repo-Checker-Limit)', () => {
    assert.ok(Object.keys(io.common.news).length <= 20, `news hat ${Object.keys(io.common.news).length} Einträge`);
});

test('README enthält Changelog- und License-Kapitel', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.ok(readme.includes('## Changelog'), 'README: ## Changelog fehlt');
    assert.ok(readme.includes('## License'), 'README: ## License fehlt');
    assert.ok(/Copyright \(c\) \d{4}/.test(readme), 'README: Copyright-Zeile fehlt');
});

test('referenzierte Dateien existieren (main, icon, lib, admin)', () => {
    assert.ok(fs.existsSync(path.join(root, pkg.main)), `main fehlt: ${pkg.main}`);
    assert.ok(fs.existsSync(path.join(root, 'admin', io.common.icon)), `Icon fehlt: admin/${io.common.icon}`);
    assert.ok(fs.existsSync(path.join(root, 'admin', 'jsonConfig.json')), 'admin/jsonConfig.json fehlt');
    assert.ok(fs.existsSync(path.join(root, 'lib', 'simulation.js')), 'lib/simulation.js fehlt');
    if (io.common.adminTab) {
        assert.ok(fs.existsSync(path.join(root, 'admin', 'tab.html')), 'adminTab gesetzt, aber admin/tab.html fehlt');
    }
});

test('jeder native-Default hat ein UI-Feld und umgekehrt', () => {
    const items = Object.keys(jsonConfig.items).filter((k) => !k.startsWith('_'));
    const native = Object.keys(io.native);
    const missingInNative = items.filter((k) => !native.includes(k));
    const missingInUi = native.filter((k) => !items.includes(k));
    assert.deepStrictEqual(missingInNative, [], `UI-Felder ohne native-Default: ${missingInNative}`);
    assert.deepStrictEqual(missingInUi, [], `native-Defaults ohne UI-Feld: ${missingInUi}`);
});

test('storageTemplate-Optionen decken sich mit den Vorlagen (+custom)', () => {
    const opts = jsonConfig.items.storageTemplate.options.map((o) => o.value).sort();
    const expected = ['custom'].concat(Object.keys(TEMPLATES)).sort();
    assert.deepStrictEqual(opts, expected);
});

test('jede Vorlage hat einen Info-Text mit den korrekten Leistungswerten', () => {
    for (const [key, s] of Object.entries(TEMPLATES)) {
        const info = jsonConfig.items['_tplInfo_' + key];
        assert.ok(info && info.type === 'staticText', `_tplInfo_${key} fehlt`);
        assert.ok(info.hidden && info.hidden.includes("'" + key + "'"), `_tplInfo_${key}: hidden-Bezug fehlt`);
        assert.ok(info.text.includes(String(s.maxChargeW)), `_tplInfo_${key}: Ladeleistung fehlt`);
        assert.ok(info.text.includes(String(s.maxDischargeW)), `_tplInfo_${key}: Entladeleistung fehlt`);
    }
});

test('instanceObjects sind wohlgeformt', () => {
    assert.ok(Array.isArray(io.instanceObjects), 'instanceObjects fehlt');
    for (const obj of io.instanceObjects) {
        assert.ok(obj._id && obj.type && obj.common, `instanceObject unvollständig: ${JSON.stringify(obj)}`);
    }
});
