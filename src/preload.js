// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js loaded');

contextBridge.exposeInMainWorld('api', {
  plantuml: {
    render: (code) => ipcRenderer.invoke('render-plantuml', code),
    exportSvg: (options) => ipcRenderer.invoke('plantuml:export-svg', options),
    exportPng: (options) => ipcRenderer.invoke('plantuml:export-png', options),
    exportPdf: (options) => ipcRenderer.invoke('plantuml:export-pdf', options)
  },
  file: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
    saveFileAs: (content) => ipcRenderer.invoke('file:saveAs', content),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
    recentFiles: {
      load: () => ipcRenderer.invoke('recent-files:load'),
      add: (filePath) => ipcRenderer.invoke('recent-files:add', filePath)
    }
  },
  app: {
    quit: () => ipcRenderer.invoke('app:quit')
  },
  onMenuEvent: (callback) => {
    ipcRenderer.on('menu:openFile', () => callback('openFile'));
    ipcRenderer.on('menu:save', () => callback('save'));
    ipcRenderer.on('menu:saveAs', () => callback('saveAs'));
    ipcRenderer.on('menu:exportSvg', () => callback('exportSvg'));
    ipcRenderer.on('menu:exportPng', () => callback('exportPng'));
    ipcRenderer.on('menu:exportPdf', () => callback('exportPdf'));
    ipcRenderer.on('menu:zoomIn', () => callback('zoomIn'));
    ipcRenderer.on('menu:zoomOut', () => callback('zoomOut'));
    ipcRenderer.on('menu:resetView', () => callback('resetView'));
    ipcRenderer.on('menu:closeTab', () => callback('closeTab'));
    ipcRenderer.on('menu:openPath', (_event, filePath, content) => callback('openPath', filePath, content));
  },
  onUnsavedDialog: (callback) => {
    ipcRenderer.on('dialog:unsavedChanges', () => callback());
  },
  unsavedDialogResponse: (action) => ipcRenderer.invoke('dialog:unsavedChangesResponse', action)
});
