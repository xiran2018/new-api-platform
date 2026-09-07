# 模型价格架构

## 唯一计费权威

真实扣费继续使用 new-api 的 `new-api` 数据库和现有 Option：

- `ModelPrice`：按请求计费。
- `ModelRatio`、`CompletionRatio`、`CacheRatio`、`CreateCacheRatio`、`ImageRatio`、`AudioRatio`、`AudioCompletionRatio`：按 Token/模态计费。
- `billing_setting.billing_mode`、`billing_setting.billing_expr`：表达式、分段、分时和复杂任务计费。

“模型价格管理”复用 upstream 的 `ModelPricingEditorPanel` 及 `/api/option/model_pricing` 保存接口。该接口带版本校验，可阻止并发编辑静默覆盖。因此在新页面保存 LLMAPI 价格后，计费立即生效；原有 `/system-settings/billing/model-pricing` 和 `/models/metadata` 也会读到相同结果。

## 展示与比较数据

`platform_db.model_price_catalogs` 只负责公开价格目录：厂商、标签、厂商原价、同步候选价格、发布状态、排序和 LLMAPI 公开价格快照。它不是第二套计费引擎。

- 厂商价格允许 Token、按次、分时、分段和自定义表格等结构化展示。
- LLMAPI 公开价格快照在实际计费保存成功后更新。
- 上游同步先写入候选厂商价格；管理员确认后才覆盖厂商原价。
- 公开页只读取已发布记录，不读取敏感运行时配置。

## 两个原有页面的定位

- `/system-settings/billing/model-pricing` 是完整的批量运行时价格管理与上游同步入口。
- `/models/metadata` 主要管理模型名称、厂商、标签、端点等元数据；其中价格抽屉最终也更新同一组 Option。
- `/platform/model-prices` 提供“原厂价、销售价、差距、公开展示”统一工作流，但不复制计费公式解释器。

## Upstream 同步注意事项

升级 core 后重点验证以下导入契约：

1. `ModelPricingEditorPanel` 和 `ModelPricingEditorPanelHandle` 是否仍从 `model-pricing-sheet.tsx` 导出。
2. `getModelPricing`、`saveModelPricing` 的请求与响应结构是否变化。
3. Option 字段集合是否新增计费倍率或表达式字段。
4. `combineBillingExpr` 是否仍是表达式合并的官方入口。

不要把 upstream 计费编辑器复制到 `extensions/`。如接口变化，只修改价格页的适配器 `runtime-pricing-editor.tsx`。
