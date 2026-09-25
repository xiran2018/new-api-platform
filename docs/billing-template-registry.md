# 计费模板与高级媒体计费规则注册表

最后核对日期：2026-09-24。

本文件是计费功能的人工可读兼容合同。机器可读的完整合同位于
`extensions/frontend/model-prices/billing-template-registry.ts`。模板的代码结构、组件名称和
表达式写法以后可以重构，但本文件登记的业务能力、字段、编辑方式、展示方式和真实结算能力
不得在同步 upstream、解决冲突或重构时被删除。

## 登记与检查制度

新增、修改或删除任何计费模板时，必须在同一个提交中完成以下工作：

1. 在机器注册表中登记稳定 `key`、名称、用途、条件字段、价格字段、单位、编辑布局、管理端展示、
   客户端展示、运行时结算和兼容约束。
2. 更新本文件对应条目。模板可以改名，但稳定 `key` 不得复用；已有数据库数据仍引用旧结构时，
   不得直接删除旧 key 或旧表达式的解析能力。
3. 表达式模板必须加入 `PLATFORM_BILLING_PRESET_GROUPS`；高级媒体模板必须加入
   `BILLING_TEMPLATE_KEYS` 和 `createUsageRuleTemplate`。
4. 添加或更新回归测试，至少覆盖模板载入、可视化编辑、序列化、真实表达式执行、管理端展示、
   客户端展示，以及旧数据兼容。
5. 执行 `./scripts/assemble-extensions.sh`、`./scripts/verify-core-compatibility.sh` 和相关 Vitest/Go 测试。

自动检查会比较“实际模板 key”和“注册表 key”，并确认注册表里的每个 key 都登记在本文档。
因此只增加代码但不登记、只登记但不实现，都会导致同步或 CI 检查失败。

## 通用数据与结算约定

### 表达式计费变量

| 变量 | 含义 | 常用单位 |
| --- | --- | --- |
| `p` | 文本输入 Token | 每百万 Token |
| `c` | 文本输出 Token | 每百万 Token |
| `len` | 用于分档的输入长度 | Token |
| `cr` | 缓存读取 Token | 每百万 Token |
| `cc` / `cc1h` | 缓存写入 Token | 每百万 Token |
| `img` / `img_o` | 图片输入/输出 Token | 每百万图片 Token |
| `ai` / `ao` | 音频输入/输出 Token | 每百万音频 Token |
| `vid` / `vid_o` | 视频输入/输出 Token | 每百万视频 Token |
| `aud_s` | 音频时长 | 秒 |
| `param(path)` | 请求体字段 | 按字段类型判断 |
| `u(field)` | 高级媒体规则产生的 usage 数值 | 由收费项单位决定 |

表达式价格以系统内部美元基准存储；编辑器根据“定价货币”换算输入和显示。列表根据模型的
显示币种再次换算，并统一保留三位小数。零价字段不在客户端价格表显示，但仍可作为免费分支
保留在表达式中。

### 管理端与客户端共同约定

- 厂商原价和实际价格使用同一套模板解析与展示结构。
- 实际价格编辑区保留厂商原价、差值、优惠或加额提示；客户端不显示差值，加额不显示折扣标签。
- 客户端和管理端列表不得显示原始表达式、内部变量或匹配条件，例如 `param(...)`、`u(...)`。
- 思考/非思考属于同一输入档位时合并为一行；共享输入价格只显示一次。
- 表格只显示非零价格；旧数据包含不同图片/视频价格时不能为追求合并布局而丢弃其中一个值。
- 保存实际价格后必须写入 new-api 的运行时计费配置，不能只保存平台展示数据。

### 分段档位的动态兼容约束

- 所有按输入长度、数量、时间或其他连续条件分段的模板，档位数量都必须是动态的，不能把
  3 档当成数据结构上限。管理员可以在兜底档前增加档位，也可以删除已有档位；删除后仍必须
  保留至少一个可执行档位和最后一个无条件兜底档。
