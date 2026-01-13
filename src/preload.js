// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload.js 加载成功！');

contextBridge.exposeInMainWorld('api', {
  plantuml: {
    render: (code) => ipcRenderer.invoke('render-plantuml', code),
    exportImage: (options) => ipcRenderer.invoke('plantuml:export-svg', options)
  },
  file: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
    saveFileAs: (content) => ipcRenderer.invoke('file:saveAs', content)
  }
});