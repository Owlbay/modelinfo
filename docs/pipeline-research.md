# 模型信息自动采集管线：调研与设计

> 状态：调研稿（2026-10-11），供决策用，尚未登记到 `docs/README.md`。
> 范围：`data/vendors/` 全部 63 家模型厂商 + 未收录的重点厂商；线索源；管线架构；开源参考；分阶段计划；待决事项。
> 方法：读取仓库现有 845 个模型文件的 `sources`（即维护者已核验过的官方页面），再用 curl/fetch 在 2026-10-11 实测：模型列表 API 免鉴权响应、`llms.txt` / `sitemap.xml` / RSS、页面是否静态可解析、是否有 `.md` 版本、反爬。表中 **「已测」** 指当天实际请求得到的结果；**「未核验」** 指基于文档或经验、尚未实际请求确认。

---

## 0. 结论先行

1. **推荐方案：混合管线**——「确定性变更哨兵 + LLM 结构化抽取 + 确定性证据校验 + 按厂商开 PR、人工合并」。少数提供结构化官方 API 的厂商（Anthropic、Google、xAI、Cohere、Mistral、Jina、Inception、IBM、Deepgram）用确定性适配器；其余用 Claude 从归一化后的官方页面抽取，每个改动值必须附带「官方原文片段」，由脚本验证片段确实出现在抓取快照中、且数值可由片段按 `maintenance.md` 允许的换算得到，否则降级为 Issue。全部运行在 GitHub Actions，不引入任何服务端运行时或数据库。
2. **可行性很好**：63 家中有 **约 40 家的核心页面可直接拿到 Markdown**（Mintlify/Fern/自建文档的 `.md`、`.md.txt` 后缀或 `llms.txt`），**约 17 家是静态 HTML 可解析**，**真正需要浏览器渲染或特殊处理的只有 6 家左右**（字节火山引擎、讯飞星火页、百川、Stability、Naver（403）、可灵部分页）。其中火山引擎有未公开的文档 JSON 接口可绕过渲染。
3. **成本很低**：按「只在页面变化时抽取」计，Claude API 月成本估计 **20–60 美元**；每季度全量复核一次约 **10–20 美元**（用 Batch 再减半）。GitHub Actions 对公开仓库免费。
4. **主要阻塞**：
   - 多数厂商的模型列表 API 需要 API Key（63 家中实测**免鉴权可用的仅 Jina、Inception、NVIDIA、Deepgram、Typhoon、IBM** 6 家），国内厂商申请 Key 往往需要实名认证/充值；
   - `GITHUB_TOKEN` 创建的 PR **不会触发 CI**，需要 GitHub App 或 PAT；
   - `info.verified_at` 定义是「最近人工核验日期」，自动化不能直接写；
   - 快照存储涉及转载厂商文档的版权问题，不宜放公开仓库；
   - GitHub 托管 runner 在美国，访问部分国内站点可能慢或被限（需实测，必要时自托管 runner）。
5. **调研中顺带发现的数据问题**（管线上线后这类问题会被自动发现）：
   - 字节跳动全部 23 个模型文件都引用 `https://www.volcengine.com/docs/82379/1099320`，该文档在火山引擎文档接口中已返回空内容（Title 为空），疑似已迁移到 `82379/1544106`（模型价格），需人工确认；
   - 线索源对比显示部分厂商存在可能漏收的模型（见 2.6 节），需人工判断是否属于收录范围。

---

## 1. 官方来源清单（按厂商）

### 1.1 获取方式图例

| 代号 | 含义 | 管线处理 |
| --- | --- | --- |
| **MD** | 页面 URL 加 `.md` 返回干净 Markdown（Mintlify、Fern、ReadMe、自建；已测） | 直接抓 Markdown，最稳 |
| **MD.txt** | Google 文档站：URL 加 `.md.txt` | 同上 |
| **SSR** | 服务端渲染，HTML 中已有正文与数值（已测） | HTML → 正文抽取（Readability）→ Markdown |
| **SPA** | 前端渲染，HTML 中几乎无正文（已测） | 找隐藏 JSON 接口，或用 Playwright 渲染 |
| **JSON** | 文档站自身的 JSON 接口（非公开 API） | 可用，但随时可能变，需监控失败 |
| **403** | Cloudflare/反爬或地域拦截（已测） | 不硬抓；改用其它官方页面，或降级为人工 |

通用规律（已测）：
- **Mintlify** 站点：页面 `.md` 可用；changelog 页面加 `/rss.xml` 有 RSS（如 `docs.z.ai/release-notes/new-released/rss.xml`、`docs.bfl.ml/release-notes/rss.xml`、`docs.ai21.com/changelog/rss.xml`、`dev.writer.com/home/changelog/rss.xml`）。
- **Fern** 站点：页面 `.md` 可用；changelog 为 `<changelog路径>.rss`（如 `docs.cohere.com/changelog.rss`、`elevenlabs.io/docs/changelog.rss`、`docs.sarvam.ai/changelog.rss`、`docs.ltx.io/api-changelog.rss`、`developers.deepgram.com/changelog.rss`）。
- 很多站点 `sitemap.xml` 带 `<lastmod>`（已测：Cohere 311/311、Z.ai 64/64、xAI 178/207、Voyage 38/38），可用于低成本变更检测；Anthropic、DeepSeek 的 sitemap 无 lastmod。
- `llms.txt` 有些是假的（返回 SPA HTML）：DeepSeek、Jina、Kimi、Vidu、LongCat、Stability、华为、阿里国际站、火山引擎、上海 AI Lab 均如此（已测），不能当索引用。

### 1.2 模型列表 API 实测汇总（2026-10-11，不带 Key 请求）

| 结果 | 厂商 |
| --- | --- |
| **免鉴权返回完整列表** | Jina `api.jina.ai/v1/models`（30 条，OpenRouter 格式：context_length、max_output_length、pricing、modalities、supported_features、description）；Inception `api.inceptionlabs.ai/v1/models`（同格式，含价格与上下文）；NVIDIA `integrate.api.nvidia.com/v1/models`（80 条，仅 id/owned_by，含大量第三方模型）；Deepgram `api.deepgram.com/v1/models`（stt 459 / tts 102 条：name、version、languages、batch、streaming，无价格）；Typhoon `api.opentyphoon.ai/v1/models`（仅 id）；IBM `us-south.ml.cloud.ibm.com/ml/v1/foundation_model_specs`（含 model_limits、functions、provider，混有第三方） |
| **返回 401/403，需 Key** | OpenAI、Anthropic、Google、Mistral、xAI、DeepSeek、Cohere、Moonshot、智谱（国内/国际）、MiniMax、阶跃、火山方舟、阿里百炼（国内/国际）、百度千帆（403）、腾讯混元、ElevenLabs、Upstage、小米、Meta、蚂蚁、Reka、Writer、AI Singapore、SenseAudio、讯飞、百川、LongCat、上海 AI Lab、华为 MaaS、Recraft、Stability、Runway、Sakana、PFN |
| **免鉴权返回空** | AI21 `api.ai21.com/studio/v1/models`（`{"data":[]}`） |
| **未找到列表端点（404）** | Voyage、Perplexity、Sarvam、Cartesia |
| **官方 OpenAPI 公开** | BFL `api.bfl.ai/openapi.json`、Inception `api.inceptionlabs.ai/openapi.json`、OpenAI `github.com/openai/openai-openapi`、Google discovery `generativelanguage.googleapis.com/$discovery/rest?version=v1beta` |

