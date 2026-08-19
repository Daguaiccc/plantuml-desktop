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
          <template v-if="msg.role === 'assistant' && hasCodeBlock(msg.content) && !isStreaming(msg)">
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
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';

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

// ===== 对话历史持久化（cache/ai-chat-history.json，与最近文件同目录）=====
// 流式进行中不把半截占位写入历史；完成后的 done 回调会再触发保存
async function saveHistory() {
  if (loading.value && messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') return;
  if (!window.api?.ai) return;
  try {
    // IPC 的 structured clone 无法克隆 Vue reactive proxy，必须先转普通 JSON 对象
    const plain = messages.value.map((m) => ({ role: m.role, content: m.content }));
    const r = await window.api.ai.saveHistory(plain);
    console.log('[ai-history] save result:', JSON.stringify(r), 'count:', plain.length);
  } catch (e) { console.error('[ai-history] save error:', e); }
}
watch(messages, () => { saveHistory(); }, { deep: true });
// 组件卸载（关闭面板）前兜底保存，避免最后一次消息未落盘
onBeforeUnmount(() => { saveHistory(); });

async function loadHistory() {
  if (!window.api?.ai) { console.log('[ai-history] load skipped (no api)'); return; }
  try {
    const history = await window.api.ai.loadHistory();
    console.log('[ai-history] load result count:', Array.isArray(history) ? history.length : history);
    if (Array.isArray(history) && history.length > 0) messages.value = history;
  } catch (e) { console.error('[ai-history] load error:', e); }
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
  // 预置 assistant 占位消息，流式增量填充
  messages.value.push({ role: 'assistant', content: '' });
  const idx = messages.value.length - 1;
  loading.value = true;
  scrollDown();

  const history = messages.value
    .slice(0, idx)
    .filter(m => m.content)
    .map(m => ({ role: m.role, content: m.content }));

  const off = window.api.ai.chatEvents({
    delta: ({ delta }) => {
      messages.value[idx].content += delta;
      scrollDown();
    },
    done: ({ content }) => {
      messages.value[idx].content = content || 'AI 未返回内容';
      loading.value = false;
      scrollDown();
    },
    error: ({ error: msg }) => {
      if (messages.value[idx].content === '') messages.value.splice(idx, 1);
      else messages.value[idx].content += '\n\n[请求失败: ' + msg + ']';
      error.value = '请求失败: ' + msg;
      loading.value = false;
      scrollDown();
    }
  });
  try {
    await window.api.ai.chatStream(history, props.currentCode);
  } catch (err) {
    if (messages.value[idx]) {
      if (messages.value[idx].content === '') messages.value.splice(idx, 1);
      else messages.value[idx].content += '\n\n[请求失败: ' + (err.message || '未知错误') + ']';
    }
    error.value = '请求失败: ' + (err.message || '未知错误');
    loading.value = false;
    scrollDown();
  } finally {
    off();
  }
}

// 流式进行中的最后一条 assistant 消息：始终以纯文本显示，完成后才切换代码块视图
function isStreaming(msg) {
  return loading.value && messages.value.length > 0 && messages.value[messages.value.length - 1] === msg;
}

function insertCode(text) { emit('insertCode', extractCode(text)); }
function clearChat() { messages.value = []; error.value = ''; saveHistory(); }

onMounted(() => { loadConfig(); loadHistory(); });
</script>