- 新增档位默认复制相邻档位的价格作为可编辑起点，并生成新的条件和稳定节点 ID；管理员可以
  修改条件上限、档位名称、输入价格以及思考/非思考输出价格。`128K`、`256K`、`1M` 等只
  是示例值，不能写死为模板能力。
- 已保存的三档、四档或更多档位表达式都必须继续被解析、编辑、序列化和真实执行。修改条件
  上限时，只能自动更新由系统生成的数字范围名称；管理员手动修改过的名称不得被覆盖。
- 通用表达式编辑器和共享输入/思考输出专用编辑器都必须提供“增加计价档位”操作；高级媒体
  计费规则使用同样的动态档位约束。任何新增模板或重构都要补充“增加、删除、修改上限、
  保存后执行”回归测试。

## 表达式模板注册表

### 分段与思考模板

| 稳定 key / 名称 | 功能和字段 | 编辑布局 | 管理端与客户端显示 | 真实结算和兼容要求 |
| --- | --- | --- | --- | --- |
| `input-length-tiers`<br>Input token range pricing | 按 `len` 分档；价格字段 `p`、`c` | 通用条件树；档位名称、长度上限、输入价、输出价可编辑 | 每个 Token 档位一行，只显示可读档位和价格 | 选择首个命中档位后按实际 `p/c` 结算；128K/256K 只是示例，不得固化 |
| `qwen-thinking-output`<br>Qwen input range and thinking output prices | 条件 `len`、`param(enable_thinking)`；价格 `p`、`c` | 每个长度档包含思考和非思考分支 | 同一长度档位合并一行，输出拆为非思考和思考两列 | 先按长度、再按请求思考开关结算；允许把开关字段改成渠道真实字段 |
| `shared-input-thinking-output`<br>Shared input + thinking output prices | 一个共享 `p`，两个分支 `c` | 专用三价格编辑器：共享输入、非思考输出、思考输出 | 单行显示，输入价格不重复 | 两分支结算都必须包含共享输入价 |
| `two-range-thinking-output`<br>Two input ranges + thinking output prices | 两个 `len` 档位；每档 `p/c` 与思考开关 | 通用可视化分支编辑器 | 每档一行，输出分成两个模式 | 最后一档为兜底；模型超上下文由上游处理，不在 core 增加模板专用拦截 |
| `three-range-thinking-output`<br>Three input ranges + thinking/non-thinking output prices | 多长度档位；每个分支各自有 `p/c` | 成对分支编辑器；档位上限、名称、价格可修改，档位可删除 | 列为 Token 范围、输入价格、非思考输出、思考输出 | 旧表达式必须持续可解析、显示和编辑 |
| `three-range-shared-input-thinking-output`<br>Three input ranges + shared input, thinking/non-thinking output prices | 每档只设置一次 `p`，思考/非思考分别设置 `c` | 专用表格；档位名称、上限、共享输入和两种输出；支持删档；上限显示 K/M 换算 | 每档一行，共享输入一列，两个输出子列 | `p` 必须序列化进两个分支的共享价格；至少保留一个档位；内部模式标签由编辑器维护 |

### 多模态模板

