// src/main.js
const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let plantumlProcess = null;
let mainWindow = null;
let isOperationInProgress = false;
let pendingOpenFilePath = null;
let isForceQuitting = false;

function getResourcePath(relativePath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, '..', relativePath);
}

function getCacheDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'cache');
  }
  return path.join(__dirname, '..', 'cache');
}

function validateResources() {
  const jarPath = getResourcePath('bin/plantuml.jar');
  const javaExe = process.platform === 'win32'
    ? getResourcePath('jre/bin/java.exe')
    : getResourcePath('jre/bin/java');

  const missing = [];
  try { fsSync.accessSync(jarPath); } catch { missing.push('plantuml.jar (bin/plantuml.jar)'); }
  try { fsSync.accessSync(javaExe); } catch { missing.push('Java 运行时 (jre/bin/java.exe)'); }

  if (missing.length > 0) {
    dialog.showErrorBox('启动失败 - 缺少必要组件', `以下文件未找到：\n\n${missing.join('\n')}\n\n请重新安装应用程序。`);
    app.quit();
    return false;
  }
  return true;
}

// ========== Recent Files (stored in cache dir) ==========
const MAX_RECENT_FILES = 10;

function getRecentFilesPath() {
  return path.join(getCacheDir(), 'recent-files.json');
}

function loadRecentFiles() {
  try {
    if (fsSync.existsSync(getRecentFilesPath())) {
      const data = fsSync.readFileSync(getRecentFilesPath(), 'utf8');
      const files = JSON.parse(data);
      return files.filter(f => {
        try { fsSync.accessSync(f.path); return true; } catch { return false; }
      });
    }
  } catch { /* ignore */ }
  return [];
}

function saveRecentFiles(files) {
  try {
    const dir = path.dirname(getRecentFilesPath());
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
    fsSync.writeFileSync(getRecentFilesPath(), JSON.stringify(files, null, 2), 'utf8');
  } catch { /* ignore */ }
}

function addRecentFile(filePath) {
  const files = loadRecentFiles();
  const idx = files.findIndex(f => f.path === filePath);
  if (idx >= 0) files.splice(idx, 1);
  files.unshift({ path: filePath, name: path.basename(filePath), timestamp: Date.now() });
  if (files.length > MAX_RECENT_FILES) files.length = MAX_RECENT_FILES;
  saveRecentFiles(files);
}

function parseOpenFileFromArgv(argv) {
  const args = argv || process.argv;
  const startIdx = app.isPackaged ? 1 : 2;
  for (let i = startIdx; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (ext === '.puml' || ext === '.txt') {
      try { fsSync.accessSync(arg); return arg; } catch {}
    }
  }
  return null;
}

function createWindow() {
  const isDev = !app.isPackaged;
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../dist/preload.js');

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  const winIcon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: winIcon,
    title: 'PlantUML 编辑器',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });

  mainWindow.on('close', async (e) => {
    if (isForceQuitting) return;
    try {
      const hasUnsaved = await mainWindow.webContents.executeJavaScript(
        'window.__hasUnsavedChanges__ ? window.__hasUnsavedChanges__() : false'
      );
      if (!hasUnsaved) return;
      e.preventDefault();
      mainWindow.webContents.send('dialog:unsavedChanges');
    } catch (err) {
      console.error('Close handler error:', err);
    }
  });

  // Use query param to signal pending file so renderer skips welcome flash
  const pendingQuery = pendingOpenFilePath ? { pending: '1' } : {};
  if (isDev) {
    const baseUrl = 'http://localhost:5173';
    const qs = pendingOpenFilePath ? '?pending=1' : '';
    mainWindow.loadURL(baseUrl + qs);
  } else {
    mainWindow.loadFile(path.resolve(__dirname, '../dist/index.html'), { query: pendingQuery });
  }

  if (pendingOpenFilePath) {
    mainWindow.webContents.once('did-finish-load', () => {
      const fpath = pendingOpenFilePath;
      pendingOpenFilePath = null;
      fs.readFile(fpath, 'utf8')
        .then(content => {
          mainWindow.webContents.send('menu:openPath', fpath, content);
          addRecentFile(fpath);
        })
        .catch(() => {});
    });
  }
}

