# Session Handoff Document

## Project Name

基于 QuantumNous/new-api 构建 DMXAPI 类 AI API SaaS 平台

---

# 1. 项目目标

目标：

基于开源项目：

```
https://github.com/QuantumNous/new-api
```

构建一个类似：

```
https://www.dmxapi.cn/
```

的 AI API 聚合平台。

系统需要支持：

* OpenAI API 兼容接口
* 多模型统一调用
* 模型价格展示
* 开发者文档
* 更新日志
* FAQ
* 用户控制台
* API Key 管理
* Token 统计
* 套餐
* 余额
* 支付
* VIP
* 商业化运营

核心要求：

> 最大程度复用 new-api，同时保证未来 new-api 官方升级时可以低成本同步。

---

# 2. 核心架构决策

## 不采用方案

禁止：

```
直接 fork new-api
大量修改 frontend/backend
```

原因：

new-api 更新频繁。

如果深度修改：

```
new-api v1.0

↓

new-api v1.5

merge conflict 大量产生
```

长期无法维护。

---

# 3. 最终架构设计

采用：

```
new-api Core

+

Extension Layer

+

Platform Service

```

整体：

```
                    用户

                     |
                     |

                 Web Portal

                     |

        ----------------------------

        |                          |

   new-api 原有页面          扩展页面

   控制台                    模型价格

   Token                     FAQ

   关于                      更新日志


        ----------------------------


              new-api Backend


                     |

              Extension Backend


                     |

        PostgreSQL / Redis


                     |

       OpenAI / Claude / Gemini
```

---

# 4. new-api 的角色定位

new-api 不作为完整产品。

定位：

```
AI Gateway Core
```

负责：

* API 请求接收
* OpenAI 兼容接口
* Channel 管理
* Model Relay
* Token 统计
* API Key
* 用户基础体系

不要修改：

```
relay
controller核心逻辑
model核心结构
```

---

# 5. 当前源码分析结论

## 前端技术栈

new-api 当前版本：

```
React

+

TypeScript

+

TanStack Router

+
组件化 Layout
```

不是旧版 Vue。

---

# 6. Web 前端关键位置

## Layout

目录：

```
web/src/components/layout/
```

主要：

```
components/layout/components/

public-layout.tsx

public-header.tsx

top-nav.tsx

footer.tsx

authenticated-layout.tsx
```

作用：

公共页面结构：

```
Header

    |

页面内容

    |

Footer
```

---

# 7. 顶部菜单扩展方案

不要直接修改：

```
public-header.tsx

top-nav.tsx
```

原因：

官方升级容易冲突。

采用：

Extension Menu Registry。

新增：

```
web/src/extensions/navigation/
```

例如：

```
top-nav.extension.ts
```

定义：

```ts
[
 {
   title:"模型价格",
   href:"/pricing"
 },

 {
   title:"更新日志",
   href:"/changelog"
 },

 {
   title:"FAQ",
   href:"/faq"
 }
]
```

然后与官方菜单合并：

```
official menu

+

extension menu

=

最终导航
```

---

# 8. 页面扩展方案

新增：

```
web/src/extensions/pages/
```

例如：

```
pages/

├── pricing

├── faq

└── changelog
```

通过 Router 注册。

最终用户看到：

```
控制台

文档

关于

模型价格

更新日志

FAQ
```

统一 Header。

---

# 9. Router 扩展方案

new-api 使用：

```
web/src/routes/
```

基于：

```
TanStack Router
```

不建议直接修改大量官方 route。

新增：

```
extensions/routes/
```

例如：

```
pricing

faq

changelog
```

编译阶段注入。

---

# 10. 后端扩展设计

新增：

```
extension/
```

结构：

```
extension

├── plugin.go

├── router

├── controller

├── service

└── model
```

设计插件接口：

```go
type Plugin interface {

Name() string

Init()

RegisterRouter(
router *gin.RouterGroup
)

}
```

例如：

```
platform-plugin
```

负责：

* 套餐
* 支付
* 订单
* VIP
* 模型价格

---

# 11. 数据库设计

不要修改：

```
new-api database
```

避免升级困难。

保持：

```
newapi_db

user

token

channel

log

```

新增：

```
platform_db
```

包含：

```
product

subscription

order

payment

coupon

vip
```

通过：

```
user_id
```

关联。

---

# 12. 推荐项目目录

最终：

```
new-api-platform


├── core

│   └── new-api

│
├── extensions

│   |
│   ├── frontend

│   |
│   └── backend

│
├── docs

│
├── deploy

│
├── scripts

└── patches
```

详细：

