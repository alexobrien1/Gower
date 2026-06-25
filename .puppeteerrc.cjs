// Keep the Chromium browser INSIDE the project folder so Render bundles it into the
// deploy (otherwise it downloads to a home cache that Render does not keep).
const { join } = require('path');
module.exports = { cacheDirectory: join(__dirname, '.cache', 'puppeteer') };
