# AGENTS.md

<!-- 本文件由 generate-agents-md skill 生成（证据驱动：每条可核查陈述均可回溯到仓库中的文件）。
更新方式：重新运行 generate-agents-md skill，或按各章节"证据来源"核对后增量修改。 -->

## 项目概述

离线 PlantUML 桌面图表编辑器：左侧 Monaco 编辑器编写 PlantUML 源码，右侧实时渲染 SVG 预览（缩放/平移），支持多标签页、导出 SVG/PNG/PDF、内置 7 个示例模板与语法速查、AI 绘图助手（Anthropic / Gemini / OpenAI 兼容，流式输出）。Electron + Vue 3 + Vite 构建，完全离线运行（内嵌 JRE + PlantUML JAR）。

证据来源：`README.md`、`package.json`、`src/main.js`、`src/renderer/App.vue`。

## 技术栈

- Electron — `^39.2.7`（devDependencies，`package.json`）
- Vue 3 — `^3.5.26`（Composition API + `<script setup>`）
- Vite — `^7.3.0` + `@vitejs/plugin-vue ^6.0.3`
- monaco-editor — `^0.55.1`（dependencies）
- lodash — `^4.17.21`（dependencies，仅 `debounce`）
- electron-builder — `^26.8.1`（Windows NSIS 打包）
- PlantUML — 外部 JAR（`bin/plantuml.jar`），非 npm 依赖
- 无 `engines` 字段（Node 版本未声明；推断需与 Electron 39 内置 Node 匹配，⚠️ 未验证）

证据来源：`package.json`、`package-lock.json`、`README.md`。

## 常用命令

全部出自 `package.json` → `scripts`：

| 命令 | 作用 | 出处 |
|---|---|---|
| `npm run dev` | 启动 Vite dev server（端口 5173, strictPort）+ Electron | `scripts.dev` |
| `npm run build` | 构建渲染进程到 `dist/`（index.html + preload.js） | `scripts.build` |
| `npm run build:win` | `vite build` 后 electron-builder 打 Windows NSIS 安装包（输出 `release/`） | `scripts.build:win` |
| `npm start` | 直接运行 Electron（需先 `npm run build`） | `scripts.start` |

**未配置测试命令、未配置 lint/format 命令**（已观察；测试骨架暂未引入）。

证据来源：`package.json` scripts。

## 项目结构

```
plantuml-desktop/
├── src/
│   ├── main.js                    # Electron 主进程：窗口/菜单/PlantUML 渲染队列/文件/导出/流式 AI
│   ├── preload.js                 # contextBridge 暴露 window.api（IPC 桥接 + AI 流式事件）
│   ├── assets/
│   │   └── styles.css             # 全局 Q-style 样式（CSS 自定义属性）
│   └── renderer/                  # Vite root（vite.config.js → root: 'src/renderer'）
│       ├── index.html             # HTML 模板
│       ├── main.js                # Vue 入口 createApp(App).mount('#app')
│       ├── App.vue                # 根组件：多标签、编辑器+预览、缩放保持、导出、AI 面板、拖拽打开
│       ├── components/
│       │   ├── PlantUmlEditor.vue     # Monaco 封装 + 语法高亮 + 自动补全 + @startuml 配对诊断
│       │   ├── SyntaxCheatsheet.vue   # 语法速查面板
│       │   ├── AIPanel.vue            # AI 对话面板（流式渲染）
│       │   └── AIConfigPanel.vue      # AI 提供商配置弹窗（含测试连接）
│       └── examples/
│           └── plantumlExamples.js    # 7 个内置示例模板（时序/类/用例/活动/组件/部署/状态）
├── bin/plantuml.jar              # 运行时引擎（gitignored，需手动放置）
├── jre/                          # 内嵌 Java 运行时（gitignored，需手动放置）
├── build/                        # electron-builder buildResources（icon.ico / icon.png）
├── assets/                       # 应用图标与 logo（icon.ico、logo.svg/png）
├── cache/                        # 运行时数据：recent-files.json、ai-config.json（gitignored）
├── dist/                         # 构建产物（gitignored）
├── release/                      # electron-builder 打包输出（gitignored）
├── package.json / package-lock.json
├── vite.config.js
└── README.md / AGENTS.md / LICENSE（GPL-3.0）
```