需 Key 的 API 中，**字段信息量大的**（已按官方文档核验）：
- **Anthropic** `GET /v1/models`：`max_input_tokens`、`max_tokens`、`capabilities`（effort 各档、thinking、batch、structured_outputs、image/pdf 输入、citations 等）、`lifecycle`（active/deprecated/retired）、`deprecated_at`、`retires_at`。可直接覆盖 limits、reasoning.efforts、部分 features、status。
- **xAI** `GET /v1/models`：`aliases`、各类 token 价格（单位：USD 美分/1 亿 token）、长上下文阈值与价格、图像单价、modalities、默认思考等级。
- **Cohere** `GET /v1/models`：`context_length`、`endpoints`、`features`、`is_deprecated`。
- **Google** `GET v1beta/models`：`inputTokenLimit`、`outputTokenLimit`、`thinking`、`supportedGenerationMethods`、`description`；无价格与生命周期（models.dev 也因此不用它判断下架）。
- **Mistral** `GET /v1/models`：`max_context_length`、`capabilities`、`aliases`、`deprecation`（字段未逐一核验）。
- **OpenAI** `GET /v1/models` 只有 `id/created/owned_by`，且按账号可见、混有快照与内部 ID、无生命周期——只能用作「出现新 ID」的信号。

### 1.3 国际：大语言模型与综合厂商

| 厂商（文件数） | 模型列表 API | 模型/文档页 | 价格页 | 变更 / 下线来源 | 获取 | 备注与风险 |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI (48) | 需 Key；`/v1/models` 仅 id/created/owned_by，按账号可见 | `developers.openai.com/api/docs/models/all`、`/models/<id>` | `/api/docs/pricing` | `/api/docs/changelog`、`/api/docs/deprecations`（均有 `.md`，已测）；`status.openai.com/history.rss`；`developers.openai.com/rss.xml`（博客）；`openai.com/news/rss.xml` | MD | `openai.com` 主站 Cloudflare 403（已测），只用 developers 站；GitHub `openai/openai-openapi`（openapi.yaml 4 MB）、`openai-python` 的 `types/shared/chat_model.py`（模型 ID 枚举）可作新 ID 信号 |
| Anthropic (14) | 需 Key；字段最全（见 1.2） | `platform.claude.com/docs/en/about-claude/models/overview` | `/about-claude/pricing` | `/release-notes/overview`、`/about-claude/model-deprecations`（均 `.md`）；`status.claude.com/history.rss` | MD | `anthropic-sdk-python` 的 `types/model_param.py` 为 ID 枚举；`llms.txt` 82 KB；sitemap 无 lastmod |
| Google (45) | 需 Key（免费可申请）；有 token 上限与 thinking，无价格/生命周期 | `ai.google.dev/gemini-api/docs/models` | `/gemini-api/docs/pricing` | `/changelog`、`/deprecations`（`.md.txt`，已测）；`developers.googleblog.com/feeds/posts/default`（RSS） | MD.txt | discovery 文档公开；HTML 价格在 raw 中、去标签后文本匹配失败（表格结构复杂），建议只用 `.md.txt` |
| xAI (16) | 需 Key；含价格与别名 | `docs.x.ai/developers/models`（`.md` 含价格表） | `/developers/pricing` | `/developers/release-notes`（`.md`） | MD | `x.ai` 主站 403（已测）；sitemap 有 lastmod |
| Mistral AI (17) | 需 Key；含上下文、能力、下线信息 | `docs.mistral.ai/getting-started/models/models_overview/`、`/models/<id>` | `docs.mistral.ai/inference/pricing`、`mistral.ai/pricing` | `/resources/release-notes.md`、`/inference/model-lifecycle.md`（已测） | 混合 | 模型总览与价格页 `.md` 404，HTML 正文很少（Next.js），可能需渲染；优先用 API + lifecycle 页 |
| Cohere (31) | 需 Key；含 context_length、endpoints、is_deprecated | `docs.cohere.com/docs/models` | `/docs/how-does-cohere-pricing-work`、`cohere.com/pricing` | `docs.cohere.com/changelog.rss`、`/docs/deprecations`（`.md`） | MD | 价格页数字在 raw HTML，`.md` 更稳 |
| DeepSeek (2) | 需 Key；仅 id/owned_by | `api-docs.deepseek.com` | `/quick_start/pricing` | `/updates`（无 RSS，`.md` 不可用） | SSR | Docusaurus 静态，可直接解析；HF `deepseek-ai/*/config.json` 用于上下文口径 |
| Meta (8) | 需 Key | `dev.meta.ai/docs/models` | `/docs/pricing-rate-limits` | 未发现 changelog（未核验） | MD | `llms.txt` 29 KB |
| Amazon (9) | Bedrock `ListFoundationModels` 需 AWS SigV4 凭证（未核验） | `docs.aws.amazon.com/nova/latest/...`、Bedrock model card | `aws.amazon.com/bedrock/pricing/` | AWS What's New（RSS 未核验） | SSR | 价格页 900 KB 且不含模型 ID，需按显示名匹配；`docs.aws.amazon.com/llms.txt` 有 417 KB 索引 |
| Microsoft (9) | 无公开列表（Azure 资源级） | `learn.microsoft.com/.../use-foundry-models-mai-image`、speech-service MAI 页 | `azure.microsoft.com/pricing/details/speech/` 等 | `microsoft.ai/news` | SSR | Azure 价格页依赖 JS 计算器，数值可能不在 HTML（已测：MAI 页无价格数字）；Learn 文档源码托管在 GitHub（未核验），可改为监控源仓库 |
| NVIDIA (21) | **公开**；80 条但混有第三方，仅 id/owned_by | `docs.api.nvidia.com/nim/reference/<model>`、`build.nvidia.com/.../modelcard` | 多数无公开单价 | — | MD | 需按 `owned_by` 过滤；与 models.dev 对比噪声大（大量第三方托管模型） |
| IBM (2) | **公开** `foundation_model_specs`（含 model_limits、functions，混第三方） | `ibm.com/docs/en/watsonx/saas?topic=solutions-supported-foundation-models` | `ibm.com/products/watsonx-ai/pricing` | IBM announcements | SSR | 价格为资源单位（RU）计价，换算需人工判断 |
| Perplexity (8) | 未找到列表端点 | `docs.perplexity.ai`（embeddings、agent-api 页） | `/docs/getting-started/pricing` | `docs.perplexity.ai/changelog/changelog.md`（已测） | MD | `www.perplexity.ai` 403 |
| AI21 Labs (2) | 免鉴权返回空 | `docs.ai21.com/docs/jamba-foundation-models` | `www.ai21.com/pricing/` | `docs.ai21.com/changelog/rss.xml`（已测） | MD | |
| Writer (3) | 需 Key | `dev.writer.com/home/models` | `/home/pricing` | `dev.writer.com/home/changelog/rss.xml`（已测） | MD | |
| Reka AI (2) | 需 Key | `docs.reka.ai/chat/models` | `docs.reka.ai/pricing` | `reka.ai/news` | MD | |
| Inception Labs (3) | **公开**，含价格与上下文 | `docs.inceptionlabs.ai/get-started/models` | 同左 / API | 博客 | MD | 官方 API 已含价格，可做确定性适配器 |
| Upstage (12) | 需 Key | `console.upstage.ai/docs/models/history` | `upstage.ai/pricing` | models/history 即生命周期页 | MD | |
| Contextual AI (3) | — | `docs.contextual.ai/api-reference/rerank/rerank` | `contextual.ai/pricing` | `docs.contextual.ai/release-notes/2025` | MD | |
| Sakana AI (1) | 需 Key | `console.sakana.ai/models` | 同左 | `sakana.ai` 新闻 | SSR | 价格数字未在 HTML 中匹配到（已测），可能需渲染 |
| Preferred Networks (1) | 需 Key | `docs.plamo.preferredai.jp/en/api` | `plamo.preferredai.jp/api` | `preferred.jp` 新闻 | SSR | |
| Naver (3) | 需 Key | `guide.ncloud-docs.com/docs/clovastudio-model` | 同站 | `/docs/clovastudio-releasenote` | **403** | 模型页对脚本 403（已测），但 `llms.txt` 可访问（209 KB）；可能需从 llms.txt 指向的页面或换 UA/地域 |
| AI Singapore (4) | 需 Key | `docs.sea-lion.ai/guides/inferencing/api` | 未见单价 | `sea-lion.ai/blog` | MD | HF `aisingapore/*` |
| SCB 10X Typhoon (4) | **公开**（仅 id） | `docs.opentyphoon.ai/en/models/` | 未见单价 | — | SSR | 无 llms.txt/sitemap |
| Sarvam AI (9) | 未找到列表端点 | `docs.sarvam.ai/api/getting-started/models/*` | `/api/getting-started/pricing` | `docs.sarvam.ai/changelog.rss`（已测） | MD | HTML 价格页数字不在文本中（已测），用 `.md` |

