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
    for (const f of ['name', 'version', 'titleLang', 'desc', 'authors', 'licenseInformation', 'type', 'mode', 'tier']) {
        assert.ok(io.common[f] !== undefined && io.common[f] !== '', `common.${f} fehlt`);
    }
    assert.ok(io.common.titleLang.en && io.common.titleLang.de, 'titleLang braucht en+de');
    assert.ok(io.common.desc.en && io.common.desc.de, 'desc braucht en+de');
    assert.ok(Array.isArray(io.common.authors) && io.common.authors.length, 'authors fehlt');
    assert.ok(io.common.licenseInformation.type && io.common.licenseInformation.license, 'licenseInformation braucht type+license');
});

test('deprecated Felder (title, license, main) sind entfernt', () => {
    assert.strictEqual(io.common['title'], undefined, 'common.title ist deprecated (titleLang nutzen)');
    assert.strictEqual(io.common['license'], undefined, 'common.license ist deprecated (licenseInformation nutzen)');
    assert.strictEqual(io.common['main'], undefined, 'common.main ist deprecated (main in package.json)');
});

test('adminTab.name ist mehrsprachig (Objekt mit en/de)', () => {
    const n = io.common.adminTab && io.common.adminTab.name;
    assert.ok(n && typeof n === 'object' && n.en && n.de, 'adminTab.name muss {en, de}-Objekt sein');
});

test('news hat höchstens 7 Einträge (Repository-Builder kappt bei 7)', () => {
    assert.ok(Object.keys(io.common.news).length <= 7, `news hat ${Object.keys(io.common.news).length} Einträge`);
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

test('jede Vorlage hat einen Info-Text mit den korrekten Leistungs-/Standby-Werten', () => {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'admin/i18n/en.json'), 'utf8'));
    const de = JSON.parse(fs.readFileSync(path.join(root, 'admin/i18n/de.json'), 'utf8'));
    for (const [key, s] of Object.entries(TEMPLATES)) {
        const info = jsonConfig.items['_tplInfo_' + key];
        assert.ok(info && info.type === 'staticText', `_tplInfo_${key} fehlt`);
        assert.ok(info.hidden && info.hidden.includes("'" + key + "'"), `_tplInfo_${key}: hidden-Bezug fehlt`);
        // text ist jetzt ein i18n-Schlüssel; Werte in der en- UND de-Fassung prüfen
        assert.ok(typeof info.text === 'string' && en[info.text] && de[info.text], `_tplInfo_${key}: i18n-Eintrag fehlt`);
        for (const txt of [en[info.text], de[info.text]]) {
            assert.ok(txt.includes(String(s.maxChargeW)), `_tplInfo_${key}: Ladeleistung fehlt`);
            assert.ok(txt.includes(String(s.maxDischargeW)), `_tplInfo_${key}: Entladeleistung fehlt`);
            assert.ok(txt.includes('~' + s.standbyW + ' W'), `_tplInfo_${key}: Standby fehlt`);
        }
    }
});

test('Vorlagen enthalten einen Standby-Wert', () => {
    for (const [key, s] of Object.entries(TEMPLATES)) {
        assert.ok(typeof s.standbyW === 'number' && s.standbyW >= 0 && s.standbyW <= 100, `${key}: standbyW unplausibel`);
    }
});

const I18N_LANGS = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

test('i18n: alle Sprachdateien vorhanden und schlüsselgleich zu en', () => {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'admin/i18n/en.json'), 'utf8'));
    for (const lang of I18N_LANGS) {
        const file = path.join(root, 'admin/i18n', lang + '.json');
        assert.ok(fs.existsSync(file), `i18n-Datei fehlt: ${lang}.json`);
        const keys = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')));
        assert.deepStrictEqual(keys.sort(), Object.keys(en).sort(), `Schlüssel in ${lang}.json weichen von en.json ab`);
    }
});

test('i18n: jeder jsonConfig-Text hat einen Eintrag in en.json', () => {
    const en = JSON.parse(fs.readFileSync(path.join(root, 'admin/i18n/en.json'), 'utf8'));
    assert.strictEqual(jsonConfig.i18n, true, 'jsonConfig.i18n muss true sein');
    const missing = [];
    for (const [key, item] of Object.entries(jsonConfig.items)) {
        for (const f of ['label', 'help', 'text']) {
            if (typeof item[f] === 'string' && en[item[f]] === undefined) missing.push(`${key}.${f}`);
        }
        for (const o of item['options'] || []) {
            if (typeof o.label === 'string' && en[o.label] === undefined) missing.push(`${key}.options`);
        }
    }
    assert.deepStrictEqual(missing, [], `Texte ohne Übersetzungs-Eintrag: ${missing}`);
});

test('io-package: titleLang, desc und news in allen Sprachen', () => {
    for (const lang of I18N_LANGS) {
        assert.ok(io.common.titleLang[lang], `titleLang.${lang} fehlt`);
        assert.ok(io.common.desc[lang], `desc.${lang} fehlt`);
        for (const [v, entry] of Object.entries(io.common.news)) {
            assert.ok(entry[lang], `news ${v}: ${lang} fehlt`);
        }
    }
});

test('instanceObjects sind wohlgeformt', () => {
    assert.ok(Array.isArray(io.instanceObjects), 'instanceObjects fehlt');
    for (const obj of io.instanceObjects) {
        assert.ok(obj._id && obj.type && obj.common, `instanceObject unvollständig: ${JSON.stringify(obj)}`);
    }
});