// Handle OS file open
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady() && mainWindow) {
    fs.readFile(filePath, 'utf8')
      .then(content => {
        mainWindow.webContents.send('menu:openPath', filePath, content);
        addRecentFile(filePath);
        mainWindow.focus();
      })
      .catch(() => {});
  } else {
    pendingOpenFilePath = filePath;
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    const filePath = parseOpenFileFromArgv(commandLine);
    if (filePath) {
      fs.readFile(filePath, 'utf8')
        .then(content => {
          mainWindow.webContents.send('menu:openPath', filePath, content);
          addRecentFile(filePath);
        })
        .catch(() => {});
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!validateResources()) return;

  if (!pendingOpenFilePath) {
    const filePath = parseOpenFileFromArgv();
    if (filePath) pendingOpenFilePath = filePath;
  }

  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        { label: '打开', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:openFile') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
        { label: '另存为...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:saveAs') },
        { type: 'separator' },
        { label: '导出 SVG...', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('menu:exportSvg') },
        { label: '导出 PNG...', click: () => mainWindow?.webContents.send('menu:exportPng') },
        { label: '导出 PDF...', click: () => mainWindow?.webContents.send('menu:exportPdf') },
        { type: 'separator' },
        { label: '关闭标签页', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.webContents.send('menu:closeTab') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => mainWindow?.close() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('menu:zoomIn') },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('menu:zoomOut') },
        { label: '重置视图', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.send('menu:resetView') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 PlantUML 编辑器',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 PlantUML 编辑器',
              message: 'PlantUML 编辑器 v1.0.0',
              detail: '基于 Electron + Vue 3 + Monaco Editor 构建的离线 PlantUML 桌面编辑器。'
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ========== Unsaved Dialog Response ==========
ipcMain.handle('dialog:unsavedChangesResponse', async (_event, action) => {
  if (action === 'save') {
    await mainWindow.webContents.executeJavaScript(
      'window.__saveAllAndQuit__ ? window.__saveAllAndQuit__() : false'
    );
  } else if (action === 'discard') {
    isForceQuitting = true;
    mainWindow.destroy();
    app.quit();
  }
});

// ========== PlantUML Render ==========
function createPlantumlProcess() {
  if (plantumlProcess) { try { plantumlProcess.kill(); } catch {} }
  const jarPath = getResourcePath('bin/plantuml.jar');
  const javaExe = process.platform === 'win32'
    ? getResourcePath('jre/bin/java.exe')
    : getResourcePath('jre/bin/java');

  plantumlProcess = spawn(
    `"${javaExe}"`,
    ['-jar', `"${jarPath}"`, '-pipe', '-tsvg', '-charset', 'UTF-8'],
    { shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  plantumlProcess.on('error', (err) => { console.error('Failed to start PlantUML process:', err); });
  plantumlProcess.on('exit', () => { plantumlProcess = null; });
  return plantumlProcess;
}

ipcMain.handle('render-plantuml', async (_event, plantumlCode) => {
  if (!plantumlProcess || plantumlProcess.exitCode !== null) {
    createPlantumlProcess();
  }

  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    let timeoutId = setTimeout(() => reject(new Error('PlantUML 渲染超时')), 5000);

    plantumlProcess.stdout.removeAllListeners('data');
    plantumlProcess.stderr.removeAllListeners('data');
    plantumlProcess.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    plantumlProcess.stderr.on('data', (chunk) => { errorOutput += chunk.toString('utf8'); });

    const checkComplete = () => {
      if (output.includes('</svg>')) {
        clearTimeout(timeoutId);
        let errorLine = null;
        if (errorOutput) {
          const match = errorOutput.match(/line[:\s]*(\d+)/i);
          if (match) errorLine = parseInt(match[1]);
        }
        resolve({ svg: output, errorLine, errorMessage: errorOutput.trim() || null });
      } else {
        setTimeout(checkComplete, 10);
      }
    };

    plantumlProcess.stdin.write(plantumlCode.trimEnd() + '\n');
    checkComplete();
  });
});

// ========== Export Handlers ==========
ipcMain.handle('plantuml:export-svg', async (_event, { code }) => handleExport({ code, format: 'SVG', title: '导出 SVG 图像', defaultName: 'diagram.svg', ext: 'svg', plantumlFlag: '-tsvg' }));
ipcMain.handle('plantuml:export-png', async (_event, { code }) => handleExport({ code, format: 'PNG', title: '导出 PNG 图像', defaultName: 'diagram.png', ext: 'png', plantumlFlag: '-tpng' }));
ipcMain.handle('plantuml:export-pdf', async (_event, { code }) => handleExport({ code, format: 'PDF', title: '导出 PDF', defaultName: 'diagram.pdf', ext: 'pdf', plantumlFlag: '-tpdf' }));

async function handleExport({ code, format, title, defaultName, ext, plantumlFlag }) {
  if (isOperationInProgress) return { success: false, canceled: true };
  isOperationInProgress = true;

  try {
    const tempDir = path.join(app.getPath('temp'), 'plantuml-desktop');
    await fs.mkdir(tempDir, { recursive: true });

    const timestamp = Date.now();
    const tempPumlPath = path.join(tempDir, `plantuml_export_${timestamp}.puml`);
    const outFilePath = tempPumlPath.replace(/\.puml$/, `.${ext}`);

    try {
      await fs.writeFile(tempPumlPath, code, 'utf8');
      const jarPath = getResourcePath('bin/plantuml.jar');
      const javaExe = process.platform === 'win32'
        ? getResourcePath('jre/bin/java.exe')
        : getResourcePath('jre/bin/java');

      await new Promise((resolve, reject) => {
        const child = spawn(`"${javaExe}"`, ['-jar', `"${jarPath}"`, plantumlFlag, `"${tempPumlPath}"`], { shell: true });
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || 'PlantUML 执行失败'));
        });
      });

      try { await fs.access(outFilePath); } catch {
        throw new Error(`PlantUML 未生成 ${format} 文件`);
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title,
        defaultPath: defaultName,
        filters: [{ name: format, extensions: [ext] }, { name: '所有文件', extensions: ['*'] }]
      });

      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      let finalPath = result.filePath;
      if (!finalPath.toLowerCase().endsWith(`.${ext}`)) finalPath += `.${ext}`;
      const data = await fs.readFile(outFilePath);
      await fs.writeFile(finalPath, data);
      return { success: true, filePath: finalPath };

    } catch (error) {
      console.error(`${format} 导出失败:`, error);
      return { success: false, error: error.message };
    } finally {
      for (const file of [tempPumlPath, outFilePath]) {
        try { await fs.unlink(file); } catch (e) { if (e.code !== 'ENOENT') console.warn('无法删除临时文件:', file, e.message); }
      }
    }
  } finally {
    isOperationInProgress = false;
  }
}

