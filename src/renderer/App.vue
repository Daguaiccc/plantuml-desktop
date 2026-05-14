<template>
  <div
    class="app-container"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @mousedown="onClickOutside"
  >
    <!-- Drag overlay -->
    <div v-if="isDragging" class="drag-overlay">释放文件以打开</div>

    <!-- Title bar -->
    <div class="title-bar">
      <div class="title-bar-left">
        <img :src="logo" alt="Logo" class="app-logo" />
        <span class="file-name">{{ displayFileName }}{{ isModified ? ' *' : '' }}</span>
      </div>
      <div class="title-bar-right">
        <button @click="showCheatsheet = true" class="toolbar-btn icon-btn" title="语法速查">?</button>
        <button @click="openFile" class="toolbar-btn" :disabled="isBusy">打开</button>
        <button @click="save" class="toolbar-btn" :disabled="isBusy">保存</button>
        <button @click="saveAs" class="toolbar-btn" :disabled="isBusy">另存为</button>
        <div class="export-dropdown-wrapper">
          <button @click.stop="toggleExportMenu" class="toolbar-btn" :disabled="!canExport || isBusy">导出 ▾</button>
          <div v-if="showExportMenu" class="export-dropdown">
            <button @click.stop="doExport('svg')">导出 SVG</button>
            <button @click.stop="doExport('png')">导出 PNG</button>
            <button @click.stop="doExport('pdf')">导出 PDF</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab bar -->
    <div v-if="tabs.length >= 1" class="tab-bar">
      <div class="tab-bar-inner">
        <div
          v-for="(tab, idx) in tabs" :key="tab.id"
          class="tab-item"
          :class="{ active: tab.id === activeTabId, 'drag-over': dragOverIndex === idx && dragTabIndex !== idx, dragging: dragTabIndex === idx }"
          draggable="true"
          @click="switchTab(tab.id, $event)"
          @dragstart="onTabDragStart($event, idx)"
          @dragover.prevent="onTabDragOver($event, idx)"
          @dragenter.prevent
          @dragleave="onTabDragLeave($event)"
          @drop="onTabDrop($event, idx)"
          @contextmenu.prevent="onTabContextMenu($event, tab.id)"
        >
          <span class="tab-label">{{ tab.fileName }}{{ tab.code !== tab.savedContent ? ' *' : '' }}</span>
          <button class="tab-close-btn" @click.stop="requestCloseTab(tab.id)" title="关闭">&times;</button>
        </div>
      </div>
      <button class="tab-new-btn" @click="createNewDiagram" title="新建标签页">+</button>
    </div>

    <!-- Tab context menu -->
    <div v-if="tabMenu.show" class="context-menu" :style="{ left: tabMenu.x + 'px', top: tabMenu.y + 'px' }" @mousedown.stop>
      <button @click="contextCloseTab">关闭</button>
      <button @click="contextCloseOthers">关闭其他</button>
      <button @click="contextCloseAll">关闭所有</button>
      <button v-if="tabMenu.filePath" @click="contextCopyPath">复制路径</button>
    </div>

    <!-- Welcome modal -->
    <div v-if="showWelcome" class="welcome-modal-overlay">
      <div class="welcome-modal">
        <h3>欢迎使用 PlantUML 编辑器</h3>
        <button @click="createNewDiagram" class="modal-btn-primary">创建新绘图</button>
        <button @click="openExistingDiagram" class="modal-btn-secondary">打开现有绘图</button>
        <div v-if="recentFiles.length > 0" class="recent-files-section">
          <div class="recent-files-title">最近打开的文件</div>
          <div v-for="rf in recentFiles" :key="rf.path" class="recent-file-item" @click="openRecentFile(rf.path)">
            <span class="recent-file-name">{{ rf.name }}</span>
            <span class="recent-file-path">{{ rf.path }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Unsaved changes dialog -->
    <div v-if="showUnsavedDialog" class="welcome-modal-overlay">
      <div class="welcome-modal">
        <h3>{{ unsavedDialogTitle }}</h3>
        <p class="unsaved-message">{{ unsavedDialogMessage }}</p>
        <button @click="unsavedSave" class="modal-btn-primary">保存</button>
        <button @click="unsavedDiscard" class="modal-btn-secondary">不保存</button>
        <button @click="unsavedCancel" class="modal-btn-secondary">取消</button>
      </div>
    </div>

    <!-- Syntax cheatsheet -->
    <SyntaxCheatsheet :show="showCheatsheet" @close="showCheatsheet = false" />

    <!-- Main layout -->
    <div v-if="tabs.length > 0" class="main-layout" ref="mainLayout">
      <!-- Left: Editor -->
      <div class="editor-panel" :style="{ width: `calc(${splitRatio * 100}% - 8px)` }">
        <div class="editor-toolbar">
          <div class="toolbar-group">
            <span class="label">示例</span>
            <select v-model="selectedExample" @change="loadExample" class="select-control">
              <option value="">请选择</option>
              <option v-for="opt in exampleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="toolbar-group">
            <span class="label">主题</span>
            <select v-model="selectedTheme" @change="applyTheme" class="select-control">
              <option v-for="t in themeOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
        </div>
        <div class="editor-wrapper">
          <div class="editor-header"><span class="editor-header-text">plantuml</span></div>
          <PlantUmlEditor
            ref="editorRef"
            v-model="editorCode"
            @cursorChange="onCursorChange"
          />
        </div>
      </div>

      <!-- Splitter -->
      <div class="splitter" :class="{ active: isSplitting }" @mousedown="startSplit"></div>

      <!-- Right: Preview -->
      <div class="preview-panel" :style="{ width: `calc(${(1 - splitRatio) * 100}% - 8px)` }">
        <div class="preview-controls">
          <button @click="zoomOut" title="缩小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12H19" /></svg>
          </button>
          <div class="zoom-input-wrapper">
            <input type="number" :value="Math.round(zoomLevel * 100)" @change="handleZoomInput"
              min="10" max="300" step="10" class="zoom-input" />
            <span>%</span>
          </div>
          <button @click="zoomIn" title="放大">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button @click="resetView" title="适应窗口">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>

        <div ref="svgWrapper" class="svg-wrapper"
          @mousedown="startDrag"
          @wheel.prevent="handleWheelZoom"
        >
          <div v-if="svg" class="svg-content"
            :style="{ transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoomLevel})`, transformOrigin: '0 0' }"
            v-html="svg"
          ></div>
          <div v-else class="preview-placeholder">图表预览将显示在这里</div>
        </div>

        <div v-if="error" class="error-msg">{{ error }}</div>

        <div class="status-bar">
          <span v-if="svgSize">{{ svgSize.width }} &times; {{ svgSize.height }} px</span>
          <span v-else></span>
          <span v-if="renderTime !== null">{{ renderTime }}ms</span>
          <span v-else></span>
          <span>行 {{ cursorLine }}, 列 {{ cursorColumn }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';
import _debounce from 'lodash/debounce';
import PlantUmlEditor from './components/PlantUmlEditor.vue';
import SyntaxCheatsheet from './components/SyntaxCheatsheet.vue';
import logo from '../assets/logo-app.png';
import { PLANTUML_EXAMPLES, EXAMPLE_OPTIONS } from './examples/plantumlExamples.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3.0;
const INITIAL_CODE = '@startuml\n@enduml';

const PLANTUML_THEMES = [
  { value: '', label: '无主题' },
  { value: 'blueprint', label: 'Blueprint' },
  { value: 'cerulean', label: 'Cerulean' },
  { value: 'crt-amber', label: 'CRT Amber' },
  { value: 'crt-green', label: 'CRT Green' },
  { value: 'hacker', label: 'Hacker' },
  { value: 'materia', label: 'Materia' },
  { value: 'mimeograph', label: 'Mimeograph' },
  { value: 'plain', label: 'Plain' },
  { value: 'sketchy-outline', label: 'Sketchy' },
  { value: 'spacelab', label: 'Spacelab' },
  { value: 'united', label: 'United' }
];

// ========== Tab System ==========
let nextTabId = 1;
const tabs = ref([]);
const activeTabId = ref(null);

function createTab(code, fileName, filePath) {
  const id = String(nextTabId++);
  const tab = { id, fileName: fileName || '未命名绘图.puml', filePath: filePath || null, code: code || INITIAL_CODE, savedContent: code || INITIAL_CODE };
  tabs.value.push(tab);
  activeTabId.value = id;
  return tab;
}

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value));
const isModified = computed(() => { const t = activeTab.value; return t ? t.code !== t.savedContent : false; });
const displayFileName = computed(() => activeTab.value ? activeTab.value.fileName : '');

