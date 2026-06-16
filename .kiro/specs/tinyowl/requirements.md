# Requirements Document

## Introduction

tinyowl（中文名「猫头鹰评测」，域名 https://tinyowl.cn ）是一个面向 API「中转站」（model-relay）的评测与验证平台。中转站是指对外提供 OpenAI 兼容接口、转售各大模型厂商（OpenAI / Anthropic / Google 等）API 能力的第三方服务。由于中转站存在「模型身份替换」「降智（用低配模型冒充高配模型）」「协议不一致」「日志与密钥不透明」「高配低卖」等风险，tinyowl 通过对用户提供的中转站接口进行多维度、多轮探测，给出低成本的技术性验证结论，并维护一个按模型分类的中转站榜单、官方 API 状态监控、检测历史与科普内容。

本平台对标参考站点禾维AI（https://hvoy.ai/ ），方法学参考开源项目 add-matong/llm-api-model-verifier、论文《Auditing Black-Box LLM APIs with a Rank-Based Uniformity Test》《Deceptive Model Claims in Shadow APIs》，以及 BerriAI/liteLLM、Mirrowel/LLM-API-Key-Proxy 等 OpenAI 兼容网关实现模式。

本文档定义检测/验证引擎、按模型分类的中转站榜单、官方 API 状态监控、检测历史、用户 API Key 隐私处理、FAQ/内容页面，以及整体 Web 应用（前端 + 后端）的需求。产品界面为中文。检测结论为低成本技术性验证，非法律审计，且不保证 100% 准确。

## Glossary

- **tinyowl**：本评测平台的整体系统，包含前端、后端及检测引擎。
- **Detection_Engine（检测引擎）**：后端中负责对中转站接口执行多轮探测、采集与判定的子系统。
- **Relay_Endpoint（中转站接口）**：用户提供的、对外暴露 OpenAI 兼容 API 的中转站基础 URL（base URL）。
- **API_Key（接口密钥）**：用户为访问 Relay_Endpoint 提供的鉴权密钥。
- **Target_Model（目标模型）**：用户选择的、声称由 Relay_Endpoint 提供的模型标识（如 GPT 5.5、Opus 4.8）。
- **Detection_Task（检测任务）**：一次完整的检测过程，包含输入配置、多维度探测与最终评分。
- **Detection_Dimension（检测维度）**：单个评测角度，取值范围为：返回协议一致性、响应结构、知识问答结果、身份一致性、思维链痕迹、签名指纹。
- **Detection_Score（检测评分）**：基于多维度交叉验证得出的综合可信度评分。
- **Cache_Detection_Mode（缓存检测模式）**：可选检测模式，通过额外探测识别中转站缓存行为，约增加 30 秒耗时。
- **Leaderboard（榜单）**：按 Target_Model 分类展示中转站渠道及其指标的列表。
- **Channel（渠道）**：榜单中的一个中转站条目。
- **Official_API_Status（官方API状态）**：OpenAI / Claude / Gemini 官方 API 的可用性状态。
- **Detection_History（检测历史）**：已完成 Detection_Task 的记录列表。
- **Certification_Status（认证状态）**：渠道的认证级别，取值范围为：企业认证、个人实名认证、未认证。
- **Frontend（前端）**：用户可见的中文 Web 界面。
- **Backend（后端）**：提供 API、执行检测、持久化数据的服务端。
- **Operator（运营者）**：维护榜单、渠道与内容的平台管理员。

## Requirements

### Requirement 1: 检测接口配置输入

**User Story:** 作为一名中转站用户，我想要输入中转站接口地址、API Key 并选择目标模型，以便发起一次检测。

#### Acceptance Criteria

