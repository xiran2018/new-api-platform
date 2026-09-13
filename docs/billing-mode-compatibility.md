# 计费方式兼容合同

本文件记录 `计费方式/` 截图所要求的计费能力。它不是仅供展示的清单：
`scripts/verify-core-compatibility.sh`、前端表达式测试和后端计费测试会在每次上游同步后验证这些能力。

| 截图计费结构 | 可视化入口 | 实际计费数据 |
| --- | --- | --- |
| 按生成图片张数 | 图片分辨率模板或空白规则 | `output_images` |
| 请求开关使用不同单价 | 布尔请求选项模板 | `prompt_extend` 或自定义布尔字段 |
| 按生成数量分档 | 生成图片数量阶梯模板 | `output_images` / `count` |
| 音乐、语音按输出秒数 | 音频时长模板 | `seconds` 或 Token 表达式的 `aud_s` |
| TTS 按输入字符数 | 每万字符 TTS 模板 | `tts_input_characters` |
| 声音复刻按音色数 | 音色数量模板 | `count` |
| 输入长度分档 | 输入 Token 区间表达式模板 | `len` |
| 输入长度加思考开关 | 输入区间 + 思考输出表达式模板 | `len`、`param(enable_thinking)` |
| 文本、图片、视频、音频分别计价 | 多模态表达式模板 | `p/c/img/img_o/vid/vid_o/ai/ao` |
| 纯文本/多模态文本/文本+音频三种输出 | Omni 输出模式表达式模板 | `img/ai/vid/ao` 条件分支 |
| 音频转写按秒 | 音频转写表达式模板 | `aud_s` |
| 视频分辨率乘输出时长 | 视频分辨率与时长模板 | `resolution`、`seconds` |
| 视频分辨率加有声/无声 | 视频分辨率、时长与音频开关模板 | `resolution`、`audio`、`seconds` |
| 视频标准/专业模式 | 视频模式与时长模板 | `mode`、`seconds` |
| 输入图片加输出视频 | 图片输入与视频输出模板 | `input_images`、`resolution`、`seconds` |
| 3D 任务类型与输出规格组合 | 任务类型与输出规格矩阵模板 | `task_type`、`output_spec` |

模板中的价格、分辨率、模式、档位和字段值均为可编辑初始值。管理员可以增加、删除或调整档位，
并非只能使用截图里的示例数值。任务渠道只有在渠道的 `billing_usage_schema` 提供对应字段时，
才会在运行时使用该字段结算；同步请求由图片、音频请求解析器生成对应 usage facts。

## 上游同步保护

统一使用：

```bash
./scripts/sync-upstream.sh --merge
```

脚本在合并后依次重新装配 extensions、执行兼容合同检查、运行表达式/模板回归测试、构建前端，
并执行后端表达式与结算映射测试。任一步失败都表示同步尚未完成，不能提交子模块指针。

本地功能尽量保存在 `extensions/`。Core 中只保留通用插槽、表达式变量和真实结算映射；
`git rerere` 负责复用已经人工确认过的冲突解决，但不能替代上述自动测试。

GitHub Actions 的 `Verify upstream compatibility` 工作流会在 `main` 推送和 Pull Request 时
重复执行同一组合同检查。即使没有通过同步脚本提交，远端也能发现计费模板或结算映射回归。