| 稳定 key / 名称 | 功能和字段 | 编辑布局 | 管理端与客户端显示 | 真实结算和兼容要求 |
| --- | --- | --- | --- | --- |
| `text-image-audio-split`<br>Text/image/audio split pricing | `p/c/img/img_o/ai/ao` 分别计价 | 通用 Token 价格字段网格 | 竖向显示所有非零模态价格 | 所有模态 usage 分别乘价求和；前后端及 Go 映射必须保留 |
| `audio-image-input-text-audio-output`<br>Audio/image input + text/audio output pricing | 音频输入 `ai`、图片输入 `img`、文本输出 `c`、音频输出 `ao` | 可视化四字段编辑器；截图中的价格仅为示例，可自由修改 | 管理端和客户端均为单行横向表格，顺序为输入音频、输入图片、输出文本、输出音频 | 使用现有 `ai/img/c/ao` 变量真实结算；不需要新增 Go usage 变量；不显示原始表达式 |
| `unified-multimodal-input-audio-output`<br>Unified text/image/video input + separate audio pricing | `p/c/img/vid/ai/ao`；按 `ao > 0` 分输出模式 | 文本输出与文本+音频输出两个可视化分支 | 显示可读输出模式，不显示 `ao` 条件 | `vid`、`ao` 必须参与真实结算 |
| `omni-output-modes`<br>Qwen3 Omni three output prices | 文本 `p`、音频 `ai`、图片 `img`、视频 `vid` 分别输入；纯文本 `c`、多模态文本 `c`、文本+音频 `ao` 三种输出 | 保留原模板，图片和视频输入可以分别编辑 | 单行六列分组表；旧图片/视频价格不同时在同一单元格分两行 | 先结算输入，再按 `ao` 和是否有多模态输入选择输出分支；旧 key 和标签不得删除 |
| `omni-shared-media-input-output-modes`<br>Qwen3 Omni shared image/video input + three output prices | 文本、音频、图片/视频共享输入；三种输出 | 专用六列表格；图片/视频只填一次，自动同时写入 `img`、`vid` | 与原 Omni 模板相同的单行六列表格 | 必须保持 img/vid 双写、shared marker 识别及真实计费；不能覆盖原模板 |
| `shared-text-image-input-audio-output-modes`<br>Shared text/image/video input + audio input + multimodal/audio output pricing | 文本 `p`、图片 `img`、视频 `vid` 共用一个输入单价；音频输入 `ai` 单独计价；多模态文本输出 `c` 与文本+音频输出 `ao` 分支计价 | 专用共享输入 + 输出分支编辑器；共享输入字段只填写一次 | 输入价格区和输出分支区分组显示，不重复输入共享价格；仅显示非零价格 | 序列化为共享输入前缀加 `ao > 0` 输出分支；保存时共享输入分别写入 `p/img/vid`，必须保持真实结算和模板 key 兼容 |
| `live-translation-multimodal`<br>Live translation multimodal token pricing | `p/c/img/ai/ao` | 通用 Token 字段网格 | 只显示非零模态价格 | 各模态 usage 分别结算；零价字段允许存在但不展示 |
| `audio-transcription-per-second`<br>Audio transcription per second | `aud_s` | 音频时长价格字段，单位紧邻输入框 | 显示按秒价格，不显示内部变量名 | 前端变量、Go 编译绑定、运行时绑定和结算 usage 映射都必须保留 |

## 高级媒体计费规则注册表

高级媒体计费规则与按 Token、按次、按表达式并列。规则数据结构是：

- `UsageRuleSet.version = 1`；`execution` 为 `request` 或 `task`。
- 每个档位包含可编辑名称、零到多个匹配条件和至少一个收费项。
- 除最后一档外，每档必须有条件；最后一档必须是无条件兜底。
- 条件运算符包括 `=、!=、<、≤、>、≥`。布尔值使用启用/禁用下拉；分辨率使用数字加
  `DPI/K/P` 单位下拉；schema 枚举使用下拉，减少错误输入。
- 收费项由 meter、单位、价格组成。可选单位包括次、张、个、音色、字符、千字符、万字符、
  秒、分钟、小时、百万 Token、计费点；系统用 `divisor` 换算后生成 `u(field)` 结算表达式。
- 档位、条件和收费项均可增删；价格不得为负数。厂商原价和实际价格都使用该编辑器，并显示
  厂商价格、差值、优惠或加额后的预览。

