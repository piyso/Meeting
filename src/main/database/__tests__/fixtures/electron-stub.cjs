// Stand-in for the `electron` module when database code runs under
// ELECTRON_RUN_AS_NODE (see `npm run test:db`). Only what the database layer
// and its logger touch.
const os = require('os')
const path = require('path')

module.exports = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'bluearkive-dbtest-userdata'),
    isPackaged: false,
    getVersion: () => '0.0.0',
    isReady: () => true,
  },
  BrowserWindow: { getAllWindows: () => [] },
  net: { isOnline: () => true },
}