### 1.4 国际：向量 / 重排 / 语音 / 图像 / 视频

| 厂商（文件数） | 模型列表 API | 模型/文档页 | 价格页 | 变更来源 | 获取 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| Voyage AI (18) | 无 | `docs.voyageai.com/docs/embeddings`、`/docs/reranker` | `/docs/pricing`（`.md` 带 `updatedAt` 头信息） | `blog.voyageai.com`；sitemap lastmod | MD | `.md` 头部 `updatedAt` 可直接用于变更检测 |
| Jina AI (16) | **公开**，含价格/上下文 | `jina.ai/models/<id>` | API 返回值；`docs.jina.ai` | — | SSR | 官方 API 可做确定性适配器；`llms.txt` 是 HTML |
| Mixedbread (2) | — | `www.mixedbread.com/docs/...` | 未见独立价格页 | `/docs/changelog` | MD | |
| Nomic (2) | — | `docs.nomic.ai/atlas/embeddings-and-retrieval/text-embedding` | — | `nomic.ai/news` | SSR | |
| ElevenLabs (18) | 需 Key（`/v1/models` 返回 workspace_not_found） | `elevenlabs.io/docs/overview/models` | `elevenlabs.io/pricing/api` | `elevenlabs.io/docs/changelog.rss`（2.3 MB） | MD | 价格页 HTML 数值可匹配 |
| Deepgram (17) | **公开**（模型、版本、语言） | `developers.deepgram.com/docs/models-languages-overview` | `deepgram.com/pricing` | `developers.deepgram.com/changelog.rss`（2.2 MB） | MD | API 可确定「模型是否存在」，价格仍需页面 |
| Cartesia (6) | 未找到 | `docs.cartesia.ai/build-with-cartesia/tts-models/*` | `docs.cartesia.ai/pricing` | `changelog.rss` 返回 429 | MD | Cloudflare 挑战标记，限速明显 |
| AssemblyAI (5) | — | `assemblyai.com/docs/getting-started/models` | `assemblyai.com/pricing` | 博客 | MD | |
| Speechmatics (5) | — | `docs.speechmatics.com/speech-to-text/models` | `speechmatics.com/pricing` | 新闻 | MD | 价格页 HTML 去标签后数值缺失，需原始结构 |
| Soniox (3) | — | `soniox.com/docs/stt/models`、`/docs/tts/models` | `soniox.com/pricing` | — | SSR | |
| Twelve Labs (4) | — | `docs.twelvelabs.io/v1.3/docs/concepts/models/*` | 未见 | `/v1.3/docs/get-started/release-notes` | MD | |
| Black Forest Labs (13) | **OpenAPI 公开** | `docs.bfl.ml/flux_2/*` | `docs.bfl.ml/quick_start/pricing` | `docs.bfl.ml/release-notes/rss.xml`（已测） | MD | OpenAPI 的 endpoint 列表可做新模型信号 |
| Recraft (21) | 需 Key | `recraft.ai/docs/api-reference/models` | `/docs/api-reference/pricing` | 未发现 changelog | MD | |
| Ideogram (4) | — | `developer.ideogram.ai`（`llms.txt` 指引 `.md`） | `ideogram.ai/api-pricing` | — | MD | |
| Leonardo.Ai (2) | — | `docs.leonardo.ai/docs/*` | 未见 API 单价页 | `leonardo.ai/news` | MD | |
| Stability AI (8) | 需 Key（`/v1/engines/list` 旧接口） | `platform.stability.ai/docs/api-reference` | `platform.stability.ai/pricing` | `/docs/release-notes` | **SPA** | API reference 为前端渲染（文本 35 字符，已测）；需 Playwright 或改用 OpenAPI（`platform.stability.ai/docs/openapi.json` 未核验） |
| Runway (7) | 需 Key | `docs.dev.runwayml.com/guides/models/` | `/guides/pricing/` | `/api-details/api_changelog.md`（已测） | MD | |
| Luma AI (3) | — | `docs.agents.lumalabs.ai/guides/model` | `/guides/pricing` | `lumalabs.ai/news` | SSR | |
| Lightricks (4) | — | `docs.ltx.io/models/*` | `docs.ltx.io/pricing` | `docs.ltx.io/api-changelog.rss`（已测） | MD | |
| PixVerse (5) | — | `docs.platform.pixverse.ai/model-overview-2140345m0` | 同站 | `/changelogs-906383m0` | MD | 页面 URL 带随机后缀，改版后易失效 |

### 1.5 中国厂商