1. THE Frontend SHALL 提供输入字段用于接收 Relay_Endpoint URL、API_Key 以及 Target_Model 选择。
2. WHEN 用户提交检测请求且 Relay_Endpoint URL 为空，THE Frontend SHALL 阻止提交并提示「中转站接口地址不能为空」。
3. WHEN 用户提交检测请求且 API_Key 为空，THE Frontend SHALL 阻止提交并提示「API Key 不能为空」。
4. WHEN 用户提交检测请求且未选择 Target_Model，THE Frontend SHALL 阻止提交并提示「请选择目标模型」。
5. IF Relay_Endpoint URL 不符合 `http` 或 `https` 协议的 URL 格式，THEN THE Frontend SHALL 阻止提交并提示「接口地址格式无效」。
6. THE Frontend SHALL 提供 Cache_Detection_Mode 的开关，默认为关闭。
7. WHERE Cache_Detection_Mode 开关为开启状态，THE Frontend SHALL 显示提示「开启缓存检测将额外增加约 30 秒」。
8. THE Frontend SHALL 在接口配置区域显示隐私提示「优先使用仅用于测试的 API Key，密钥端对端加密、用后即焚」。

### Requirement 2: API Key 隐私处理

**User Story:** 作为一名注重隐私的用户，我想要我提供的 API Key 被安全处理，以便降低密钥泄露风险。

#### Acceptance Criteria

1. WHEN 用户提交 API_Key，THE Frontend SHALL 通过 HTTPS 加密传输将 API_Key 发送至 Backend。
2. WHEN Detection_Task 结束，THE Backend SHALL 从内存与临时存储中删除该 API_Key。
3. THE Backend SHALL 以掩码形式（仅保留首尾各 4 个字符）记录与展示任何包含 API_Key 的日志条目。
4. THE Backend SHALL 排除 API_Key 明文进入 Detection_History 的持久化存储。
5. IF API_Key 在持久化前未完成脱敏，THEN THE Backend SHALL 拒绝写入该记录并返回内部错误码。
6. THE Frontend SHALL 在检测结果页显示 API_Key 已被删除的确认信息。

### Requirement 3: 多维度探测检测

**User Story:** 作为一名用户，我想要系统对中转站接口进行多轮、多维度探测，以便判断该接口是否真实提供所声称的模型。

#### Acceptance Criteria

1. WHEN Detection_Task 启动，THE Detection_Engine SHALL 对 Relay_Endpoint 发起多轮探测请求。
2. THE Detection_Engine SHALL 在每次 Detection_Task 中评估全部六个 Detection_Dimension：返回协议一致性、响应结构、知识问答结果、身份一致性、思维链痕迹、签名指纹。
3. WHEN 评估返回协议一致性维度，THE Detection_Engine SHALL 校验响应是否符合 OpenAI 兼容协议的字段与流式格式规范。
4. WHEN 评估响应结构维度，THE Detection_Engine SHALL 校验响应中 `usage`、`finish_reason`、`role` 等结构字段的完整性与取值合法性。
5. WHEN 评估知识问答结果维度，THE Detection_Engine SHALL 向 Relay_Endpoint 发送已知答案的探测题并比对返回内容。
6. WHEN 评估身份一致性维度，THE Detection_Engine SHALL 通过身份探测题判断模型自述身份与 Target_Model 是否一致。
7. WHEN 评估思维链痕迹维度，THE Detection_Engine SHALL 检测响应中是否存在与 Target_Model 推理特征匹配的思维链痕迹。
8. WHEN 评估签名指纹维度，THE Detection_Engine SHALL 采集响应的统计指纹特征并与 Target_Model 的基线指纹比对。
9. IF Relay_Endpoint 在探测期间返回鉴权失败状态，THEN THE Detection_Engine SHALL 立即终止 Detection_Task 并返回「鉴权失败」结果，不返回任何其他维度结果。
10. IF Relay_Endpoint 在单个探测轮次中超过 60 秒无响应，THEN THE Detection_Engine SHALL 仅终止该探测轮次、将其标记为「超时」，并继续执行 Detection_Task 的剩余探测轮次。
11. WHILE Detection_Task 正在执行，THE Frontend SHALL 显示当前进度与已完成的探测轮次。

### Requirement 4: 缓存检测模式