// Two-way binding with editor
const editorCode = computed({
  get: () => activeTab.value ? activeTab.value.code : '',
  set: (val) => { if (activeTab.value) activeTab.value.code = val; }
});

const selectedExample = ref('');
const exampleOptions = EXAMPLE_OPTIONS;
const selectedTheme = ref('');
const themeOptions = PLANTUML_THEMES;

// Welcome modal — suppressed when a file is pending via IPC
const suppressWelcome = ref(false);
const showWelcome = computed(() => !suppressWelcome.value && tabs.value.length === 0);

// Recent files
const recentFiles = ref([]);

// Syntax cheatsheet
const showCheatsheet = ref(false);

// Export dropdown
const showExportMenu = ref(false);
function toggleExportMenu() { showExportMenu.value = !showExportMenu.value; }
function onClickOutside(e) {
  if (!e.target.closest('.export-dropdown-wrapper')) showExportMenu.value = false;
  if (!e.target.closest('.context-menu')) closeContextMenu();
}

// Unsaved dialog
const showUnsavedDialog = ref(false);
const unsavedDialogMode = ref('tab'); // 'tab' | 'app'
const pendingCloseTabId = ref(null);
const sequentialCloseMode = ref(false);
const sequentialCloseQueue = ref([]);
const sequentialCloseTab = computed(() => {
  if (!sequentialCloseMode.value || sequentialCloseQueue.value.length === 0) return null;
  return tabs.value.find(t => t.id === sequentialCloseQueue.value[0]);
});
const unsavedDialogTitle = computed(() => '未保存的更改');
const unsavedDialogMessage = computed(() => {
  if (sequentialCloseMode.value) {
    const tab = sequentialCloseTab.value;
    return tab ? `是否保存对 "${tab.fileName}" 的更改？` : '';
  }
  const tab = tabs.value.find(t => t.id === pendingCloseTabId.value);
  return tab ? `是否保存对 "${tab.fileName}" 的更改？` : '';
});

