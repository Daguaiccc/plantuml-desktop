<template>
  <div ref="container" class="monaco-editor-container"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.main.js';

const props = defineProps({
  modelValue: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'cursorChange']);

const container = ref(null);
let editor = null;
let decorations = [];

// ===== PlantUML 编辑增强 =====
const PLANTUML_KEYWORDS = [
  '@startuml', '@enduml', '@startmindmap', '@endmindmap',
  'participant', 'actor', 'usecase', 'class', 'interface', 'abstract', 'enum',
  'entity', 'package', 'rectangle', 'component', 'artifact', 'folder', 'frame',
  'node', 'cloud', 'storage', 'database', 'agent', 'boundary', 'control',
  'state', 'note', 'title', 'legend', 'skinparam', 'activate', 'deactivate',
  'alt', 'else', 'end', 'loop', 'opt', 'par', 'group', 'break', 'critical',
  'detach', 'destroy', 'return', 'stop', 'repeat', 'while', 'fork', 'join',
  'if', 'then', 'endif', 'autonumber', 'header', 'footer', 'caption',
  'left', 'right', 'center', 'up', 'down', 'hide', 'show', 'namespace',
  'allow_mixing', 'scale', 'zoom', 'sprite', 'stereotype', 'methods', 'fields',
  'properties', 'static', 'external', 'collections', 'map'
];

// 与 App.vue PLANTUML_THEMES 对应（不含空值"无主题"）
const PLANTUML_THEMES = [
  'blueprint', 'cerulean', 'crt-amber', 'crt-green', 'hacker', 'materia',
  'mimeograph', 'plain', 'sketchy-outline', 'spacelab', 'united'
];

onMounted(async () => {
  await nextTick();

  if (!container.value) {
    console.error('[Monaco] Failed to get container DOM element');
    return;
  }

  monaco.languages.register({ id: 'plantuml' });
  monaco.languages.setMonarchTokensProvider('plantuml', {
    tokenizer: {
      root: [
        [/(?:[@]start(uml|mindmap|wbs))|(?:[@]end(uml|mindmap|wbs))/, 'keyword'],
        [/!theme\s+\S+/, 'keyword.other'],
        [new RegExp(`\\b(${PLANTUML_KEYWORDS.filter((k) => !k.startsWith('@')).join('|')})\\b`), 'keyword'],
        [/'.*$/, 'comment'],
        [/"/, 'string', '@string'],
        [/[a-zA-Z][\w]*/, 'identifier']
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/"/, 'string', '@pop'],
        [/\\./, 'string.escape']
      ]
    }
  });

  // 自动补全：普通输入给关键词；!theme 后给主题名
  monaco.languages.registerCompletionItemProvider('plantuml', {
    triggerCharacters: ['@', '!', ':'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);

      // 在 !theme 后：只建议主题名
      const themeMatch = linePrefix.match(/!theme\s+([\w-]*)$/i);
      if (themeMatch) {
        return {
          suggestions: PLANTUML_THEMES.map((t) => ({
            label: t,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: t,
            range,
            sortText: '0' + t
          }))
        };
      }

      // 通用关键词 + !theme 指令
      const suggestions = PLANTUML_KEYWORDS.map((kw) => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
        range,
        sortText: kw.startsWith('@') ? '0' + kw : '1' + kw
      }));
      suggestions.push({
        label: '!theme',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: '!theme ',
        range,
        sortText: '2'
      });
      return { suggestions };
    }
  });

  editor = monaco.editor.create(container.value, {
    value: props.modelValue || '',
    language: 'plantuml',
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    wordWrap: 'off',
    tabSize: 2
  });

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue());
    updateDiagnostics();
  });

  editor.onDidChangeCursorPosition((e) => {
    emit('cursorChange', {
      line: e.position.lineNumber,
      column: e.position.column
    });
  });
});

watch(() => props.modelValue, (newVal) => {
  if (editor && editor.getValue() !== newVal) {
    editor.setValue(newVal);
  }
});

function highlightErrorLine(lineNumber) {
  if (!editor) return;
  clearErrorHighlights();
  if (lineNumber > 0) {
    decorations = editor.deltaDecorations([], [{
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: 'error-line-highlight',
        overviewRuler: { color: '#E8734A', position: monaco.editor.OverviewRulerLane.Full }
      }
    }]);
    editor.revealLineInCenter(lineNumber);
  }
}

function clearErrorHighlights() {
  if (editor && decorations.length > 0) {
    editor.deltaDecorations(decorations, []);
    decorations = [];
  }
}

function focusEditor() {
  if (editor) editor.focus();
}

// 基础诊断：@startuml / @enduml 配对检查（详细语法错误行由渲染结果高亮）
function updateDiagnostics() {
  if (!editor) return;
  const model = editor.getModel();
  const text = model.getValue();
  const starts = [...text.matchAll(/@startuml/gi)];
  const ends = [...text.matchAll(/@enduml/gi)];
  const markers = [];
  if (starts.length !== ends.length) {
    const lastLine = (arr) => model.getLineNumberAtOffset(arr[arr.length - 1].index);
    if (starts.length > ends.length) {
      const l = lastLine(starts);
      markers.push({ severity: monaco.MarkerSeverity.Error, message: '缺少 @enduml', startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 });
    } else {
      const l = lastLine(ends);
      markers.push({ severity: monaco.MarkerSeverity.Error, message: '缺少 @startuml', startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 });
    }
  }
  monaco.editor.setModelMarkers(model, 'plantuml', markers);
}

defineExpose({ highlightErrorLine, clearErrorHighlights, focusEditor });

onUnmounted(() => {
  if (editor) { editor.dispose(); }
});
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
}

:deep(.error-line-highlight) {
  background-color: rgba(232, 115, 74, 0.15);
}
</style>
