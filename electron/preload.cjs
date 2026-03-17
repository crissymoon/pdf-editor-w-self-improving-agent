const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('xcmPdfDesktop', {
  platform: process.platform,
  versions: process.versions,
});
