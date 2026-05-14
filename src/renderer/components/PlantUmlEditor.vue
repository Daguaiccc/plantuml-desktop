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
        [/\b(activate|deactivate|participant|actor|usecase|class|interface|package|note|title|skinparam|state|database|[*])\b/, 'keyword'],
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

defineExpose({ highlightErrorLine, clearErrorHighlights });

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
