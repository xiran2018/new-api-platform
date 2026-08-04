使用的数据库是postgresql://root:123456@localhost:5432，如果有需要新建立一个数据库，不要使用new-api数据库。

需要注意修改时只允许修改/home/jing/new-api-platform目录，不要修改其他的目录


页面添加的文本需要按照选择语言版本替换为对应的语言。

## 平台扩展约束

- 原有 new-api 数据库继续使用 `SQL_DSN=postgresql://root:123456@localhost:5432/new-api`。
- 所有平台新增数据只能使用 `PLATFORM_DATABASE_URL=postgresql://root:123456@localhost:5432/platform_db?sslmode=disable`，不得写入 new-api 数据库。
- 前端新增文本必须补齐 `web/src/i18n/locales/` 的全部现有语言。
- 平台业务代码放在 `extensions/`；运行 `scripts/assemble-extensions.sh` 后生成到被忽略的 core 目录。
- 更新 upstream 前后均使用 `scripts/sync-upstream.sh`，不要手改 `routeTree.gen.ts`。
- 发生 upstream 冲突时必须遵循 `docs/upstream-conflict-playbook.md`，仅在文档列出的接缝内保留平台代码并完成验证。