```
extensions

├── frontend

│
│   ├── pricing

│   ├── faq

│   ├── changelog

│   └── navigation


└── backend

    ├── billing

    ├── payment

    └── subscription
```

---

# 13. 编译流程设计

最终不是运行多个项目。

而是：

```
extension

      |

merge

      |

new-api source

      |

build

      |

Docker image
```

---

## 前端

流程：

```
merge frontend extension

↓

npm install

↓

npm run build

↓

dist
```

---

## 后端

流程：

```
merge backend extension

↓

go mod tidy

↓

go build

↓

new-api binary
```

---

# 14. Docker 部署

生产：

```
docker-compose


services:

 nginx

 new-api

 postgres

 redis
```

运行：

```
nginx

        |

new-api

        |

postgres
redis
```

---

# 15. Git Upstream 同步策略

目标：

跟随：

```
QuantumNous/new-api
```

采用：

```
upstream

+

extension

+

patch
```

结构：

```
repository


├── core

   new-api


├── extensions

   自己代码


├── patches

   必要修改

```

---

# 16. 升级流程

官方：

```
new-api v1.0

↓

new-api v1.1
```

执行：

```bash
git fetch upstream

git merge upstream/main
```

然后：

重新：

```
merge extensions

build

test

deploy
```

目标：

升级冲突：

```
<10 个文件
```

而不是：

```
100+
```

---

# 17. 当前已完成分析

已确定：

## 前端

定位：

```
web/src/components/layout/components/public-header.tsx

web/src/components/layout/components/top-nav.tsx

web/src/components/layout/components/public-layout.tsx

web/src/routes/
```

确定：

* 使用 React
* 使用 TanStack Router
* 支持扩展导航

---

## 架构

确定：

采用：

```
Core + Extension + Platform Service
```

---

# 18. 当前未完成任务

## Task 1

源码级确认：

需要继续检查：

```
use-top-nav-links.ts
```

确定：

如何做到：

零侵入增加顶部菜单。

---

## Task 2

实现真正 Extension Framework

需要开发：

Backend:

```
extension/plugin.go

plugin loader

router registry
```

Frontend:

```
extension registry

route registry

menu registry
```

---

## Task 3

实现自动同步脚本

创建：

```
scripts/sync-upstream.sh
```

功能：

* fetch upstream
* merge
* 检测冲突
* build test

---

## Task 4

建立第一版 DMXAPI 功能

优先：

Phase 1:

```
模型价格页面

更新日志

FAQ

开发文档入口
```

Phase 2:

```
套餐

余额

支付

VIP
```

Phase 3:

```
模型市场

智能路由

Agent API

MCP
```

---

# 19. 下一次 Codex Session 工作入口

新的 Codex session 应首先执行：

1. 阅读本文件

2. 检查：

```
core/new-api
web/src
```

3. 完成：

```
extension registry
```

4. 不直接修改 new-api 核心。

所有新增功能优先进入：

```
extensions/
```

---

# 最终设计原则

一句话：

> new-api 是 AI Gateway Kernel，扩展层是商业 SaaS 平台，所有业务能力通过 Extension 注入，保证长期跟随 upstream 升级。

---

END

---

# 20. 当前实现状态（2026-08-02）

已实现扩展接缝、公开 FAQ/Changelog 路由、内容管理入口和独立平台数据库。

数据库边界：

```text
SQL_DSN                        -> new-api
PLATFORM_DATABASE_URL          -> platform_db
```

`platform_db` 当前保存更新日志及平台设置；绝不写入 new-api 数据库。

更新日志：

```text
公开页:       /updates
管理页:       /platform/content
```

管理页支持展示开关、创建、编辑、删除和 Tiptap 富文本编辑；公开导航会依据展示开关及当前语言显示或隐藏 Changelog。

## Upstream 更新

首次配置官方 upstream：

```bash
git -C core/new-api remote add upstream https://github.com/QuantumNous/new-api.git
```

常规流程：

```bash
./scripts/sync-upstream.sh
./scripts/sync-upstream.sh --merge
```

第一条命令仅显示新增提交、文件变更摘要并用 Git 的 merge-tree 预检冲突，不修改工作区。确认变更内容和 `Clean merge: yes` 后，才执行第二条命令。合并后脚本会装配扩展、生成前端路由、运行前端 build/typecheck 和 Go 编译。不要手动编辑 `routeTree.gen.ts`。

发生冲突时，使用 `docs/upstream-conflict-playbook.md`。该文档记录各 core 接缝需要保留的精确行为、数据库隔离约束、路由再生方式及完成后的验证项。
