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
  execution: 'request-only' | 'request-or-task'
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
    key: 'batch-multimodal-token-tiers',
    name: 'Batch multimodal input/cache/output token tiers',
    group: 'tiered',
    purpose: '按输入 Token 长度分档，并在每档分别设置文本输入、音频输入、文本缓存、音频缓存和输出价格。',
    conditionFields: ['len'],
    priceFields: ['p', 'ai', 'cr', 'ai_cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '可视化档位表；每档直接填写长度上限和五种价格，可继续增加、删除或重命名档位。',
      managementDisplay: '紧凑分组表：Token 范围、文本输入、音频输入、文本缓存、音频缓存、输出。',
      publicDisplay: '与管理端相同的横向分组表，不显示表达式源码或内部变量名。',
    },
    runtime: '按 len 选择档位，再使用 p、ai、cr、ai_cr、c 的实际 Token usage 结算。',
    compatibility: '32K、128K、256K 仅为可编辑示例边界；模型超过上下文上限时仍由模型/渠道拒绝，模板不在 core 增加额外拦截。',
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
    key: 'realtime-modality-cache-pricing',
    name: 'Realtime text/image/audio + cached input pricing',
    group: 'multimodal',
    purpose:
      '面向实时多模态模型，分别设置文本、图片、音频输入、缓存读取、文本/图片/音频输出价格。',
    conditionFields: [],
    priceFields: [
      'p',
      'cr',
      'c',
      'img',
      'img_cr',
      'img_o',
      'ai',
      'ai_cr',
      'ao',
    ],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '管理员友好的八字段价格表：文本输入、缓存输入、图片输入、图片缓存、音频输入、文本输出、图片输出、音频输出。',
      managementDisplay:
        '输入价格和输出价格分组显示；零价字段隐藏，但保存的字段仍保持兼容。',
      publicDisplay:
        '按输入/输出分组显示非零价格，不显示表达式源码、变量名或内部条件。',
    },
    runtime:
      '使用 p/cr/c、img/img_cr/img_o、ai/ai_cr/ao 对文本、图片、音频三种模态的输入、Cached input、输出分别计价；缓存模态明细存在时会从普通输入和聚合缓存中拆出，避免重复计费，缺少明细时对应模态缓存为 0。',
    compatibility:
      '适用于已提供模态和缓存 usage 明细的普通多模态/实时兼容接口；Realtime WebSocket 当前仅保证已有文本、音频和缓存字段，图片或会话时长必须由上游 usage 提供后才会计费。',
  },
  {
    key: 'gemini-flash-lite-unified-cache-pricing',
    name: 'Gemini Flash Lite unified multimodal + cached input pricing',
    group: 'multimodal',
    purpose:
      'Gemini Flash Lite 统一按 Token 计价：文本、图片、视频、音频共享输入单价，缓存读取单价独立，输出 Token 单价独立。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '管理员友好的六字段价格表：文本输入、图片输入、视频输入、音频输入、Cached input、输出。',
      managementDisplay:
        '按输入、Cached input、输出分组显示非零价格；不显示表达式源码或内部变量名。',
      publicDisplay:
        '按 Gemini 的统一多模态输入、缓存读取和输出价格展示，隐藏表达式源码。',
    },
    runtime:
      '使用 p、img、vid、ai、cr、c 的实际 Token usage 分别乘价后求和；输入和输出价格以每百万 Token 为单位。',
    compatibility:
      '默认值对应 Gemini Flash Lite 统一输入/输出和缓存读取价格，但所有数值都可编辑；截图中的缓存存储“每小时”价格不在此模板中伪造为 Token 价格。',
  },
  {
    key: 'gemini-flash-lite-audio-cache-pricing',
    name: 'Gemini Flash Lite shared text/image/video + separate audio/cache pricing',
    group: 'multimodal',
    purpose:
      'Gemini Flash Lite 将文本、图片、视频作为一组输入价格，音频输入和音频 Cached input 单独计价，输出 Token 独立计价。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'cr', 'ai_cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '管理员友好的七字段价格表：文本/图片/视频输入、音频输入、文本/图片/视频 Cached input、音频 Cached input、输出。',
      managementDisplay:
        '按共享输入、音频输入、Cached input、输出分组显示非零价格；不显示表达式源码。',
      publicDisplay:
        '按共享文本/图片/视频输入、音频输入、缓存读取和输出价格展示，隐藏内部变量名。',
    },
    runtime:
      '使用 p、img、vid、ai、cr、ai_cr、c 的实际 Token usage 分别乘价后求和；文本/图片/视频缓存可使用聚合 cr，音频缓存使用 ai_cr。',
    compatibility:
      '默认值对应 Gemini Flash Lite 文本/图片/视频与音频分离价格，但数值和字段均可编辑；截图中的缓存存储“每小时”价格需等待 core 提供独立存储时长 usage 后再启用。',
  },
  {
    key: 'gemini-flash-lite-unified-cache-pricing-simple',
    name: 'Gemini Flash Lite easy setup: unified input + cached input + output',
    group: 'multimodal',
    purpose:
      '管理员友好版本：只填写统一多模态输入、Cached input 和输出三个价格，系统自动将输入价格应用到文本、图片、视频和音频。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '三项直接填写表格：统一文本/图片/视频/音频输入、Cached input、输出；不要求手写表达式。',
      managementDisplay: '输入、Cached input、输出各显示一项，不显示重复模态字段。',
      publicDisplay: '显示统一多模态输入、缓存读取和输出价格，不显示表达式源码。',
    },
    runtime:
      '保存时把统一输入价写入 p、img、vid、ai；cr 和 c 按真实 Token usage 结算。',
    compatibility:
      '这是新增的管理员友好模板，不覆盖原 Gemini 模板；模板 key 和 easy marker 必须保留，旧表达式继续由通用编辑器兼容。',
  },
  {
    key: 'gemini-flash-lite-audio-cache-pricing-simple',
    name: 'Gemini Flash Lite easy setup: shared input + separate audio/cache',
    group: 'multimodal',
    purpose:
      '管理员友好版本：只填写文本/图片/视频共享输入、音频输入、Cached input、音频 Cached input 和输出价格。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'cr', 'ai_cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '五项直接填写表格：共享文本/图片/视频输入、音频输入、两类 Cached input、输出；不要求手写表达式。',
      managementDisplay: '共享输入只显示一次，音频和缓存字段分组显示，不显示表达式源码。',
      publicDisplay: '显示共享输入、音频输入、缓存读取和输出价格，不显示内部变量名。',
    },
    runtime:
      '保存时把共享输入价写入 p、img、vid；ai、cr、ai_cr、c 按真实 Token usage 结算。',
    compatibility:
      '这是新增的管理员友好模板，不覆盖原 Gemini 模板；模板 key 和 easy marker 必须保留，截图中的缓存存储小时费仍需独立 usage 才能支持。',
  },
  {
    key: 'gemini-omni-shared-input-text-video-output-simple',
    name: 'Gemini Omni easy setup: shared multimodal input + text/video output',
    group: 'multimodal',
    purpose:
      '文本、图片、视频、音频输入共用一个价格，文本输出和视频输出分别计价。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'c', 'vid_o'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '三个价格输入框：统一多模态输入、文本输出、视频输出。',
      managementDisplay: '单行三列表格，输入在前，文本和视频输出在后。',
      publicDisplay: '单行显示具体模态价格，不显示模板名称和表达式源码。',
    },
    runtime:
      '统一输入价同时写入 p、img、vid、ai；c 与 vid_o 使用实际文本输出和视频输出 Token 结算。',
    compatibility:
      '不得把默认示例数值固化；模板 marker、共享输入双写及 vid_o 输出字段必须保留。',
  },
  {
    key: 'gemini-image-shared-input-text-image-output-simple',
    name: 'Gemini image easy setup: shared text/image input + text/image output',
    group: 'multimodal',
    purpose: '文本和图片输入共用一个价格，文本输出和图片输出分别计价。',
    conditionFields: [],
    priceFields: ['p', 'img', 'c', 'img_o'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '三个价格输入框：文本/图片共享输入、文本输出、图片输出。',
      managementDisplay: '单行三列表格，输入在前，文本和图片输出在后。',
      publicDisplay: '单行显示具体价格，不显示表达式源码。',
    },
    runtime:
      '共享输入价同时写入 p、img；c 与 img_o 使用实际文本输出和图片输出 Token 结算。',
    compatibility:
      'Google Search grounding 继续使用系统现有工具附加费，不得伪造表达式 usage；本模板只负责 Token 价格。',
  },
  {
    key: 'gemini-image-text-image-video-input-output-simple',
    name: 'Gemini image easy setup: shared text/image/video input + text/thinking and image output',
    group: 'multimodal',
    purpose:
      '文本、图片和视频输入共用一个价格，文本/思考输出与图片输出分别计价。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'c', 'img_o'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '三个价格输入框：文本/图片/视频共享输入、文本/思考输出、图片输出。',
      managementDisplay: '单行三列表格，输入在前，两个输出价格在后。',
      publicDisplay: '单行显示具体模态价格，不显示模板名称和表达式源码。',
    },
    runtime:
      '共享输入价同时写入 p、img、vid；c 使用文本及思考输出 Token，img_o 使用图片输出 Token 真实结算。',
    compatibility:
      '保留旧的文本/图片输入模板；不得同时按 img_o Token 价格和换算后的每张图片价格重复收费。截图中的每张图片价格只作为图片输出 Token 数量的换算说明。',
  },
  {
    key: 'gemini-native-audio-text-media-input-output-simple',
    name: 'Gemini Native Audio easy setup: text/media input + text/audio output',
    group: 'multimodal',
    purpose:
      '文本输入单独计价，音频和视频输入共享一个价格，文本输出和音频输出分别计价。',
    conditionFields: [],
    priceFields: ['p', 'ai', 'vid', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '四个价格输入框：文本输入、音频/视频共享输入、文本输出、音频输出。',
      managementDisplay: '单行四列表格，两个输入价格在前，两个输出价格在后。',
      publicDisplay: '单行显示具体模态价格，不显示模板名称和表达式源码。',
    },
    runtime:
      '音频/视频共享输入价同时写入 ai、vid；p、c、ao 与 ai、vid 使用实际对应模态 Token 结算。',
    compatibility:
      '共享输入双写、模板 key 和 easy marker 必须保留；不得用音频时长、视频时长或请求次数代替模态 Token。',
  },
  {
    key: 'gemini-robotics-unified-cache-pricing-simple',
    name: 'Gemini Robotics easy setup: unified input + cached input + output',
    group: 'multimodal',
    purpose:
      '文本、图片、视频、音频输入共用一个价格，缓存读取和输出分别计价。',
    conditionFields: [],
    priceFields: ['p', 'img', 'vid', 'ai', 'cr', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '三个价格输入框：统一多模态输入、Cached input、输出。',
      managementDisplay: '单行三列表格显示统一输入、缓存读取和输出。',
      publicDisplay: '只显示最终采用的单一价格，不显示日期阶段和表达式源码。',
    },
    runtime:
      '统一输入价同时写入 p、img、vid、ai；cr 和 c 使用实际缓存读取及输出 Token 结算。',
    compatibility:
      '官方按日期调整的价格不写入日期分支，管理员填写最终选定价格；缓存存储每小时费没有独立 usage 前不得用 cr 或 cc1h 冒充，Google Search 继续由工具附加费结算。',
  },
  {
    key: 'gemini-tts-text-cache-audio-output-simple',
    name: 'Gemini TTS easy setup: text input + cached input + audio output',
    group: 'multimodal',
    purpose: '分别设置文本输入、缓存读取和音频输出价格。',
    conditionFields: [],
    priceFields: ['p', 'cr', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '三个价格输入框：文本输入、Cached input、音频输出。',
      managementDisplay: '单行三列表格显示输入、缓存和音频输出。',
      publicDisplay: '只显示具体价格，不显示日期阶段或表达式源码。',
    },
    runtime: 'p、cr、ao 使用实际 Token usage 分别乘价后求和。',
    compatibility:
      '截图中的日期分阶段不进入代码，管理员填写最终采用的单一价格；缓存存储每小时费在没有独立 usage 前不得伪造。',
  },
  {
    key: 'gemini-multimodal-embedding-input-simple',
    name: 'Gemini Embedding easy setup: multimodal input only',
    group: 'multimodal',
    purpose: 'Embedding 模型分别设置文本、图片、音频和视频输入价格，不收输出费。',
    conditionFields: [],
    priceFields: ['p', 'img', 'ai', 'vid'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '四个输入价格框，不显示无意义的输出价格。',
      managementDisplay: '文本、图片、音频、视频输入在一行四列显示。',
      publicDisplay: '只显示非零输入价格，不显示表达式源码。',
    },
    runtime: 'p、img、ai、vid 使用各自实际输入 Token usage 结算，无输出项。',
    compatibility:
      '四种输入字段和无输出语义必须保留；数值只是可编辑默认值，不得绑定特定模型名。',
  },
  {
    key: 'image-modality-cache-pricing',
    name: 'Image model text/image/cache input + image output pricing',
    group: 'multimodal',
    purpose:
      '面向图像模型，分别设置文本输入、图片输入、文本/图片缓存输入和图片输出价格。',
    conditionFields: [],
    priceFields: ['p', 'cr', 'img', 'img_cr', 'img_o'],
    unit: '每百万对应模态 Token',
    layout: {
      editor:
        '管理员友好五字段价格表：文本输入、缓存输入、图片输入、图片缓存、图片输出。',
      managementDisplay:
        '输入价格在前、图片输出价格在后；零价字段不显示。',
      publicDisplay:
        '按图像模型的输入/输出分组展示具体价格，不显示表达式源码。',
    },
    runtime:
      '使用 p、cr、img、img_cr、img_o 的实际 usage 分别乘价后求和；没有图片缓存明细时按普通缓存字段结算。',
    compatibility:
      '不会覆盖已有 text-image-audio-split 模板；旧模型价格仍按原表达式执行，新模板只在管理员选择后生效。',
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
    key: 'audio-image-input-text-audio-output-simple',
    name: 'Simple audio/image input + text/audio output pricing',
    group: 'multimodal',
    purpose:
      '面向管理员的简化表单：只填写音频输入、图片输入、文本输出和音频输出四个价格。',
    conditionFields: [],
    priceFields: ['ai', 'img', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '直接显示四个价格输入框，不要求管理员编辑表达式或条件菜单。',
      managementDisplay: '单行四列，输入音频、输入图片在前，输出文本、输出音频在后。',
      publicDisplay: '与管理端相同的单行四列表格，不显示表达式源码。',
    },
    runtime: '按 ai、img、c、ao 对应的实际 usage 数量分别乘以单价后求和。',
    compatibility:
      '这是原 audio-image-input-text-audio-output 模板的管理员友好别名，不覆盖旧数据和旧模板。',
  },
  {
    key: 'text-audio-input-text-audio-output-simple',
    name: 'Simple text/audio input + text/audio output pricing',
    group: 'multimodal',
    purpose:
      '面向管理员的四字段表单：文本输入、音频输入、文本输出和音频输出分别按每百万 Token 计价。',
    conditionFields: [],
    priceFields: ['p', 'ai', 'c', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '直接显示文本输入、音频输入、文本输出、音频输出四个价格输入框。',
      managementDisplay:
        '单行四列，输入价格在前，输出价格在后；不显示表达式源码。',
      publicDisplay:
        '单行四列，输入价格在前，输出价格在后；只显示已设置的非零价格。',
    },
    runtime:
      '按 p、ai、c、ao 对应的实际文本/音频输入输出 Token 数量分别乘以单价后求和。',
    compatibility:
      '使用现有 p、ai、c、ao 变量和结算映射；这是管理员友好别名，不覆盖旧模板和旧数据。',
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
    key: 'audio-input-audio-output-token-pricing',
    name: 'Audio input + audio output token pricing',
    group: 'multimodal',
    purpose: '实时语音翻译或语音到语音场景，分别设置输入音频 Token 和输出音频 Token 的价格。',
    conditionFields: [],
    priceFields: ['ai', 'ao'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '管理员友好双字段表格，只填写音频输入价格和音频输出价格。',
      managementDisplay: '输入、输出在同一行显示，不展示无关文本或图片价格。',
      publicDisplay: '单行显示音频输入和音频输出价格，单位为每 1M Token。',
    },
    runtime: 'Gemini promptTokensDetails.AUDIO 映射到 ai，candidatesTokensDetails.AUDIO 映射到 ao，分别按实际 Token 乘价结算。',
    compatibility: 'tier 标签是专用编辑器和显示器的稳定识别标记；不得改名或改回按分钟/连接时长计费。',
  },
  {
    key: 'audio-input-text-output-token-pricing',
    name: 'Audio input + text output token pricing',
    group: 'multimodal',
    purpose: '实时或普通语音转写场景，分别设置输入音频 Token 和输出文本 Token 的价格。',
    conditionFields: [],
    priceFields: ['ai', 'c'],
    unit: '每百万对应模态 Token',
    layout: {
      editor: '管理员友好双字段表格，只填写音频输入价格和文本输出价格。',
      managementDisplay: '输入、输出在同一行显示，不展示无关价格。',
      publicDisplay: '单行显示音频输入和文本输出价格，单位为每 1M Token。',
    },
    runtime: 'Gemini promptTokensDetails.AUDIO 映射到 ai，文本 candidates token 计入 c，分别按实际 Token 乘价结算；thinking token 已包含在 completion 总量中。',
    compatibility: '同一模板可用于不同转写模型，管理员只需修改两个价格；不得改成 aud_s、seconds 或分钟计费。',
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
    defaultTiers: '1K、2K 条件档 + 其他图片分辨率兜底档；档位名称、条件、数量和值都可增删修改。',
    layout: {
      editor: '纵向档位卡片；每档包含名称、匹配条件和收费项。',
      managementDisplay: '按档位展示条件及输入/输出图片单价。',
      publicDisplay: '按档位表格展示，不暴露内部条件表达式。',
    },
    runtime:
      '按顺序匹配 resolution_tier，使用实际 input_images/output_images 数量结算；Alibaba Qwen-Image-3.0 会将 output_image_type/input_image_count/image_count 同步映射为这些通用字段。',
    compatibility:
      '分辨率由数字输入和 DPI/K/P 单位下拉组成，不得固定为只有 1K/2K；Qwen-Image-3.0 的 1K/2K 档位由请求尺寸和完成 usage 标准化得到。',
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
      '仅兼容读取和编辑历史配置，不再允许管理员新选择该模板。不同图片插件的实际输出数量字段并不统一，新配置必须选择插件明确支持的图片计费模板；历史 request 模式保留 core 原生 fixed(unitPrice) * image_count，历史 task 模式继续使用 u("image_count") * unitPrice。',
  },
  {
    key: 'seedreamPixelScene',
    name: 'Seedream input/output image and pixel scene pricing',
    purpose: '按输入图片、单图生成/图层拆分场景以及 261 万像素阈值两侧的输出图片数量计价。',
    execution: 'request-or-task',
    conditionFields: ['layer_decomposition'],
    chargeMeters: ['input_images', 'images_up_to_1_5k', 'images_above_1_5k'],
    units: ['张'],
    defaultTiers: '单图生成和图层拆分两行；每行直接填写输入图片、≤261万像素输出、>261万像素输出价格。',
    layout: {
      editor: '管理员友好的四列表格，不暴露通用条件和 meter 编辑器。',
      managementDisplay: '生成场景、输入图片、两档输出图片价格在同一行显示。',
      publicDisplay: '按照深色价格表的紧凑分组结构展示，不显示内部 usage 字段。',
    },
    runtime: 'Doubao Seedream 插件按实际输出图片尺寸生成两个数量字段，并结合 layer_decomposition 与 input_images 真实结算。',
    compatibility: '内部历史字段名保留 1_5k，但真实阈值是 2,610,000 像素；不得仅按名称推断阈值或改坏旧数据。',
  },
  {
    key: 'musicPerSong',
    name: 'Music generation per song/request',
    purpose: '为一次请求固定生成一首歌曲的音乐模型设置每首歌曲价格。',
    execution: 'request-only',
    conditionFields: [],
    chargeMeters: ['request'],
    units: ['次'],
    defaultTiers: '一个无条件档位，管理员只需填写每首歌曲/每次请求价格。',
    layout: {
      editor: '单档位、单价格输入框，不要求编辑表达式或 usage 字段。',
      managementDisplay: '显示每首歌曲/每次请求价格。',
      publicDisplay: '显示音乐生成按歌曲/请求计费价格。',
    },
    runtime:
      '同步请求每次命中一次固定价格；适用于一个请求固定返回一首歌曲的渠道。',
    compatibility:
      '不得把按请求计费描述成真实歌曲数量计费；如果渠道允许一请求返回多首歌曲，必须先增加并上报 song_count usage 后再按数量结算。',
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
      '普通图片请求按 image_count 命中首个档位并结算；异步任务读取插件提供的 u("image_count")。',
    compatibility:
      '阈值、档位数和名称可修改，最后一档必须是无条件兜底；旧 output_images 规则打开时不删除数据，保存到任务模型时迁移为 image_count。',
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
    key: 'seedanceVideoTokens',
    name: 'Seedance resolution and reference-video token pricing',
    purpose: '按输出视频分辨率与是否包含参考视频选择每百万计费 Token 单价。',
    execution: 'request-or-task',
    conditionFields: ['resolution', 'video_input'],
    chargeMeters: ['tokens'],
    units: ['百万 Token'],
    defaultTiers: '480p、720p、1080p、4k 分别提供无参考视频/有参考视频两行；默认不生成兜底档位，未匹配组合拒绝计费。',
    layout: {
      editor: '管理员友好的分辨率、参考视频状态、Token 单价矩阵，可增加、删除和重命名组合。',
      managementDisplay: '同一分辨率合并为一行，无视频输入和有视频输入分别显示。',
      publicDisplay: '紧凑显示分辨率及两种输入场景价格，不显示条件表达式。',
    },
    runtime: 'Doubao Seedance 插件从完成结果读取实际 billing tokens，并保留提交时估算用于预扣；按 resolution/video_input 命中单价后结算。',
    compatibility: '只对插件声明的分辨率和 video_input 字段启用；截图中的分辨率是默认示例而不是硬编码限制；结构化规则使用 unmatchedPolicy=reject，不生成无条件兜底档位，未匹配组合由后端拒绝。',
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
    key: 'liveSessionSeconds',
    name: 'GPT-Live session connection duration pricing',
    purpose: 'GPT-Live WebSocket 会话按照实际连接持续时间逐秒计费。',
    execution: 'request-only',
    conditionFields: [],
    chargeMeters: ['live_session_seconds'],
    units: ['秒', '分钟', '小时'],
    defaultTiers: '一个无条件会话时长档；默认示例 0.05/分钟，可编辑。',
    layout: {
      editor: '单档收费项，管理员只需选择秒/分钟/小时并填写价格。',
      managementDisplay: '显示 GPT-Live 会话连接时长单价，不暴露内部 meter。',
      publicDisplay: '显示按秒/分钟/小时的会话连接价格。',
    },
    runtime:
      '仅 OpenAI Realtime WebSocket 由服务端注入 live_session_seconds；断开时按 time.Since(StartTime).Seconds() 的小数秒精确结算。',
    compatibility:
      '不得复用 aud_s 或媒体任务 seconds；不得向上取整到整分钟；普通 HTTP 请求不能通过请求体伪造此用量。',
  },
  {
    key: 'ttsCharacters',
    name: 'Text-to-speech per 10K characters',
    purpose: 'TTS 输入字符和输出字符分别计价，允许输出免费或未来设置非零价格。',
    execution: 'request-or-task',
    conditionFields: [],
    chargeMeters: ['tts_input_characters', 'tts_output_characters'],
    units: ['字符', '千字符', '万字符'],
    defaultTiers: '一个按万字符计费档；输入默认示例 0.8/万字符，输出默认 0。',
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
    key: 'threeDArtifact',
    name: '3D artifact specification pricing',
    purpose: '按照成功输出的 3D 文件规格计价，例如标准/高清白模和纹理模型。',
    execution: 'request-or-task',
    conditionFields: ['output_spec'],
    chargeMeters: ['request'],
    units: ['次'],
    defaultTiers: '标准白模、标准纹理模型、高清白模、高清纹理模型四个可编辑示例。',
    layout: {
      editor: '管理员直接填写产物名称、输出规格值和单次成功输出价格，可增加或删除规格。',
      managementDisplay: '生成类型/贴图类型语义和单价组成紧凑表格。',
      publicDisplay: '按深色参考图的“产物规格 + 单价”分组表展示。',
    },
    runtime: '任务插件提供 output_spec 后按首个匹配规格结算；未声明该字段的插件禁止保存。',
    compatibility: '默认规格值只是示例；实际插件枚举可以替换，旧 taskMatrix 数据继续使用原模板。',
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
