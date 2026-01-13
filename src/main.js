// src/main.js
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

let plantumlProcess = null;
let mainWindow = null; // 👈 新增全局引用
let isOperationInProgress = false; // 👈 防连点锁

function createWindow() {
  const isDev = !app.isPackaged;
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../dist/preload.js');

  mainWindow = new BrowserWindow({ // 👈 赋值给全局变量
    width: 1200,
    height: 800,
    icon: "assets/icon.png",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.resolve(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ========== PlantUML 渲染（SVG）==========
function createPlantumlProcess() {
  if (plantumlProcess) {
    try { plantumlProcess.kill(); } catch {}
  }

  const jarPath = path.join(__dirname, '../bin/plantuml.jar');
  const javaExe = process.platform === 'win32'
    ? path.join(__dirname, '../jre/bin/java.exe')
    : path.join(__dirname, '../jre/bin/java');

  plantumlProcess = spawn(
    `"${javaExe}"`,
    ['-jar', `"${jarPath}"`, '-pipe', '-Tsvg', '-charset', 'UTF-8'],
    { shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );

  plantumlProcess.on('exit', () => { plantumlProcess = null; });
  return plantumlProcess;
}

ipcMain.handle('render-plantuml', async (event, plantumlCode) => {
  if (!plantumlProcess || plantumlProcess.exitCode !== null) {
    createPlantumlProcess();
  }

  return new Promise((resolve, reject) => {
    let output = '';
    let timeoutId = setTimeout(() => reject(new Error('PlantUML 渲染超时')), 5000);

    plantumlProcess.stdout.removeAllListeners('data');
    plantumlProcess.stderr.removeAllListeners('data');

    plantumlProcess.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    plantumlProcess.stderr.on('data', (chunk) => { /* ignore */ });

    const checkComplete = () => {
      if (output.includes('</svg>')) {
        clearTimeout(timeoutId);
        resolve(output);
      } else {
        setTimeout(checkComplete, 10);
      }
    };

    plantumlProcess.stdin.write(plantumlCode.trimEnd() + '\n');
    checkComplete();
  });
});

// ========== 新增：导出 ==========
ipcMain.handle('plantuml:export-svg', async (event, { code }) => {
  // 🔒 防连点锁
  if (isOperationInProgress) return { success: false, canceled: true };
  isOperationInProgress = true;

  try {
    const tempDir = app.isPackaged
      ? path.join(path.dirname(app.getPath('exe')), 'temp')
      : path.join(__dirname, '..', 'temp');

    await fs.mkdir(tempDir, { recursive: true });

    const timestamp = Date.now();
    const tempPumlPath = path.join(tempDir, `plantuml_export_${timestamp}.puml`);
    const svgFilePath = tempPumlPath.replace(/\.puml$/, '.svg');

    try {
      await fs.writeFile(tempPumlPath, code, 'utf8');

      const jarPath = path.join(__dirname, '../bin/plantuml.jar');
      const javaExe = process.platform === 'win32'
        ? path.join(__dirname, '../jre/bin/java.exe')
        : path.join(__dirname, '../jre/bin/java');

      const args = ['-jar', `"${jarPath}"`, '-Tsvg', `"${tempPumlPath}"`];

      await new Promise((resolve, reject) => {
        const child = spawn(`"${javaExe}"`, args, { shell: true });
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(stderr.trim() || 'PlantUML 执行失败'));
          }
        });
      });

      try {
        await fs.access(svgFilePath);
      } catch {
        throw new Error('PlantUML 未生成 SVG 文件，请检查语法或 JAR 包是否正常');
      }

      //传入 mainWindow 实现模态锁定
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出 SVG 图像',
        defaultPath: 'diagram.svg',
        filters: [
          { name: 'SVG 矢量图', extensions: ['svg'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      let finalPath = result.filePath;
      if (!finalPath.toLowerCase().endsWith('.svg')) {
        finalPath += '.svg';
      }

      const svgData = await fs.readFile(svgFilePath);
      await fs.writeFile(finalPath, svgData);

      return { success: true, filePath: finalPath };

    } catch (error) {
      console.error('❌ SVG 导出失败:', error);
      return { success: false, error: error.message };
    } finally {
      for (const file of [tempPumlPath, svgFilePath]) {
        try {
          await fs.unlink(file);
        } catch (e) {
          if (e.code !== 'ENOENT') {
            console.warn('⚠️ 无法删除临时文件:', file, e.message);
          }
        }
      }
    }
  } finally {
    isOperationInProgress = false;
  }
});

// ========== 文件操作 ==========
ipcMain.handle('dialog:openFile', async () => {
  if (isOperationInProgress) return { canceled: true };
  isOperationInProgress = true;

  try {
    // ✅ 传入 mainWindow 实现模态锁定
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'PlantUML Files', extensions: ['puml', 'txt'] }],
      properties: ['openFile']
    });
    
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, content };
  } finally {
    isOperationInProgress = false;
  }
});

ipcMain.handle('file:save', async (_event, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file:saveAs', async (_event, content) => {
  if (isOperationInProgress) return { success: false };
  isOperationInProgress = true;

  try {
    // ✅ 传入 mainWindow 实现模态锁定
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'PlantUML', extensions: ['puml'] }],
      defaultPath: '未命名绘图.puml'
    });
    
    if (result.canceled || !result.filePath) return { success: false };
    await fs.writeFile(result.filePath, content, 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    isOperationInProgress = false;
  }
});