| 厂商（文件数） | 模型列表 API | 模型/文档页 | 价格页 | 变更 / 下线来源 | 获取 | 备注与风险 |
| --- | --- | --- | --- | --- | --- | --- |
| Alibaba (176) | 需 Key；DashScope 兼容 `/compatible-mode/v1/models`（国内/国际，基础字段） | 国际 `alibabacloud.com/help/en/model-studio/text-generation-model`；国内 `help.aliyun.com/zh/model-studio/models` | 国际 `.../model-pricing`；国内 `help.aliyun.com/zh/model-studio/model-pricing.md`（682 KB） | `.../newly-released-models`（「模型上下架与更新」，国内 `.md` 406 KB） | MD（国内站）/ SSR（国际站） | **数量最大、页面最大**（单页约 20 万 token），必须按标题分节再抽取；国际/国内价格区域不同，需按 `providers[].base_url` 区域取值 |
| Zhipu AI (43) | 需 Key（字段未核验） | 国际 `docs.z.ai/guides/overview/*`；国内 `docs.bigmodel.cn/cn/guide/start/model-overview` | `docs.z.ai/guides/overview/pricing`、`docs.bigmodel.cn/cn/guide/start/pricing` | `docs.z.ai/release-notes/new-released/rss.xml`（已测） | MD | 两站均 Mintlify；HF `zai-org/*/config.json` 用于 "200K"=202752 口径 |
| ByteDance (23) | 需 Key（方舟 `/api/v3/models`）；火山 OpenAPI `ListFoundationModels`（AK/SK，未核验） | `volcengine.com/docs/82379/1330310`（模型列表） | `82379/1544106`（模型价格） | `82379/1159178`（模型发布公告）、`82379/1350667`（模型下线公告） | **SPA + JSON** | HTML 正文仅 60 字符（已测）；但 `www.volcengine.com/api/doc/getDocDetail?LibraryID=82379&DocumentID=<id>&type=online` 返回 `MDContent` 与 `UpdatedTime`（已测，非公开接口）。**现有 23 个文件引用的 `82379/1099320` 已返回空文档** |
| StepFun (25) | 需 Key | `platform.stepfun.ai/docs/en/guides/models/overview` | `/docs/en/guides/pricing/details` | 未找到 changelog 页（`/docs/en/changelog.md` 404） | MD | 无 sitemap/llms.txt；国内站 `platform.stepfun.com` 有 Cloudflare 标记 |
| MiniMax (19) | 需 Key | `platform.minimax.io/docs/guides/models-intro` | `/docs/guides/pricing-paygo` | `/docs/release-notes/models.md`（已测） | MD | 国内站 `minimaxi.com` 另有价格（CNY） |
| Moonshot AI (4) | 需 Key | `platform.kimi.ai/docs/models` | `/docs/pricing/chat` | `/docs/changelog.md`（已测） | MD | 国内站 `platform.moonshot.cn` |
| Baidu (17) | 403（千帆 v2 需 IAM 签名或 Key） | `cloud.baidu.com/doc/qianfan/s/rmh4stp0j` 等 | `cloud.baidu.com/doc/qianfan-docs/s/Jm8r1826a` 等 | 千帆模型下线公告（未核验具体页） | SSR | 正文在 HTML 中（已测）；文档 ID 无语义，改版风险 |
| Tencent (19) | 需 Key（混元 OpenAI 兼容） | `cloud.tencent.com/document/product/1729/*`、`1823/*`（TokenHub） | `1729/97731` 等 | 产品动态页（未核验） | SSR | `cloud.tencent.com/llms.txt` 是官网通用索引，不含模型文档 |
| SenseTime (21) | 需 Key | `docs.senseaudio.cn/guides/account/model-list` | 同页 | — | MD | 另有 `token.sensenova.cn` |
| iFlytek (9) | 需 Key | `xfyun.cn/doc/spark/*.html` | `xinghuo.xfyun.cn/sparkapi` | — | SSR / **SPA** | `xfyun.cn/doc` 静态可解析；`xinghuo.xfyun.cn/sparkapi` 为 SPA（文本 61 字符，已测） |
| Kuaishou (9) | 需 Key | `kling.ai/document-api/guides/capability-map/*` | `kling.ai/document-api/pricing/base/*` | `kling.ai/document-api/updates/api` | **SPA**，但 `.md` 可用 | HTML 文本 45 字符，`.md` 版本可取（已测）；StreamLake 文档链接 404（已测，现有数据需复查） |
| Xiaomi (9) | 需 Key | `mimo.mi.com/docs/*` | `/docs/zh-CN/price/pay-as-you-go` | — | SSR | HF `XiaomiMiMo/*` |
| Ant Group (6) | 需 Key | `developer.ant-ling.com/en/docs/models/*` | `/en/docs/models/price` | `/en/docs/getting-started/changelog` | SSR | sitemap 可用 |
| Shengshu Vidu (12) | 需 Key | `platform.vidu.com/docs/overview/model-map` | 同站 | `/docs/api-reference/updates` | MD | `llms.txt` 为 HTML |
| Shanghai AI Lab (7) | 需 Key（返回「登录已过期」） | `internlm.intern-ai.org.cn/doc/docs/模型列表/` | 未见单价 | `shlab.org.cn/news` | SSR | HF `internlm/*` |
| Meituan (2) | 需 Key | `longcat.chat/platform/docs/` | `/platform/docs/pricing/*` | `/platform/docs/change-log` | MD | |
| Huawei (2) | 需 Key（MaaS） | `support.huaweicloud.com/model-list-maas/model_list_0001.html` | `/price-maas/price-maas-0002.html` | `/bulletin-maas/bulletin-maas-0001.html` | SSR | `llms.txt` 为 HTML |
| Baichuan (2) | 需 Key | `platform.baichuan-ai.com/docs-v2/*` | `platform.baichuan-ai.com/prices` | — | **SPA**（文档页）/ SSR（价格页） | 文档页文本 293 字符（已测） |

### 1.6 未收录的重点厂商（候选）

只列「模型厂商自家有公开 API」的候选；收录前须按 `maintenance.md` 的范围逐家确认。状态码为 2026-10-11 访问文档首页的结果。

| 厂商 | 类型 | 官方文档（状态） | 备注 |
| --- | --- | --- | --- |
| Hume AI | 语音（EVI、TTS） | `dev.hume.ai`（`/docs` 404，路径待查） | 未核验 |
| Fish Audio | TTS | `docs.fish.audio`（200） | |
| Resemble AI | TTS | `docs.resemble.ai`（200） | |
| Rime | TTS | `docs.rime.ai`（200） | |
| LMNT | TTS | `docs.lmnt.com`（200） | |
| Inworld | TTS | `docs.inworld.ai`（200） | |
| Gladia | STT | `docs.gladia.io`（200） | |
| Rev.ai | STT | `docs.rev.ai`（200） | |
| Liquid AI | LLM | `docs.liquid.ai`（200） | 是否有第一方付费 API 待确认 |
| Arcee AI | LLM | `docs.arcee.ai`（200） | |
| Nous Research | LLM | `portal.nousresearch.com`（200） | |
| Poolside | 代码 LLM | `docs.poolside.ai`（200） | 可能仅企业 |
| Perceptron | 视觉 LLM | `docs.perceptron.inc`（200） | |
| Morph / Relace | 代码应用模型 | `docs.morphllm.com`、`docs.relace.ai`（200） | 是否属于「模型厂商」需判断 |
| Krea | 图像/视频 | `docs.krea.ai`（200） | 部分为第三方模型转售，需甄别 |
| Bria AI | 图像 | `docs.bria.ai`（200） | |
| Freepik | 图像（Mystic） | `docs.freepik.com`（200） | 混有第三方模型 |
| Adobe Firefly | 图像/视频 | `developer.adobe.com/firefly-services/docs/firefly-api/`（200） | 企业授权 |
| Tripo（VAST） | 3D | `platform.tripo3d.ai/docs`（200） | `3d` 类型已在规范中 |
| Meshy | 3D | `docs.meshy.ai`（200） | |
| Moonvalley / Hedra | 视频 | 文档域名解析失败（未核验） | |
| 零一万物 | LLM | `platform.lingyiwanwu.com/docs`（200） | 业务状态需确认 |
| 360 智脑 | LLM | `ai.360.com/platform/docs/overview`（200） | |
| 昆仑万维 Skywork | LLM/音乐/视频 | 域名未核验 | |
| Ola Krutrim | LLM（印度） | `cloud.olakrutrim.com`（200） | |
| Aleph Alpha | LLM（欧洲） | `docs.aleph-alpha.com`（200） | 已转向企业平台，需确认公开 API |
| LG AI Research EXAONE | LLM | `lgresearch.ai/exaone`（200） | 是否有第一方 API 待确认 |
| Microsoft Phi（已有厂商内的缺口） | LLM | Azure AI Foundry | 现有 `microsoft` 只收 MAI 系列 |