**User Story:** 作为一名用户，我想要可选地开启缓存检测，以便识别中转站是否对响应使用缓存。

#### Acceptance Criteria

1. WHERE Cache_Detection_Mode 为开启状态，THE Detection_Engine SHALL 发送重复与近似探测请求以识别缓存行为。
2. WHERE Cache_Detection_Mode 为开启状态，THE Detection_Engine SHALL 在结果中输出缓存命中判定结论。
3. WHERE Cache_Detection_Mode 为关闭状态，THE Detection_Engine SHALL 跳过缓存相关探测。

### Requirement 5: 检测评分与结果

**User Story:** 作为一名用户，我想要得到综合评分与各维度明细，以便理解该中转站接口的可信程度。

#### Acceptance Criteria

1. WHEN 所有 Detection_Dimension 评估完成，THE Detection_Engine SHALL 基于多维度交叉验证计算 0 至 100 范围的 Detection_Score。
2. THE Detection_Engine SHALL 为每个 Detection_Dimension 输出独立的维度结论与对应说明。
3. WHEN Detection_Task 完成，THE Frontend SHALL 展示 Detection_Score 与全部六个维度的明细结论。
4. THE Frontend SHALL 在结果页显示免责声明「本检测为低成本技术性验证，非法律审计，不保证 100% 准确」。
5. IF 身份一致性维度判定为不一致，THEN THE Frontend SHALL 在结果页突出显示「疑似模型身份替换」警示。
6. IF 知识问答或签名指纹维度判定为疑似降智，THEN THE Frontend SHALL 在结果页突出显示「疑似降智」警示。
7. IF 任一警示因前端错误无法显示，THEN THE Frontend SHALL 仍展示 Detection_Score 与各维度明细结论。

### Requirement 6: 检测历史

**User Story:** 作为一名用户，我想要查看过往检测记录，以便回溯与对比检测结果。

#### Acceptance Criteria

1. WHEN Detection_Task 完成，THE Backend SHALL 将该任务的脱敏结果写入 Detection_History。
2. THE Detection_History 记录 SHALL 包含 Relay_Endpoint 的脱敏标识、Target_Model、Detection_Score、各维度结论与检测时间。
3. WHEN 用户访问检测历史页面，THE Frontend SHALL 按检测时间倒序展示 Detection_History 记录。
4. WHEN 用户选择一条 Detection_History 记录，THE Frontend SHALL 展示该记录的完整维度明细。
5. THE Detection_History SHALL 不包含 API_Key 明文。

### Requirement 7: 按模型分类的中转站榜单

**User Story:** 作为一名用户，我想要按目标模型查看中转站渠道榜单及其指标，以便挑选合适的中转站。

#### Acceptance Criteria

1. THE Frontend SHALL 提供按 Target_Model（如 GPT 5.5、Opus 4.8、Sonnet 4.6、Gemini 3.1 Pro）切换的 Leaderboard 视图。
2. THE Leaderboard SHALL 为每个 Channel 展示以下列：认证状态、渠道名、价格、近7天价格变化百分比、限速、可用率百分比、降智情况、响应延迟（秒）。
3. THE Leaderboard SHALL 将 Certification_Status 以「企业认证」「个人实名认证」「未认证」三种取值之一展示。
4. WHEN Leaderboard 数据加载完成，THE Frontend SHALL 展示该 Target_Model 下的全部 Channel 条目。
5. IF 某个 Target_Model 下无任何 Channel，THEN THE Frontend SHALL 显示「暂无渠道数据」。

### Requirement 8: 榜单筛选与排序

**User Story:** 作为一名用户，我想要按认证筛选并按精选或价格排序榜单，以便快速定位目标渠道。

#### Acceptance Criteria