// ========== SVG / Zoom / Pan State ==========
const svg = ref('');
const error = ref('');
const editorRef = ref(null);
const zoomLevel = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const svgWrapper = ref(null);

let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// Splitter
const splitRatio = ref(0.5);
const isSplitting = ref(false);
const mainLayout = ref(null);
let splitStartX = 0;
let splitStartRatio = 0.5;

// Drag & drop
const isDragging = ref(false);

// Cursor
const cursorLine = ref(1);
const cursorColumn = ref(1);

// Status bar
const svgSize = ref(null);
const renderTime = ref(null);

// Export busy
const isExporting = ref(false);
const isExportingPng = ref(false);
const isExportingPdf = ref(false);
const isBusy = computed(() => isExporting.value || isExportingPng.value || isExportingPdf.value);
const canExport = computed(() => (activeTab.value?.code || '').trim().length > 0);

// ========== Render ==========
const render = async () => {
  error.value = '';
  const startTime = performance.now();
  try {
    const code = activeTab.value?.code || '';
    const trimmed = code.trim();
    if (!trimmed.includes('@startuml') || !trimmed.includes('@enduml')) {
      error.value = 'PlantUML 代码必须包含 @startuml 和 @enduml';
      renderTime.value = null;
      return;
    }
    const result = await window.api.plantuml.render(code);
    svg.value = result.svg;
    renderTime.value = Math.round(performance.now() - startTime);
    if (result.errorLine) {
      error.value = result.errorMessage || '语法错误';
      editorRef.value?.highlightErrorLine(result.errorLine);
    } else {
      error.value = '';
      editorRef.value?.clearErrorHighlights();
    }
  } catch (err) {
    error.value = '渲染失败: ' + (err.message || String(err));
    renderTime.value = null;
  }
};