不收录说明：Groq、Together、Fireworks、Cerebras、SiliconFlow、OpenRouter 等是托管/聚合平台，按约定不计入模型厂商，但它们的模型列表 API 可作线索（见第 2 节）。

---

## 2. 线索源（不可引用，只用于发现变化）

| 线索源 | 内容 | 获取 | 更新频率 | 许可 / 条款 | 用法 |
| --- | --- | --- | --- | --- | --- |
| **models.dev** `https://models.dev/api.json`；GitHub `anomalyco/models.dev`（原 `sst/models.dev`） | 226 个 provider、8443 条（已测）：limit.context/output、cost（input/output/cache）、modalities、reasoning、knowledge、release_date、last_updated | 公开 JSON，无需 Key | 每小时同步（`sync-models.yml` cron `17 * * * *`） | MIT | 主线索：按 provider 映射到我们的 `owned_by`，比较 ID 集合与数值 |
| **LiteLLM** `model_prices_and_context_window.json`（`BerriAI/litellm`） | 4036 条：max_input/output_tokens、input/output_cost_per_token、mode、supports_* | raw GitHub | 持续提交；另有每周自动更新工作流 | MIT（`enterprise/` 除外） | 价格与上下文的交叉核对；键名含托管平台前缀，噪声大 |
| **OpenRouter** `openrouter.ai/api/v1/models` | 458 条：context_length、pricing、architecture、supported_parameters、knowledge_cutoff、**expiration_date** | 公开 JSON | 实时 | 服务条款约束（未逐条核验），仅作检测不转载 | 新模型最早出现处之一；`expiration_date` 可作下线信号 |
| **Hugging Face Hub API** `huggingface.co/api/models?author=<org>&sort=createdAt` | 开源权重发布、`config.json` | 公开 API（有速率限制） | 实时 | 各模型许可不同；API 本身可用 | 开源权重厂商（Qwen、DeepSeek、zai-org、moonshotai、MiniMaxAI、stepfun-ai、XiaomiMiMo、inclusionAI、internlm、mistralai、nvidia、ibm-granite、jinaai 等）的新模型信号；`config.json` 本身已被维护约定认可为上下文口径依据 |
| **Artificial Analysis** API | 模型评测、价格、速度 | 需 API Key（无 Key 返回 401，已测） | 频繁 | 免费层要求署名（未核验） | 可选；价值主要在发现新模型 |
| **Portkey-AI/models** | 价格与配置 JSON | GitHub | 活跃 | MIT | 次要交叉核对 |
| **pydantic/genai-prices** | 价格数据 + 计算 | GitHub | 活跃 | MIT | 次要交叉核对 |
| **simonw/llm-prices** | 价格表 | GitHub | 活跃 | 未声明许可 | 仅看，不复制 |
| 托管平台列表（Groq、Together、Fireworks、Cerebras 等） | 新模型上架 | 多需 Key | 实时 | — | 低优先级 |
| 厂商 SDK 仓库（`openai-python`、`anthropic-sdk-python`、`googleapis/python-genai`、`mistralai/client-python`） | 模型 ID 枚举、OpenAPI 生成代码 | GitHub API / Releases Atom | 随发布 | 多为 Apache-2.0/MIT | 官方来源但通常不作数值出处；作为新 ID 出现的早期信号 |

### 2.6 线索源对比示例（说明映射难度）

用 models.dev 直连 provider 的 ID 集合与本仓库（含 `aliases`）对比（2026-10-11）：
- Anthropic、DeepSeek、Moonshot、Inception、MiniMax 等完全覆盖；
- Mistral：models.dev 有 25 个 ID 不在本仓库（如 `devstral-*` 系列）；
- OpenAI：21 个（多为 `gpt-4`、`gpt-3.5-turbo` 等旧模型或日期快照）；
- 阿里国内站：51 个（大量为第三方模型 DeepSeek/MiniMax 托管版，按约定不计入阿里）；
- NVIDIA：98 个（几乎全是第三方托管）。

结论：线索源对比必须配合「每厂商忽略规则 + 快照 ID 识别 + 第三方模型过滤」，否则噪声会淹没真实信号。

---

## 3. 管线架构

### 3.1 约束映射

| 约束 | 对管线的要求 |
| --- | --- |
| 数据唯一真源 `data/models/*.json` | 管线只产出对这些文件的 PR，不另存数据副本；快照与状态不进入站点构建 |
| 每个数值可在官方页面找到 | 每个改动值必须带 `{url, quote}` 证据，并通过确定性校验 |
| 未知写 `null`，不推算 | 抽取提示词与校验器都禁止推算；校验器只允许 `maintenance.md` 列出的精确换算 |
| 纯静态 | 管线只在 GitHub Actions 中运行；不使用 Cloudflare Worker Cron、数据库或常驻服务 |
| 数据通过 PR 更新、CI 跑 `pnpm check && pnpm build` | 每个厂商一个分支一个 PR；PR 需由 GitHub App/PAT 创建才能触发 CI |
| `info.verified_at` 为人工核验日期 | 管线只更新 `sources[].retrieved_at`；`verified_at` 由人工审核时更新（或审核后打标签触发工作流写入） |

### 3.2 流程总览

```text
            ┌───────────── 定时（cron） ─────────────┐
            ▼                                        ▼
  [1 抓取] 来源注册表 → fetch（ETag/Last-Modified）    [1' 线索] models.dev / LiteLLM / OpenRouter / HF
            │  归一化：HTML→正文→Markdown；按标题分节      │  映射到 owned_by + 我们的 id/aliases
            ▼                                        ▼
  [2 检测] 分节哈希对比上次快照；API 列表 diff；RSS 新条目；线索 diff
            │  无变化 → 结束（零成本）
            ▼
  [3 抽取] 确定性适配器（API 型厂商）  或  Claude 结构化抽取（只喂变化的分节 + 当前模型 JSON）
            │  输出：字段级变更提案 [{model, field, old, new, url, quote}]
            ▼
  [4 校验] quote ∈ 快照文本？ new 可由 quote 按允许规则得到？ zod/validate-data 通过？ 交叉检查
            │  通过 → 进 PR      不通过 / 需判断 → 进 Issue
            ▼
  [5 产出] 每厂商一个 PR（证据表 + 源链接 + diff 摘要），CI 运行；人工审核合并
           需判断事项开 Issue（新模型是否收录、价格分档取哪档、疑似下线等）
```

### 3.3 关键组件设计

**来源注册表**（建议 `scripts/pipeline/sources/<vendor>.json`，人工维护）：

