# 数据维护

## 新增或更新模型

1. 在 `data/models/` 新建或修改 `<id>.json`，文件名与 `id` 一致，字段见 [spec-v1-models.md](spec-v1-models.md)。
2. 每个数值都要能在 `sources` 列出的官方页面找到；官方没有给出的写 `null` 或空数组。
3. 更新 `sources[].retrieved_at` 与 `info.verified_at` 为本次核验日期。
4. 运行 `node scripts/validate-data.mjs <文件>` 快速自检，再运行 `pnpm check && pnpm build`。

## 收录范围

- 模型厂商在自家官方 API 上可调用、或曾经可调用后已下线的模型，全部类型：对话、推理、视觉、代码、向量、重排、OCR、审核、图像、视频、音频。
- 只开放给审批机构、只有开源权重而无官方 API 的模型不收录。
- 已下线模型同样收录，`info.status` 为 `retired`：至少要有官方下线公告或下线页面写明该模型 ID；其余字段只填官方页面（含官方旧文档、官方公告）能查到的值，查不到写 `null`。官方页面已撤下时，可用该官方网址在 Internet Archive（web.archive.org）的存档快照作来源，`sources[].url` 写存档地址，`title` 注明「存档」与原网址。
- 模型厂商宣布即将下线但仍可调用的模型标为 `deprecated`。
- 已收录的模型下线后不删除文件，`info.status` 改为 `retired`，并把写明下线的官方页面加入 `sources`；其余字段保留下线前的官方值。

## 数据约定

- **来源**：只用模型厂商官方文档、模型页、价格页与官方公告。第三方聚合站只作线索，不作来源。例外：`api.sdk` 可使用 models.dev 元数据、SDK 作者文档与实现确认支持范围，保留来源与匹配审计；该例外不适用于价格、能力等字段。
- **不推算**：不从模型名、SDK 用法或相近模型推断数值；不按规则自行计算价格。官方只给规则时写 `null`，或在价格页确有数字时照录。
- **模型厂商**：`owned_by` 是模型厂商；转售平台、聚合网关、云厂商托管的第三方模型不计入该模型厂商。模型厂商登记在 `data/vendors/<id>.json`（`id`、显示名 `name`、官网 `url`），新模型厂商先登记再加模型。
- **ID**：用模型厂商的稳定模型 ID；带日期的快照 ID、`-latest` 等别名放进 `aliases`，不另建文件。模型 ID 与别名全库唯一、共用一个命名空间：别名不能等于其他模型的 ID，也不能同时挂在两个文件下（`-latest` 这类会漂移的别名只挂在当前指向的模型上）。`validate-data.mjs` 与构建都会检查。
- **发布日期**：只采用官方明确写出的日期；只有月份时写 `null`。
- **价格**：
  - 模型厂商第一方标准价，币种照录（国际站多为 USD，国内站为 CNY），与 `providers[].base_url` 的区域一致。
  - `unit` 按官方计费方式选择：Token 计价用 `1M_tokens`；按字符、张、秒、分钟、小时、次、页计价用对应单位（见接口规范第 6 节）。
  - 按输入长度、分辨率、时长分档时取最低档的标准价；促销价、夜间折扣价、套餐价不用；分辨率或时长不同而单价不同的，取最低档并在 PR 中说明。
  - 单位换算只做精确换算：每千 Token / 字符 × 1000 得每百万；每千张、每百秒等同理。不跨单位推算（如不把按秒价格折算成按次）。
  - 同一模型按多种单位混合计费、无法用一个单位表达时 `pricing` 为 `null`。
  - 以音频、实时交互为主的模型（实时语音、音频对话、全模态实时模型）按模态分别计价时 `pricing` 为 `null`，不只取文本一档；以文本对话为主、另对音频或图像输入单独计价的模型，记文本标准价；图像生成模型按「文本输入 Token + 图像输出 Token」计价时，`input` 记文本输入价、`output` 记图像输出价。
- **上下文**：文档写明确数字时照录；只写 "128K"、"1M" 这类缩写时，按下表的模型厂商口径换算。口径依据是模型厂商接口参数上限、官方模型配置（如 Hugging Face `config.json` 的 `max_position_embeddings`）或官方文档中的精确数字，依据页面写进该模型的 `sources`。模型自身有精确数字时以精确数字为准。

| 口径 | 模型厂商 |
| --- | --- |
| 1K = 1024 | Google、DeepSeek、智谱（"200K" 为 202752）、Moonshot、字节、百度、腾讯、讯飞、小米、AI21、Mistral |
| 1K = 1000 | OpenAI、Anthropic、xAI、Amazon、Cohere（对话与向量；重排模型文档写明 4096） |
| 按模型给出精确数字 | 阿里、MiniMax、阶跃、Meta |

