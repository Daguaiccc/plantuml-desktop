<template>
  <div v-if="show" class="config-overlay" @click.self="$emit('close')">
    <div class="config-dialog">
      <div class="config-header">
        <h3>AI 模型配置</h3>
        <button class="config-close-btn" @click="$emit('close')">&times;</button>
      </div>
      <div class="config-body">
        <div class="config-field">
          <label>提供商</label>
          <select v-model="form.provider" class="config-select">
            <option v-for="p in providers" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
        <div class="config-field" v-if="form.provider !== 'ollama'">
          <label>API Key</label>
          <input v-model="form.apiKey" type="password" class="config-input" placeholder="sk-..." />
        </div>
        <div class="config-field">
          <label>API 地址</label>
          <input v-model="form.baseUrl" class="config-input" :placeholder="defaultBaseUrl" />
        </div>
        <div class="config-field">
          <label>模型名称</label>
          <input v-model="form.model" class="config-input" :placeholder="defaultModel" />
        </div>
      </div>
      <div class="config-footer">
        <button class="config-btn secondary" @click="$emit('close')">取消</button>
        <button class="config-btn primary" @click="saveConfig">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close', 'saved']);

const providers = [
  { value: 'ollama', label: 'Ollama（免费本地）' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问' },
  { value: 'custom', label: '自定义 OpenAI 兼容' }
];

const defaultUrls = {
  ollama: 'http://localhost:11434/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  custom: ''
};
const defaultModels = {
  ollama: 'qwen2.5:7b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  custom: ''
};

const defaultBaseUrl = computed(() => defaultUrls[form.provider] || '');
const defaultModel = computed(() => defaultModels[form.provider] || '');

const form = reactive({
  provider: 'ollama',
  apiKey: '',
  baseUrl: '',
  model: ''
});

async function loadConfig() {
  if (!window.api?.ai) return;
  try {
    const config = await window.api.ai.loadConfig();
    if (config) {
      form.provider = config.provider || 'ollama';
      form.apiKey = config.apiKey || '';
      form.baseUrl = config.baseUrl || '';
      form.model = config.model || '';
    }
  } catch {}
}

watch(() => form.provider, () => {
  form.baseUrl = form.baseUrl || defaultBaseUrl.value;
  form.model = form.model || defaultModel.value;
});

async function saveConfig() {
  const config = {
    provider: form.provider,
    apiKey: form.apiKey,
    baseUrl: form.baseUrl || defaultBaseUrl.value,
    model: form.model || defaultModel.value
  };
  if (window.api?.ai) {
    await window.api.ai.saveConfig(config);
  }
  emit('saved', config);
  emit('close');
}

onMounted(loadConfig);
</script>
