<template>
  <div class="app-container">
    <!-- 标题栏 -->
    <div class="title-bar">
      <div class="title-bar-left">
        <img :src="logo" alt="Logo" class="app-logo" />
        <span class="file-name">{{ fileName }}{{ isSaved ? '' : '*' }}</span>
      </div>
      <div class="title-bar-right">
        <button @click="openFile" class="toolbar-btn" :disabled="isBusy">打开</button>
        <button @click="save" class="toolbar-btn" :disabled="isBusy">保存</button>
        <button @click="saveAs" class="toolbar-btn" :disabled="isBusy">另存为</button>
        <button @click="exportAsSvg" class="toolbar-btn" :disabled="!canExportOrCopy || isBusy">
          {{ isExporting ? '导出中...' : '导出 SVG' }}
        </button>
      </div>
    </div>

    <!-- 欢迎弹窗 -->
    <div v-if="showWelcomeModal" class="welcome-modal-overlay">
      <div class="welcome-modal">
        <div class="modal-content">
          <h3>欢迎使用 PlantUML 编辑器</h3>
          <button @click="createNewDiagram" class="modal-btn-primary">创建新绘图</button>
          <button @click="openExistingDiagram" class="modal-btn-secondary">打开现有绘图</button>
        </div>
      </div>
    </div>

    <!-- 主体内容 -->
    <div class="main-layout">
      <!-- 左侧：编辑器 -->
      <div class="editor-panel">
        <div class="editor-toolbar">
          <div class="toolbar-group">
            <span class="label">示例</span>
            <select v-model="selectedExample" @change="loadExample" class="select-control">
              <option value="">请选择</option>
              <option
                v-for="opt in exampleOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
        <div class="editor-wrapper">
          <div class="editor-header">
            <span class="editor-header-text">plantuml</span>
          </div>
          <PlantUmlEditor v-model="code" />
        </div>
      </div>

      <!-- 右侧：SVG 预览 -->
      <div class="preview-panel">
        <div class="preview-controls">
          <button @click="zoomOut" title="缩小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12H19" />
            </svg>
          </button>

          <div class="zoom-input-wrapper">
            <input
              type="number"
              :value="Math.round(zoomLevel * 100)"
              @change="handleZoomInput"
              min="10"
              max="300"
              step="10"
              class="zoom-input"
            />
            <span>%</span>
          </div>

          <button @click="zoomIn" title="放大">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <button @click="resetView" title="重置视图">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 17C17 18.1046 16.1046 19 15 19C13.8954 19 13 18.1046 13 17C13 15.8954 13.8954 15 15 15C16.1046 15 17 15.8954 17 17Z" />
              <path d="M15 5V13L9 11" />
            </svg>
          </button>
        </div>

        <div
          ref="svgWrapper"
          class="svg-wrapper"
          @mousedown="startDrag"
          @wheel.prevent="handleWheelZoom"
        >
          <div
            v-if="svg"
            class="svg-content"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoomLevel})`,
              transformOrigin: '0 0'
            }"
            v-html="svg"
          ></div>
          <div v-else class="preview-placeholder">图表预览将显示在这里</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';
import _debounce from 'lodash/debounce';
import PlantUmlEditor from './components/PlantUmlEditor.vue';
import logo from '../assets/logo.svg';
import { PLANTUML_EXAMPLES, EXAMPLE_OPTIONS } from './examples/plantumlExamples.js';

// ========== 常量 ==========
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3.0;
const INITIAL_CODE = '@startuml\n@enduml'; //统一命名

// ========== 状态 ==========
const code = ref(INITIAL_CODE); // 初始化为模板
const svg = ref('');
const loading = ref(false);
const error = ref('');

const zoomLevel = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const svgWrapper = ref(null);

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

const showWelcomeModal = ref(true);
const hasShownWelcome = ref(false);

const fileName = ref('未命名绘图.puml');
const currentFilePath = ref(null);

const selectedExample = ref('');
const exampleOptions = EXAMPLE_OPTIONS;

// 👇 核心：保存快照
const savedContent = ref(INITIAL_CODE);

// 👇 新增状态
const isExporting = ref(false);
const isCopying = ref(false);
const isBusy = computed(() => isExporting.value || isCopying.value);

// ✅ 正确的 isSaved：基于快照比较
const isContentModified = computed(() => code.value !== savedContent.value);
const isSaved = computed(() => !isContentModified.value);

// =================== 渲染逻辑 ===================
const render = async () => {
  error.value = '';
  loading.value = true;
  try {
    const trimmed = code.value.trim();
    if (!trimmed.includes('@startuml') || !trimmed.includes('@enduml')) {
      error.value = 'PlantUML 代码必须包含 @startuml 和 @enduml';
      return;
    }
    const result = await window.api.plantuml.render(code.value);
    svg.value = result;
  } catch (err) {
    console.error('渲染错误:', err);
    error.value = '渲染失败: ' + (err.message || String(err));
  } finally {
    loading.value = false;
  }
};

const debouncedRender = _debounce(render, 500);
watch(code, debouncedRender, { immediate: true });

// 自动适配容器大小
const fitToContainer = () => {
  if (!svg.value || !svgWrapper.value) return;

  const container = svgWrapper.value;
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  const svgWidth = parseFloat(svgEl.getAttribute('width')) || 0;
  const svgHeight = parseFloat(svgEl.getAttribute('height')) || 0;

  if (svgWidth <= 0 || svgHeight <= 0) return;

  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  const scaleX = containerWidth / svgWidth;
  const scaleY = containerHeight / svgHeight;
  let scale = Math.min(scaleX, scaleY);
  scale = Math.min(scale, MAX_ZOOM);

  const contentWidth = svgWidth * scale;
  const contentHeight = svgHeight * scale;
  const offsetXCentered = (containerWidth - contentWidth) / 2;
  const offsetYCentered = (containerHeight - contentHeight) / 2;

  zoomLevel.value = scale;
  offsetX.value = offsetXCentered;
  offsetY.value = offsetYCentered;
};

watch(svg, () => {
  nextTick(() => {
    fitToContainer();
  });
});

onMounted(() => {
  const handleResize = _debounce(() => {
    if (svg.value) fitToContainer();
  }, 200);

  window.addEventListener('resize', handleResize);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
  });
});

// =================== 缩放与拖拽逻辑 ===================
function applyZoom(factor, clientX, clientY) {
  const newZoom = Math.min(Math.max(zoomLevel.value * factor, MIN_ZOOM), MAX_ZOOM);
  if (Math.abs(newZoom - zoomLevel.value) < 0.001) return;

  if (clientX !== undefined && clientY !== undefined && svgWrapper.value) {
    const rect = svgWrapper.value.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const beforeX = (mouseX - offsetX.value) / zoomLevel.value;
    const beforeY = (mouseY - offsetY.value) / zoomLevel.value;

    const afterX = beforeX * newZoom;
    const afterY = beforeY * newZoom;

    offsetX.value = mouseX - afterX;
    offsetY.value = mouseY - afterY;
  }

  zoomLevel.value = newZoom;
}

function zoomIn() { applyZoom(1.2); }
function zoomOut() { applyZoom(1 / 1.2); }
function handleWheelZoom(e) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  applyZoom(delta, e.clientX, e.clientY);
}

function startDrag(e) {
  if (e.button !== 0) return;
  isDragging = true;
  dragStartX = e.clientX - offsetX.value;
  dragStartY = e.clientY - offsetY.value;
  if (svgWrapper.value) svgWrapper.value.style.cursor = 'grabbing';
  e.preventDefault();
}

function onDragMove(e) {
  if (!isDragging) return;
  offsetX.value = e.clientX - dragStartX;
  offsetY.value = e.clientY - dragStartY;
}

function stopDrag() {
  isDragging = false;
  if (svgWrapper.value) svgWrapper.value.style.cursor = 'grab';
}

document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', stopDrag);

function resetView() {
  if (svg.value) {
    fitToContainer();
  } else {
    zoomLevel.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
  }
}

function handleZoomInput(e) {
  let value = parseFloat(e.target.value);
  if (isNaN(value)) value = 100;
  value = Math.min(Math.max(value, 10), 300);
  const newZoom = value / 100;

  const container = svgWrapper.value;
  if (container && svg.value) {
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const beforeX = (centerX - offsetX.value) / zoomLevel.value;
    const beforeY = (centerY - offsetY.value) / zoomLevel.value;

    const afterX = beforeX * newZoom;
    const afterY = beforeY * newZoom;

    offsetX.value = centerX - afterX;
    offsetY.value = centerY - afterY;
  }

  zoomLevel.value = newZoom;
}

// =================== 文件操作 ===================
function getBaseName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

function createNewDiagram() {
  code.value = INITIAL_CODE;
  fileName.value = '未命名绘图.puml';
  currentFilePath.value = null;
  savedContent.value = INITIAL_CODE; // 👈 重置快照
  showWelcomeModal.value = false;
  hasShownWelcome.value = true;
}

async function openExistingDiagram() {
  if (!window.api) {
    alert('此功能仅在 Electron 桌面应用中可用');
    return;
  }

  try {
    const result = await window.api.file.openFile();
    if (result.canceled) return;

    code.value = result.content;
    fileName.value = getBaseName(result.filePath);
    currentFilePath.value = result.filePath;
    savedContent.value = result.content; // 👈 更新快照
    showWelcomeModal.value = false;
    hasShownWelcome.value = true;
  } catch (err) {
    console.error('打开文件失败:', err);
    alert('打开文件时出错: ' + (err.message || '未知错误'));
  }
}

async function save() {
  if (!window.api) {
    // Web 环境
    const blob = new Blob([code.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.value;
    a.click();
    URL.revokeObjectURL(url);
    savedContent.value = code.value; // 👈 Web 也更新快照
    return;
  }

  if (currentFilePath.value) {
    const result = await window.api.file.saveFile(currentFilePath.value, code.value);
    if (result.success) {
      savedContent.value = code.value; // 👈 成功后更新快照
    } else {
      alert('保存失败: ' + result.error);
    }
  } else {
    const result = await window.api.file.saveFileAs(code.value);
    if (result.success && result.filePath) {
      currentFilePath.value = result.filePath;
      fileName.value = getBaseName(result.filePath);
      savedContent.value = code.value; // 👈 更新快照
    }
  }
}

function openFile() {
  openExistingDiagram();
}

async function saveAs() {
  if (!window.api) {
    const blob = new Blob([code.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.value;
    a.click();
    URL.revokeObjectURL(url);
    savedContent.value = code.value; // 👈 Web 更新快照
    return;
  }

  const result = await window.api.file.saveFileAs(code.value);
  if (result.success && result.filePath) {
    currentFilePath.value = result.filePath;
    fileName.value = getBaseName(result.filePath);
    savedContent.value = code.value; // 👈 更新快照
  }
}

// =================== 快捷键 ===================
const handleKeyDown = (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    save();
  }
};

// =================== 导出 & 复制逻辑 ===================
const canExportOrCopy = computed(() => code.value.trim().length > 0);

async function exportAsSvg() {
  if (!canExportOrCopy.value || isExporting.value) return;
  
  isExporting.value = true;
  try {
    const result = await window.api.plantuml.exportImage({
      code: code.value,
      format: 'svg'
    });

    if (result.success) {
      // 可选：自动打开
      // await window.api.shell.openPath(result.filePath);
    } else if (!result.canceled) {
      alert('导出失败: ' + result.error);
    }
  } catch (err) {
    console.error('导出失败:', err);
    alert('导出失败: ' + (err.message || '未知错误'));
  } finally {
    isExporting.value = false;
  }
}

// =================== 生命周期 ===================
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

// =================== 示例加载 ===================
const loadExample = () => {
  const key = selectedExample.value;
  if (key && PLANTUML_EXAMPLES[key]) {
    code.value = PLANTUML_EXAMPLES[key].code;
    currentFilePath.value = null;
    savedContent.value = PLANTUML_EXAMPLES[key].code; // 👈 示例加载视为已保存
  }
};

// =================== 关闭应用逻辑 ===================
async function closeApp() {
  if (!isContentModified.value) {
    // 无修改，直接退出
    if (window.api?.app) {
      window.api.app.quit();
    } else {
      alert('Web 版无法关闭窗口，请手动关闭标签页');
    }
    return;
  }

  // 有未保存的修改
  if (!window.api?.dialog) {
    const confirmed = confirm('当前有未保存的更改，确定要退出吗？');
    if (confirmed) {
      window.close();
    }
    return;
  }

  const { response } = await window.api.dialog.showMessageBox({
    type: 'warning',
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    message: '当前有未保存的更改，是否保存？'
  });

  if (response === 0) {
    // 保存
    await save();
    // 保存后无论内容如何，都允许退出
    if (window.api?.app) window.api.app.quit();
  } else if (response === 1) {
    // 不保存
    if (window.api?.app) window.api.app.quit();
  }
  // response === 2: 取消，不退出
}
</script>