const debouncedRender = _debounce(render, 500);
watch(editorCode, debouncedRender, { immediate: true });

const debouncedSyncTheme = _debounce(syncThemeFromCode, 300);
watch(editorCode, debouncedSyncTheme);

watch(svg, () => {
  nextTick(() => {
    fitToContainer();
    if (svgWrapper.value) {
      const svgEl = svgWrapper.value.querySelector('svg');
      if (svgEl) {
        const w = parseFloat(svgEl.getAttribute('width')) || 0;
        const h = parseFloat(svgEl.getAttribute('height')) || 0;
        svgSize.value = w > 0 ? { width: Math.round(w), height: Math.round(h) } : null;
      } else { svgSize.value = null; }
    }
  });
});

const fitToContainer = () => {
  if (!svg.value || !svgWrapper.value) return;
  const container = svgWrapper.value;
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;
  const sw = parseFloat(svgEl.getAttribute('width')) || 0;
  const sh = parseFloat(svgEl.getAttribute('height')) || 0;
  if (sw <= 0 || sh <= 0) return;
  const cr = container.getBoundingClientRect();
  const scale = Math.min(cr.width / sw, cr.height / sh, MAX_ZOOM);
  zoomLevel.value = scale;
  offsetX.value = (cr.width - sw * scale) / 2;
  offsetY.value = (cr.height - sh * scale) / 2;
};

onMounted(() => {
  const hr = _debounce(() => { if (svg.value) fitToContainer(); }, 200);
  window.addEventListener('resize', hr);
  onUnmounted(() => { window.removeEventListener('resize', hr); });
});

