# 原厂价格同步与比较回归记录

状态：已修复并纳入自动兼容性检查  
记录日期：2026-09-24

## 用户可见问题

在模型价格管理中点击“一键同步原厂价格”后，原厂价格已经写入并显示在价格输入框中，
但“实际价格”输入框旁仍可能提示“原厂价格未设置”，导致管理员无法确认原厂价格和差值。

这不是同步按钮本身失败，而是同步后的原厂价格数据与输入框比较插件之间匹配失败。以后如果
再次出现“输入框已有原厂数值，但旁边提示未设置”，必须按本文检查比较链路，不能通过隐藏提示、
写死默认价格或把空值当成 `0` 来绕过。

## 已确认的历史根因

1. 只读取 `PriceSpec.blocks[0]`，原厂价格位于后续价格块时无法找到。
2. 把多个完整表达式拼接后统一解析，产生无效表达式并丢失本来有效的价格。
3. 仅使用可修改的档位名称匹配；档位重命名、重复名称或名称格式变化时匹配失败。
4. 只使用表达式源码位置作为标识；价格文本长度变化后位置会变化，重新打开编辑器时不稳定。
5. 高级媒体计费规则按数组下标匹配；增删、重排或改名档位后会匹配失败或匹配到错误价格。
6. 有效 `usageRuleSet` 位于非首个价格块时没有被读取。
7. `null`、空字符串等未设置值被错误转换成数值 `0`，掩盖真实的数据缺失。
8. 把价格块中的全部 `note` 都当成计费表达式；当 `note` 实际是 `https://models.dev/api.json`
   等来源网址或说明文字时，解析失败后跳过了同一块中的 `input/output/cache` 结构化价格。
9. 比较扩展把变量名通过 React 保留属性 `key` 传给组件。React 不会把 `key` 放入组件 props，
   导致比较器实际收不到 `p`、`c`、`aud_s`、`fixed` 等字段名。
10. 后来增加的 Omni、共享输入 + 思考/非思考输出等专用编辑器直接使用价格输入框，绕过了
    公共 `PricingFieldAddon`，因此这些模板没有原厂价格与差价提示。

## 厂商下拉菜单保存回归

模型价格管理中的“厂商”是管理员可编辑字段。保存后，管理员列表会再次执行模型与渠道元数据同步；同步只能为新记录推导厂商，不能覆盖数据库中已经保存的厂商。

实现约束如下：

1. 同步读取已有记录的 `vendor`，并优先使用已保存值。
2. `OnConflict` 更新模型元数据时不得更新 `vendor`。
3. 修改厂商后必须验证 PUT 保存、列表刷新和再次打开编辑框均返回新值。
4. `scripts/verify-core-compatibility.sh` 必须检查 `storedVendors` 和不含 `vendor` 的元数据更新列。

这样可以避免选择新厂商后重新打开又恢复为 `Other` 或渠道推导值。

## 不可回退的功能合同

### 普通、按次和表达式价格

1. 扫描全部 `PriceSpec.blocks`，每个表达式块独立解析。
2. 表达式块以 `baseExpression` 为权威来源；同一块中的旧规范化字段不能覆盖表达式价格。
3. 输入框与原厂价格的首选匹配键为：
   - 价格变量，如 `p`、`c`、`cr`、`cc`、`aud_s`、`fixed`；
   - 可视化规则的稳定结构路径；
   - 规范化后的档位名称。
4. 结构路径和档位名称必须共同校验。路径因增删档位而过期时，不能覆盖名称明确匹配到的价格。
5. 没有结构路径时允许按规范化档位名称匹配；档位改名后，仅在该变量只有一个唯一原厂价格时
   才允许安全回退。
6. 同一变量存在多个不同候选价格而又不能唯一定位时，必须显示“原厂价格未设置/无法确定”，
   禁止猜测或显示其他档位价格。
7. 点击“一键同步原厂价格”后，所有由同步表达式载入的价格输入框都必须能立即找到对应原厂价格；
   保存、刷新并重新打开编辑器后仍应成立。
