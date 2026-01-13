// src/renderer/plantumlExamples.js

/**
 * PlantUML 示例库
 * 支持：时序图、类图、用例图、活动图、组件图、部署图、状态图、对象图
 */

export const PLANTUML_EXAMPLES = {
  // 1. 时序图（Sequence Diagram）
  sequence: {
    label: '时序图',
    code: `@startuml
actor 用户 as User
participant "前端" as Frontend
participant "API 服务" as API
database "数据库" as DB

User -> Frontend : 输入登录信息
Frontend -> API : POST /login
API -> DB : 查询用户
DB --> API : 返回用户数据
API --> Frontend : 返回 token
Frontend --> User : 跳转首页
@enduml`
  },

  // 2. 类图（Class Diagram）
  class: {
    label: '类图',
    code: `@startuml
class User {
  +String username
  +String email
  +boolean isActive()
  +login()
}

class Order {
  +int id
  +Date createdAt
  +List<Item> items
  +calculateTotal()
}

class Item {
  +String name
  +double price
}

User "1" -- "0..*" Order : 下单 >
Order "1" *-- "1..*" Item : 包含 >

note right of User
  用户实体
end note
@enduml`
  },

  // 3. 用例图（Use Case Diagram）
  usecase: {
    label: '用例图',
    code: `@startuml
left to right direction
actor "管理员" as Admin
actor "普通用户" as User

rectangle "系统功能" {
  Admin -- (管理用户)
  Admin -- (查看日志)
  User -- (发布文章)
  User -- (评论文章)
  (发布文章) .> (登录) : include
  (评论文章) .> (登录) : include
}
@enduml`
  },

  // 4. 活动图（Activity Diagram）
  activity: {
    label: '活动图',
    code: `@startuml
title 用户注册流程

start
:访问注册页面;
:填写用户名/邮箱/密码;
if (邮箱已存在?) then (是)
  :提示错误;
  stop
endif

:发送验证邮件;
:等待用户点击链接;
if (链接有效?) then (否)
  :注册失败;
  stop
endif

:激活账户;
:跳转到登录页;
stop
@enduml`
  },

  // 5. 组件图（Component Diagram）
  component: {
    label: '组件图',
    code: `@startuml
package "Web 应用" {
  [前端 Vue]
  [后端 API]
  [认证服务]
}

package "基础设施" {
  [MySQL 数据库]
  [Redis 缓存]
}

[前端 Vue] ..> [后端 API] : HTTP/JSON
[后端 API] ..> [认证服务] : gRPC
[后端 API] --> [MySQL 数据库] : JDBC
[认证服务] --> [Redis 缓存] : SET/GET

note top of [认证服务]
  JWT 签发与校验
end note
@enduml`
  },

  // 6. 部署图（Deployment Diagram）
  deployment: {
    label: '部署图',
    code: `@startuml
node "用户设备" {
  artifact "浏览器" {
    [Vue App]
  }
}

node "云服务器" {
  node "Nginx" {
    [反向代理]
  }
  node "App Server" {
    [Node.js API]
  }
  node "Database Server" {
    [PostgreSQL]
  }
}

[Vue App] --> [反向代理] : HTTPS
[反向代理] --> [Node.js API] : HTTP
[Node.js API] --> [PostgreSQL] : SQL
@enduml`
  },

  // 7. 状态图（State Diagram）
  state: {
    label: '状态图',
    code: `@startuml
[*] --> 待支付
待支付 --> 已支付 : 支付成功
待支付 --> 已取消 : 超时未支付
已支付 --> 已发货 : 仓库发货
已发货 --> 已完成 : 用户确认收货
已发货 --> 已退货 : 申请退货
已退货 --> [*]

note right of 已发货
  7天内可申请退货
end note
@enduml`
  }
};

// 自动生成下拉选项
export const EXAMPLE_OPTIONS = Object.entries(PLANTUML_EXAMPLES).map(([value, item]) => ({
  value,
  label: item.label
}));