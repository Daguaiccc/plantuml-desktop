
<template>
  <div ref="container" class="monaco-editor-container"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.main.js';

const props = defineProps({
  modelValue: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const container = ref(null);
let editor = null;

onMounted(async () => {
  await nextTick(); // 👈 关键：确保 DOM 已更新，ref 已绑定

  if (!container.value) {
    console.error('[Monaco] Failed to get container DOM element');
    return;
  }


  // 注册 PlantUML 语言
  monaco.languages.register({ id: 'plantuml' });
  monaco.languages.setMonarchTokensProvider('plantuml', {
    tokenizer: {
      root: [
        // 👇 安全：只匹配普通关键字（无 @ 符号）
        [/\b(activate|deactivate|participant|actor|usecase|class|interface|package|note|title|skinparam|state|datebase|[*])\b/, 'keyword'],

        // 注释（以 ' 开头的行）
        [/'.*$/, 'comment'],

        // 字符串（双引号）
        [/"/, 'string', '@string'],

        // 其他标识符（类名、用例名等）
        [/[a-zA-Z][\w]*/, 'identifier']
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/"/, 'string', '@pop'],
        [/\\./, 'string.escape']
      ]
    }
  });

// create 时
language: 'plantuml'

  editor = monaco.editor.create(container.value, {
    value: props.modelValue || ``,
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
});

watch(() => props.modelValue, (newVal) => {
  if (editor && editor.getValue() !== newVal) {
    editor.setValue(newVal);
  }
});

onUnmounted(() => {
  if (editor) {
    editor.dispose();
  }
});
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
  border: 1px solid #ccc;
  border-radius: 4px;
}
</style>