// ========== Zoom & Pan ==========
function applyZoom(factor, cx, cy) {
  const nz = Math.min(Math.max(zoomLevel.value * factor, MIN_ZOOM), MAX_ZOOM);
  if (Math.abs(nz - zoomLevel.value) < 0.001) return;
  if (cx !== undefined && cy !== undefined && svgWrapper.value) {
    const r = svgWrapper.value.getBoundingClientRect();
    const mx = cx - r.left, my = cy - r.top;
    const bx = (mx - offsetX.value) / zoomLevel.value, by = (my - offsetY.value) / zoomLevel.value;
    offsetX.value = mx - bx * nz;
    offsetY.value = my - by * nz;
  }
  zoomLevel.value = nz;
}
function zoomIn() { applyZoom(1.2); }
function zoomOut() { applyZoom(1 / 1.2); }
function handleWheelZoom(e) { applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY); }
function startDrag(e) {
  if (e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX - offsetX.value;
  panStartY = e.clientY - offsetY.value;
  if (svgWrapper.value) svgWrapper.value.style.cursor = 'grabbing';
  e.preventDefault();
}
function onDragMove(e) {
  if (!isPanning) return;
  offsetX.value = e.clientX - panStartX;
  offsetY.value = e.clientY - panStartY;
}
function stopDrag() { isPanning = false; if (svgWrapper.value) svgWrapper.value.style.cursor = 'grab'; }
document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', stopDrag);
function resetView() {
  if (svg.value) fitToContainer();
  else { zoomLevel.value = 1; offsetX.value = 0; offsetY.value = 0; }
}
function handleZoomInput(e) {
  let v = parseFloat(e.target.value);
  if (isNaN(v)) v = 100;
  v = Math.min(Math.max(v, 10), 300);
  const nz = v / 100;
  const c = svgWrapper.value;
  if (c && svg.value) {
    const r = c.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const bx = (cx - offsetX.value) / zoomLevel.value, by = (cy - offsetY.value) / zoomLevel.value;
    offsetX.value = cx - bx * nz;
    offsetY.value = cy - by * nz;
  }
  zoomLevel.value = nz;
}

// ========== Splitter ==========
function startSplit(e) {
  isSplitting.value = true;
  splitStartX = e.clientX;
  splitStartRatio = splitRatio.value;
  e.preventDefault();
}
function onSplitMove(e) {
  if (!isSplitting.value || !mainLayout.value) return;
  const r = mainLayout.value.getBoundingClientRect();
  const d = (e.clientX - splitStartX) / r.width;
  splitRatio.value = Math.min(Math.max(0.2, splitStartRatio + d), 0.8);
}
function stopSplit() { isSplitting.value = false; }
document.addEventListener('mousemove', onSplitMove);
document.addEventListener('mouseup', stopSplit);

// ========== Drag & Drop File ==========
function onDragOver() { isDragging.value = true; }
function onDragLeave() { isDragging.value = false; }
async function onDrop(e) {
  isDragging.value = false;
  const files = e.dataTransfer.files;
  if (files.length === 0) return;
  const file = files[0];
  if (!file.name.endsWith('.puml') && !file.name.endsWith('.txt')) return;
  try {
    const content = await file.text();
    createTab(content, file.name, file.path || null);
    if (file.path && window.api) {
      window.api.file.recentFiles.add(file.path).then(f => { recentFiles.value = f; });
    }
  } catch (err) { console.error('Drop error:', err); }
}

// ========== Tab Context Menu ==========
const tabMenu = ref({ show: false, x: 0, y: 0, tabId: null, filePath: null });
const batchCloseQueue = ref([]);

function onTabContextMenu(e, tabId) {
  const tab = tabs.value.find(t => t.id === tabId);
  tabMenu.value = { show: true, x: e.clientX, y: e.clientY, tabId, filePath: tab?.filePath || null };
}

function closeContextMenu() { tabMenu.value.show = false; }

function contextCloseTab() { closeContextMenu(); requestCloseTab(tabMenu.value.tabId); }

function contextCloseOthers() {
  closeContextMenu();
  const currentId = tabMenu.value.tabId;
  const others = tabs.value.filter(t => t.id !== currentId).reverse();
  startBatchClose(others.map(t => t.id));
}

function contextCloseAll() {
  closeContextMenu();
  startBatchClose([...tabs.value].reverse().map(t => t.id));
}

function contextCopyPath() {
  closeContextMenu();
  if (tabMenu.value.filePath) navigator.clipboard.writeText(tabMenu.value.filePath);
}

function startBatchClose(ids) {
  batchCloseQueue.value = ids;
  advanceBatchClose();
}

function advanceBatchClose() {
  while (batchCloseQueue.value.length > 0) {
    const tid = batchCloseQueue.value[0];
    const tab = tabs.value.find(t => t.id === tid);
    if (!tab) { batchCloseQueue.value.shift(); continue; }
    if (tab.code !== tab.savedContent) {
      pendingCloseTabId.value = tid;
      showUnsavedDialog.value = true;
      return; // Wait for user response
    }
    doCloseTab(tid);
    batchCloseQueue.value.shift();
  }
}

// ========== Tab Drag & Drop ==========
const dragTabIndex = ref(-1);
const dragOverIndex = ref(-1);

function onTabDragStart(e, idx) {
  dragTabIndex.value = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
}

function onTabDragOver(e, idx) {
  dragOverIndex.value = idx;
}

function onTabDragLeave() {
  dragOverIndex.value = -1;
}

function onTabDrop(e, idx) {
  const from = dragTabIndex.value;
  dragTabIndex.value = -1;
  dragOverIndex.value = -1;
  if (from < 0 || from === idx) return;
  const moved = tabs.value.splice(from, 1)[0];
  const to = from < idx ? idx - 1 : idx;
  tabs.value.splice(to, 0, moved);
}

// ========== Tab Operations ==========
function findTabByPath(filePath) {
  if (!filePath) return null;
  return tabs.value.find(t => t.filePath === filePath) || null;
}

function switchTab(tabId, event) {
  if (event?.shiftKey) {
    requestCloseTab(tabId);
    return;
  }
  if (tabId === activeTabId.value) return;
  svg.value = '';
  error.value = '';
  activeTabId.value = tabId;
}

function requestCloseTab(tabId) {
  const tab = tabs.value.find(t => t.id === tabId);
  if (!tab) return;
  if (tab.code !== tab.savedContent) {
    pendingCloseTabId.value = tabId;
    unsavedDialogMode.value = 'tab';
    showUnsavedDialog.value = true;
  } else {
    doCloseTab(tabId);
  }
}

function doCloseTab(tabId) {
  const idx = tabs.value.findIndex(t => t.id === tabId);
  if (idx < 0) return;
  tabs.value.splice(idx, 1);
  if (tabs.value.length === 0) {
    activeTabId.value = null;
    svg.value = '';
    error.value = '';
  } else if (activeTabId.value === tabId) {
    activeTabId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id;
  }
}

// ========== File Operations ==========
function getBaseName(p) { return p.split(/[\\/]/).pop(); }

function createNewDiagram() {
  createTab(INITIAL_CODE, '未命名绘图.puml', null);
}

async function openExistingDiagram() {
  if (!window.api) { alert('此功能仅在 Electron 桌面应用中可用'); return; }
  try {
    const result = await window.api.file.openFile();
    if (result.canceled) return;
    const existing = findTabByPath(result.filePath);
    if (existing) { switchTab(existing.id); return; }
    // Replace empty single tab or create new
    if (tabs.value.length === 1 && !activeTab.value.filePath && activeTab.value.code === INITIAL_CODE && activeTab.value.savedContent === INITIAL_CODE) {
      const tab = activeTab.value;
      tab.code = result.content;
      tab.savedContent = result.content;
      tab.fileName = getBaseName(result.filePath);
      tab.filePath = result.filePath;
    } else {
      createTab(result.content, getBaseName(result.filePath), result.filePath);
    }
    recentFiles.value = await window.api.file.recentFiles.load();
  } catch (err) { alert('打开文件时出错: ' + (err.message || '未知错误')); }
}

async function openRecentFile(filePath) {
  if (!window.api) return;
  const existing = findTabByPath(filePath);
  if (existing) { switchTab(existing.id); return; }
  try {
    const result = await window.api.file.readFile(filePath);
    if (result.success) {
      createTab(result.content, getBaseName(filePath), filePath);
      recentFiles.value = await window.api.file.recentFiles.add(filePath);
    }
  } catch (err) { alert('无法打开文件: ' + (err.message || '未知错误')); }
}

async function saveTab(tab) {
  if (!window.api) {
    const blob = new Blob([tab.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = tab.fileName; a.click();
    URL.revokeObjectURL(url);
    tab.savedContent = tab.code;
    return true;
  }
  if (tab.filePath) {
    const result = await window.api.file.saveFile(tab.filePath, tab.code);
    if (result.success) {
      tab.savedContent = tab.code;
      window.api.file.recentFiles.add(tab.filePath);
      return true;
    } else { alert('保存失败: ' + result.error); return false; }
  } else {
    const result = await window.api.file.saveFileAs(tab.code);
    if (result.success && result.filePath) {
      tab.filePath = result.filePath;
      tab.fileName = getBaseName(result.filePath);
      tab.savedContent = tab.code;
      window.api.file.recentFiles.add(result.filePath);
      return true;
    }
    return false;
  }
}

async function save() {
  if (!activeTab.value) return;
  await saveTab(activeTab.value);
}

function openFile() { openExistingDiagram(); }

async function saveAs() {
  if (!activeTab.value || !window.api) return;
  const tab = activeTab.value;
  const result = await window.api.file.saveFileAs(tab.code);
  if (result.success && result.filePath) {
    tab.filePath = result.filePath;
    tab.fileName = getBaseName(result.filePath);
    tab.savedContent = tab.code;
    window.api.file.recentFiles.add(result.filePath);
  }
}

// ========== Open path from OS ==========
function handleOpenPath(filePath, content) {
  suppressWelcome.value = false;
  const existing = findTabByPath(filePath);
  if (existing) { switchTab(existing.id); return; }
  // Replace the empty initial tab if it's untouched
  if (tabs.value.length === 1 && !activeTab.value.filePath && activeTab.value.code === INITIAL_CODE && activeTab.value.savedContent === INITIAL_CODE) {
    const tab = activeTab.value;
    tab.code = content;
    tab.savedContent = content;
    tab.fileName = getBaseName(filePath);
    tab.filePath = filePath;
  } else {
    createTab(content, getBaseName(filePath), filePath);
  }
  if (window.api) {
    window.api.file.recentFiles.add(filePath).then(f => { recentFiles.value = f; });
  }
}

// ========== Export ==========
async function doExport(format) {
  showExportMenu.value = false;
  if (!canExport.value) return;
  if (format === 'svg' && !isExporting.value) {
    isExporting.value = true;
    try {
      const r = await window.api.plantuml.exportSvg({ code: activeTab.value.code });
      if (!r.success && !r.canceled) alert('导出失败: ' + r.error);
    } catch (err) { alert('导出失败: ' + (err.message || '未知错误')); }
    finally { isExporting.value = false; }
  } else if (format === 'png' && !isExportingPng.value) {
    isExportingPng.value = true;
    try {
      const r = await window.api.plantuml.exportPng({ code: activeTab.value.code });
      if (!r.success && !r.canceled) alert('导出失败: ' + r.error);
    } catch (err) { alert('PNG 导出失败: ' + (err.message || '未知错误')); }
    finally { isExportingPng.value = false; }
  } else if (format === 'pdf' && !isExportingPdf.value) {
    isExportingPdf.value = true;
    try {
      const r = await window.api.plantuml.exportPdf({ code: activeTab.value.code });
      if (!r.success && !r.canceled) alert('导出失败: ' + r.error);
    } catch (err) { alert('PDF 导出失败: ' + (err.message || '未知错误')); }
    finally { isExportingPdf.value = false; }
  }
}

// ========== Cursor ==========
function onCursorChange({ line, column }) { cursorLine.value = line; cursorColumn.value = column; }

// ========== Keyboard ==========
const handleKeyDown = (e) => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); }
};

