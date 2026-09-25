/**
 * Stable billing-template registry.
 *
 * This is a product compatibility contract, not UI copy. A template may be
 * reimplemented, but its documented fields, editing workflow, display shape,
 * and runtime settlement behavior must not disappear during an upstream sync.
 * Keep docs/billing-template-registry.md in sync with every change.
 */

export type BillingTemplateLayoutContract = {
  editor: string
  managementDisplay: string
  publicDisplay: string
}

export type ExpressionTemplateContract = {
  key: string
  name: string
  group: 'tiered' | 'multimodal'
  purpose: string
  conditionFields: readonly string[]
  priceFields: readonly string[]
  unit: string
  layout: BillingTemplateLayoutContract
  runtime: string
  compatibility: string
}

export type AdvancedMediaTemplateContract = {
  key: string
  name: string
  purpose: string
  execution: 'request-or-task'
  conditionFields: readonly string[]
  chargeMeters: readonly string[]
  units: readonly string[]
  defaultTiers: string
  layout: BillingTemplateLayoutContract
  runtime: string
  compatibility: string
}

export const EXPRESSION_TEMPLATE_REGISTRY = [
  {
    key: 'input-length-tiers',
    name: 'Input token range pricing',
    group: 'tiered',
    purpose: '按输入 Token 长度划分多个输入、输出价格档位。',
    conditionFields: ['len'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor: '通用可视化条件树；档位名称、长度上限、输入价和输出价可编辑。',
      managementDisplay: '每个 Token 档位一行，显示输入价格和输出价格。',
      publicDisplay: '隐藏表达式源码，按档位表格展示非零价格。',
    },
    runtime: '使用实际输入长度 len 选择首个命中档位，再按 p、c 结算。',
    compatibility:
      '档位边界和示例名称可以修改；不得把示例 128K、256K 固化为不可编辑业务限制。',
  },
  {
    key: 'qwen-thinking-output',
    name: 'Qwen input range and thinking output prices',
    group: 'tiered',
    purpose: '按输入长度和 enable_thinking 开关分别设置思考、非思考价格。',
    conditionFields: ['len', 'param(enable_thinking)'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor: '可视化条件树；输入长度分支下包含思考与非思考两个子分支。',
      managementDisplay: '同一长度档位合并成一行，输出拆为非思考、思考两列。',
      publicDisplay: '同一长度档位合并成一行，不显示请求条件表达式。',
    },
    runtime: '先按 len 分档，再读取请求体 enable_thinking，最终按 p、c 结算。',
    compatibility:
      '渠道若使用其他思考字段，必须允许在条件编辑器中改成真实字段。',
  },
  {
    key: 'shared-input-thinking-output',
    name: 'Shared input + thinking output prices',
    group: 'tiered',
    purpose: '所有请求共用一个输入价，思考和非思考输出价分别设置。',
    conditionFields: ['param(enable_thinking)'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor:
        '专用共享输入编辑器：一个输入价格、一个非思考输出价格、一个思考输出价格。',
      managementDisplay: '一行显示共享输入价和两种输出价。',
      publicDisplay: '一行显示共享输入价和两种输出价，不重复输入价。',
    },
    runtime: 'p 位于共享价格区，c 根据 enable_thinking 分支选择。',
    compatibility:
      '共享输入价只能保存一次，但两个分支的真实结算结果都必须包含它。',
  },
  {
    key: 'two-range-thinking-output',
    name: 'Two input ranges + thinking output prices',
    group: 'tiered',
    purpose: '两个输入长度档位分别设置输入价及思考、非思考输出价。',
    conditionFields: ['len', 'param(enable_thinking)'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor: '可视化条件树；每个长度档位包含思考和非思考分支。',
      managementDisplay: '每个长度档位一行，输出拆为非思考、思考两列。',
      publicDisplay: '每个长度档位一行，隐藏原始表达式。',
    },
    runtime: '按 len 和 enable_thinking 组合选择价格。',
    compatibility:
      '最后分支是兜底档位；模型自身的上下文限制由模型或上游返回错误。',
  },
  {
    key: 'three-range-thinking-output',
    name: 'Three input ranges + thinking/non-thinking output prices',
    group: 'tiered',
    purpose: '多个输入长度档位分别维护输入价、非思考输出价和思考输出价。',
    conditionFields: ['len', 'param(enable_thinking)'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor:
        '成对分支编辑器；档位上限、档位名称和两种模式价格可修改，档位可删除。',
      managementDisplay: '列为 Token 范围、输入价格、非思考输出、思考输出。',
      publicDisplay: '同档位思考/非思考价格合并到同一行。',
    },
    runtime: '按 len 选择档位，再按 enable_thinking 选择该档输出价。',
    compatibility: '旧数据即使模板结构重构，也必须继续解析、显示和编辑。',
  },
  {
    key: 'three-range-shared-input-thinking-output',
    name: 'Three input ranges + shared input, thinking/non-thinking output prices',
    group: 'tiered',
    purpose: '每个长度档位只填写一次输入价，输出按思考和非思考分别定价。',
    conditionFields: ['len', 'param(enable_thinking)'],
    priceFields: ['p', 'c'],
    unit: '每百万 Token',
    layout: {
      editor:
        '专用共享输入档位编辑器；每行是档位名称、上限、共享输入价、非思考输出价、思考输出价。',
      managementDisplay: '每个 Token 档位一行，输入价只显示一次。',
      publicDisplay: '每个 Token 档位一行，输出价格使用两个子列。',
    },
    runtime:
      '每档 p 作为两个思考分支的 sharedPrices，c 按 enable_thinking 分支结算。',
    compatibility:
      '档位可删除且至少保留一个；上限旁显示 K/M 换算；内部 thinking 标签由编辑器维护。',
  },
  {
    key: 'text-image-audio-split',
    name: 'Text/image/audio split pricing',
    group: 'multimodal',
    purpose: '文本、图片和音频的输入、输出 Token 分别计价。',
    conditionFields: [],
    priceFields: ['p', 'c', 'img', 'img_o', 'ai', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '通用 Token 价格字段网格。',
      managementDisplay: '竖向列出所有已启用且非零的模态价格。',
      publicDisplay: '只展示非零价格，不展示变量名或表达式。',
    },
    runtime: '按各模态实际 usage 数量分别乘以对应单价后求和。',
    compatibility:
      '图片输出 img_o、音频输入 ai、音频输出 ao 的前后端变量和结算映射必须保留。',
  },
  {
    key: 'audio-image-input-text-audio-output',
    name: 'Audio/image input + text/audio output pricing',
    group: 'multimodal',
    purpose:
      '音频输入、图片输入、文本输出和音频输出分别计价；输入字段在前，输出字段在后。',
    conditionFields: [],
    priceFields: ['ai', 'img', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '可视化四字段编辑器；音频输入、图片输入、文本输出、音频输出均可独立填写。',
      managementDisplay:
        '单行横向显示，顺序固定为音频输入、图片输入、文本输出、音频输出；保留原厂价格和差值。',
      publicDisplay:
        '单行横向显示，输入价格在前、输出价格在后，不显示表达式或内部变量。',
    },
    runtime:
      '按 ai、img、c、ao 对应的实际 usage 数量分别乘以单价后求和。',
    compatibility:
      '使用现有 ai/img/c/ao 变量和表达式结算，不改变后端协议；截图中的价格只是示例，不能固化到模板。',
  },
  {
    key: 'unified-multimodal-input-audio-output',
    name: 'Unified text/image/video input + separate audio pricing',
    group: 'multimodal',
    purpose:
      '文本、图片、视频共享多模态输入结构，音频输入及文本/音频输出分别定价。',
    conditionFields: ['ao > 0'],
    priceFields: ['p', 'c', 'img', 'vid', 'ai', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '可视化分支编辑器；文本输出和文本+音频输出为两个分支。',
      managementDisplay: '按输出模式分组展示各输入和输出价格。',
      publicDisplay: '展示人类可读的输出模式，不显示 ao 条件表达式。',
    },
    runtime: 'ao 大于 0 时使用文本+音频输出分支，否则使用文本输出分支。',
    compatibility: '视频输入 vid 和音频输出 ao 必须参与真实计费。',
  },
  {
    key: 'shared-text-image-input-audio-output-modes',
    name: 'Shared text/image/video input + audio input + multimodal/audio output pricing',
    group: 'multimodal',
    purpose:
      '文本、图片、视频共用一个输入价格，音频输入单独计价；输出分为多模态文本和仅音频计费的文本+音频两种模式。',
    conditionFields: ['ao > 0'],
    priceFields: ['p+img+vid', 'ai', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '专用四字段可视化编辑器；文本/图片/视频共用输入价格，音频输入、 多模态文本输出和文本+音频输出分别填写。',
      managementDisplay:
        '单行四列横向显示，顺序为文本/图片/视频输入、音频输入、文本输出（多模态输入）、文本+音频输出（仅音频计费）。',
      publicDisplay:
        '与管理端相同的单行四列分组表，输入列在前、输出列在后，不显示表达式源码或内部变量名。',
    },
    runtime:
      '保存时共享输入价格同时写入 p、img、vid；按 ai 计音频输入，ao 大于 0 的请求按音频输出计费，否则按 c 计多模态文本输出。',
    compatibility:
      '模板 key、shared text/image/video input 标签、p/img/vid 双写语义和 ao 输出分支必须保留；不得用截图中的价格替代可编辑参数。',
  },
  {
    key: 'shared-text-image-audio-output-modes',
    name: 'Shared text/image input + audio input + multimodal/audio output pricing',
    group: 'multimodal',
    purpose:
      '文本和图片共用一个输入价格，音频输入单独计价；输出分为多模态文本和仅音频计费的文本+音频两种模式。',
    conditionFields: ['ao > 0'],
    priceFields: ['p+img', 'ai', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '专用四字段可视化编辑器；文本/图片共用输入价格，音频输入、多模态文本输出和文本+音频输出分别填写。',
      managementDisplay:
        '单行四列横向显示，顺序为文本/图片输入、音频输入、文本输出（多模态输入）、文本+音频输出（仅音频计费）。',
      publicDisplay:
        '与管理端相同的单行四列分组表，输入列在前、输出列在后，不显示表达式源码或内部变量名。',
    },
    runtime:
      '保存时共享输入价格同时写入 p、img；按 ai 计音频输入，ao 大于 0 的请求按音频输出计费，否则按 c 计多模态文本输出。',
    compatibility:
      '使用独立模板 key 和 shared text/image input 标签；旧的 shared text/image/video 模板保持不变，截图中的价格不能固化为业务限制。',
  },
  {
    key: 'shared-text-image-video-audio-output-simple',
    name: 'Simple shared text/image/video input + audio input + output pricing',
    group: 'multimodal',
    purpose:
      '面向管理员的简化表单：只填写文本/图片/视频共享输入、音频输入、文本输出和文本+音频输出价格。',
    conditionFields: ['ao > 0'],
    priceFields: ['p+img+vid', 'ai', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '直接显示四个价格输入框，不要求管理员编辑表达式或条件菜单。',
      managementDisplay: '单行四列，输入价格在前，输出价格在后。',
      publicDisplay: '单行四列，显示文本/图片/视频输入、音频输入、文本输出和文本+音频输出。',
    },
    runtime:
      '保存时共享输入价格写入 p、img、vid；ai、c、ao 按请求实际 usage 参与结算。',
    compatibility:
      '这是管理员友好别名模板，不覆盖旧模板；使用相同表达式语义，旧数据和上游同步保持兼容。',
  },
  {
    key: 'shared-text-image-audio-output-simple',
    name: 'Simple shared text/image input + audio input + output pricing',
    group: 'multimodal',
    purpose:
      '面向管理员的简化表单：只填写文本/图片共享输入、音频输入、文本输出和文本+音频输出价格。',
    conditionFields: ['ao > 0'],
    priceFields: ['p+img', 'ai', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '直接显示四个价格输入框，不要求管理员编辑表达式或条件菜单。',
      managementDisplay: '单行四列，输入价格在前，输出价格在后。',
      publicDisplay: '单行四列，显示文本/图片输入、音频输入、文本输出和文本+音频输出。',
    },
    runtime:
      '保存时共享输入价格写入 p、img；ai、c、ao 按请求实际 usage 参与结算。',
    compatibility:
      '这是管理员友好别名模板，不覆盖旧模板；使用相同表达式语义，旧数据和上游同步保持兼容。',
  },
  {
    key: 'omni-output-modes',
    name: 'Qwen3 Omni three output prices',
    group: 'multimodal',
    purpose: '独立填写文本、音频、图片、视频输入价，并设置三种输出价格。',
    conditionFields: ['ao > 0', 'img > 0 || ai > 0 || vid > 0'],
    priceFields: ['p', 'ai', 'img', 'vid', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '保留原模板的可视化结构，图片输入和视频输入可以分别维护。',
      managementDisplay:
        '单行六列分组表：文本输入、音频输入、图片/视频输入、纯文本输出、多模态文本输出、文本+音频输出。',
      publicDisplay:
        '与管理端相同的单行分组表；图片和视频旧价格不同时在同一单元格分两行显示。',
    },
    runtime:
      '输入价格先求和；ao>0 选择仅音频计费输出，否则根据是否有多模态输入选择文本输出档。',
    compatibility:
      '模板 key 和旧表达式标签必须保留；不能因新增共享输入模板而迁移或覆盖旧数据。',
  },
  {
    key: 'omni-shared-media-input-output-modes',
    name: 'Qwen3 Omni shared image/video input + three output prices',
    group: 'multimodal',
    purpose: '图片和视频输入只填写一个共享价格，输出仍分为三种模式。',
    conditionFields: ['ao > 0', 'img > 0 || ai > 0 || vid > 0'],
    priceFields: ['p', 'ai', 'img+vid', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '专用六列表格；图片/视频只有一个输入框，修改时同时更新 img、vid。',
      managementDisplay: '单行六列分组表，与原 Omni 模板保持一致。',
      publicDisplay: '单行六列分组表，不展示分支条件或表达式源码。',
    },
    runtime:
      '保存时将共享输入值同时序列化到 img、vid；三种输出分支与原模板相同。',
    compatibility:
      '专用编辑器识别 shared image/video input 标签；该标识和 img/vid 双写行为必须保留。',
  },
  {
    key: 'live-translation-multimodal',
    name: 'Live translation multimodal token pricing',
    group: 'multimodal',
    purpose: '实时翻译场景分别设置文本输出、图片输入、音频输入和音频输出价格。',
    conditionFields: [],
    priceFields: ['p', 'c', 'img', 'ai', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '通用 Token 价格字段网格。',
      managementDisplay: '逐项展示非零的文本、图片、音频价格。',
      publicDisplay: '逐项展示非零价格，隐藏内部变量。',
    },
    runtime: '按各模态 usage 独立乘价并求和。',
    compatibility: '零价字段可以保留在表达式中，但列表不显示零价。',
  },
  {
    key: 'audio-transcription-per-second',
    name: 'Uploaded audio transcription per second',
    group: 'multimodal',
    purpose: '上传音频的语音识别、转写或翻译，按系统读取到的输入音频秒数计费。',
    conditionFields: [],
    priceFields: ['aud_s'],
    unit: '每秒',
    layout: {
      editor: '显示“输入音频时长价格”，明确系统读取上传音频并通过 aud_s 计费。',
      managementDisplay: '显示输入音频时长价格，并与生成音频/媒体任务时长区分。',
      publicDisplay: '显示按秒计费价格并固定保留 6 位小数，不显示 aud_s 变量名。',
    },
    runtime: '使用 usage 中的 aud_s 乘以秒单价。',
    compatibility: '仅用于系统可读取上传音频时长的 ASR/转写/翻译请求；不得与渠道或媒体任务提供的 seconds 混用。前端变量、Go 表达式绑定和结算 usage 映射三处都必须存在；价格精度固定为小数点后 6 位。',
  },
] as const satisfies readonly ExpressionTemplateContract[]

