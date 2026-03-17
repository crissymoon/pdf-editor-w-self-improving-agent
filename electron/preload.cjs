const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xcmPdfDesktop', {
  platform: process.platform,
  versions: process.versions,
  emailPDF: (payload) => ipcRenderer.invoke('xcm:emailPdf', payload),
});
