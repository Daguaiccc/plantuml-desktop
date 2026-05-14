# PlantUML Desktop Editor

> 由 AI（Claude Code）辅助生成的离线 PlantUML 桌面编辑器

一个基于 Electron + Vue 3 + Monaco Editor 的 PlantUML 图表编辑器，支持实时预览、多标签页、导出多种格式，完全离线运行。

## 技术栈

- **Electron** — 桌面应用框架
- **Vue 3** — Composition API + `<script setup>`
- **Monaco Editor** — 代码编辑器（VS Code 内核）
- **PlantUML** — Java 渲染引擎（内嵌 JRE）
- **electron-builder** — 打包与分发

## 功能特性

- 多标签页管理 — 同时编辑多个图表，标签页可拖拽排序
- 实时预览 — 编辑代码即时渲染 SVG
- 语法高亮 — PlantUML 关键字着色
- 语法速查 — 内置 8 类图表语法参考面板
- 丰富的示例模板 — 时序图、类图、用例图、活动图、组件图、部署图、状态图
- 主题切换 — 支持 12 种 PlantUML 内置主题
- 导出格式 — SVG / PNG / PDF
- 缩放与拖拽 — 滚轮缩放、拖拽平移、适应宽度、1:1 实际大小
- 文件关联 — 双击 .puml 文件直接打开
- 拖拽打开 — 拖拽 .puml 文件到窗口
- 最近文件 — 记录最近打开的 10 个文件
- 未保存提示 — 关闭标签页/应用时逐一提示保存
- 分割线拖拽 — 自由调整编辑区与预览区比例
- 右键菜单 — 标签页右键：关闭、关闭其他、关闭所有、复制路径
- Shift+点击 — 快速关闭标签页

## 下载

前往 [Releases](https://github.com/Daguaiccc/plantuml-desktop/releases) 页面下载最新安装包：

- **Windows**: `PlantUML Editor Setup x.x.x.exe`（NSIS 安装程序，支持自定义安装路径）

> 安装包已内置 JRE 和 PlantUML JAR，无需额外安装 Java 环境。

## 开发

```bash
# 克隆仓库
git clone https://github.com/Daguaiccc/plantuml-desktop.git
cd plantuml-desktop

# 安装依赖
npm install

# 准备运行时依赖（需手动下载）
# - bin/plantuml.jar
# - jre/ (Windows JDK)

# 启动开发模式
npm run dev

# 构建
npm run build

# 打包 Windows 安装程序
npm run build:win
```

## 项目结构

```
plantuml-desktop/
├── src/
│   ├── main.js              # Electron 主进程
│   ├── preload.js           # IPC 桥接
│   ├── assets/
│   │   ├── styles.css       # 全局样式 (Q-style)
│   │   ├── logo.svg         # 矢量 Logo
│   │   ├── logo.png         # 应用图标源文件
│   │   └── logo-app.png     # 界面 Logo
│   └── renderer/
│       ├── App.vue          # 根组件
│       ├── main.js          # Vue 入口
│       ├── index.html       # HTML 模板
│       ├── components/
│       │   ├── PlantUmlEditor.vue  # Monaco 编辑器封装
│       │   └── SyntaxCheatsheet.vue # 语法速查面板
│       └── examples/
│           └── plantumlExamples.js # 示例模板库
├── bin/
│   └── plantuml.jar         # PlantUML 引擎（手动下载）
├── jre/                     # Java 运行时（手动下载）
├── package.json
├── vite.config.js
└── README.md
```

## License

GPL-3.0

## 致谢

本项目由 [Claude Code](https://claude.ai/code)（Anthropic）辅助生成，展示了 AI 驱动的端到端桌面应用开发能力。