证据来源：仓库根目录扫描、`vite.config.js`、`.gitignore`、`README.md`。

## 架构与数据流

- **入口**：`src/main.js` → `app.whenReady` → `validateResources()`（校验 JAR/JRE，缺失则弹错误框并退出）→ `createWindow()`。单实例锁（`requestSingleInstanceLock`），`.puml`/`.txt` 文件可经命令行参数或 `open-file` 事件打开。
- **渲染主流程（串行队列 + 自愈）**：渲染进程编辑代码 → `window.api.plantuml.render(code)`（IPC `render-plantuml`）→ 主进程**串行队列**（`renderQueue` promise 链，一次一个请求，杜绝并发抢 stdout 监听）→ 向**常驻** Java 管道进程（`java -jar plantuml.jar -pipe -tsvg -charset UTF-8`，`shell: true`）stdin 写入源码 → 收集 stdout 直到 `</svg>` → 返回 `{ svg, errorLine, errorMessage }`。**5 秒超时自动 kill 并重建管道**（残留半截输出不污染后续渲染）；exit 事件仅当退出的是当前进程才清引用。
- **渲染进程竞态防护**：`App.vue` 的 `render()` 用递增版本号 `renderSeq`，过期响应（成功/语法错误/异常三分支）一律丢弃；`isRendering` 浮层由最新请求管理。
- **视图保持**：用户手动缩放/平移（滚轮/拖拽/缩放按钮/输入框）置 `userViewAdjusted`，之后新 SVG 保持缩放级别并居中（`keepViewOnNewSvg`），不再强制 auto-fit；`resetView`（适应窗口）恢复自动适配。容器 resize、AI 面板开关走同一 `refreshViewport` 逻辑。
- **导出**（SVG/PNG/PDF）：写临时 `.puml` 到 `%TEMP%/plantuml-desktop` → 一次性 JAR 子进程（`-tsvg`/`-tpng`/`-tpdf`）→ 原生保存对话框 → 复制结果并清理临时文件。
- **文件**：打开/保存/另存为/读取均经 IPC；最近文件存 `cache/recent-files.json`（最多 10 条，读取时过滤已不存在的路径）。
- **AI 助手（流式）**：配置存 `cache/ai-config.json`（provider: ollama/openai/anthropic/gemini/deepseek/qwen/custom；**apiKey 用 Electron `safeStorage` 加密**，格式 `{enc: base64}`，`isEncryptionAvailable()` 为 false 时退化明文）；`ai:chat` 走 SSE 流式（OpenAI 兼容 `choices[].delta.content` / Anthropic `content_block_delta` / Gemini `candidates[].parts[].text`），经 `webContents.send('ai:chat:delta'|'done'|'error')` 推送，120s 超时；`ai:test` 用传入配置发最小请求验证连接（15s 超时，不保存）。
- **编辑器增强**（Monaco）：自定义 `plantuml` Monarch tokenizer（60+ 关键词 + `!theme` 指令高亮）；自动补全（通用关键词 + `!theme` 后上下文感知的主题名）；`@startuml`/`@enduml` 配对诊断（`setModelMarkers`）。
- **错误交互**：渲染出错时编辑器自动 `revealLineInCenter` 高亮错误行；错误消息条可点击（`jumpToErrorLine`）重新定位并聚焦编辑器。保存/导出失败用 toast（4s）而非原生 alert。
- **进程边界**：`contextIsolation: true`；渲染进程仅能通过 preload 的 `window.api` 与主进程通信。
- **串行化**：`isOperationInProgress` 标志防止文件/导出原生对话框重叠。

证据来源：`src/main.js`、`src/preload.js`、`src/renderer/App.vue`、`src/renderer/components/PlantUmlEditor.vue`。

## 代码约定与风格

- Vue 3 Composition API `<script setup>`；无 TypeScript。
- 主进程/preload 用 CommonJS（`require`），渲染进程用 ESM（`import`）。
- 单引号 + 分号；变量 camelCase、常量 UPPER_SNAKE（如 `PLANTUML_THEMES`、`MAX_ZOOM`）；组件文件 PascalCase（`PlantUmlEditor.vue`）。
- `src/main.js` 内用 `// ========== Section ==========` 注释分节。
- UI 文案为中文；Monaco 编辑器 `tabSize: 2`。
- 无 ESLint/Prettier/.editorconfig/测试（已观察缺失）。