| 稳定 key / 名称 | 默认条件字段 | 默认收费字段和单位 | 默认布局与用途 | 真实结算和兼容要求 |
| --- | --- | --- | --- | --- |
| `image`<br>Output image resolution (1K/2K) | `resolution_tier` | `input_images`、`output_images` / 张 | 分辨率档位；同时支持参考图输入和生成图输出 | 数字 + DPI/K/P 下拉；1K/2K 只是模板示例 |
| `outputImageCount`<br>Generated output images per image | 无 | 普通图片接口使用 `image_count` / 张；异步任务可使用 `output_images` | 单档位统一设置每张生成图片价格 | 普通图片接口按请求 `n` 预扣、按实际返回图片张数结算；不得退化为按请求次数计费 |
| `boolean`<br>Boolean request option | `prompt_extend` | `request` / 次 | 开启条件档 + 关闭兜底档 | 布尔值必须使用启用/禁用下拉，可换成其他 schema 布尔字段 |
| `volume`<br>Generated image quantity tiers | 普通图片接口 `image_count`；异步任务 `output_images` | 对应图片数量 / 张 | 多个数量区间阶梯价 | 阈值和档位数可编辑；普通图片接口必须按原生 `image_count` 真实结算，旧 `output_images` 数据继续兼容 |
| `video`<br>Output video resolution and duration | `resolution` | `seconds` / 秒、分钟、小时 | 按视频输出分辨率设置时长价 | 明确分辨率属于输出视频；按真实秒数和 divisor 结算 |
| `videoAudio`<br>Video resolution, duration and audio switch | `resolution`、`audio` | `seconds` / 秒、分钟、小时 | 分辨率与有声/无声组合档位 | 同档所有条件同时匹配；有声档应在无声兜底前 |
| `videoMode`<br>Video output mode and duration | `mode` | `seconds` / 秒、分钟、小时 | 标准/专业等模式的时长价格 | `wan-std` 只是示例，允许新增任意模式 |
| `imageVideo`<br>Input image and output video | `mode`、`resolution` | `input_images` / 张；`seconds` / 时长 | 输入图片与输出视频混合计价 | 界面和显示必须明确输入/输出方向 |
| `audioSeconds`<br>Audio duration pricing | 无 | `seconds` / 秒、分钟、小时 | 音频、音乐、语音时长价 | 单位紧邻“音频时长计费”显示 |
| `ttsCharacters`<br>Text-to-speech per 10K characters | 无 | `tts_input_characters`、`tts_output_characters` / 字符、千字符、万字符 | 同档录入 TTS 输入和输出字符价 | 输出允许为 0 或非零；客户端不显示内部变量名；不得产生重复音频输入价格 |
| `voiceCount`<br>Voice enrollment count | 无 | `count` / 音色、个 | 音色注册或声音复刻数量价 | 客户端使用业务名称“音色数量”，不显示 `count` |
| `taskMatrix`<br>Task type and output specification matrix | `task_type`、`output_spec` | `request` / 次 | 任务类型 × 输出规格组合矩阵 | 优先使用 usage schema 枚举；默认 3D 组合只是示例 |
| `blank`<br>Blank rule | 自定义 | 默认 `request` / 次，可改为 schema 数值字段 | 从空白档位创建任意规则 | 必须保持“最后一档无条件、前置档有条件、价格非负”的校验 |

## 编辑器布局合同

高级媒体规则卡片必须保留以下层次，具体 CSS 和组件可以更换：

1. 顶部显示“高级媒体计费规则”、用途说明、计费模板下拉和同步/异步结算提示。
2. 每个档位顶部包含可编辑档位名称、档位序号或兜底标识、删除档位操作。
3. 非兜底档显示“全部条件同时匹配”区域：字段下拉、运算符下拉、值编辑器和删除条件操作。
4. “本档收费项”区域包含收费字段下拉、单位下拉、价格输入、厂商原价/差值和删除收费项操作。
5. 支持添加条件、添加收费项、添加档位；至少保留一个档位和每档一个收费项。
6. 模板选择后立即载入内容，不要求再点击“载入模板”。厂商原价与实际价格间的一键同步必须
   同步模板、币种、档位、条件、收费字段、单位和价格，而不是只复制数值。

## 存储、展示与真实计费链路

1. 编辑器把高级媒体规则保存为 `PriceBlock.usageRuleSet`，同时用 `usageRuleSetExpression` 生成
   可执行表达式；表达式按规则顺序构造条件链，最后一档作为兜底。
2. 同步请求使用请求体字段和解析得到的 usage；异步任务使用渠道 `billing_usage_schema` 提供的
   字段。只有渠道能够上报的 meter 才能可靠进行真实结算。