- **思考支持**：`reasoning.supported` 只有官方明确说明支持或不支持时才写 `true` / `false`；模型页未出现 reasoning、未列推理参数，不能据此把未知值改为 `false`。
- **思考等级**：`reasoning.efforts` 只写 API 可传的确切取值；只有开关或 Token 预算时为空数组。
- **能力**：`features` 只列文档明确支持的能力；未写明的不列。
- **协议差异**：只有官方明确列出的模型才标注 Responses 支持，不能从同系列其他模型外推。Google Interactions 使用 `interactions`，不标成 `responses`。同一 provider 的思考参数按协议不同时可用 `reasoning_params` 分别登记。
- **来源冲突**：官方字段自相矛盾（如输入上限大于总上下文）时，冲突值写 `null`，保留来源并记录待核实原因，不自行计算修正值。
- **接口地址**：`providers[].endpoints` 只写文档给出的路径；文档未给出路径时留空对象。HTTP 使用 `https://` 与 `GET` / `POST`；WebSocket 使用 `wss://` 与 `WS`，不可伪装成普通 HTTP 调用。同一模型有多种协议地址时拆分 provider；路径中的工作空间等占位符只按官方原样登记。

## 多语言简介

- 只有介绍类文本需要多语言：`info.description` 保存官方原文（照录，不翻译），其他语言写入维护字段 `translations.<语言代码>.description`。参数类字段（上下文、价格、模态等）不翻译。
- 译文只翻译原文，不增删信息、不加评价；专有名词、模型名、产品名、单位保持原样。原文是哪种语言，就不为该语言写译文。
- 原文更新时同步更新或删除译文；`info.description` 为 `null` 时不写译文。

## 官方来源检查

`node scripts/check-official.mjs [文件...]` 在 `validate-data.mjs` 之外再检查四件事，不改数据：

1. **官方域名**：除标题含 `api.sdk only` 的 SDK 来源，以及 `models.dev`、`ai-sdk.dev` 外，至少一条 `sources` 的主机名属于该厂商。允许的主机来自 `data/vendors/<id>.json` 的官网，以及脚本里的文档站补充表（如 `ai.google.dev`、`docs.mistral.ai`）。官网主机升到注册域时，`com.cn`、`co.jp`、`github.io` 这类公共后缀会再向前取一段，不会把整个后缀放行。`web.archive.org` 只在被存档的原地址属于这些主机时算数。
2. **日期**：`sources[].retrieved_at` 必须是真实的 `YYYY-MM-DD`；`info.verified_at` 同样，或为 `null`。比 UTC 当天晚超过 1 天则失败；晚 1 天仍通过，避免 UTC+8 早晨把本地今天判成未来。早于 `--max-age` 天（默认 180）只警告；加上 `--strict` 时警告也失败。`--max-age` 不是非负整数时直接退出。
3. **数值范围**：价格不为负，币种为三个大写字母，单位属于接口规范中的计价单位，`limits.input` 与 `limits.output` 不超过 `limits.context`。
4. **必填字段**：公开字段和维护字段 `aliases`、`sources`、`providers` 必须存在。字段顺序和枚举仍由 `validate-data.mjs` 把关。

`node scripts/check-official.mjs --cross [--report 路径]` 会下载 models.dev、OpenRouter 和 LiteLLM，按厂商前缀加模型 ID 或别名匹配后写出差异。同名键保留先写入的记录。价格只比较相同币种和单位：这三个目录读取的是 USD / `1M_tokens`，本地人民币、字符、分钟、页等报价跳过价格比较，但仍核对 Token 上下限；不做汇率或跨单位换算。LiteLLM 的 `max_tokens` 对照 `limits.context`，`max_input_tokens` 只对照 `limits.input`。它只提示 1000/1024、折扣价和图像/文本计价口径可能不同，不自动改 JSON。网络失败时退出码为 2。`pnpm test` 会执行 `scripts/*.test.mjs`，其中包括 `scripts/check-official.test.mjs`。

## 批量采集

大批量补录时按模型厂商拆分并行处理，每组只写自己模型厂商的文件，用 `scripts/validate-data.mjs` 自检，最后统一运行 `pnpm check && pnpm build`，并人工抽查各组标注的推断值与空缺项。

## 待补空缺

部分模型的发布日期、知识截止、思考等级与价格官方未公布，当前为 `null`。可在各模型详情页查看具体字段，官方更新后按上述流程补录。

运行 `node scripts/audit-data.mjs` 输出全库及各厂商的字段空缺、状态统计和待核验 ID 清单（JSON）。`node scripts/completeness.mjs` 在此基础上按厂商列出 limits、pricing 各分项、reasoning、features、info 与 sources 的空缺；`--vendor`、`--ids`、`--markdown` 可缩小范围或改成表格。这是本地完整性清单，空值可能不适用或官方未公布，不能当作错误率，也不能当作已完成官方全量核验的证明。`deprecated` 仍可调用，统计时与 `retired` 分开。