// ========== Unsaved Dialog Actions ==========
function advanceSequentialClose() {
  if (sequentialCloseQueue.value.length === 0) {
    sequentialCloseMode.value = false;
    window.api?.unsavedDialogResponse('discard');
    return;
  }
  const nextId = sequentialCloseQueue.value[0];
  const nextTab = tabs.value.find(t => t.id === nextId);
  if (!nextTab) {
    sequentialCloseQueue.value.shift();
    advanceSequentialClose();
    return;
  }
  switchTab(nextId);
  if (nextTab.code !== nextTab.savedContent) {
    showUnsavedDialog.value = true;
  } else {
    doCloseTab(nextId);
    sequentialCloseQueue.value.shift();
    advanceSequentialClose();
  }
}

async function unsavedSave() {
  showUnsavedDialog.value = false;
  if (sequentialCloseMode.value) {
    const tab = sequentialCloseTab.value;
    if (tab) {
      await saveTab(tab);
      doCloseTab(tab.id);
      sequentialCloseQueue.value.shift();
      advanceSequentialClose();
    }
  } else if (batchCloseQueue.value.length > 0) {
    const tid = batchCloseQueue.value.shift();
    const tab = tabs.value.find(t => t.id === tid);
    if (tab) { await saveTab(tab); doCloseTab(tid); }
    pendingCloseTabId.value = null;
    advanceBatchClose();
  } else {
    const tab = tabs.value.find(t => t.id === pendingCloseTabId.value);
    if (tab) {
      const ok = await saveTab(tab);
      if (ok) doCloseTab(pendingCloseTabId.value);
    }
    pendingCloseTabId.value = null;
  }
}