3. 表达式模板和高级媒体规则保存实际价格时，必须通过 new-api 运行时价格 API 写入真实计费配置；
   平台数据库中的厂商价格、描述、备注和展示结构不能代替运行时价格。
4. 管理端模型价格列表和客户端模型价格页面都通过公共价格渲染器显示；不得出现“编辑器能保存，
   但列表无法显示”或“列表能显示，但实际结算仍用旧价格”的分叉。

## 原厂价格比较的稳定性合同

“实际价格”输入框旁的原厂价格和差值属于跨模板兼容能力，不得依赖某个模板当前的数组布局。
完整问题记录、根因、禁止回退项和测试矩阵见
[`vendor-price-sync-regression.md`](vendor-price-sync-regression.md)。
历史上反复出现“原厂价格已保存但提示未设置”，根因是比较逻辑只读取第一个价格块、要求档位
名称完全相同，或按高级媒体规则的数组下标匹配。后续实现和上游同步必须遵守：

1. 普通、按次和表达式价格必须扫描全部 `PriceSpec.blocks`；每个表达式块必须独立解析，禁止把
   多个完整表达式直接拼接后解析。
2. 表达式价格必须优先按可视化规则的稳定结构路径和变量（如 `p`、`c`、`aud_s`、`fixed`）
   精确匹配，不能只依赖可修改且可能重复的档位名称，也不能使用会随价格文本长度变化的源码
   位置。结构路径不可用时再按规范化后的档位名称匹配；档位改名后，仅当该变量在全部原厂价格
   中只有一个唯一数值时才允许回退。存在多个不同价格时必须提示无法确定，禁止猜测并显示错误
   价格。
3. 高级媒体计费规则禁止按 `rules[ruleIndex]` 配对。必须按结算方式、条件字段/运算符/值、档位
   名称以及收费项的 meter/unit 语义匹配；增删、改名或重排档位后仍应找到正确原厂价格。
4. 高级规则无法精确匹配时，也只能在相同 meter/unit 具有唯一价格时安全回退；多个候选价格
   必须保持“原厂价格未设置/无法确定”，不能拿其他档位的价格进行比较。
5. 保存表达式时，`baseExpression` 是该块的权威原厂价格来源；同一块遗留的规范化字段不得覆盖
   表达式中的价格。有效的 `usageRuleSet` 可以位于任意价格块，不能只读取第一个块。
6. 修改比较算法时必须保留回归测试：非首块价格、多表达式块、档位改名、同名档位按结构路径
   区分、多个候选拒绝猜测、高级规则重排、跨 request/task 拒绝比较。兼容性脚本失败时不得
   通过删除测试绕过。
7. `note` 只有通过表达式编译后才可作为表达式。来源网址、说明文字和其他元数据必须回退读取
   当前价格块的结构化字段，不能因为 `note` 非空就跳过 `input/output/cache`。
8. 公共比较组件必须用 `fieldKey` 接收变量名。禁止把变量名直接放进 React 保留属性 `key`，
   因为 React 不会将该属性传入组件。
9. 所有专用可视化模板（包括 Omni、共享输入思考输出及动态多档位编辑器）的每一个价格输入框
   都必须接入 `PricingFieldAddon`，并提供变量、档位名称和稳定 `scopeId`。
10. 一键同步后的比较基线必须根据真正载入编辑器的草稿重新生成；旧格式价格、仅 `note` 表达式、
    模板转换后的表达式都必须立即显示原厂价格和差价。

## 上游同步后的必检项目

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

涉及 Go 表达式变量或 usage 映射时还要执行：

```bash
cd core/new-api
GOCACHE=/tmp/new-api-go-cache go test ./pkg/billingexpr ./service
```

检查失败时不得提交新的 core 子模块指针。禁止通过删除注册表条目、降低断言或跳过测试来“解决”
上游同步冲突；应恢复对应能力，或者在确认产品不再需要后进行有数据库迁移和兼容方案的显式变更。