本轮价格与发布日期补录见 [2026-10-11 逐型号核验记录](audits/pricing-release-2026-10-11.json)：记录补录前后数值、剩余缺项、原因与官方资料入口。该记录是当日快照；后续维护以 `data/models/` 为准。历史存档价格仅代表对应快照，不表示已下线模型仍可购买。已检索未找到、资料获取失败与官方明确未公布须区分，不能将空值统一描述为“官方未公布”。

后续使用浏览器、搜索接口与官方网页历史存档的补查见 [历史复查记录](audits/history-pricing-release-2026-10-11.json)；[models.dev 候选对照](audits/models-dev-candidates-2026-10-11.json) 仅保存第三方线索。候选需核对具体型号、第一方供应商、币种、计费单位和日期含义后才可采纳；套餐零价、促销价、美元换算价与漂移别名的版本日期不能直接填入。

语义回归检查运行 `pnpm test`：覆盖输入/输出与上下文矛盾、端点与 API 类型不一致、Messages 误标、分协议思考参数，以及 HTTPS / WSS 混用。

### 2026-10-11 核验中的保留项

- Moonshot 本轮官方文档明确列出的 Responses 型号为 `kimi-k3`，不能将该能力外推给全部 Kimi 型号；Chat、Messages、Responses 的思考参数分别登记。
- 部分 StepFun 音频旧型号、Vidu 旧型号及 ReaderLM-v2 尚未找到对应型号的完整官方请求路径，保留空端点；`xsparkx2flash` 只确认了 Token Plan 地址，未推断路径。
- KAT-Coder-Pro V2.5 的按量调用需要控制台分配的 `ep-*` 部署 ID，不能把目录中的模型 ID 当作已验证的请求参数。
- OpenAI GPT-5 Chat 部分官方页面的输入上限大于同页总上下文；冲突的输入值保留 `null`，未用减法或其他型号的数据代填。
- 历史型号日期、知识截止及混合计价等空值仍需逐项核验；全库格式校验通过不代表所有字段都已公开或全部历史资料都已查全。

## SDK 数据

`api.sdk` 位于 `api.types` 之后，为去重的 npm 包名数组（可含导出子路径），可同时登记 AI SDK 适配器、厂商 SDK 和已核验的直接调用 SDK，未知写 `[]`。每个包至少支持一种模型接口；调用需要按协议选择方法，并设置对应的厂商地址、认证与参数。SDK 元数据不改变模型生命周期，已下线型号只作历史接口参考。

- models.dev：下载 `https://models.dev/api.json` 后运行 `node scripts/import-sdk.mjs <快照路径> <YYYY-MM-DD>`。精确匹配调用平台与模型 ID，优先使用模型级 `provider.npm`，否则使用平台 `npm`；保留多个包。平台默认 npm 字段仅作候选，仍须核对 SDK 是否实现该模型的接口类型；最终合并时不保留缺乏接口支持证据的默认包。导入不会清空其他已核验 SDK。
- 全库文档扫描：`node scripts/scan-sdk-docs.mjs <YYYY-MM-DD>`。扫描各模型的官方文档，缺省使用首个官方来源；HTTP 失败、拦截与未知 SDK 单独记录，不视为官方确认没有 SDK。
- 支持范围：核对 SDK 文档、源码与 npm 包名后更新调研快照，再运行 `node scripts/enrich-sdk.mjs docs/audits/sdk-support-2026-10-13.json docs/audits/sdk-documents-2026-10-13.json`。按实际协议、调用地址和 SDK 实现匹配；缺少端点时仅接受快照中明确列出的模型/API 家族映射。不要把平台的文本 SDK 套到其全部音视频型号，也不要把第三方网关 SDK 当成第一方 API SDK。
- 再次补录会移除本工具旧审计中已失去证据的 SDK，同时保留独立手工追加的包；models.dev 的精确匹配结果作为独立来源合并。仅更新 SDK 及其来源，不修改人工核验日期或其他模型参数。

本轮结果见 [SDK 支持依据](audits/sdk-support-2026-10-13.json)、[全库文档扫描](audits/sdk-documents-2026-10-13.json) 和 [逐模型匹配审计](audits/sdk-internet-scan-2026-10-13.json)。审计中的包版本与网页摘要是核查快照，不是安装版本约束。SDK 作者的说明用于确认 SDK 接口覆盖；纯 HTTP 示例、仅有 Python SDK 或其它网关的示例不足以确认 npm SDK 支持。