// ========== File Operations ==========
ipcMain.handle('dialog:openFile', async () => {
  if (isOperationInProgress) return { canceled: true };
  isOperationInProgress = true;

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'PlantUML Files', extensions: ['puml', 'txt'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    addRecentFile(filePath);
    return { canceled: false, filePath, content };
  } finally {
    isOperationInProgress = false;
  }
});

ipcMain.handle('file:save', async (_event, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    addRecentFile(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file:saveAs', async (_event, content) => {
  if (isOperationInProgress) return { success: false };
  isOperationInProgress = true;

  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'PlantUML', extensions: ['puml'] }],
      defaultPath: '未命名绘图.puml'
    });
    if (result.canceled || !result.filePath) return { success: false };
    await fs.writeFile(result.filePath, content, 'utf8');
    addRecentFile(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    isOperationInProgress = false;
  }
});

ipcMain.handle('file:read', async (_event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('recent-files:load', () => loadRecentFiles());
ipcMain.handle('recent-files:add', (_event, filePath) => {
  addRecentFile(filePath);
  return loadRecentFiles();
});

// ========== AI Config ==========
function getAIConfigPath() {
  const dir = getCacheDir();
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'ai-config.json');
}

function loadAIConfig() {
  try {
    const p = getAIConfigPath();
    if (fsSync.existsSync(p)) return JSON.parse(fsSync.readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function saveAIConfig(config) {
  try {
    fsSync.writeFileSync(getAIConfigPath(), JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

ipcMain.handle('ai:config:load', () => loadAIConfig());
ipcMain.handle('ai:config:save', (_event, config) => saveAIConfig(config));

// ========== AI Chat ==========
const SYSTEM_PROMPT = `你是一位资深软件架构师和 PlantUML 专家，帮助 Java 工程师设计系统架构图。

用户是 Java 后端工程师，主要用 PlantUML 绘制设计方案中的时序图、类图、用例图、活动图、组件图、部署图、状态图等。

回复格式要求：
1. 先用简洁的中文解释你画的图表达了什么、关键设计要点、各组件之间的关系
2. 然后用 @startuml ... @enduml 包裹完整的 PlantUML 代码
3. 代码中可使用中文标签和注释，排版清晰
4. 如果用户要求修改现有图表，基于提供的当前代码进行修改

当前编辑器中的 PlantUML 代码：
---
{currentCode}
---`;

async function callAI(config, messages) {
  const { provider, apiKey, baseUrl, model } = config;

  if (provider !== 'anthropic' && provider !== 'gemini') {
    const url = `${baseUrl}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const body = JSON.stringify({ model, messages, temperature: 0.3, stream: false });
    const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) { const err = await resp.text().catch(() => ''); throw new Error(`API 请求失败 (${resp.status}): ${err}`); }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');
    const body = JSON.stringify({ model, system: systemMsg?.content || '', messages: userMsgs, max_tokens: 4096, temperature: 0.3 });
    const resp = await fetch(`${baseUrl}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Anthropic API 请求失败 (${resp.status})`);
    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'gemini') {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = JSON.stringify({ contents });
    const resp = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Gemini API 请求失败 (${resp.status})`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error('未知的 AI 提供商');
}

ipcMain.handle('ai:chat', async (_event, { messages, currentCode }) => {
  const config = loadAIConfig();
  if (!config) throw new Error('请先配置 AI 模型');
  const sysPrompt = SYSTEM_PROMPT.replace('{currentCode}', currentCode || '(空)');
  const fullMessages = [{ role: 'system', content: sysPrompt }, ...messages];
  return await callAI(config, fullMessages);
});

// ========== App Quit ==========
ipcMain.handle('app:quit', () => { if (mainWindow) mainWindow.close(); });

// ========== Cleanup ==========
app.on('before-quit', async () => {
  if (plantumlProcess) { try { plantumlProcess.kill(); } catch {} plantumlProcess = null; }
  const tempDir = path.join(app.getPath('temp'), 'plantuml-desktop');
  try {
    const files = await fs.readdir(tempDir);
    for (const file of files) { await fs.unlink(path.join(tempDir, file)).catch(() => {}); }
  } catch { /* ignore */ }
});
