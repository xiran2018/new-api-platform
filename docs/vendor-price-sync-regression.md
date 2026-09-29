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
11. 厂商原价采用高级媒体计费规则时，一键同步曾只把规则生成的 `billingExpr` 写入实际价格草稿，
    没有把 `usageRuleSet` 和高级媒体模式一起同步。因此实际价格页错误切换为“计费表达式”，且
    “输出视频分辨率与时长计价”等模板的档位、条件、单位和原厂价格没有载入。

## 2026-09-29：高级媒体同步降级为表达式、规则数据丢失回归

### 用户现象

厂商原价选择“高级媒体计费规则”中的“输出视频分辨率与时长计价”并保存后，在实际价格页点击
“一键同步原厂价格”，页面错误选择“计费表达式”，而不是“高级媒体计费规则”；原厂规则中的
视频分辨率档位、时长价格、单位和其他结构化数据也没有同步到实际价格。

### 根因与修复约束

高级媒体价格同时包含可执行的 `billingExpr` 和用于可视化编辑、比较、再次保存的
`usageRuleSet`。只同步表达式虽然可能暂时保留部分运行时计算结果，但会丢失模板身份和结构化字段，
导致页面无法按原模板编辑，后续保存还可能覆盖正确规则。

以后必须遵守：

1. 同步入口统一通过 `resolveVendorPriceSync` 识别原厂价格中的有效 `usageRuleSet`。
2. 找到高级媒体规则时，同步结果必须同时返回规则生成的草稿和完整 `usageRuleSet`；界面必须据此
   开启高级媒体模式并选中匹配模板，不能回退到普通表达式编辑器。
3. 必须深拷贝规则。同步后应完整保留 `execution`、档位顺序和名称、全部条件，以及收费项的
   `meter`、`unit`、`price`、`divisor`，同时保证实际价格编辑不会反向修改厂商原价对象。
4. 判断同步成功不能只检查 `billingExpr` 非空；必须验证实际价格页面的模式、模板和每个结构化
   字段均与厂商原价一致。
5. 新增高级媒体模板、修改规则序列化或重构一键同步时，都必须复用同一同步入口，并将新模板加入
   模式保持和全字段复制的回归测试。

固定测试为 `runtime-pricing-editor.test.ts` 中的
`keeps an output-video usage rule as advanced pricing and copies all rule data`。该测试同时检查模式保持、
完整数据同步和深拷贝，禁止在同步上游或重构时删除或降低断言。

## 2026-09-28：新增模板保存为空、同步失败回归

### 用户现象

新增以下模板后，管理员填写价格并点击保存，接口可能返回 HTTP 200，但数据库中的
`vendorPriceSpec.blocks[].baseExpression` 和 `note` 变成空字符串。随后重新打开编辑框时模板选择丢失，
“一键同步原厂价格”也无法找到可同步的价格：

- `Audio input + audio output token pricing`
- `Audio input + text output token pricing`

### 根因

`TieredPricingEditor.applyPreset()` 会在同一个事件中连续调用：

1. `onBillingExprChange(preset.expr)`；
2. `onRequestRuleExprChange(rules)`。

如果这两个回调分别通过 React 渲染闭包中的旧 `expression.billingExpr` 和旧
`expression.requestRuleExpr` 组合表达式，第二次回调读取的仍是选择模板前的旧值（通常为空），
就会把第一次写入的完整模板覆盖为空。接口保存成功只代表请求成功，不代表表达式内容正确。

### 不可回退的实现约束

1. 任何同时编辑计费表达式和请求规则的模板，必须通过
   `createBillingExpressionDraft()` / `updateBillingExpressionDraft()` 或等价的共享草稿机制；
   禁止在两个回调中直接引用渲染闭包里的旧 `expression`。
2. 连续更新必须始终基于同一份最新草稿重新执行 `combineBillingExpr()`，不能让第二个回调覆盖第一个回调。
3. 保存前必须读取最新编辑快照，而不是仅依赖可能尚未完成更新的 React state。
4. 表达式模式下，若不是高级媒体规则且所有 block 的计费表达式都为空，必须阻止保存并提示错误，
   不能返回“保存成功”。
5. 新模板至少要有“选择模板 → 连续更新两个字段 → 保存 → 重新打开 → 同步到实际价格”的回归测试。
6. 新模板不能只测试页面显示；必须确认最终写入 `billing_setting.billing_mode` 和
   `billing_setting.billing_expr` 的内容与模板表达式一致。

### 自动防回归测试

`expression-draft.test.ts` 覆盖了两个音频模板以及“已有请求规则、替换计费表达式”的场景。
`runtime-pricing-editor.test.ts` 覆盖已保存的两个模板可以同步到实际计费表达式且表达式不变。
新增模板时，应将模板加入参数化测试，避免只修复某一个模板而遗漏其他模板。

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
5. 一键同步必须同时同步高级媒体模式和完整 `usageRuleSet`，不得只同步由规则生成的表达式。
6. 同步的规则必须是深拷贝，实际价格后续编辑不能修改厂商原价中的档位、条件或收费项。

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
- 输出视频分辨率与时长规则同步后仍为高级媒体计费，且完整复制档位、条件、单位、除数和价格；
- 高级媒体同步结果与厂商规则内容相等但引用独立，避免实际价格编辑污染厂商原价。

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
