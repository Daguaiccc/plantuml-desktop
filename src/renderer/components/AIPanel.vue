<template>
  <div class="ai-panel">
    <div class="ai-panel-header">
      <div class="ai-header-left">
        <h3>AI 绘图助手</h3>
        <span v-if="config" class="ai-model-badge">{{ config.model }}</span>
      </div>
      <div class="ai-header-right">
        <button class="ai-header-btn" title="设置" @click="$emit('openConfig')">⚙</button>
        <button class="ai-header-btn" title="清空对话" @click="clearChat">清空</button>
        <button class="ai-close-btn" @click="$emit('close')">&times;</button>
      </div>
    </div>

    <div class="ai-messages" ref="msgContainer">
      <div v-if="messages.length === 0" class="ai-empty">
        <p>描述你想要绘制的图表，AI 将为你生成 PlantUML 代码。</p>
        <div class="ai-examples">
          <button v-for="ex in examples" :key="ex" class="ai-example-btn" @click="sendMessage(ex)">{{ ex }}</button>
        </div>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="ai-message" :class="msg.role">
        <div class="ai-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="ai-msg-content">
          <template v-if="msg.role === 'assistant' && hasCodeBlock(msg.content)">
            <div v-if="extractText(msg.content)" class="ai-msg-text">{{ extractText(msg.content) }}</div>
            <div class="ai-code-actions">
              <button class="ai-insert-btn" @click="insertCode(msg.content)">插入到编辑器</button>
            </div>
            <pre class="ai-code-block"><code>{{ extractCode(msg.content) }}</code></pre>
          </template>
          <div v-else class="ai-msg-text">{{ msg.content }}</div>
        </div>
      </div>

      <div v-if="loading" class="ai-message assistant">
        <div class="ai-msg-role">AI</div>
        <div class="ai-msg-content"><span class="ai-loading">思考中...</span></div>
      </div>

      <div v-if="error" class="ai-error">{{ error }}</div>
    </div>

    <div class="ai-input-area">
      <textarea
        v-model="input"
        class="ai-input"
        placeholder="描述你想画的图... (Ctrl+Enter 发送)"
        @keydown="onInputKeydown"
        :disabled="loading || !config"
        rows="3"
        ref="inputEl"
      ></textarea>
      <button class="ai-send-btn" @click="send" :disabled="loading || !input.trim() || !config">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted } from 'vue';

const props = defineProps({ show: Boolean, currentCode: { type: String, default: '' } });
const emit = defineEmits(['close', 'insertCode', 'openConfig']);

const messages = ref([]);
const input = ref('');
const loading = ref(false);
const error = ref('');
const config = ref(null);
const msgContainer = ref(null);
const inputEl = ref(null);

const examples = [
  '画一个用户登录的时序图',
  '画一个订单系统的类图',
  '画一个审批流程的活动图',
  '画一个微服务架构的组件图',
  '画一个用户状态流转的状态图'
];

function hasCodeBlock(text) {
  return /@startuml[\s\S]*@enduml/.test(text) || /```[\s\S]*```/.test(text);
}

function extractText(text) {
  const m = text.match(/^([\s\S]*?)@startuml/);
  if (m) return m[1].trim();
  const mc = text.match(/^([\s\S]*?)```/);
  if (mc) return mc[1].trim();
  return '';
}
function extractCode(text) {
  let m = text.match(/@startuml[\s\S]*?@enduml/);
  if (m) return m[0];
  m = text.match(/```(?:plantuml)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return text;
}

function scrollDown() {
  nextTick(() => { if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight; });
}

async function loadConfig() {
  if (window.api?.ai) { try { config.value = await window.api.ai.loadConfig(); } catch {} }
}

watch(() => props.show, (v) => { if (v) loadConfig(); });

function onInputKeydown(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    send();
  }
}

async function sendMessage(text) { input.value = text; send(); }

async function send() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  input.value = '';
  error.value = '';
  messages.value.push({ role: 'user', content: text });
  loading.value = true;
  scrollDown();

  try {
    const reply = await window.api.ai.chat(
      messages.value.map(m => ({ role: m.role, content: m.content })),
      props.currentCode
    );
    messages.value.push({ role: 'assistant', content: reply || 'AI 未返回内容' });
  } catch (err) {
    error.value = '请求失败: ' + (err.message || '未知错误');
  } finally {
    loading.value = false;
    scrollDown();
  }
}

function insertCode(text) { emit('insertCode', extractCode(text)); }
function clearChat() { messages.value = []; error.value = ''; }

onMounted(loadConfig);
</script>