1. THE Frontend SHALL 提供按 Certification_Status 筛选 Leaderboard 的控件。
2. WHEN 用户选择某一 Certification_Status 筛选项，THE Frontend SHALL 仅展示匹配该认证状态的 Channel。
3. THE Frontend SHALL 提供按「精选」与按「价格」排序 Leaderboard 的控件。
4. WHEN 用户选择按价格排序，THE Frontend SHALL 按 Channel 价格升序排列条目。
5. WHEN 用户选择按精选排序，THE Frontend SHALL 按平台精选权重降序排列条目。

### Requirement 9: 官方 API 状态监控

**User Story:** 作为一名用户，我想要查看 OpenAI、Claude、Gemini 官方 API 的状态，以便区分问题来自官方还是中转站。

#### Acceptance Criteria

1. THE Frontend SHALL 展示 OpenAI、Claude、Gemini 三个官方 API 的 Official_API_Status。
2. THE Backend SHALL 周期性采集每个官方 API 的可用性状态。
3. THE Frontend SHALL 以「正常」「异常」「未知」三种状态之一展示每个官方 API 的 Official_API_Status。
4. WHEN Official_API_Status 采集成功，THE Frontend SHALL 展示该状态对应的最近更新时间。
5. IF 官方 API 状态采集失败，THEN THE Frontend SHALL 将对应 Official_API_Status 展示为「未知」。

### Requirement 10: FAQ 与科普内容页面

**User Story:** 作为一名用户，我想要阅读关于中转站、风险与检测原理的科普内容，以便理解检测结论与使用建议。

#### Acceptance Criteria

1. THE Frontend SHALL 提供 FAQ 页面，解释中转站概念及其工作方式。
2. THE FAQ 页面 SHALL 说明以下风险：协议不一致、模型身份替换、降智、日志与密钥不透明、高配低卖。
3. THE FAQ 页面 SHALL 说明 tinyowl 检测的工作原理与各 Detection_Dimension 的含义。
4. THE FAQ 页面 SHALL 包含使用建议「榜单排名不等于完全可信」与「建议先小额充值」。
5. THE FAQ 页面 SHALL 全部以中文展示。

### Requirement 11: 运营者内容管理

**User Story:** 作为平台运营者，我想要维护榜单渠道与官方状态来源，以便保持数据的准确与更新。

#### Acceptance Criteria

1. THE Backend SHALL 提供创建、更新与删除 Channel 的接口。
2. WHEN Operator 创建或更新 Channel 且任一必填字段（渠道名、认证状态、价格、Target_Model）缺失，THE Backend SHALL 拒绝该操作并返回字段校验错误，且 SHALL 保证拒绝与错误返回为原子行为：IF 无法返回有效的字段校验错误，THEN THE Backend SHALL 同样不执行该拒绝操作（保持数据原状）。
3. WHEN Operator 更新 Channel 价格，THE Backend SHALL 记录价格变更以支持近7天价格变化百分比的计算。
4. THE Backend SHALL 对运营管理接口要求身份鉴权。
5. IF 未通过身份鉴权的请求访问运营管理接口，THEN THE Backend SHALL 返回未授权错误码，并完全阻止该请求所对应的操作执行。

### Requirement 12: Web 应用与本地可运行

**User Story:** 作为一名开发者，我想要本平台采用现代 Web 技术栈并可在本地运行，以便开发、测试与部署。

#### Acceptance Criteria

1. THE tinyowl SHALL 由 Frontend 与 Backend 两部分组成，并通过 HTTP API 通信。
2. THE Frontend SHALL 以中文界面渲染全部用户可见文案。
3. WHEN 开发者按文档执行本地启动命令，THE tinyowl SHALL 在本地环境完成启动并提供可访问的 Frontend 与 Backend。
4. THE tinyowl SHALL 提供持久化存储用于保存 Channel、Detection_History 与 Official_API_Status 数据，并在包含开发与测试在内的所有运行环境中均使用持久化存储。
5. IF Backend 依赖的持久化存储不可用，THEN THE Backend SHALL 在启动时返回明确的错误信息。
6. THE tinyowl SHALL 提供 README 文档，说明本地安装、配置与启动步骤。
