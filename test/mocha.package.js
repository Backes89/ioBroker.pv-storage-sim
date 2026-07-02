'use strict';

// Offizielle ioBroker-Paketvalidierung (@iobroker/testing) – läuft unter Mocha:
//   npm run test:package
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.packageFiles(path.join(__dirname, '..'));
