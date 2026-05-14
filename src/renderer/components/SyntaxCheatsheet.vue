<template>
  <div v-if="show" class="cheatsheet-overlay" @click.self="$emit('close')" @keydown.escape="$emit('close')">
    <div class="cheatsheet-panel">
      <div class="cheatsheet-header">
        <h3>PlantUML 语法速查</h3>
        <button class="cheatsheet-close-btn" @click="$emit('close')">&times;</button>
      </div>
      <div class="cheatsheet-body">
        <div v-for="(section, i) in sections" :key="i" class="cheatsheet-section">
          <div class="cheatsheet-section-title" @click="section.collapsed = !section.collapsed">
            <span class="cheatsheet-arrow">{{ section.collapsed ? '▸' : '▾' }}</span>
            {{ section.title }}
          </div>
          <div v-show="!section.collapsed" class="cheatsheet-section-body">
            <pre class="cheatsheet-code">{{ section.syntax }}</pre>
            <div class="cheatsheet-keywords">
              <span v-for="kw in section.keywords" :key="kw" class="cheatsheet-kw">{{ kw }}</span>
            </div>
            <div v-if="section.tip" class="cheatsheet-tip">{{ section.tip }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue';

defineProps({ show: Boolean });
defineEmits(['close']);

const sections = reactive([
  {
    title: '时序图 · Sequence',
    collapsed: false,
    syntax: `@startuml
actor 用户
participant "服务" as S
database 数据库 as DB
用户 -> S : 请求
S -> DB : 查询
DB --> S : 结果
S --> 用户 : 响应
@enduml`,
    keywords: ['actor', 'participant', 'database', '->', '-->', 'activate', 'deactivate', 'note left/right', 'alt/else/end', 'loop/end', 'group/end'],
    tip: '→ 实线箭头，--> 虚线箭头'
  },
  {
    title: '类图 · Class',
    collapsed: false,
    syntax: `@startuml
class 类名 {
  +公有属性
  -私有属性
  +方法()
}
类A "1" -- "0..*" 类B : 关系
@enduml`,
    keywords: ['class', 'interface', 'abstract', 'enum', 'package', '+', '-', '#', '--', '--|>', '..', 'note'],
    tip: '+ 公有，- 私有，# 保护'
  },
  {
    title: '用例图 · Use Case',
    collapsed: true,
    syntax: `@startuml
left to right direction
actor 用户
rectangle 系统 {
  用户 -- (用例1)
  (用例1) .> (用例2) : <<include>>
}
@enduml`,
    keywords: ['actor', 'usecase', 'rectangle', 'package', '--', '.>', '<<include>>', '<<extend>>', 'left to right direction'],
    tip: '-- 关联，.> 依赖/包含'
  },
  {
    title: '活动图 · Activity',
    collapsed: true,
    syntax: `@startuml
start
:步骤1;
if (条件?) then (是)
  :分支1;
else (否)
  :分支2;
endif
:步骤2;
stop
@enduml`,
    keywords: ['start', 'stop', 'if/else/endif', 'repeat/repeat while', 'while/endwhile', 'fork/fork again/end fork', 'split/split again/end split', 'partition'],
    tip: ':文本; 表示活动节点'
  },
  {
    title: '组件图 · Component',
    collapsed: true,
    syntax: `@startuml
package "分组" {
  [组件A]
  [组件B]
}
[组件A] ..> [组件B] : 依赖
@enduml`,
    keywords: ['component', 'package', 'node', 'folder', 'frame', 'cloud', 'database', 'interface', '()', '..>', '-->'],
    tip: '[名称] 表示组件，() 表示接口'
  },
  {
    title: '部署图 · Deployment',
    collapsed: true,
    syntax: `@startuml
node "服务器" {
  component [应用]
}
node "客户端" {
  artifact [浏览器]
}
@enduml`,
    keywords: ['node', 'artifact', 'component', 'database', 'cloud', 'frame', '-->', '..'],
    tip: 'node 嵌套 component/artifact 表示部署结构'
  },
  {
    title: '状态图 · State',
    collapsed: true,
    syntax: `@startuml
[*] --> 状态A
状态A --> 状态B : 事件
状态B --> [*]
state 状态A {
  [*] --> 子状态1
  子状态1 --> [*]
}
@enduml`,
    keywords: ['state', '[*]', '-->', 'note on/right of', 'hide empty description'],
    tip: '[*] 表示起始/终止状态'
  },
  {
    title: '通用指令',
    collapsed: true,
    syntax: `!theme spacelab
title 图表标题
caption 图注说明
skinparam backgroundColor #FEFEFE
hide footbox
' 单行注释
/' 多行注释 '/
@enduml`,
    keywords: ['title', 'caption', 'skinparam', '!theme', 'hide', 'show', 'scale', 'left/right/top to bottom direction', 'newpage'],
    tip: '!theme 可选: blueprint, cerulean, hacker, materia, plain, sketchy-outline, spacelab, united'
  }
]);
</script>