```json
{
  "vendor": "anthropic",
  "sources": [
    { "id": "models", "url": "https://platform.claude.com/docs/en/about-claude/models/overview", "fetch": "md", "kind": "models" },
    { "id": "pricing", "url": "https://platform.claude.com/docs/en/about-claude/pricing", "fetch": "md", "kind": "pricing" },
    { "id": "deprecations", "url": "https://platform.claude.com/docs/en/about-claude/model-deprecations", "fetch": "md", "kind": "lifecycle" },
    { "id": "api", "url": "https://api.anthropic.com/v1/models", "fetch": "api", "auth": "ANTHROPIC_API_KEY", "adapter": "anthropic" },
    { "id": "feed", "url": "https://status.claude.com/history.rss", "fetch": "rss", "kind": "signal" }
  ],
  "ignore": ["^claude-.*-\\d{8}$"],
  "aliasRules": [{ "pattern": "^(.*)-(\\d{8})$", "canonical": "$1" }]
}
```

`fetch` 取值：`md`（加 `.md`）、`md.txt`、`html`（SSR，Readability + turndown）、`volc-json`（火山引擎文档接口）、`playwright`（少数 SPA）、`api`、`rss`、`sitemap`。初始注册表可由脚本从现有 845 个文件的 `sources` 自动生成（本调研已做过统计：每家 3–6 个高频 URL 覆盖绝大多数模型），再人工补 API 与 RSS。

**归一化与分节**：
- 统一转 Markdown，去导航/页脚/脚本，Unicode NFKC、空白折叠；表格保留为 Markdown 表格。
- 按 `##`/`###` 标题分节，每节单独哈希。这样阿里 68 万字符的价格页只会把真正变化的几节送去抽取。
- 去除噪声：时间戳、随机 ID、「最后更新于」字样等按厂商配置的正则剔除，避免假变化。

**变更检测（全部确定性、零 LLM 成本）**：
1. 分节哈希 diff；
2. 模型列表 API：ID 集合 diff + 结构化字段 diff（Anthropic 的 limits/lifecycle、xAI 的价格、Cohere 的 is_deprecated 等）；
3. RSS/Atom 新条目（关键词过滤：model、deprecat、pricing、模型、下线、价格）；
4. sitemap `lastmod` 变化（有 lastmod 的站点可先于全文抓取做廉价预筛）；
5. 线索源 diff：新出现的 ID、与本仓库数值不一致的字段；
6. 链接健康：404、重定向、空文档（如火山 1099320）。

**抽取**：
- *确定性适配器*（优先）：Anthropic、Google、xAI、Cohere、Mistral（需 Key）；Jina、Inception、IBM、Deepgram（公开）。只覆盖 API 权威的字段，其它字段保留原值。
- *LLM 抽取*：Claude，使用结构化输出（JSON schema 由 `src/content.config.ts` 的字段推导，只允许输出「变更提案」而不是整份文件）。输入 = 变化分节（含前后版本）+ 受影响模型的当前 JSON + 该厂商的口径规则（如 1K=1024）。提示词明确：只抄原文，不换算（换算交给校验器的白名单函数），找不到就不提。
- 推荐模型：常规用 Claude Sonnet（Sonnet 5.5：输入 2 美元/百万 Token，输出 10 美元/百万 Token，取自本仓库 `data/models/claude-sonnet-5-5.json`）；大页面预筛或 RSS 分类可用 Haiku 5.5（0.1/0.5 美元）；不需要 Opus。

**防幻觉校验（核心）** `verify.mjs`：
1. `quote` 必须是该 URL 本次快照归一化文本的子串（同样归一化后比较）；
2. `new` 必须能从 `quote` 经白名单变换得到：
   - 数字原样（`$0.10` → 0.1；`¥2` → 2；千分位、全角数字）；
   - 每千 → 每百万 ×1000、每千张 ÷1000 等 `maintenance.md` 允许的精确换算；
   - 缩写上下文按厂商口径表（`128K` × 1024 或 × 1000）；
   - 日期格式（`October 8, 2026` / `2026年10月8日` → `2026-10-08`；只有月份 → 必须为 `null`）；
3. 字段级权威矩阵：如 `pricing` 只接受 `kind=pricing` 的来源，`status=deprecated` 只接受 lifecycle 页或 API lifecycle；
4. 跑 `node scripts/validate-data.mjs <文件>`，再在 CI 跑 `pnpm check && pnpm build`；
5. 交叉检查（不阻断，只标注）：与线索源不一致、价格变化超过 ±50%、上下文变小、`release_date` 晚于今天等，在 PR 中高亮。

任何一步失败 → 不改文件，进 Issue，附原文片段与失败原因。

**产出**：
- 每厂商一个分支 `pipeline/<vendor>`，重复运行时强制更新同一分支、同一 PR（参照 models.dev）。
- PR 正文：变更表（模型、字段、旧值、新值、证据原文 ≤200 字、URL、抓取时间）、校验结果、交叉检查告警；只引用短片段，不贴整页。
- 自动更新改动文件的 `sources[].retrieved_at`；不写 `verified_at`。
- Issue 用固定标题去重（`[pipeline] <vendor>: <model-id> <事项>`），参考 models.dev 的「标题去重 + 已关闭也算」策略，避免反复提醒已决定忽略的条目。

**新模型与下线**：
- 新 ID：先判断是否为快照/别名（规则 + 线索源 canonical 映射）→ 建议加入现有文件 `aliases`；否则开「新模型」Issue，附可抽取到的字段草稿；人工确认收录后由抽取步骤生成新文件（未知字段一律 `null`）。
- 下线：官方宣布 → `status: deprecated`（PR）；官方页面写明已下线（退役日已过）→ `status: retired`（PR，附写明下线的官方页面）。不删除文件（2026-10-11 已决定：下线模型保留记录，只标注状态）。
- 全量采集包含已下线模型：各厂商的下线 / 弃用页面（lifecycle）作为固定来源，新出现的下线条目若本库未收录，按 `retired` 新建文件（字段取官方旧文档或存档快照，查不到为 `null`）。

**合并策略（建议）**：
- MVP 阶段：全部人工合并。
- 稳定后可自动合并的白名单（需分支保护 + CI 通过 + 校验全绿）：①只改 `retrieved_at`；②确定性适配器从官方 API 得到、且与页面证据一致的 `limits` / `status`；③多源一致的价格不变确认。价格数值变化、新模型、删除一律人工。

**运行与限额**：
- 抓取量很小：约 250 个页面/接口，每主机串行、≥1 秒间隔，带 ETag/If-Modified-Since，遵守 robots.txt，UA 标明项目与联系方式。
- GitHub Actions：公开仓库标准 runner 免费；cron 最小 5 分钟且可能延迟；**公开仓库 60 天无活动会自动停用定时工作流**；`GITHUB_TOKEN` 创建的 PR/推送不触发其它工作流（需 GitHub App 安装令牌，参考 models.dev 的 `setup-git-committer`）。
- 国内站点从美国 runner 访问的稳定性需实测；不稳定时可加一台自托管 runner（不违反「纯静态」，它只是 CI 执行机）。