8. `note` 只有在通过计费表达式编译后才可作为表达式；网址和普通说明必须继续读取所在价格块的
   结构化字段。一键同步后的比较基线必须从真正载入编辑器的草稿重新生成。
9. 所有价格输入框，包括专用模板，都必须经过 `PricingFieldAddon`。字段名必须使用普通属性
   `fieldKey` 传给组件，再由组件转换为比较器的 `key`；禁止直接使用 React 保留属性 `key`。
10. 专用模板必须同时传递变量、档位名称和稳定结构路径 `scopeId`。新增模板不能只裸用
    `PricingAmountInput` 而遗漏原厂价格比较插件。

### 高级媒体计费规则

1. 遍历全部价格块寻找与表达式元数据一致的 `usageRuleSet`。
2. 按结算方式、条件字段、运算符、条件值、档位名称、meter 和 unit 进行语义匹配，禁止使用
   `rules[ruleIndex]` 等数组位置配对。
3. 档位重排、改名或增删后，只能在 meter/unit 候选价格唯一时回退；候选冲突时不得猜测。
4. request 结算规则不能与 task-settlement 规则互相比较。

## 必须保留的自动测试

`runtime-pricing-editor.test.ts` 至少覆盖：

- 非首个价格块中的规范化价格；
- 多个表达式块分别解析；
- 共享输入价格；
- 档位改名后的唯一价格回退；
- 多个不同候选价格时拒绝猜测；
- 同名档位通过稳定结构路径分别匹配；
- 过期结构路径不能覆盖正确的档位名称；
- 每个已注册表达式模板都至少能解析出价格；
- 一键同步载入的每一个价格字段都能找到原厂价格。
- `note` 为来源 URL 时回退到结构化价格，`note` 为合法表达式时仍能比较；
- 一键同步生成的规范化比较基线可覆盖旧 Token/按次价格和仅 `note` 表达式；
- Omni、共享输入 + 思考输出、共享输入多档位等专用编辑器的每个价格输入框都收到正确变量和
  稳定 `scopeId`；
- `PricingFieldAddon` 的渲染器能收到真实字段名，防止 React 保留 `key` 属性再次丢失变量。

`usage-rule-builder.test.ts` 至少覆盖：

- 高级规则重排后仍按语义匹配；
- 档位改名后的唯一 meter/unit 回退；
- 多候选时拒绝错误匹配；
- request/task 结算方式不一致时拒绝比较；
- 有效 `usageRuleSet` 位于第二个或后续价格块。

## 修改或同步上游后的检查步骤

```bash
./scripts/assemble-extensions.sh
./scripts/verify-core-compatibility.sh

cd core/new-api/web
BUN_TMPDIR=/data/new-api-tmp bun run typecheck
BUN_TMPDIR=/data/new-api-tmp bunx vitest run \
  src/platform/model-prices/price-renderer.test.tsx \
  src/platform/admin-pages/model-prices/runtime-pricing-editor.test.ts \
  src/platform/admin-pages/model-prices/usage-rule-builder.test.ts \
  src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx
```

任何一步失败，都不能提交新的 core 子模块指针，也不能通过删除测试、降低断言或隐藏
“原厂价格未设置”提示来通过检查。

## 相关实现文件

- `extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.tsx`
- `extensions/frontend/admin-pages/model-prices/runtime-pricing-editor.test.ts`
- `extensions/frontend/admin-pages/model-prices/usage-rule-builder.tsx`
- `extensions/frontend/admin-pages/model-prices/usage-rule-builder.test.ts`
- `extensions/frontend/model-prices/pricing-field-addon.tsx`
- `extensions/frontend/model-prices/visual-billing-document-editor.tsx`
- `core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx`
- `core/new-api/web/src/features/system-settings/models/__tests__/visual-billing-editor.test.tsx`
- `core/new-api/web/src/features/system-settings/models/tier-price-fields.tsx`
- `core/new-api/web/src/features/system-settings/models/visual-billing-document-editor.tsx`
- `scripts/verify-core-compatibility.sh`

后续允许重构实现、调整界面和改变模板布局，但以上用户能力和匹配安全原则不能删除或弱化。