function unsavedDiscard() {
  showUnsavedDialog.value = false;
  if (sequentialCloseMode.value) {
    const tab = sequentialCloseTab.value;
    if (tab) {
      doCloseTab(tab.id);
      sequentialCloseQueue.value.shift();
    }
    advanceSequentialClose();
  } else if (batchCloseQueue.value.length > 0) {
    const tid = batchCloseQueue.value.shift();
    doCloseTab(tid);
    pendingCloseTabId.value = null;
    advanceBatchClose();
  } else {
    doCloseTab(pendingCloseTabId.value);
    pendingCloseTabId.value = null;
  }
}

function unsavedCancel() {
  showUnsavedDialog.value = false;
  if (sequentialCloseMode.value) {
    sequentialCloseMode.value = false;
    sequentialCloseQueue.value = [];
    window.api?.unsavedDialogResponse('cancel');
  }
  batchCloseQueue.value = [];
  pendingCloseTabId.value = null;
}

// ========== Lifecycle ==========
let beforeUnloadHandler = null;

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);

  // Check for pending file (query param set by main process)
  const urlParams = new URLSearchParams(window.location.search);
  const hasPending = urlParams.get('pending') === '1';
  if (hasPending) {
    suppressWelcome.value = true;
    setTimeout(() => { suppressWelcome.value = false; }, 500);
  }

  if (window.api) {
    try { recentFiles.value = await window.api.file.recentFiles.load(); } catch {}
  }

  // Menu events
  if (window.api?.onMenuEvent) {
    window.api.onMenuEvent((action, ...args) => {
      switch (action) {
        case 'openFile': openFile(); break;
        case 'save': save(); break;
        case 'saveAs': saveAs(); break;
        case 'exportSvg': doExport('svg'); break;
        case 'exportPng': doExport('png'); break;
        case 'exportPdf': doExport('pdf'); break;
        case 'zoomIn': zoomIn(); break;
        case 'zoomOut': zoomOut(); break;
        case 'resetView': resetView(); break;
        case 'closeTab': if (activeTab.value) requestCloseTab(activeTab.value.id); break;
        case 'openPath': handleOpenPath(args[0], args[1]); break;
      }
    });
  }

  // Unsaved changes dialog from main process (app close)
  if (window.api?.onUnsavedDialog) {
    window.api.onUnsavedDialog(() => {
      if (tabs.value.length === 0) {
        window.api.unsavedDialogResponse('discard');
        return;
      }
      sequentialCloseQueue.value = [...tabs.value].reverse().map(t => t.id);
      sequentialCloseMode.value = true;
      advanceSequentialClose();
    });
  }

  window.__hasUnsavedChanges__ = () => tabs.value.some(t => t.code !== t.savedContent);
  window.__saveAllAndQuit__ = async () => {
    const modified = tabs.value.filter(t => t.code !== t.savedContent);
    for (const tab of modified) {
      await saveTab(tab);
    }
    if (window.api?.app) window.api.app.quit();
    return true;
  };

  beforeUnloadHandler = (e) => {
    if (tabs.value.some(t => t.code !== t.savedContent)) {
      e.preventDefault(); e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
  delete window.__hasUnsavedChanges__;
  delete window.__saveAllAndQuit__;
});

