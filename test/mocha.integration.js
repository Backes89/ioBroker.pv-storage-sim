'use strict';

// Offizieller ioBroker-Integrationstest (@iobroker/testing): startet einen echten
// js-controller, installiert den Adapter und prüft, dass er sauber hochfährt.
// Läuft unter Mocha (erster Lauf lädt den js-controller herunter):
//   npm run test:integration
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'));