证据来源：`src/main.js`、`src/renderer/App.vue`、`src/renderer/components/PlantUmlEditor.vue`。

## 环境与外部依赖

- **运行时必需（不在 git 内，需手动放置；启动时强校验，缺失即退出）**：
  - `bin/plantuml.jar` — PlantUML 引擎（`.gitignore` 排除，README 注明手动下载）
  - `jre/bin/java.exe`（Windows）或 `jre/bin/java`（其他平台）— 内嵌 JRE
- 路径解析：`getResourcePath()` — dev 模式用项目根，打包模式用 `process.resourcesPath`；`cache/` 目录打包模式下位于 exe 同目录。
- Node 版本未声明（无 `engines`）；⚠️ 未验证。
- AI 功能需用户自行配置 provider/API key（apiKey 加密存本地 `cache/ai-config.json`）。

证据来源：`src/main.js`（`validateResources`/`getResourcePath`/`loadAIConfig`）、`.gitignore`、`README.md`。

## 测试策略

**无测试**：仓库内无测试文件、无测试命令、无测试框架配置（已观察；测试骨架暂未引入）。改动靠手动运行验证。

证据来源：`package.json`、仓库扫描。

## 已知约束与坑

- **启动强校验外部运行时**：`bin/plantuml.jar` 或 `jre/bin/java.exe` 缺失时直接弹错误框并退出（`src/main.js` `validateResources`）。
- **渲染队列串行**：同一时刻只渲染一个请求，大图渲染期间的新请求排队（最多等 5s 超时重建）；配合渲染进程 500ms debounce + 版本号丢弃，实际体验无感。
- **5 秒硬超时**：超时即 kill 管道重建；超大/超复杂图可能超时（表现为主进程自动重建后重试）。
- **AI 流式依赖 SSE**：三协议解析按官方格式实现，但**未经真实 API 实测**（需 API key）；某提供商格式不符时会在 `AIPanel` 显示"请求失败"并附错误信息。
- **safeStorage 平台差异**：Windows 可用；Linux 无 keyring 时 `isEncryptionAvailable()` 为 false，apiKey 退化明文存储。
- **AI 对话不持久化**：`AIPanel` 的 messages 仅存会话内存，关闭面板/重启即清空。
- **`build/` 被 gitignore 但打包依赖它**：`.gitignore` 排除了 `build/`，而 electron-builder 的 `buildResources`、`win.icon`、`fileAssociations` 都引用 `build/icon.ico`；克隆后需自行准备该目录，否则 `npm run build:win` 图标缺失。
- **Windows 路径处理**：子进程用 `shell: true` 且手动加引号拼接路径，路径含引号/特殊字符时可能出错（推断，未实测）。
- **单实例锁**：第二个实例不会新建窗口，而是把文件打开请求转交给已有实例。
- **限制**：最多同时 10 个标签页（`App.vue` `createTab`）；预览最大缩放 3.0（MIN_ZOOM 0.1）。
- **Vite 特殊配置**：root 为 `src/renderer` 且输出到顶层 `dist/`；preload 作为独立 rollup 入口；`define` 将 `global` → `globalThis`、`process.platform` → `"browser"`（Monaco 依赖）；`vs` alias 指向 `node_modules/monaco-editor/min/vs`。
- **构建产物大 chunk**：`dist/main.js` ~3.8MB（gzip ~1MB，Monaco 全量打包），Vite 有 chunk >500kB 警告；未做代码分割。
- **无 CI/测试/lint**：合入前需手动验证构建与打包。

证据来源：`src/main.js`、`src/renderer/App.vue`、`src/renderer/components/AIPanel.vue`、`src/renderer/components/AIConfigPanel.vue`、`src/renderer/components/PlantUmlEditor.vue`、`.gitignore`、`package.json`、`vite.config.js`。

## 验证清单

- [x] 本文件中每个路径均已在仓库中确认存在。
- [x] 本文件中每条命令均在 `package.json` scripts 中确认存在。
- [x] 依赖与版本在 `package.json` 中确认存在。
- [ ] ⚠️ 未验证项已标注：Node 版本要求、Windows 特殊字符路径、AI 流式真实 API 行为。
