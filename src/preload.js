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
  ai: {
    loadConfig: () => ipcRenderer.invoke('ai:config:load'),
    saveConfig: (config) => ipcRenderer.invoke('ai:config:save', config),
    chat: (messages, currentCode) => ipcRenderer.invoke('ai:chat', { messages, currentCode }),
    // 流式：invoke 在流结束后 resolve；增量/结束/错误经 chatEvents 推送
    chatStream: (messages, currentCode) => ipcRenderer.invoke('ai:chat', { messages, currentCode }),
    chatEvents: (handlers) => {
      const listeners = {
        delta: (_event, payload) => handlers.delta?.(payload),
        done: (_event, payload) => handlers.done?.(payload),
        error: (_event, payload) => handlers.error?.(payload)
      };
      ipcRenderer.on('ai:chat:delta', listeners.delta);
      ipcRenderer.on('ai:chat:done', listeners.done);
      ipcRenderer.on('ai:chat:error', listeners.error);
      return () => {
        ipcRenderer.removeListener('ai:chat:delta', listeners.delta);
        ipcRenderer.removeListener('ai:chat:done', listeners.done);
        ipcRenderer.removeListener('ai:chat:error', listeners.error);
      };
    },
    testConnection: (config) => ipcRenderer.invoke('ai:test', config),
    loadHistory: () => ipcRenderer.invoke('ai:history:load'),
    saveHistory: (messages) => ipcRenderer.invoke('ai:history:save', messages)
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
