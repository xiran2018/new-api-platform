# Upstream 同步、冲突处理与首页入口方案

本文用于维护 `new-api-platform`：外层仓库保存平台扩展、脚本与文档；`core/new-api` 是指向个人 Fork 的 Git submodule。

## 仓库关系

```text
new-api-platform（个人仓库）
├── extensions/            平台功能、FAQ、更新日志、独立首页
├── scripts/               装配、构建、同步脚本
├── docs/                  运维与冲突说明
└── core/new-api/          Git submodule → xiran2018/new-api
                             └── upstream → QuantumNous/new-api
```

`core/new-api` 中只保留无法通过 `extensions/` 完成的最小接缝。所有接缝必须提交到 Fork；不要依赖未提交改动或长期 stash。

## 首次获取项目

```bash
git clone --recurse-submodules git@github.com:xiran2018/new-api-platform.git
cd new-api-platform
```

忘记 `--recurse-submodules` 时：

```bash
git submodule update --init --recursive
```

## 日常同步 upstream

先确认工作区干净：

```bash
cd /home/jing/new-api-platform
git status --short
git -C core/new-api status --short
```

同步、验证并记录子模块版本：

```bash
cd /home/jing/new-api-platform/core/new-api
git switch main
git fetch origin
git fetch upstream
git pull --ff-only origin main
git merge upstream/main
git push origin main

cd /home/jing/new-api-platform
./scripts/assemble-extensions.sh
cd core/new-api/web
bun run typecheck
bun run build

cd /home/jing/new-api-platform
git add core/new-api
git commit -m "chore: sync new-api upstream"
git push origin main
```

合并前可运行 `./scripts/sync-upstream.sh --check` 查看上游摘要；core 工作区干净时也可使用 `./scripts/sync-upstream.sh --merge`。

## 发生冲突时

查看冲突文件：

```bash
cd /home/jing/new-api-platform/core/new-api
git status
git diff --name-only --diff-filter=U
```

优先保留 upstream 的业务实现，只恢复平台必需的最小接缝。参考：

```text
patches/backend-plugin-loader.patch
patches/frontend-public-navigation.patch
patches/frontend-admin-navigation.patch
patches/frontend-route-mount.patch
docs/upstream-conflict-playbook.md
```

解决后：

```bash
git add <已解决文件>
git commit
git push origin main
```

若尚未提交且合并方向不对，可取消本次合并：

```bash
git merge --abort
```

不要用 `git reset --hard` 清理不确定的工作区。随后回到外层装配、验证，并提交新的 submodule 指针。

## 本地改动阻止合并

平台接缝改动应提交到 Fork：

```bash
git -C core/new-api add <接缝文件>
git -C core/new-api commit -m "feat: add platform integration seams"
git -C core/new-api push origin main
```

临时实验改动才使用：

```bash
git -C core/new-api stash -u
```

## 首页入口与降低 core 冲突的方案

独立首页源码位于 `extensions/homepage/`。入口层应尽量放在 core 之外。

### 方案 A：Nginx / Caddy / 云负载均衡

```text
浏览器 :11115
  └── 入口层
       ├── /                  独立静态首页
       ├── /home-assets/*     CSS、JS、图片
       └── 其他路径           代理到 new-api 节点
```

优点：TLS、缓存、压缩、限流、真实 IP、WebSocket/流式响应与多节点健康检查成熟；core 无需修改首页路由。

适合：多节点、分布式、高可用、HTTPS 与公网生产环境。

### 方案 B：内置极简门户代理（不安装 Nginx/Caddy）

外层项目增加独立 Go 服务，仅使用标准库 `httputil.ReverseProxy`：

```text
浏览器 :11115
  └── extensions/gateway（独立进程）
       ├── /                  独立静态首页
       ├── /home-assets/*     CSS、JS、图片
       └── 其他路径           转发至 127.0.0.1:7000 的 new-api
```

优点：不安装额外 Web 服务，启动脚本可同时启动门户与 new-api；core 首页路由不需要改动，upstream 同步风险低。

限制：不适合承担分布式入口、TLS、复杂限流/缓存、健康检查和多节点负载均衡。未来走分布式时通常仍需入口层。

适合：单机、内网、开发与简单部署。

当前项目已采用方案 B。运行：

```bash
cd /home/jing/new-api-platform
./scripts/rebuild-and-start.sh
```

该脚本按 `core/new-api/.env` 中的 `PORT` 启动 `new-api`（默认 `7000`），并启动门户于 `:11115`。用户始终访问门户端口。门户脚本自动读取 `.env` 的端口并设置其上游地址；日常只需要修改门户端口：

```text
PLATFORM_GATEWAY_PORT=11115
```

`PLATFORM_GATEWAY_UPSTREAM` 和 `PLATFORM_HOMEPAGE_DIR` 是门户程序的底层高级配置。标准的 `rebuild-and-start.sh` 已分别自动设置为 `http://127.0.0.1:<core/.env PORT>` 和 `extensions/homepage`，通常不要手动设置。

在集群中，每个主/从节点均可运行同一门户版本；外部负载均衡器访问各节点的门户端口。门户不连接数据库或 Redis，不影响 `NODE_TYPE=master/slave` 的同步职责。

#### 门户与内部端口

默认端口分工：

```text
11115  门户对外监听端口，浏览器与负载均衡器访问此端口
7000   new-api 默认内部监听端口，仅由本机门户转发使用；实际值由 core/new-api/.env 的 PORT 决定
```

默认启动：

```bash
cd /home/jing/new-api-platform
./scripts/rebuild-and-start.sh
```

只修改门户对外端口，例如改为 `12000`：

```bash
PLATFORM_GATEWAY_PORT=12000 ./scripts/rebuild-and-start.sh
```

修改 new-api 内部端口时，只需编辑 `core/new-api/.env`：

```bash
sed -i 's/^PORT=.*/PORT=7100/' core/new-api/.env
./scripts/rebuild-and-start.sh
```

同时修改门户对外端口与 new-api 内部端口：

```bash
sed -i 's/^PORT=.*/PORT=7100/' core/new-api/.env
PLATFORM_GATEWAY_PORT=12000 ./scripts/rebuild-and-start.sh
```

`core/new-api/.env` 中的 `PORT` 是唯一的 new-api 内部端口来源。启动脚本会读取该值，并自动将门户代理转发到相同端口；不再使用 `NEW_API_INTERNAL_PORT`。

修改端口后必须先停止旧的启动进程，再重新运行 `./scripts/rebuild-and-start.sh`。内部端口只应绑定在可信网络/本机；用户和外部负载均衡器应始终访问门户端口。

### 当前原则

- 不要通过“系统设置 → 首页内容填充”嵌入同域首页 URL；会造成 iframe 递归或路由回退问题。
- 若要撤回全部首页 core 接缝，应先采用方案 A 或 B，再删除首页专用 core 修改。
- FAQ、更新日志及管理端继续通过 `extensions/` 装配，与首页入口方案独立。