export const ADVANCED_MEDIA_TEMPLATE_REGISTRY = [
  {
    key: 'image',
    name: 'Output image resolution (1K/2K)',
    purpose: '按输出图片分辨率计费，同时支持输入参考图和输出图片两个收费项。',
    execution: 'request-or-task',
    conditionFields: ['resolution_tier'],
    chargeMeters: ['input_images', 'output_images'],
    units: ['张'],
    defaultTiers: '1K 条件档 + 其他图片分辨率兜底档；档位和值都可增删修改。',
    layout: {
      editor: '纵向档位卡片；每档包含名称、匹配条件和收费项。',
      managementDisplay: '按档位展示条件及输入/输出图片单价。',
      publicDisplay: '按档位表格展示，不暴露内部条件表达式。',
    },
    runtime:
      '按顺序匹配 resolution_tier，使用实际 input_images/output_images 数量结算。',
    compatibility:
      '分辨率由数字输入和 DPI/K/P 单位下拉组成，不得固定为只有 1K/2K。',
  },
  {
    key: 'outputImageCount',
    name: 'Generated output images per image',
    purpose: '为普通图片生成接口设置统一的每张输出图片单价。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['image_count'],
    units: ['张'],
    defaultTiers: '一个无条件档位，管理员只需填写每张输出图片的价格。',
    layout: {
      editor: '单档位、单收费项，显示实际生成图片数、张和单价。',
      managementDisplay: '显示每张输出图片价格，不展示 image_count 内部变量。',
      publicDisplay: '显示输出图片单价，例如 ¥0.500 / 张。',
    },
    runtime:
      '普通图片请求使用 core 原生 image_count：按请求 n 预扣，按实际返回图片张数结算。',
    compatibility:
      'request 模式必须生成 fixed(unitPrice) * image_count；异步任务若只有 output_images usage，继续使用任务 usage 结算，不得混淆。',
  },
  {
    key: 'boolean',
    name: 'Boolean request option',
    purpose: '根据请求布尔开关开启或关闭使用不同单价。',
    execution: 'request-or-task',
    conditionFields: ['prompt_extend'],
    chargeMeters: ['request'],
    units: ['次'],
    defaultTiers: '开启条件档 + 关闭兜底档。',
    layout: {
      editor: '布尔值使用启用/禁用下拉菜单。',
      managementDisplay: '分别展示开启与关闭价格。',
      publicDisplay: '显示人类可读的开启/关闭档位。',
    },
    runtime: '读取请求或 usage 中的 prompt_extend 后按次结算。',
    compatibility: '允许将字段改为 usage schema 提供的其他布尔字段。',
  },
  {
    key: 'volume',
    name: 'Generated image quantity tiers',
    purpose: '按生成图片数量区间使用阶梯单价。',
    execution: 'request-or-task',
    conditionFields: ['image_count'],
    chargeMeters: ['image_count'],
    units: ['张'],
    defaultTiers: '≤25、26-125、126-250、251-1250、>1250 五个可编辑示例档。',
    layout: {
      editor: '每个数量档位一张卡片，阈值变化同步更新示例名称。',
      managementDisplay: '按数量档位展示每张单价。',
      publicDisplay: '按数量范围逐行展示。',
    },
    runtime:
      '普通图片请求按 image_count 命中首个档位并结算；异步任务使用 output_images usage。',
    compatibility:
      '阈值、档位数和名称可修改，最后一档必须是无条件兜底；旧 output_images 规则仍须继续解析。',
  },
  {
    key: 'video',
    name: 'Output video resolution and duration',
    purpose: '按输出视频分辨率选择每秒价格。',
    execution: 'request-or-task',
    conditionFields: ['resolution'],
    chargeMeters: ['seconds'],
    units: ['秒', '分钟', '小时'],
    defaultTiers: '720P 条件档 + 其他视频分辨率兜底档。',
    layout: {
      editor: '分辨率数字 + DPI/K/P 单位下拉，收费项选择时长单位。',
      managementDisplay: '每个分辨率一行显示时长单价。',
      publicDisplay: '按分辨率档位展示时长价格。',
    },
    runtime: '匹配 resolution，按实际 seconds 和单位 divisor 结算。',
    compatibility: '分辨率数值和单位可编辑，不得把 720P 固化。',
  },
  {
    key: 'videoAudio',
    name: 'Video resolution, duration and audio switch',
    purpose: '同时根据视频分辨率和是否包含音频确定每秒价格。',
    execution: 'request-or-task',
    conditionFields: ['resolution', 'audio'],
    chargeMeters: ['seconds'],
    units: ['秒', '分钟', '小时'],
    defaultTiers: '720P有声、1080P有声、720P无声、其他无声兜底。',
    layout: {
      editor: '同一档位可组合多个条件；audio 使用启用/禁用下拉。',
      managementDisplay: '分辨率与有声/无声组合逐行显示。',
      publicDisplay: '展示可读的分辨率、音频状态和时长价格。',
    },
    runtime: '所有条件同时匹配后按 seconds 结算。',
    compatibility: '条件顺序具有业务意义，有声档必须位于无声兜底之前。',
  },
  {
    key: 'videoMode',
    name: 'Video output mode and duration',
    purpose: '根据标准/专业等视频模式选择每秒价格。',
    execution: 'request-or-task',
    conditionFields: ['mode'],
    chargeMeters: ['seconds'],
    units: ['秒', '分钟', '小时'],
    defaultTiers: 'Standard mode 条件档 + Professional mode 兜底档。',
    layout: {
      editor: '模式条件和值可编辑，价格使用时长单位下拉。',
      managementDisplay: '每种视频模式一行。',
      publicDisplay: '按模式显示时长价格。',
    },
    runtime: '匹配 mode，按 seconds 结算。',
    compatibility: 'wan-std 只是默认示例值，不能限制管理员添加其他模式。',
  },
  {
    key: 'imageVideo',
    name: 'Input image and output video',
    purpose: '输入图片按张计费，输出视频按分辨率和时长计费。',
    execution: 'request-or-task',
    conditionFields: ['mode', 'resolution'],
    chargeMeters: ['input_images', 'seconds'],
    units: ['张', '秒', '分钟', '小时'],
    defaultTiers: '输入图片、480P输出视频、其他视频分辨率兜底。',
    layout: {
      editor: '同一规则集中混合图片张数和视频时长收费项。',
      managementDisplay: '分别展示输入图片与输出视频档位。',
      publicDisplay: '按输入/输出用途分档展示。',
    },
    runtime:
      '按 mode/resolution 选择档位，再使用 input_images 或 seconds 结算。',
    compatibility: '必须明确图片是输入、分辨率和时长是输出视频属性。',
  },
  {
    key: 'audioSeconds',
    name: 'Generated audio/media task duration pricing',
    purpose: '生成音频或媒体任务按渠道、任务适配器提供的 seconds 时长计费。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['seconds'],
    units: ['秒', '分钟', '小时'],
    defaultTiers: '一个无条件音频时长档位。',
    layout: {
      editor: '单档收费项，时长单位使用下拉菜单。',
      managementDisplay: '显示音频时长单价。',
      publicDisplay: '显示按秒/分钟/小时价格。',
    },
    runtime: '按实际 seconds 和 divisor 结算。',
    compatibility: '必须确认请求或任务适配器会提供 seconds；上传音频 ASR/转写应改用 aud_s 模板。单位必须紧邻音频时长计费字段显示。',
  },
  {
    key: 'ttsCharacters',
    name: 'Text-to-speech per 10K characters',
    purpose: 'TTS 输入字符和输出字符分别计价，允许输出免费或未来设置非零价格。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['tts_input_characters', 'tts_output_characters'],
    units: ['字符', '千字符', '万字符'],
    defaultTiers: '一个按字符计费档；输入默认示例 0.8/万字符，输出默认 0。',
    layout: {
      editor: '同一档位两个收费项，只保留一个音频输入相关价格语义。',
      managementDisplay: '输入字符价和输出字符价在同一档位显示。',
      publicDisplay: '零价不显示，非零输出价自动显示。',
    },
    runtime:
      '分别读取 tts_input_characters、tts_output_characters 并按 divisor 结算。',
    compatibility:
      '前端不要输出内部变量名 tts_input_characters；输出价必须允许录入非零值。',
  },
  {
    key: 'voiceCount',
    name: 'Voice enrollment count',
    purpose: '声音复刻或音色注册按音色数量计费。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['count'],
    units: ['音色', '个'],
    defaultTiers: '一个无条件音色数量档。',
    layout: {
      editor: '单档数量收费项。',
      managementDisplay: '显示每个音色价格。',
      publicDisplay: '显示音色数量单价。',
    },
    runtime: '按实际 count 结算。',
    compatibility: '界面不显示内部 count 名称，使用业务名称“音色数量”。',
  },
  {
    key: 'taskMatrix',
    name: 'Task type and output specification matrix',
    purpose: '按任务类型与输出规格的组合矩阵计价，例如 3D 任务。',
    execution: 'request-or-task',
    conditionFields: ['task_type', 'output_spec'],
    chargeMeters: ['request'],
    units: ['次'],
    defaultTiers: '三个 Text-to-3D 示例组合 + 其他任务规格兜底。',
    layout: {
      editor: '每档可组合 task_type 与 output_spec 两个条件。',
      managementDisplay: '组合条件和按次价格逐行显示。',
      publicDisplay: '显示业务标签，不显示内部条件表达式。',
    },
    runtime: '两个条件同时匹配后按请求结算。',
    compatibility:
      '组合和值来自 usage schema 时优先使用 schema 枚举，不限制为默认 3D 示例。',
  },
  {
    key: 'blank',
    name: 'Blank rule',
    purpose: '从空白规则开始，自定义请求属性、usage 字段、档位和收费项。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['request'],
    units: ['次'],
    defaultTiers: '一个名为“默认”的无条件按次兜底档。',
    layout: {
      editor: '通用档位卡片，可新增/删除档位、条件和收费项。',
      managementDisplay: '根据实际配置展示。',
      publicDisplay: '根据实际档位和非零收费项展示。',
    },
    runtime: '按管理员配置生成 u(field) 表达式并由实际结算引擎执行。',
    compatibility:
      '最后一档必须无条件，前面每档必须有条件；价格必须是非负有限数。',
  },
] as const satisfies readonly AdvancedMediaTemplateContract[]