// ========== Examples & Theme ==========
const loadExample = () => {
  const key = selectedExample.value;
  if (key && PLANTUML_EXAMPLES[key]) {
    if (activeTab.value) {
      activeTab.value.code = PLANTUML_EXAMPLES[key].code;
      activeTab.value.savedContent = activeTab.value.code;
      activeTab.value.filePath = null;
    }
    syncThemeFromCode();
  }
};

const THEME_REGEX = /^!theme\s+(\S+)\s*$/m;

function syncThemeFromCode() {
  const code = activeTab.value?.code || '';
  const match = code.match(THEME_REGEX);
  selectedTheme.value = (match && PLANTUML_THEMES.some(t => t.value === match[1])) ? match[1] : '';
}

function applyTheme() {
  if (!activeTab.value) return;
  const theme = selectedTheme.value;
  const lines = activeTab.value.code.split('\n');
  const idx = lines.findIndex(l => /^!theme\s/.test(l));
  if (!theme) {
    if (idx >= 0) { lines.splice(idx, 1); activeTab.value.code = lines.join('\n'); }
    return;
  }
  const line = `!theme ${theme}`;
  if (idx >= 0) lines[idx] = line;
  else {
    const start = lines.findIndex(l => /^@startuml/.test(l));
    if (start >= 0) lines.splice(start + 1, 0, line);
    else lines.unshift(line);
  }
  activeTab.value.code = lines.join('\n');
}
</script>