**快照存储**（候选，需决策）：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 独立**私有**仓库 `modelinfo-snapshots`（推荐） | git 自带历史与 diff（「git scraping」模式）；不公开转载厂商文档 | 需跨仓库令牌 |
| 本仓库孤儿分支 | 简单 | 公开转载厂商文档有版权顾虑；仓库膨胀 |
| Actions artifacts / cache | 无需额外仓库 | 默认保留 90 天、cache 10 GB 上限，不适合长期证据 |
| Cloudflare R2 | 容量大 | 引入外部存储与密钥；虽非运行时，但增加依赖 |

**密钥清单**：
- 必需：`ANTHROPIC_API_KEY`（抽取 + Anthropic 模型列表）；GitHub App（`PIPELINE_APP_ID`、`PIPELINE_APP_PRIVATE_KEY`）或细粒度 PAT；快照仓库写权限。
- 推荐（结构化 API）：`GEMINI_API_KEY`、`XAI_API_KEY`、`MISTRAL_API_KEY`、`COHERE_API_KEY`、`OPENAI_API_KEY`。
- 可选（仅做 ID 存在性检测）：`DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`ZAI_API_KEY`/`ZHIPU_API_KEY`、`DASHSCOPE_API_KEY`（国内/国际各一）、`ARK_API_KEY`、`MINIMAX_API_KEY`、`STEPFUN_API_KEY`、`ELEVENLABS_API_KEY` 等。国内多数需实名认证，部分需余额。
- 注意：列表接口按账号可见（OpenAI、方舟需开通模型），「列表里没有」不等于「已下线」。

**节奏建议**：

| 来源类型 | 频率 |
| --- | --- |
| 模型列表 API、RSS、status 页 | 每 6 小时 |
| 模型页、价格页、下线页（分节哈希） | 每日 |
| 线索源（models.dev、LiteLLM、OpenRouter、HF） | 每日 |
| 链接健康检查 | 每周 |
| 全量复核（对所有模型重新抽取并比对，不依赖变化） | 每季度，按厂商分批，用 Batch API |

### 3.4 成本估算（Claude API）

假设：每天约 5–15 个分节变化，每次抽取输入 2 万–4 万 Token（变化分节前后版本 + 受影响模型 JSON + 规则），输出约 3000 Token；用 Sonnet 5.5（2/10 美元每百万）。

| 场景 | 输入 Token | 输出 Token | 费用 |
| --- | --- | --- | --- |
| 日常（每日 10 次抽取） | 30 万/日 | 3 万/日 | 约 0.9 美元/日 → **约 27 美元/月** |
| 发布高峰（每日 30 次） | 90 万/日 | 9 万/日 | 约 2.7 美元/日 |
| 季度全量复核（约 250 页 × 平均 4 万 Token） | 1000 万 | 50 万 | 约 25 美元；Batch 半价约 **13 美元** |
| RSS/线索分类（Haiku 5.5） | 少量 | 少量 | < 1 美元/月 |

规则重复部分可用提示缓存进一步降低。整体月预算按 **50 美元**封顶即可，超出时暂停 LLM 步骤只保留检测与 Issue。

### 3.5 方案对比

| | 方案 A：只检测，人工补录 | 方案 B：检测 + LLM 抽取 + 证据校验 → PR（推荐主干） | 方案 C：每厂商确定性解析器全自动（models.dev 式） |
| --- | --- | --- | --- |
| 做法 | 快照/API/线索 diff → 开 Issue 附 diff | 见 3.2 | 每家写 API/表格解析器，直接改文件，缺失项开 Issue 交给代理 |
| 准确性 | 最高（全人工） | 高（证据校验把关，仍需人工审） | API 型厂商很高；表格解析遇改版会静默出错 |
| 覆盖 | 全部 63 家 | 全部（SPA 用 Playwright 或降级 A） | 只有约 9 家有结构化 API；其余要写脆弱的 HTML 解析器 |
| 维护成本 | 低 | 中（注册表 + 提示词 + 校验器） | 高（63 个解析器跟随改版） |
| 运行成本 | 0 | 约 30–60 美元/月 | 0 |
| 人工负担 | 高（每次变化都要人补） | 低（审 PR） | 低，但出错难发现 |
| 合规风险 | 无 | 低（证据强制） | 中（解析器推算或错位） |

**推荐**：以 B 为主干；对 API 字段丰富的厂商叠加 C 的确定性适配器（只负责 API 权威字段）；对 SPA/403/证据校验失败的情况自动降级为 A。三者共用同一套抓取、快照、校验与 PR 产出代码。

另一个可选的「代理式」变体：Issue 打开后由 `anthropics/claude-code-action`（MIT）运行 Claude Code，在受限路径（只允许改 `data/models/*.json`）内补全数据并开 PR，类似 models.dev 的 `issue-fixer.yml`（用 opencode）。适合「新模型」这类需要多页查找的任务，但仍必须过 3.3 的证据校验与 CI。

---

## 4. 可借鉴的开源项目

| 项目 | 许可 | 可借鉴点 |
| --- | --- | --- |
| **anomalyco/models.dev**（`sync-models.yml`、`issue-fixer.yml`、`sync.md`） | MIT | 按 provider 矩阵并行同步、每 provider 一个可复用自动化 PR、同步报告写入 PR 正文、缺失模型开 Issue（固定标题去重，已关闭的也算，列表失败时不创建）、Issue 自动派发代理修复且限制可改路径、6 小时重试兜底；明确记录了 OpenAI/Google 列表 API 不适合判断下架的原因 |
| **BerriAI/litellm**（`auto_update_price_and_context_window.yml`、`cost-map-guard.yml`） | MIT（`enterprise/` 除外） | 每周定时从第三方 API 更新 JSON 并开 PR；schema 同步与守卫工作流；反例：直接采用聚合源数据，不符合本项目「只用官方来源」原则 |
| **Portkey-AI/models** | MIT | JSON 校验工作流、同步到对象存储 |
| **pydantic/genai-prices** | MIT | 价格数据带来源链接与历史价格结构 |
| **dgtlmoon/changedetection.io** | Apache-2.0 | 网页变化检测思路：CSS/XPath 过滤、忽略文本规则、触发阈值（不建议引入服务，只借思路） |
| **simonw/shot-scraper** + 「git scraping」模式 | Apache-2.0 | 用定时 Actions 抓取并把快照提交进 git，以 git diff 作为变更记录 |
| **mozilla/readability** | Apache-2.0 | HTML 正文抽取 |
| **mixmark-io/turndown** | MIT | HTML → Markdown |
| **microsoft/playwright** | Apache-2.0 | 少数 SPA 页面渲染 |
| **anthropics/claude-code-action** | MIT | Issue/PR 驱动的代理修复 |
| **peter-evans/create-pull-request** | MIT | 幂等创建/更新 PR |

引入任何第三方源码（不只是依赖）前，按 AGENTS.md 登记到 `THIRD_PARTY_NOTICES.md`。

---

## 5. 分阶段计划

### P0 基础（约 1 周）
- 从现有 `sources` 自动生成来源注册表初稿，人工补 API/RSS/fetch 方式。
- 实现抓取、归一化、分节哈希、快照写入私有仓库。
- 链接健康检查（每周）：输出 404/重定向/空文档清单（首批应包括火山 `82379/1099320`、StreamLake 链接）。
- 产出：每周一个汇总 Issue，不改数据。

### P1 变更检测 MVP（约 2–3 周）
- 模型列表 API diff：公开的 6 家 + 已有 Key 的厂商。
- RSS / changelog / 下线页监控（第 1 节已验证的 feed 先上）。
- 线索源 diff（models.dev、LiteLLM、OpenRouter、HF），带每厂商忽略规则与快照 ID 识别。
- 产出：按厂商开/更新 Issue（变化摘要 + diff 链接），仍不改数据。
- 验收：连续两周误报率可接受（建议 < 30%），未漏报已知发布。

### P2 抽取与 PR（约 3–4 周）
- 证据校验器（3.3 的白名单换算 + 子串校验 + 权威矩阵），先用历史数据回测：对现有 845 个文件跑一遍「从当前快照能否找到证据」，顺便得到一份待复核清单。
- LLM 抽取：先接 10 家 MD 型厂商（OpenAI、Anthropic、Google、xAI、Cohere、智谱、MiniMax、Moonshot、阶跃、Voyage）。
- 每厂商一个 PR，GitHub App 身份，CI 正常触发；人工审核。
- 验收：PR 中被人工改动/拒绝的字段比例 < 10%。

### P3 确定性适配器与生命周期（约 2–3 周）
- Anthropic、Google、xAI、Cohere、Mistral、Jina、Inception、IBM、Deepgram 适配器。
- 新模型流程（Issue → 人工确认 → 生成文件）；下线/退役流程。
- 可选：Issue 驱动的 Claude Code 代理补录。

### P4 全量（持续）
- 覆盖全部 63 家：阿里分节抽取、火山 JSON、Playwright 处理 SPA、Naver 等 403 站点的替代来源。
- 自动合并白名单上线；季度全量复核（Batch）。
- 「过期数据」报告：`verified_at` 超过 N 天的模型列表。
- 候选厂商收录评估（1.6 节）。
- 写 `docs/pipeline.md` 并登记到 `docs/README.md`；在 `maintenance.md` 说明自动 PR 的审核规则。

### 文件布局建议

```text
scripts/pipeline/
  package.json            # 可选：独立依赖（turndown、readability、playwright），不进站点构建
  sources/<vendor>.json   # 来源注册表、忽略规则、别名规则、口径
  lib/
    fetch.mjs             # UA、限速、重试、ETag、robots
    normalize.mjs         # HTML→Markdown、分节、去噪
    snapshot.mjs          # 读写快照仓库、哈希
    units.mjs             # 白名单换算与上下文口径（与 maintenance.md 一致）
    evidence.mjs          # 子串校验 + 数值推导校验
    github.mjs            # 分支/PR/Issue 幂等操作与去重
  adapters/               # 确定性 API 适配器：anthropic.mjs google.mjs xai.mjs cohere.mjs mistral.mjs jina.mjs inception.mjs ibm.mjs deepgram.mjs
  leads/                  # models-dev.mjs litellm.mjs openrouter.mjs huggingface.mjs
  extract/
    llm.mjs               # Claude 结构化输出
    prompt.md             # 抽取规则（引用 maintenance.md 条款）
  detect.mjs  extract.mjs  verify.mjs  propose.mjs  linkcheck.mjs  report.mjs
.github/workflows/
  pipeline-detect.yml     # cron：抓取 + 检测（矩阵按厂商）
  pipeline-propose.yml    # 检测有变化时（workflow_dispatch / workflow_run）：抽取 + 校验 + PR
  pipeline-linkcheck.yml  # 每周
  pipeline-sweep.yml      # 季度全量复核
  pipeline-verified.yml   # 可选：PR 打 verified 标签后写入 info.verified_at
```

代码边界：管线只写 `data/models/*.json`（新厂商时加 `data/vendors/*.json`），不改 `src/`；校验复用 `scripts/validate-data.mjs`，避免第三套规则（可考虑把 `validate-data.mjs` 的规则抽成可 import 的模块）。

---

## 6. 需要负责人决定的事项

1. **自动化权限边界**：MVP 只开 Issue，还是直接开数据 PR？哪些类别允许自动合并（建议见 3.3）？
2. **`verified_at` 语义**：机器校验通过是否算「核验」？建议保持人工语义，由审核时（或打标签触发）写入。
3. **是否使用 Claude API 抽取**，以及月预算上限（建议 50 美元封顶）与模型选择。
4. **快照存储位置**：私有仓库（推荐）/ 公开分支 / Actions artifacts / R2；以及 PR 中证据原文的长度上限。
5. **厂商 API Key**：申请哪些、由谁持有和付费；国内厂商实名认证由谁办理。
6. ~~**退役模型**~~：已决定（2026-10-11）——不删除，`info.status` 标为 `retired`，见 `docs/maintenance.md`。
7. **证据是否入库**：是否新增不发布的维护字段（例如在 `sources` 中加片段）？这会改变顶层字段/`sources` 结构，需同步 schema、`validate-data.mjs` 与规范文档；不加则证据只存在于 PR 和快照仓库。
8. **新厂商发现**：线索源发现的新厂商（1.6 节）是否自动开 Issue，还是只在周报中列出？
9. **双站厂商取值**（阿里、智谱、Moonshot、MiniMax、阶跃）：维持「与 `providers[].base_url` 区域一致」，还是两区域都建 provider 覆盖值？
10. **GitHub 身份**：创建 GitHub App（推荐，可精确授权、可触发 CI）还是使用 PAT。
11. **运行位置**：仅 GitHub 托管 runner，还是为国内站点增加自托管 runner？
12. **依赖策略**：Playwright 等重依赖放独立 `scripts/pipeline/package.json`，还是并入根 `devDependencies`？
13. **通知方式**：仅 GitHub Issue/PR，还是另加周报汇总 Issue / 邮件。

---

## 附：本次实测记录要点

- 免鉴权模型列表：Jina、Inception（OpenRouter 格式，含价格/上下文）、NVIDIA、Deepgram、Typhoon、IBM；AI21 返回空列表。
- `.md` 可用的厂商主页面（已测）：OpenAI、Anthropic、Google（`.md.txt`）、xAI、Cohere、智谱（两站）、阶跃、MiniMax、Moonshot、Voyage、Perplexity、ElevenLabs、阿里（国内站）、Deepgram、Inception、Meta、Writer、Reka、Contextual、AssemblyAI、SenseAudio、Upstage、Ideogram、LTX、Twelve Labs、BFL、Cartesia、Sarvam、Speechmatics、PixVerse、AI Singapore、Mixedbread、Recraft、AI21、Leonardo、Runway、NVIDIA、LongCat、Vidu、可灵。
- 前端渲染（HTML 几乎无正文）：火山引擎（有文档 JSON 接口）、讯飞星火 API 页、可灵（`.md` 可替代）、Stability API reference、百川文档页。
- 反爬/拦截：`openai.com`、`x.ai`、`perplexity.ai` 主站 Cloudflare 403；Naver 文档 403；Cartesia changelog 429。
- 已验证 RSS：Cohere、ElevenLabs、Sarvam、LTX、Deepgram（Fern `.rss`）；Z.ai、BFL、AI21、Writer（Mintlify `/rss.xml`）；OpenAI 博客与新闻、Google Developers Blog、Hugging Face 博客；OpenAI 与 Anthropic/Claude status。
