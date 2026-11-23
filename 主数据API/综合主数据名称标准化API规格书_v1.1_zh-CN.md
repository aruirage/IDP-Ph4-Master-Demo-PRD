# 综合主数据名称标准化 API 规格书（IDP 对接 · v1）中文版

| 项目 | 内容 |
|---|---|
| 文档版本 | 1.1（开发启动用） |
| 编写日期 | 2026-11-18 |
| 更新日期 | 2026-11-19（1.1） |
| 目标读者 | IDP 开发负责人（NeosAI 公司） |
| API 版本 | v1 |
| 提供方 | Zurich 保険金2.0 项目 |
| 原文 | 日文版《総合マスタ名寄せ API 仕様書（IDP 連携・v1）》1.1（`名寄せAPI仕様書_v1.md`） |

> **关于本译本**：本文件是日文版规格书的中文译本。**日文版为正式版本（正本），两者内容不一致时，以日文版为准。** 字段名、枚举值、路径以及示例 JSON 与日文版完全相同。示例中的日文（IDP 的项目名、主数据的名称、标签、说明文字等）是 API 实际处理和返回的内容，因此保留原文。

本文档是从 IDP 调用综合主数据名称标准化 API（以下称“标准化 API”）的对接规格。记载**标准化的基本思路（§1.2）和 IDP 开发中需要满足的规格（§1.4）**，以及认证、通用格式、标准化组的设置、各 API 的请求与响应、错误、幂等性、繁忙时的行为、兼容性与扩展规则，以及推荐的集成方式。

> **v1 的承诺**：本文档记载的字段的名称、类型和含义，在 v1 期间不会更改，也不会删除。即使进行标准化的主数据表、列、项目增加，只要按照本文档的规则（§2.8）实现，IDP 侧**只需追加设置**即可对应，无需改修。

### 用语对照（日文正本 ↔ 本译本）

| 日文（正本） | 中文（本译本） | 含义 |
|---|---|---|
| 名寄せ | 名称标准化（简称“标准化”） | 将单据上的值对应到 Zurich 主数据的行 |
| 名寄せ API | 标准化 API | 本 API |
| マスタ・マスタ表 | 主数据、主数据表 | `masterTable` |
| 列・ヒント | 列、提示信息 | `column`、`hint` |
| 名寄せグループ | 标准化组 | `groups[]` |
| 主たる入力 | 主输入 | `inputRole=PRIMARY` 的列 |
| 名寄せ対象 | 标准化对象 | `items[]` |
| 帳票・帳票タイプ | 单据、单据类型 | IDP 案件中的一个文件，以及 IDP 的分类结果 |
| 案件・案件の標準項目 | 案件、案件的标准项目 | `caseNo`、`caseResult` |
| 読取値 | 识别值 | OCR 识别出的值 |
| 要確認 | 需确认 | `needsReview=true` |
| 書き戻し（値のセット）・書き戻しの先 | 回写（写入值）、回写目标 | `values` → `targets` |
| 候補 | 候选 | `candidates` |
| 薬剤マスタ・薬剤名 | 药品主数据、药品名 | `DRUG` |
| 薬効分類・薬価基準コード | 药效分类、药价基准编码 | `DRUG.EFFICACY`、`DRUG.YJCODE` |
| 別名 | 别名 | 主数据中其他写法的记录 |
| 分割・主たる要素 | 拆分、主要素 | `SPLIT`、`splitItems[].primary` |
| 新規登録候補 | 新登记候选 | `NEW_CANDIDATE` |
| 待ち行列・流量の制限 | 队列、流量限制 | §2.7 |
| 完了したタスクの一覧 | 已完成任务列表 | `GET /v1/standardizations` |
| 既定のグループ | 默认组（设置的模板） | §4.8 |
| カタログ | 目录 | `GET /v1/catalog` |
| 査定 | 理赔审核 | |
| マスタ照合（IDP の機能） | 主数据匹配（IDP 功能） | IDP 单据类型的处理规则 |
| OCR抽出確認（IDP の機能） | OCR 抽取确认（IDP 功能） | IDP 的人工确认环节 |
| 業務シーン | 业务场景 | `sceneId` |
| フォールバック | 回退（fallback） | §1.2、§4.1 |
| 1次・2次 | 第 1 期、第 2 期 | 提供的阶段 |

---

## 1. 概要

- 标准化 API 接收案件单据的识别结果（IDP 的 RESULT JSON），返回将单据上的值（伤病名、手术名、医疗机构、药品等）对应到 Zurich 主数据的行的结果。结果中附带所对应的行的**所有列的值**（包括编码、分类等不用于匹配的列）。
- **将哪个项目对应到哪个主数据表的哪一列，由 IDP 作为设置（标准化组）持有，并在每次请求时发送**（§1.2、§5.1）。IDP 的项目名可以按单据类型的设置自由命名，因此对于有设置的单据，标准化 API 不会根据项目名进行推测（仅对没有设置的单据，通过根据项目名推测的回退方式进行标准化，结果全部以需确认返回）。主数据表和列的一览（包括 SFDC 的对象名和项目名）可以通过 API 获取（§4.7）。
- 由同一个主数据表的同一行决定的项目（例：药品名、ATC 分类、药效分类、药价基准编码），汇总为一个组。一次标准化即可确定行，并可以将该行的列的值写入组中指定的项目（回写）。**请在 IDP 侧开发这一写入值的功能**（§1.4、§5.7）。同一个主数据表的组，可以创建任意多个（例：伤病名1 和伤病名2）。
- 组的项目，也可以来自同一案件的其他单据（例：医疗机构名来自诊断书，所在地来自诊疗明细书）。因此，处理以**案件为单位**进行。
- 部分对象的判断会使用 AI，因此处理时间因对象而异（多数在 1 秒以内，使用 AI 的对象通常为数十秒）。请求会放入队列中依次处理，一定时间（最长 25 秒）内未完成则返回任务编号。IDP 通过已完成任务列表，汇总查询所有案件（§2.7）。
- 结果的处理思路与 IDP 现有的“主数据匹配”相同：有把握的结果返回规范值（可以自动采用），没有把握的结果作为“需确认”返回（由人在确认界面中选择）。**无论哪种情况，都返回包括所采用的行在内、分数最高的前 5 个候选**（§5.3）。
- 标准化 API 只返回结果，不会写入主数据或其他系统。
- 调用约定与 IDP Open API 一致（Bearer API Key、`{code, msg, data}`、Unix 毫秒、`clientRequestId`、任务＋查询）。认证仅使用 Bearer API Key（§2.2）。

### 1.1 用语

| 用语 | 含义 |
|---|---|
| 主数据表 | 标准化的目标表（伤病名主数据、药品主数据等）。键为 `DISEASE` 等，作为来源的 SFDC 对象（例：`CLM_ICD10Mst__c` 和别名的 `CWF_ICD10MstAlias__c`）在一览（`GET /v1/masters`）中列出。药品主数据（`DRUG`）不是 SFDC 的对象（Zurich 维护的药品主数据） |
| 列 | 主数据表的列（伤病名、ICD10 编码、ATC 分类等）。键为 SFDC 的物理名（`对象.项目`。例：`CLM_ICD10Mst__c.ICD10__C`）。不是 SFDC 对象的主数据表的列为 `主数据表.项目`（例：`DRUG.ATC`） |
| 提示信息 | 不是主数据表的列，但用于匹配的信息（性别、伤病的原因、手术日、诊疗科等） |
| 标准化组 | 对应同一个主数据表的同一行的 IDP 项目的组合。按项目决定主数据表的列（或提示信息）和使用方式（用于匹配、回写）。在 IDP 的设置中创建 |
| 主输入 | 组中作为标准化主要线索的项目（伤病名、药品名等）。主数据表一览中 `inputRole=PRIMARY` 的列 |
| 标准化对象 | 将组应用到案件的单据后得到的一件标准化（表的列则每行一件） |
| 需确认 | 需要人工确认标准化的结果（`needsReview=true`）。与识别（OCR）的确认不同 |
| 回写（写入值） | 将所采用的主数据行的列的值，写入 IDP 设置中指定的项目。不用于匹配的列（编码、分类等）的值也可以写入。由 IDP 侧开发的功能（§5.7） |
| 候选 | 每个标准化对象返回的、分数较高的主数据行。包括所采用的行在内，最多返回前 5 个（默认）。可以自动采用的结果也附带候选（§5.3） |
| 回退 | 对于 IDP 中没有设置的单据，由标准化 API 根据项目名推测并进行标准化的方式（fallback）。结果一定为需确认（§1.2、§4.1） |

### 1.2 基本思路

> **标准化对象的项目与主数据表的列之间的对应关系（标准化组），由 IDP 作为设置持有，并在每次请求时发送。这是本 API 的基本原则（以此为准）。** 对于 IDP 中有设置的单据，标准化 API 不会根据项目名推测对应关系。
>
> 仅对于 IDP 中没有设置的单据，标准化 API 具有根据项目名推测并进行标准化的方式（**回退**）。回退的结果一定以需确认（`needsReview=true`）返回，不会被自动采用。这是为了在设置完善之前，以及防备设置遗漏而准备的。

**由 IDP 持有对应关系的理由**

- IDP 的项目名、表名、单据类型，可以按 IDP 的设置自由命名，正确了解其含义的是进行 IDP 设置的一方。
- 增加或修改单据类型和项目，是 IDP 侧的工作。如果在同一个地方同时修改对应关系，就不需要等待标准化 API 侧的变更。
- 由于请求中包含设置，用哪个设置进行了标准化，会与结果一起保留（`groupsVersion`）。

**职责分工**

| 负责方 | 持有的内容、进行的工作 |
|---|---|
| IDP | 标准化组的设置（创建、校验、保存、版本管理）、请求（案件的所有单据和组的设置）、结束的确认、结果的反映（写入值、需确认的分流）、确认界面（从候选中重新选择）、确定、向后续系统的输出 |
| 标准化 API | 主数据表和列的一览的公开、组设置的校验、将组应用到案件的单据（生成标准化对象）、没有设置的单据的回退（推测。结果为需确认）、匹配与判断（规则和 AI）、需确认的判定和原因、案件整体一致性的确认。只返回结果，不写入主数据或 IDP 的数据 |
| Zurich | 主数据的数据（SFDC）、标准化的业务方针、主数据表和用于匹配的列的追加、默认组（设置的模板） |

**标准化的思路**

1. 一个组对应主数据表的一行。组的项目对应到该行的列（或提示信息）。
2. 通过一次标准化确定行，并将该行的列的值写入组中所有回写目标的项目（因为是同一行的值，彼此不会矛盾）。不用于匹配的列（编码、分类等）也可以作为回写目标。
3. 同一个主数据表的组，可以创建任意多个（伤病名1、伤病名2 等）。
4. 组的项目可以来自同一案件的其他单据或案件的标准项目。因此，以案件为单位发出请求。
5. 标准化 API 的结果是建议。`needsReview=false` 是可以自动采用的结果，`needsReview=true` 是需要由人确认的结果。最终确定的是 IDP（人）。
6. IDP 的实现，应为与主数据表或列无关的通用实现（主数据表和列从主数据表一览中读取）。这样，主数据表、列、项目、单据类型的追加，只需设置即可。
7. 回退不是设置的替代，而是防备设置遗漏的安全网。出现 `FALLBACK_USED` 的单据类型，请添加到 IDP 的设置中。
8. 结果中，附带包括所采用的行在内、分数最高的前 5 个候选（可以自动采用的结果也附带）。由人确认时，可以从候选中重新选择。

### 1.3 调用流程

```
【设置时】
IDP 的设置界面 -- GET /v1/masters ---------------> 主数据表、列、提示信息的一览
               -- GET /v1/groups/defaults --------> Zurich 的默认组（可以导入）
               -- POST /v1/groups/validate -------> 组设置的校验（保存之前）

【每个案件】
IDP -- POST /v1/standardizations -------------------> 请求（案件的所有单据 ＋ 组的设置）
    <-- status=SUCCEEDED（含结果）-------------------- 在 waitSeconds 内完成时
    <-- status=PENDING / PROCESSING（taskId）--------- 未完成时（在队列中依次处理）
    -- GET /v1/standardizations?cursor=… ------------> 已完成任务列表（汇总查询所有案件）
    -- GET /v1/standardizations/{taskId} ------------> 结果
    反映结果
      needsReview=false → 回写主数据行的值（自动采用）
      needsReview=true  → 在确认界面中从候选中选择
    -- POST /v1/items/standardize -------------------> 在确认界面中修改识别值后重新标准化
    -- POST /v1/standardizations/{taskId}/feedback --> 返回人工确定的结果（第 2 期）
```

### 1.4 IDP 侧需要满足的标准化规格（要求）

在 IDP 的开发中，请满足以下要求。“必须”是第 1 期上线所需的要求，“第 2 期”是第 2 期上线所需的要求。详细的规则见“节”栏中的章节。也请作为验收确认的观点使用。

#### 设置（标准化组）

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| S-01 | 具有可以创建、修改、删除标准化组的设置界面。组具有不变的唯一 `groupId`、显示名称、主数据表、项目（列或提示信息、使用方式、IDP 的项目指定） | 必须 | §5.1 |
| S-02 | 设置界面根据主数据表一览（`GET /v1/masters`）生成。不在 IDP 中用固定的表持有主数据表、列、提示信息、显示名称、输入角色、可否回写。一览的版本（`schemaVersion`）变化时，无需重启即可反映 | 必须 | §4.7 |
| S-03 | 项目指定中，可以选择单据的项目（单据类型＋项目名）、单据中表的列（单据类型＋表名＋列名）、案件的标准项目。在一个组中，可以选择其他单据类型的项目 | 必须 | §5.6 |
| S-04 | 可以创建同一个主数据表的多个组。一个项目可以作为多个组的输入。将同一个项目设为多个组的回写目标时，给出警告 | 必须 | §5.1 |
| S-05 | 保存之前，校验组的设置（`POST /v1/groups/validate`）。按项目显示错误，有错误的组不保存 | 必须 | §4.9 |
| S-06 | 为设置附加版本（`groupsVersion`），保留变更的履历。可以在验证环境中确认后再放入生产环境 | 必须 | §4.1 |
| S-07 | 可以将 Zurich 的默认组（`GET /v1/groups/defaults`）导入到设置中。导入后，作为 IDP 的设置持有 | 必须 | §4.8 |
| S-08 | 不再使用的列和提示信息（`deprecated=true`）加上标记显示，在新的设置中不让选择（已有的设置继续运行） | 必须 | §4.7 |
| S-09 | 可以在由人确认之后，将 AI 对组设置的建议（`POST /v1/groups/suggest`）导入到设置中 | 第 2 期 | §4.14 |
| S-10 | 写入值的设置：组的 `OUTPUT`、`INPUT_OUTPUT` 的项目中，可以选择主数据表一览中的任意列（包括不用于匹配的列〔`inputRole=NONE`〕）。写入目标可以选择单据的项目、表的列（与主输入相同的表）、案件的标准项目 | 必须 | §5.1、§5.7 |

#### 请求与结束的确认

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| Q-01 | 案件的 OCR 抽取之后，通过请求发送案件的所有单据（按 RESULT JSON 的原样，附带单据类型 ID）、有效的所有组的设置及其版本（单据超过 50 件时拆分） | 必须 | §4.1 |
| Q-02 | 组中有使用案件标准项目（`CASE_FIELD`）的设置时，发送案件的标准项目（`caseResult`） | 必须 | §4.1、§5.2 |
| Q-03 | 附带 `clientRequestId`，超时或 500 时使用相同的值重发。重新识别后用新的版本发出请求，并取消旧的任务 | 必须 | §2.5、§4.5 |
| Q-04 | 限制请求的发送并行数，429、503 时遵循 `Retry-After`。500 时一边延长间隔，一边加入随机波动后重试 | 必须 | §2.7、§8.5 |
| Q-05 | 通过定期查询已完成任务列表（`GET /v1/standardizations?cursor=…`）得知结束。保存游标，即使 IDP 重启也从后续开始查询 | 必须 | §4.4 |
| Q-06 | 在任务进入终止状态之后读取结果。标准化对象较多时，分页获取 | 必须 | §4.2、§4.3 |
| Q-07 | 采用不使用回退的运用时，可以发送 `options.fallback=false`（可通过设置切换） | 必须 | §4.1 |

#### 结果的反映

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| A-01 | 处理的分支只使用 `status`（任务、单据）、`needsReview`、`master.values` 与 `targets`、`master.selection`。`needsReview` 缺失或为 `null` 时作为需确认处理 | 必须 | §2.8 |
| A-02 | `needsReview=false` 的标准化对象，将 `master.values` 的值写入 `targets` 的位置（写入值。A-09），并保存 `selection` 用于登记。但是，用于匹配的输入中有 IDP 的 `needReview=1` 时，在识别确认之后采用 | 必须 | §5.7、§8.4 |
| A-03 | `needsReview=true` 的标准化对象，不回写，作为 OCR 抽取确认的对象（追加确认条件“标准化需确认”） | 必须 | §8.4 |
| A-04 | 位置的 `type` 为未知的值、单据或任务为 `FAILED`、有 `INVALID_GROUP`、`MASTER_TABLE_NOT_ENABLED` 的提示时，将相应组的项目转为人工确认。不反映 `CANCELLED` 的结果 | 必须 | §8.4 |
| A-05 | 对于组的回写目标的项目，不重复设置 IDP 的“主数据匹配” | 必须 | §8.2 |
| A-06 | 按标准化对象，保存 `itemId`、`groupId`、所采用的记录（`object`、`masterId`、`selection`、`values`）、`needsReview`、原因（用于确认、审计、输出、返回确定的结果） | 必须 | §5.3 |
| A-07 | 不将 `confidence` 作为阈值使用 | 必须 | §2.8 |
| A-08 | `groupId` 为 `FALLBACK` 的标准化对象（回退的结果），一定转为人工确认（以 `needsReview=true` 返回）。使用单据 `warnings` 中的 `FALLBACK_USED` 来发现没有设置的单据类型 | 必须 | §4.1、§8.4 |
| A-09 | 开发**写入值的功能**：从所采用的行（`master`、候选、`alternatives`、`splitItems` 的 `master`、检索的结果均可）的 `values` 中，将 `targets` 中各列的值写入该位置的项目（没有值的列不写入）。不用于匹配的列（编码、分类等）的值，也用同一处理写入。作为与主数据表、列无关的通用处理，在自动采用时、在确认界面中选择候选时、重新标准化时，使用同一处理 | 必须 | §5.7 |

#### 确认界面

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| C-01 | 对于需确认的标准化对象，显示组的项目的识别值、`master`（推定值。初始值）、`candidates`（最多前 5 个）、原因（`reviewReasons[].message`）、依据（`reason`）、备注（`notesForAssessor`）。`SPLIT` 显示全部要素（主要素加标记），`NEW_CANDIDATE` 显示建议的名称和出处 | 必须 | §5.3、§5.9 |
| C-02 | 操作人员选择候选后，将该候选的 `values` 的值重新写入该标准化对象的 `targets`（A-09），并保存该候选的 `selection` | 必须 | §5.7 |
| C-03 | 操作人员修改了组的输入的识别值后，通过单个值的标准化（`ref` 中为原结果）重新标准化，并重新反映结果 | 必须 | §4.6 |
| C-04 | 可以通过主数据的检索（`POST /v1/masters/search`）查找并选择其他候选 | 第 2 期 | §4.13 |
| C-05 | 自动采用的标准化对象，也可以在确认界面中显示所采用的行和 `candidates`，操作人员可以改为其他候选（改选时与 C-02 同样处理） | 必须 | §5.3、§5.7 |

#### 输出与后续系统

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| E-01 | 向后续系统（SFDC）登记时，将确定的记录的 `selection`（`object`、`recordType`、`recordId`）成对使用。`selection` 为 `null` 的主数据表（`DRUG`）仅用于写入值 | 必须 | §5.4 |
| E-02 | 在数据映射中，可以将写入的值和 `selection` 对应到输出的项目（也可以将所采用的行的 `values` 中的列，直接对应到输出的项目） | 必须 | §9 |
| E-03 | 返回确定的结果（`POST /v1/standardizations/{taskId}/feedback`） | 第 2 期 | §4.12 |

#### 通用性与兼容性

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| G-01 | 设置界面、请求、回写、确认界面、输出的任何地方，都不编写针对主数据表或列的专门处理（即使主数据表或列增加，只需设置即可使用） | 必须 | §2.8 |
| G-02 | 忽略响应中的未知字段，用字符串接收“会增加”的枚举值，ID 保持字符串处理 | 必须 | §2.8 |
| G-03 | 显示名称从主数据表一览和目录中获取 | 必须 | §4.7、§4.10 |

#### 非功能

| 编号 | 要求 | 区分 | 节 |
|---|---|---|---|
| N-01 | 通信使用 HTTPS，并信任内部证书颁发机构的证书。API Key 作为机密信息保管，不在界面和日志中显示 | 必须 | §2.1、§2.2 |
| N-02 | 连接、等待响应的时间，以及接收缓冲区的大小，与 §8.5 一致 | 必须 | §8.5 |
| N-03 | Zurich 通知时，可以去除个人信息项目后再发送 | 必须 | §4.1、§9 |

---

## 2. 通用规则

### 2.1 连接地址

```
{BASE_URL}/v1/{resource}
```

`{BASE_URL}` 按环境（生产、验证）另行通知。通信使用 HTTPS（TLS 1.2 及以上）。服务器证书由 Zurich 的内部证书颁发机构签发，请在 IDP 的服务器上配置该内部 CA 的证书。

### 2.2 认证

认证**仅使用 Bearer API Key**。所有 API 都需要指定以下请求头（与 IDP Open API 的格式相同）。不使用基于来源 IP 地址的限制，也不使用其他认证方式（客户端证书、OAuth 等）。

```
Authorization: Bearer <apiKey>
```

| 项目 | 内容 |
|---|---|
| 签发 | 由标准化 API 的运维负责人按环境（生产、验证）签发。明文仅在签发时提供一次 |
| 有效期 | 1 年。到期前签发新密钥，切换期间新旧两个密钥均可使用 |
| 401 | 缺少请求头、Bearer 格式错误、密钥不存在或已失效 |
| 403 | 密钥不在有效期内、该密钥不能使用的 API |

### 2.3 请求与响应的格式

- 请求体为 UTF-8 的 JSON（`Content-Type: application/json`）。
- 成功时返回 HTTP 200 和以下格式的 JSON。任务受理时、处理中也返回 HTTP 200。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000123",
  "warnings": [],
  "data": {}
}
```

- 失败时，`code` 中填入与 HTTP 状态码相同的值，`data.errorCode` 中填入失败的类型（§7）。

```json
{
  "code": 400,
  "msg": "documents[0].format が不正です。IDP_RESULT_JSON または FIELDS を指定してください。",
  "requestId": "req-20261118-000124",
  "warnings": [],
  "data": {
    "errorCode": "INVALID_REQUEST",
    "details": [
      {"field": "documents[0].format", "reason": "UNSUPPORTED_VALUE"}
    ]
  }
}
```

| 字段 | 说明 |
|---|---|
| `code` | 成功为 0。失败时为与 HTTP 状态码相同的值 |
| `msg` | 失败的原因（日语） |
| `requestId` | 本次调用的标识。咨询时请提供。响应头 `X-Request-Id` 中也包含相同的值 |
| `warnings` | 关于本次调用的请求的提示（`code`、`message`。§6.16）。例：存在未知字段（`UNKNOWN_FIELD`） |
| `data` | 业务数据。失败时为 `errorCode`（§7）和 `details`（输入错误的列表：`field`＝出错字段的位置，`reason`＝错误的类型。§6.25） |

- 如果指定 `Accept-Encoding: gzip`，响应将被压缩后返回。
- 中间设备（代理等）返回的错误，可能不是上述格式的 JSON。**响应不是 JSON 时，请按 HTTP 状态码处理。**

### 2.4 数据类型规则

| 对象 | 规则 |
|---|---|
| ID | 全部为字符串（`taskId`、`itemId`、`groupId`、`masterId`、`recordId` 等）。**请不要假定其格式和长度**（最长 128 个字符）。请不要转换为数值 |
| 日期时间 | Unix 毫秒（Long）。例：`1794963600000` |
| 命名 | 字段名为 camelCase。枚举值为大写字母和 `_`（例：`NEW_CANDIDATE`）。主数据表、列、提示信息的键为 §4.7 中的值（列的键为 SFDC 的物理名 `对象.项目`。请按公开的字符串原样比较，包括大小写） |
| 置信度 | `confidence` 为 0.0～1.0 的数值。仅用于显示和排序，请不要作为阈值使用（§2.8） |
| 无值时 | 字符串为空字符串 `""` 或 `null`，对象为 `null` 或省略，数组为空数组 `[]`。空字符串与 `null`、`null` 与省略，请同等对待 |
| 一定有值的字段 | 任务的 `taskId`、`status`，单据的 `documentId`、`status`，标准化对象的 `itemId`、`groupId`、`masterTable`、`status`、`needsReview`、`inputs`、`targets`，以及存在 `master` 时的 `master.masterId`、`master.values`。这些字段不会为 `null` 或被省略 |
| 主数据的值 | `values` 等的值，在 v1 期间**一定是字符串**。具有多个值的列（§4.7 的 `multiValued=true`），将多个值用 `;` 分隔，作为一个字符串返回（例：ATC 分类 `L04AD03;L04AD01`）。日期列（`dataType=DATE`）的值为 `YYYY-MM-DD`。需要嵌套结构的信息，会作为新字段追加 |
| 顺序 | `documents` 按请求的顺序。`candidates` 按分数从高到低。`reviewReasons` 按重要程度排序（第一个为主要原因）。`splitItems` 的第一个为主要素。`items` 的顺序没有意义（请通过 `itemId`、`groupId`、`source` 进行对应） |
| RESULT JSON | `documents[].result` 中保持 IDP 的 RESULT JSON 的原有格式（`table_list` 等保持 IDP 的名称） |

### 2.5 幂等性

- `POST /v1/standardizations` 和 `POST /v1/items/standardize` 接受 `clientRequestId`（可选，最长 128 个字符）。
- 同一调用方（环境）在 24 小时内发送相同 `clientRequestId` 且内容相同的请求时，不重新处理，返回与第一次请求相同的结果（相同的 `taskId`）。切换 API Key 之后也一样。
- “内容相同”是指除 `waitSeconds`、`priority` 以外的请求体（包括组的设置）相同。
- 相同的 `clientRequestId` 但内容不同时，返回 409（`IDEMPOTENCY_CONFLICT`）。
- 因 400、429 等**未被受理的请求，不会占用该 `clientRequestId`**（可以使用相同的值重新发送）。因 500 等无法确定结果时，请使用相同的值重发（如果已受理，则返回该任务）。
- 相同 `clientRequestId` 的请求同时到达时，后到的请求返回与先到的请求相同的结果。
- 推荐的值为 `{caseNo}-{IDP 侧的处理版本}-{请求序号}`（重新识别时更改版本，将一个案件拆分为多个请求时更改序号）。
- `GET` 和取消（`cancel`）无论调用多少次，结果都相同。

### 2.6 上限

| 项目 | 内容 | 超出时 |
|---|---|---|
| 单次请求的请求体 | 最大 10 MB | 413（`PAYLOAD_TOO_LARGE`）。请拆分单据发送 |
| 单次请求的单据数 | 最多 50 件（与 IDP 的上传上限一致） | 400。请使用相同的 `caseNo` 拆分请求发送（更改 `clientRequestId` 的序号） |
| 单次请求的组数 | 最多 200 件 | 400 |
| 单个任务的标准化对象 | 最多对 500 件进行标准化 | 超出的对象也会放入结果，不进行标准化，以 `UNRESOLVED`、`needsReview=true`、原因 `NOT_PROCESSED` 返回 |
| `waitSeconds` | 0～25 秒 | 400 |
| 标准化对象列表的每页 | 最多 100 件（§4.2、§4.3） | － |
| 单个标准化对象的结果 | 最大 100 KB（包括行的所有列的值和候选） | － |
| 可查询的期间 | 自请求起 **7 天以上**（具体期间另行通知） | 404（`TASK_NOT_FOUND`） |
| 接受返回确定结果（§4.12）的期间 | 自请求起 **90 天以上**（与可查询的期间分开） | 404（`TASK_NOT_FOUND`） |

### 2.7 繁忙时的行为（访问负荷）

即使 IDP 同时发送大量请求，也会受理并依次处理。

| 项目 | 规则 |
|---|---|
| 受理与处理 | 请求放入队列，在同一优先级内按受理的顺序处理。同时处理的量由标准化 API 侧决定（根据处理资源和 AI 的使用上限）。即使繁忙，只要队列有空余就会受理 |
| 处理时间 | **自开始处理起 15 分钟内，一定会进入终止状态**（`SUCCEEDED`、`FAILED`、`CANCELLED`）。在时间内无法判断的对象，以 `TIMEOUT`（需确认）返回 |
| 等待时间 | 繁忙时会延长。任务的 `queue` 中返回参考值（等待的顺序、预计完成的日期时间）。**自受理起 24 小时内未能开始处理的任务，变为 `FAILED`（`failure.code=EXPIRED`）** |
| `waitSeconds` | 繁忙时，可能不等待而直接返回受理（`PENDING`） |
| 优先级 | `priority`：`NORMAL`（默认）、`LOW`（批量的重新处理等。在没有等待中的 `NORMAL` 时处理）。单个值的标准化（§4.6）在与案件队列分开的通道中处理，不受案件繁忙的影响 |
| 流量限制 | 按调用方设有以下上限。超出时返回 429 和 `Retry-After`（需要等待的秒数）。①请求的受理数（每秒）②同时的连接（等待响应）数 ③队列中的标准化对象数（超出时为 `QUEUE_FULL`）④单个值的标准化的同时数。具体值按环境通知（根据件数的预估决定） |
| 查询的负荷 | 请通过已完成任务列表（§4.4），汇总查询所有案件（例：每 5～10 秒 1 次）。按任务查询时，请间隔 `pollAfterMs` 以上（繁忙时会变长） |
| 承诺 | 上限与承诺（处理时间、可查询的期间、作为流量上限通知的值），在 v1 期间不会向对 IDP 侧不利的方向变更 |

### 2.8 兼容性与扩展规则（重要）

主数据表（先进医疗等）、列、提示信息、需确认的原因今后会增加。IDP 的单据类型和项目也会增加。**只要按照以下规则实现，IDP 侧只需追加设置即可对应，无需改修。**

#### 标准化 API 遵守的事项

1. v1 期间，不更改也不删除本文档记载的字段的名称、类型和含义。
2. 字段的追加，以及“会增加”的枚举值中值的追加，不升级版本即可进行。追加时会事先通知，并同时登载到目录（§4.10）和主数据表一览（§4.7）中。
3. “固定”的枚举值（§6）在 v1 期间不会增加值。
4. 不兼容的变更在 `/v2` 中进行，`/v1` 至少并行运行 12 个月。
5. 请求中存在未知字段时，不报错而是忽略，并在 `warnings` 中返回 `UNKNOWN_FIELD`。
6. **`needsReview=false` 的结果，仅限于只需进行 §5.7 的回写（将 `master.values` 写到 `targets` 的位置）和 `master.selection` 的登记（为 `null` 时不登记），即可完整反映的结果**（`master` 为 `null` 时，什么都不做即为完整的反映）。需要其他处理的结果（需要登记拆分后的所有要素、无法确定回写目标等），一定以 `needsReview=true` 返回。
7. 对于同一个位置（项目、单元格），`needsReview=false` 的结果的回写不会重叠（重叠时，将后面的组的标准化对象设为需确认〔`WRITE_CONFLICT`〕）。
8. `needsReview` 一定以 `true` 或 `false` 返回。
9. 主数据表、列、提示信息的键（§4.7），在 v1 期间不会更改，也不会删除。列的键为公开时的 SFDC 物理名，即使之后 SFDC 项目的名称发生变化，键也不会更改（届时一览中的 `object`、`field` 会变为新的名称）。不再使用的键设为 `deprecated=true` 并保留，使用该键的组也会照常处理。
10. 通过回退（§4.1）生成的标准化对象，一定以 `needsReview=true` 返回（是推测的对应关系，不会被自动采用）。

#### 希望 IDP 侧遵守的事项

1. **请忽略响应中的未知字段。**
2. **“会增加”的枚举值（§6）请作为字符串接收，遇到未知的值也不要中断处理。**
3. **处理的分支请只使用以下字段。**
   - 任务的 `status`、单据的 `documents[].status`
   - 标准化对象的 `needsReview`、`master.selection`（用于登记的记录）、`master.values`（行的值）和 `targets`（回写的位置）
   - `status`（标准化对象）、`reviewReasons`、`notices`、`decidedBy` 等，请用于显示和分流。
4. **`needsReview` 缺失或为 `null` 时，请作为需确认处理**（在 Java 中请用 `Boolean` 接收，不要将 `null` 当作 `false`）。
5. **请不要按主数据表或列编写专门的处理。** 组的设置界面请根据主数据表一览（§4.7）生成，回写请按照 §5.7 的规则，实现为与主数据表无关的处理。
6. **位置的 `type`（§6.7）为未知的值时，请不要自动采用该标准化对象，而是转为人工确认。**
7. **显示名称（“伤病名主数据”、“需确认的原因”等）请不要使用固定的表，而是从主数据表一览（§4.7）和目录（§4.10）中获取。**
8. **ID 请保持字符串处理，不要假定其格式。**
9. **请不要以 `confidence` 作为阈值来区分处理。** 是否自动采用，请由 `needsReview` 决定（置信度的参考标准，可能因判断机制的更新而变化）。
10. **向后续系统传递时，请将 `selection` 的 `object`、`recordType`、`recordId` 成对传递。**
11. **请将案件的所有单据，按 RESULT JSON 的原样，与组的设置一起发送**（因为组的项目可能在其他单据中）。IDP 中没有设置的单据类型的单据，将通过回退进行标准化，结果全部为需确认（§4.1）。

#### Java（Jackson）的接收示例

```java
// 忽略未知字段（Spring Boot 默认的 ObjectMapper 即为此设置）
ObjectMapper mapper = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();

public class ItemResult {
    private String itemId;
    private String groupId;
    private String masterTable;   // "会增加"的枚举值用 String 接收（"DISEASE" 等）
    private String status;
    private Boolean needsReview;  // 使用 Boolean 而不是 boolean。null 作为需确认处理
    private Map<String, Location> targets;  // 回写的位置（键为列）
    // ...
}

// 用 enum 接收时，将未知的值映射为 UNKNOWN
//   JsonMapper.builder().enable(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE)
//   在 enum 中定义 @JsonEnumDefaultValue UNKNOWN

// Spring WebClient 默认的接收缓冲区（256 KB），可能无法接收标准化对象较多的案件的响应。
// 请扩大接收缓冲区（例：16 MB），或减小标准化对象列表的每页大小（§4.3 的 limit）
```

#### 扩展的示例与 IDP 侧的对应

| 扩展的示例 | 标准化 API 的变化 | IDP 侧的对应 |
|---|---|---|
| 新的主数据表（例：先进医疗主数据） | 主数据表一览（§4.7）中增加 | 只需在设置中创建组（无需改修） |
| SFDC 的主数据中项目增加（例：医疗机构的电话号码） | 列的一览中增加（不用于匹配的项目，作为仅回写的列自动列出）。结果的 `values` 中也会自动包含 | 只需在设置中添加到组 |
| 进行标准化的项目增加（例：伤病名3～5、既往症） | － | 只需在设置中添加组 |
| 单据类型增加、项目名变更 | － | 只需添加或修改设置 |
| 将同一行的值，写入多个项目（药品名、ATC 分类、药效分类、药价基准编码） | － | 只需将组的项目设为 `OUTPUT` 或 `INPUT_OUTPUT` |
| 将案件中其他单据的项目，用于匹配或回写 | － | 只需在组的项目中指定其他单据类型 |
| 可用于匹配的提示信息增加（例：年龄） | 提示信息的一览中增加 | 只需在设置中添加到组 |
| 用于登记的记录种类变更（例：别名 → 主数据） | `selection` 的 `object`、`recordType` 变化 | 不需要（只要将 `object`、`recordType`、`recordId` 成对传递给后续系统。后续系统的对应由 Zurich 负责） |
| 主数据 ID 的格式变更 | ID 仍为字符串 | 不需要 |
| 需确认的原因增加 | `reviewReasons[].code` 增加值 | 不需要（显示 `message`。如用于分流，请在设置中追加） |
| 新的位置种类（例：嵌套的表） | 位置的 `type` 增加值 | 不需要（规则规定未知的 `type` 不自动采用） |
| 业务变更为需要登记一个栏中的多个伤病的全部 | 以 `needsReview=true` 返回（标准化 API 遵守的事项 6） | 不需要 |

---

## 3. API 一览

| # | 方法 | 路径 | 用途 | 阶段 |
|---|---|---|---|---|
| 1 | POST | `/v1/standardizations` | 标准化的请求（案件的单据和组的设置） | 第 1 期 |
| 2 | GET | `/v1/standardizations/{taskId}` | 状态和结果的查询 | 第 1 期 |
| 3 | GET | `/v1/standardizations/{taskId}/items` | 标准化对象的结果列表（分页） | 第 1 期 |
| 4 | GET | `/v1/standardizations` | 已完成任务列表（汇总查询） | 第 1 期 |
| 5 | POST | `/v1/standardizations/{taskId}/cancel` | 取消请求 | 第 1 期 |
| 6 | POST | `/v1/items/standardize` | 单个值的标准化（在确认界面中修改识别值时）。同步 | 第 1 期 |
| 7 | GET | `/v1/masters` | 主数据表、列、提示信息的一览（用于组的设置） | 第 1 期 |
| 8 | GET | `/v1/groups/defaults` | Zurich 的默认组 | 第 1 期 |
| 9 | POST | `/v1/groups/validate` | 组设置的校验 | 第 1 期 |
| 10 | GET | `/v1/catalog` | 枚举值的一览及显示名称 | 第 1 期 |
| 11 | GET | `/v1/health` | 运行状态确认 | 第 1 期 |
| 12 | POST | `/v1/standardizations/{taskId}/feedback` | 返回人工确定的结果 | 第 2 期（格式在 v1 中已确定） |
| 13 | POST | `/v1/masters/search` | 主数据的检索（在确认界面中查找其他候选） | 第 2 期（格式在 v1 中已确定） |
| 14 | POST | `/v1/groups/suggest` | 组设置的建议（由 AI 建议项目的对应关系） | 第 2 期（格式在 v1 中已确定） |

“第 2 期”的 API 将在第 1 期上线后提供。请求和响应的格式已在本文档中确定。

---

## 4. API 详细

### 4.1 标准化的请求 `POST /v1/standardizations`

#### 请求

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `clientRequestId` | String | 可选 | 幂等键（§2.5） |
| `caseNo` | String | 必填 | IDP 的案件编号（案件管理编号） |
| `sceneId` | String | 可选 | IDP 的业务场景 ID |
| `waitSeconds` | Integer | 可选 | 0～25。在此秒数内完成则返回结果。默认为 10。为 0 时仅返回受理。繁忙时可能不等待而直接返回受理（§2.7） |
| `priority` | String | 可选 | `NORMAL`（默认）／`LOW`（§2.7、§6.13） |
| `callbackUrl` | String | 可选 | 完成通知的地址（https。§4.15）。未指定时，请通过查询（§4.4、§4.2）获取结果 |
| `groups` | Object[] | 可选 | 标准化组的设置（§5.1）。0～200 件。请按原样放入 IDP 设置中有效的组（IDP 中有设置时必须放入。省略时，所有单据都成为回退的对象） |
| `groupsVersion` | String | 可选 | IDP 侧组设置的版本。在结果的 `versions.groups` 中返回（用于咨询和审计） |
| `options.masterTables` | String[] | 可选 | 限定进行标准化的主数据表（§6.1）。省略时为组中的全部 |
| `options.fallback` | Boolean | 可选 | 对于 IDP 中没有设置的单据类型的单据，是否通过回退（标准化 API 的推测）进行标准化。默认 `true` |
| `options.allowWebSearch` | Boolean | 可选 | 是否使用 Web 检索作为判断的依据。默认 `true` |
| `options.includeCandidates` | Boolean | 可选 | 是否返回候选（包括所采用的行在内、分数较高的主数据行）。默认 `true`（可以自动采用的结果也返回。§5.3） |
| `options.maxCandidates` | Integer | 可选 | 每个标准化对象返回候选的最大件数（包括所采用的行）。1～10。默认 5 |
| `caseResult` | Object | 可选 | 案件的标准项目（IDP 输出的原样 JSON）。组中 `CASE_FIELD` 的项目从这里读取 |
| `documents` | Object[] | 必填 | 案件的单据。1～50 件 |
| `documents[].documentId` | String | 必填 | 单据的标识（IDP 的逻辑文件 ID 等）。请在请求内保持唯一 |
| `documents[].documentTypeId` | String | 必填 | IDP 的单据类型 ID。与组的项目指定（§5.6）进行对照 |
| `documents[].documentTypeName` | String | 可选 | IDP 的单据类型名称 |
| `documents[].docCode` | String | 可选 | 单据 ID（例：`HG02-001`）。已知时请发送 |
| `documents[].format` | String | 必填 | `IDP_RESULT_JSON`（IDP 的 RESULT JSON）或 `FIELDS`（项目名与值的组合。测试用） |
| `documents[].result` | Object | 条件 | `format=IDP_RESULT_JSON` 时必填。请按 IDP 输出的原样，放入 RESULT JSON 中一张单据的内容（含 `fields`、`table_list` 的对象）。可以包含 `confidence`、`llmConfidence`、`needReview`、`valueList`、`dictMatchInfo` 等 |
| `documents[].fields` | Object | 条件 | `format=FIELDS` 时必填。`{"项目名": "值"}` 的组合（与 RESULT JSON 中 `fields` 的数组格式不同） |

- **请发送案件的所有单据**（因为组的项目可能在其他单据中）。
- IDP 中有设置的单据类型（在组的项目指定中出现的单据类型）的单据，只对组的项目进行标准化。不在组中的项目，即使名称看起来像伤病名等，也不进行标准化（§1.2）。
- IDP 中没有设置的单据类型的单据，如果 `options.fallback` 为 `true`（默认），则按照标准化 API 的默认读取方式（常用的项目名模式）推测并进行标准化（**回退**）。这些标准化对象的 `groupId` 为 `FALLBACK`，一定为 `needsReview=true`（原因 `FALLBACK_MAPPING`）。在该单据的 `warnings` 中返回 `FALLBACK_USED`。省略 `groups` 的请求中，所有单据都成为回退的对象。
- 组的设置有错误时，仅该组不进行标准化，并在 `warnings` 中返回 `INVALID_GROUP`（`groupId` 和原因）。其他组照常处理。请在保存设置之前，通过 §4.9 进行校验。
- 是否发送个人信息项目（患者姓名等），另行通知。即使发送了，标准化 API 也会在接收时立即去除，不保存、不输出到日志、不用于判断。无论哪种情况，本 API 的格式都不变。

#### 示例

2 张单据的案件。组有 5 个（同一伤病名主数据的组 2 个、按表的行的组、跨 2 张单据的组、包括不用于匹配的列〔ATC 分类、药效分类〕在内，将同一行的值写入表中 4 列的组）。

```json
{
  "clientRequestId": "CLAIM-20261118000123-v1-1",
  "caseNo": "CLAIM-20261118000123",
  "sceneId": "1001",
  "waitSeconds": 10,
  "priority": "NORMAL",
  "groupsVersion": "2026-11-19-01",
  "options": {"allowWebSearch": true, "includeCandidates": true, "maxCandidates": 5},
  "caseResult": {"fields": [{"name": "性別", "value": "女"}]},
  "groups": [
    {"groupId": "HG02-OPE", "label": "手術", "masterTable": "OPERATION", "members": [
      {"column": "CLM_OperationMst__c.NAME", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術名"}},
      {"column": "CLM_OperationMst__c.KCODE__C", "mode": "INPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術コード"}},
      {"hint": "operationDate", "mode": "INPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術日"}}
    ]},
    {"groupId": "HE03-DIS-1", "label": "傷病名1", "masterTable": "DISEASE", "members": [
      {"column": "CLM_ICD10Mst__c.NAME", "mode": "INPUT_OUTPUT", "field": {"type": "FIELD", "documentTypeId": "20002", "fieldName": "傷病名1"}},
      {"column": "CLM_ICD10Mst__c.ICD10__C", "mode": "INPUT", "field": {"type": "FIELD", "documentTypeId": "20002", "fieldName": "傷病名1_ICD10"}},
      {"hint": "sex", "mode": "INPUT", "field": {"type": "CASE_FIELD", "fieldName": "性別"}}
    ]},
    {"groupId": "HE03-DIS-2", "label": "傷病名2", "masterTable": "DISEASE", "members": [
      {"column": "CLM_ICD10Mst__c.NAME", "mode": "INPUT_OUTPUT", "field": {"type": "FIELD", "documentTypeId": "20002", "fieldName": "傷病名2"}},
      {"hint": "sex", "mode": "INPUT", "field": {"type": "CASE_FIELD", "fieldName": "性別"}}
    ]},
    {"groupId": "FAC-1", "label": "医療機関", "masterTable": "FACILITY", "members": [
      {"column": "CWF_MedicalFacilityMaster__c.NAME", "mode": "INPUT_OUTPUT", "field": {"type": "FIELD", "documentTypeId": "20002", "fieldName": "医療機関名"}},
      {"column": "CWF_MedicalFacilityMaster__c.ADDRESS__C", "mode": "INPUT", "field": {"type": "FIELD", "documentTypeId": "20001", "fieldName": "病院住所"}},
      {"hint": "department", "mode": "INPUT", "field": {"type": "FIELD", "documentTypeId": "20001", "fieldName": "診療科"}}
    ]},
    {"groupId": "HG02-DRUG", "label": "薬剤", "masterTable": "DRUG", "members": [
      {"column": "DRUG.BRANDNAME", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "商品名"}},
      {"column": "DRUG.ATC", "mode": "OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "ATC分類"}},
      {"column": "DRUG.EFFICACY", "mode": "OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "薬効分類"}},
      {"column": "DRUG.YJCODE", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "薬価基準コード"}}
    ]}
  ],
  "documents": [
    {
      "documentId": "991243705301",
      "documentTypeId": "20001",
      "documentTypeName": "診療明細書2",
      "docCode": "HG02-001",
      "format": "IDP_RESULT_JSON",
      "result": {
        "fields": [
          {"name": "帳票ID", "value": "HG02-001", "confidence": 1.0, "needReview": 0},
          {"name": "病院住所", "value": "東京都〇〇区〇〇町1-2-3", "confidence": 0.95, "needReview": 0},
          {"name": "診療科", "value": "循環器内科", "confidence": 0.98, "needReview": 0}
        ],
        "table_list": [
          {
            "tableName": "手術情報",
            "table_fields": [
              [
                {"name": "手術名", "value": "経皮的冠動脈形成術（その他のもの）", "confidence": 0.93, "needReview": 0},
                {"name": "手術日", "value": "2026-10-02", "confidence": 0.99, "needReview": 0},
                {"name": "手術コード", "value": "K5463", "confidence": 0.96, "needReview": 0}
              ]
            ]
          },
          {
            "tableName": "薬剤情報",
            "table_fields": [
              [
                {"name": "商品名", "value": "ティーエスワン配合カプセルT20 1C", "confidence": 0.91, "needReview": 0},
                {"name": "回数", "value": "28", "confidence": 0.97, "needReview": 0},
                {"name": "ATC分類", "value": "", "confidence": null, "needReview": 0},
                {"name": "薬効分類", "value": "", "confidence": null, "needReview": 0},
                {"name": "薬価基準コード", "value": "", "confidence": null, "needReview": 0}
              ]
            ]
          }
        ]
      }
    },
    {
      "documentId": "991243705302",
      "documentTypeId": "20002",
      "documentTypeName": "診断書",
      "docCode": "HE03-001",
      "format": "IDP_RESULT_JSON",
      "result": {
        "fields": [
          {"name": "帳票ID", "value": "HE03-001", "confidence": 1.0, "needReview": 0},
          {"name": "医療機関名", "value": "サンプル記念病院", "confidence": 0.97, "needReview": 0},
          {"name": "傷病名1", "value": "食道癌/直腸癌", "confidence": 0.94, "needReview": 0},
          {"name": "傷病名1_ICD10", "value": "C159,C20", "confidence": 0.92, "needReview": 0},
          {"name": "傷病名2", "value": "乳房下側部乳癌", "confidence": 0.9, "needReview": 0}
        ],
        "table_list": []
      }
    }
  ]
}
```

#### 响应

- `data` 为 §4.2 的任务。
- 处于终止状态（`SUCCEEDED` / `FAILED` / `CANCELLED`）时包含结果。使用相同的 `clientRequestId` 重发时，可能直接返回已结束的任务。
- `PENDING` / `PROCESSING` 时，`items` 为空数组。请通过已完成任务列表（§4.4），或在 `pollAfterMs` 之后查询来获取结果。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000125",
  "warnings": [],
  "data": {
    "taskId": "MS-20261118-7Q3K9D",
    "clientRequestId": "CLAIM-20261118000123-v1-1",
    "caseNo": "CLAIM-20261118000123",
    "status": "PENDING",
    "priority": "NORMAL",
    "acceptedAt": 1794963600000,
    "startedAt": null,
    "completedAt": null,
    "queue": {"position": 12, "estimatedCompletionAt": 1794963690000},
    "progress": {"itemsTotal": 0, "itemsDone": 0},
    "pollAfterMs": 5000,
    "versions": {},
    "summary": {"documents": 2, "items": 0, "autoConfirmed": 0, "needsReview": 0},
    "warnings": [],
    "failure": null,
    "documents": [],
    "items": [],
    "itemsNextCursor": null,
    "caseReview": null
  }
}
```

### 4.2 状态和结果的查询 `GET /v1/standardizations/{taskId}`

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | path | 必填 | 任务编号 |
| `includeItems` | query | 可选 | 为 `false` 时不返回 `items`、`itemsNextCursor`、`caseReview`（仅查询状态）。默认 `true` |

- 推荐先通过已完成任务列表（§4.4）得知任务结束，再进行查询。按任务查询时，请间隔 `pollAfterMs` 以上。
- **请在进入终止状态之后再读取 `items`。** 任务的 `FAILED` 也是业务上的终止，因此查询本身以 HTTP 200 返回。

#### 任务（`data`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `taskId` | String | 任务编号 |
| `clientRequestId` | String | 请求中的值 |
| `caseNo` | String | 请求中的值 |
| `status` | String | 任务的状态（§6.3，固定） |
| `priority` | String | 请求中的值（§6.13） |
| `acceptedAt` | Long | 受理的日期时间 |
| `startedAt` | Long | 开始处理的日期时间。等待中为 `null` |
| `completedAt` | Long | 结束的日期时间。结束前为 `null` |
| `queue` | Object | 等待的参考值：`position`（等待的顺序。从 1 开始）、`estimatedCompletionAt`（预计完成的日期时间）。均为参考值，也可能为 `null` |
| `progress` | Object | `itemsTotal`（标准化对象的数量）、`itemsDone`（已完成的数量） |
| `pollAfterMs` | Integer | 到下次查询为止的参考时间（毫秒）。终止状态时为 `null` |
| `versions` | Object | 判断所使用的版本（键和值均为字符串。`groups` 为请求中的 `groupsVersion`）。**请不要解析其内容，只需保存**（用于咨询和审计）。键会增减 |
| `summary` | Object | `documents`、`items`（标准化对象的数量）、`autoConfirmed`（非需确认的数量）、`needsReview`（需确认的数量） |
| `warnings` | Object[] | 关于请求的提示（`code`、`message`、`groupId`〔关于组的提示时〕。§6.16） |
| `failure` | Object | 任务为 `FAILED` 时：`code`（§6.19）、`message` |
| `documents` | Object[] | 各单据的处理状态（按请求的顺序）：`documentId`、`documentTypeId`、`docCode`、`status`（§6.4，固定）、`failure`（`FAILED` 时：`code`〔§6.18〕、`message`）、`warnings` |
| `items` | Object[] | 标准化对象的结果（§5.3）。最多 100 件。有后续时，通过 `itemsNextCursor` 从 §4.3 获取 |
| `itemsNextCursor` | String | 用于获取后续标准化对象的游标。没有后续时为 `null` |
| `caseReview` | Object | 案件整体的判断（§5.8） |

- **任务变为 `FAILED`，仅限于**因标准化 API 的故障等原因无法处理整个请求时（`INTERNAL_ERROR`），以及自受理起 24 小时内未能开始处理时（`EXPIRED`）。部分单据无法处理时，任务为 `SUCCEEDED`，该单据为 `FAILED`。
- 单据为 `FAILED` 时，无法从该单据生成标准化对象。使用该单据类型项目的组的项目，请转为人工确认。
- **任务为 `CANCELLED` 时，请不要反映结果**（可能包含取消前已完成的标准化对象的结果，但仅供参考）。

#### 示例（2 张单据、5 件，含需确认）

ID 为示例。`values` 的列和候选（`candidates`），在示例中只登载了一部分（实际包含行的所有列的值，以及最多前 5 个候选）。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000140",
  "warnings": [],
  "data": {
    "taskId": "MS-20261118-7Q3K9D",
    "clientRequestId": "CLAIM-20261118000123-v1-1",
    "caseNo": "CLAIM-20261118000123",
    "status": "SUCCEEDED",
    "priority": "NORMAL",
    "acceptedAt": 1794963600000,
    "startedAt": 1794963660000,
    "completedAt": 1794963681300,
    "queue": {"position": null, "estimatedCompletionAt": null},
    "progress": {"itemsTotal": 5, "itemsDone": 5},
    "pollAfterMs": null,
    "versions": {"api": "1.1", "agent": "1.0.0", "catalog": "2026-11-19", "groups": "2026-11-19-01", "policy": "2026-11-09", "master.DISEASE": "2026-11-16", "master.OPERATION": "2026-11-16", "master.FACILITY": "2026-11-16", "master.DRUG": "2026-11-17"},
    "summary": {"documents": 2, "items": 5, "autoConfirmed": 4, "needsReview": 1},
    "warnings": [],
    "failure": null,
    "documents": [
      {"documentId": "991243705301", "documentTypeId": "20001", "docCode": "HG02-001", "status": "SUCCEEDED", "failure": null, "warnings": []},
      {"documentId": "991243705302", "documentTypeId": "20002", "docCode": "HE03-001", "status": "SUCCEEDED", "failure": null, "warnings": []}
    ],
    "items": [
      {
        "itemId": "ope1",
        "groupId": "HG02-OPE",
        "masterTable": "OPERATION",
        "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "手術情報", "tableIndex": 0, "rowIndex": 0, "columnName": "手術名", "columnIndex": 0},
        "inputs": [
          {"column": "CLM_OperationMst__c.NAME", "value": "経皮的冠動脈形成術（その他のもの）", "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "手術情報", "tableIndex": 0, "rowIndex": 0, "columnName": "手術名", "columnIndex": 0}, "ocrConfidence": 0.93, "idpNeedReview": 0},
          {"column": "CLM_OperationMst__c.KCODE__C", "value": "K5463", "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "手術情報", "tableIndex": 0, "rowIndex": 0, "columnName": "手術コード", "columnIndex": 2}, "ocrConfidence": 0.96, "idpNeedReview": 0},
          {"hint": "operationDate", "value": "2026-10-02", "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "手術情報", "tableIndex": 0, "rowIndex": 0, "columnName": "手術日", "columnIndex": 1}, "ocrConfidence": 0.99, "idpNeedReview": 0}
        ],
        "targets": {
          "CLM_OperationMst__c.NAME": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "手術情報", "tableIndex": 0, "rowIndex": 0, "columnName": "手術名", "columnIndex": 0}
        },
        "status": "MATCHED",
        "needsReview": false,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000301",
          "displayName": "経皮的冠動脈形成術",
          "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈形成術", "CLM_OperationMst__c.KCODE__C": "K546-00", "CLM_OperationMst__c.KCODEOPNAME__C": "経皮的冠動脈形成術（その他のもの）", "CLM_OperationMst__c.KANA1__C": "ケイヒテキカンドウミャクケイセイジュツ", "CLM_OperationMst__c.CANCEROPERATION__C": "false", "CLM_OperationMst__c.CWFDENTISTRY__C": "false", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（その他のもの）", "CWF_OperationMstAlias__c.ID": "a0W000000000000301"},
          "active": true,
          "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000301", "name": "経皮的冠動脈形成術（その他のもの）"}
        },
        "proposedName": null,
        "confidence": 0.97,
        "reviewReasons": [],
        "notices": [],
        "decidedBy": "RULE",
        "reason": "読取値が、画面で選べる別名「経皮的冠動脈形成術（その他のもの）」と完全に一致し、帳票の手術コードとも矛盾しないため確定した。",
        "notesForAssessor": "",
        "alternatives": [],
        "splitItems": [],
        "webEvidence": [],
        "candidates": [
          {"masterTable": "OPERATION", "object": "CLM_OperationMst__c", "masterId": "a0V000000000000301", "displayName": "経皮的冠動脈形成術", "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈形成術", "CLM_OperationMst__c.KCODE__C": "K546-00", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（その他のもの）"}, "active": true, "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000301", "name": "経皮的冠動脈形成術（その他のもの）"}, "matchedName": "経皮的冠動脈形成術（その他のもの）", "score": 100.0, "selectable": true, "isMaster": true},
          {"masterTable": "OPERATION", "object": "CLM_OperationMst__c", "masterId": "a0V000000000000301", "displayName": "経皮的冠動脈形成術", "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈形成術", "CLM_OperationMst__c.KCODE__C": "K546-00", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"}, "active": true, "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000302", "name": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"}, "matchedName": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）", "score": 88.4, "selectable": true, "isMaster": false},
          {"masterTable": "OPERATION", "object": "CLM_OperationMst__c", "masterId": "a0V000000000000301", "displayName": "経皮的冠動脈形成術", "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈形成術", "CLM_OperationMst__c.KCODE__C": "K546-00", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（不安定狭心症に対するもの）"}, "active": true, "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000303", "name": "経皮的冠動脈形成術（不安定狭心症に対するもの）"}, "matchedName": "経皮的冠動脈形成術（不安定狭心症に対するもの）", "score": 87.9, "selectable": true, "isMaster": false},
          {"masterTable": "OPERATION", "object": "CLM_OperationMst__c", "masterId": "a0V000000000000311", "displayName": "経皮的冠動脈形成術（特殊カテーテルによるもの）", "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）", "CLM_OperationMst__c.KCODE__C": "K548-00", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）"}, "active": true, "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000311", "name": "経皮的冠動脈形成術（特殊カテーテルによるもの）"}, "matchedName": "経皮的冠動脈形成術（特殊カテーテルによるもの）", "score": 80.2, "selectable": true, "isMaster": false},
          {"masterTable": "OPERATION", "object": "CLM_OperationMst__c", "masterId": "a0V000000000000312", "displayName": "経皮的冠動脈ステント留置術", "values": {"CLM_OperationMst__c.NAME": "経皮的冠動脈ステント留置術", "CLM_OperationMst__c.KCODE__C": "K549-00", "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈ステント留置術（その他のもの）"}, "active": true, "selection": {"object": "CWF_OperationMstAlias__c", "recordType": "ALIAS", "recordId": "a0W000000000000312", "name": "経皮的冠動脈ステント留置術（その他のもの）"}, "matchedName": "経皮的冠動脈ステント留置術（その他のもの）", "score": 76.5, "selectable": true, "isMaster": false}
        ]
      },
      {
        "itemId": "dis1",
        "groupId": "HE03-DIS-1",
        "masterTable": "DISEASE",
        "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2},
        "inputs": [
          {"column": "CLM_ICD10Mst__c.NAME", "value": "食道癌/直腸癌", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2}, "ocrConfidence": 0.94, "idpNeedReview": 0},
          {"column": "CLM_ICD10Mst__c.ICD10__C", "value": "C159,C20", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1_ICD10", "fieldIndex": 3}, "ocrConfidence": 0.92, "idpNeedReview": 0},
          {"hint": "sex", "value": "女", "source": {"type": "CASE_FIELD", "fieldName": "性別"}, "ocrConfidence": null, "idpNeedReview": null}
        ],
        "targets": {
          "CLM_ICD10Mst__c.NAME": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2}
        },
        "status": "SPLIT",
        "needsReview": false,
        "master": {
          "masterTable": "DISEASE",
          "object": "CLM_ICD10Mst__c",
          "masterId": "a0P000000000000101",
          "displayName": "食道癌",
          "values": {"CLM_ICD10Mst__c.NAME": "食道癌", "CLM_ICD10Mst__c.ICD10__C": "C159", "CLM_ICD10Mst__c.KANA__C": "ショクドウガン"},
          "active": true,
          "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000101", "name": "食道癌"}
        },
        "proposedName": null,
        "confidence": 0.93,
        "reviewReasons": [],
        "notices": [],
        "decidedBy": "AI",
        "reason": "「食道癌/直腸癌」は 2 つの傷病の併記のため分割し、それぞれマスタに名寄せした。帳票の ICD10（C159・C20）と一致し、先頭の食道癌を主とした。",
        "notesForAssessor": "",
        "alternatives": [],
        "splitItems": [
          {"text": "食道癌", "primary": true, "master": {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000101", "displayName": "食道癌", "values": {"CLM_ICD10Mst__c.NAME": "食道癌", "CLM_ICD10Mst__c.ICD10__C": "C159", "CLM_ICD10Mst__c.KANA__C": "ショクドウガン"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000101", "name": "食道癌"}}},
          {"text": "直腸癌", "primary": false, "master": {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000102", "displayName": "直腸癌", "values": {"CLM_ICD10Mst__c.NAME": "直腸癌", "CLM_ICD10Mst__c.ICD10__C": "C20", "CLM_ICD10Mst__c.KANA__C": "チョクチョウガン"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000102", "name": "直腸癌"}}}
        ],
        "webEvidence": [],
        "candidates": [
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000101", "displayName": "食道癌", "values": {"CLM_ICD10Mst__c.NAME": "食道癌", "CLM_ICD10Mst__c.ICD10__C": "C159"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000101", "name": "食道癌"}, "matchedName": "食道癌", "score": 95.2, "selectable": true, "isMaster": true},
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000102", "displayName": "直腸癌", "values": {"CLM_ICD10Mst__c.NAME": "直腸癌", "CLM_ICD10Mst__c.ICD10__C": "C20"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000102", "name": "直腸癌"}, "matchedName": "直腸癌", "score": 86.0, "selectable": true, "isMaster": false},
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000103", "displayName": "食道胃接合部癌", "values": {"CLM_ICD10Mst__c.NAME": "食道胃接合部癌", "CLM_ICD10Mst__c.ICD10__C": "C160"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000103", "name": "食道胃接合部癌"}, "matchedName": "食道胃接合部癌", "score": 72.3, "selectable": true, "isMaster": false}
        ]
      },
      {
        "itemId": "dis2",
        "groupId": "HE03-DIS-2",
        "masterTable": "DISEASE",
        "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名2", "fieldIndex": 4},
        "inputs": [
          {"column": "CLM_ICD10Mst__c.NAME", "value": "乳房下側部乳癌", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名2", "fieldIndex": 4}, "ocrConfidence": 0.9, "idpNeedReview": 0},
          {"hint": "sex", "value": "女", "source": {"type": "CASE_FIELD", "fieldName": "性別"}, "ocrConfidence": null, "idpNeedReview": null}
        ],
        "targets": {
          "CLM_ICD10Mst__c.NAME": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名2", "fieldIndex": 4}
        },
        "status": "UNRESOLVED",
        "needsReview": true,
        "master": null,
        "proposedName": null,
        "confidence": 0.5,
        "reviewReasons": [
          {"code": "MULTIPLE_CANDIDATES", "message": "乳房下外側部乳癌と乳房下内側部乳癌が同点で、帳票に内側・外側を決める記載がない。"},
          {"code": "UNRESOLVED", "message": "判断できないため、人の確認が必要。"}
        ],
        "notices": [],
        "decidedBy": "AI",
        "reason": "読取値には内側・外側の区別がなく、案件の帳票にも部位を決める記載や ICD10 がないため、確定できない。",
        "notesForAssessor": "帳票の部位の記載（内側・外側）を確認してください。",
        "alternatives": [
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000201", "displayName": "乳房下外側部乳癌", "values": {"CLM_ICD10Mst__c.NAME": "乳房下外側部乳癌", "CLM_ICD10Mst__c.ICD10__C": "C505"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000201", "name": "乳房下外側部乳癌"}, "whyNot": "外側の記載がない"},
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000202", "displayName": "乳房下内側部乳癌", "values": {"CLM_ICD10Mst__c.NAME": "乳房下内側部乳癌", "CLM_ICD10Mst__c.ICD10__C": "C503"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000202", "name": "乳房下内側部乳癌"}, "whyNot": "内側の記載がない"}
        ],
        "splitItems": [],
        "webEvidence": [],
        "candidates": [
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000201", "displayName": "乳房下外側部乳癌", "values": {"CLM_ICD10Mst__c.NAME": "乳房下外側部乳癌", "CLM_ICD10Mst__c.ICD10__C": "C505"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000201", "name": "乳房下外側部乳癌"}, "matchedName": "乳房下外側部乳癌", "score": 91.7, "selectable": true, "isMaster": false},
          {"masterTable": "DISEASE", "object": "CLM_ICD10Mst__c", "masterId": "a0P000000000000202", "displayName": "乳房下内側部乳癌", "values": {"CLM_ICD10Mst__c.NAME": "乳房下内側部乳癌", "CLM_ICD10Mst__c.ICD10__C": "C503"}, "active": true, "selection": {"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000202", "name": "乳房下内側部乳癌"}, "matchedName": "乳房下内側部乳癌", "score": 91.7, "selectable": true, "isMaster": false}
        ]
      },
      {
        "itemId": "fac1",
        "groupId": "FAC-1",
        "masterTable": "FACILITY",
        "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "医療機関名", "fieldIndex": 1},
        "inputs": [
          {"column": "CWF_MedicalFacilityMaster__c.NAME", "value": "サンプル記念病院", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "医療機関名", "fieldIndex": 1}, "ocrConfidence": 0.97, "idpNeedReview": 0},
          {"column": "CWF_MedicalFacilityMaster__c.ADDRESS__C", "value": "東京都〇〇区〇〇町1-2-3", "source": {"type": "FIELD", "documentId": "991243705301", "fieldName": "病院住所", "fieldIndex": 1}, "ocrConfidence": 0.95, "idpNeedReview": 0},
          {"hint": "department", "value": "循環器内科", "source": {"type": "FIELD", "documentId": "991243705301", "fieldName": "診療科", "fieldIndex": 2}, "ocrConfidence": 0.98, "idpNeedReview": 0}
        ],
        "targets": {
          "CWF_MedicalFacilityMaster__c.NAME": {"type": "FIELD", "documentId": "991243705302", "fieldName": "医療機関名", "fieldIndex": 1}
        },
        "status": "MATCHED",
        "needsReview": false,
        "master": {
          "masterTable": "FACILITY",
          "object": "CWF_MedicalFacilityMaster__c",
          "masterId": "a1F000000000000401",
          "displayName": "サンプル記念病院",
          "values": {"CWF_MedicalFacilityMaster__c.NAME": "サンプル記念病院", "CWF_MedicalFacilityMaster__c.ADDRESS__C": "東京都〇〇区〇〇町1-2-3", "CWF_MedicalFacilityMaster__c.POSTALCODE__C": "100-0000"},
          "active": true,
          "selection": {"object": "CWF_MedicalFacilityMaster__c", "recordType": "MASTER", "recordId": "a1F000000000000401", "name": "サンプル記念病院"}
        },
        "proposedName": null,
        "confidence": 0.95,
        "reviewReasons": [],
        "notices": [],
        "decidedBy": "RULE",
        "reason": "医療機関名が同名の施設の無いマスタと一致し、診療明細書の所在地も一致したため確定した。",
        "notesForAssessor": "",
        "alternatives": [],
        "splitItems": [],
        "webEvidence": [],
        "candidates": [
          {"masterTable": "FACILITY", "object": "CWF_MedicalFacilityMaster__c", "masterId": "a1F000000000000401", "displayName": "サンプル記念病院", "values": {"CWF_MedicalFacilityMaster__c.NAME": "サンプル記念病院", "CWF_MedicalFacilityMaster__c.ADDRESS__C": "東京都〇〇区〇〇町1-2-3"}, "active": true, "selection": {"object": "CWF_MedicalFacilityMaster__c", "recordType": "MASTER", "recordId": "a1F000000000000401", "name": "サンプル記念病院"}, "matchedName": "サンプル記念病院", "score": 97.0, "selectable": true, "isMaster": true},
          {"masterTable": "FACILITY", "object": "CWF_MedicalFacilityMaster__c", "masterId": "a1F000000000000402", "displayName": "サンプル記念クリニック", "values": {"CWF_MedicalFacilityMaster__c.NAME": "サンプル記念クリニック", "CWF_MedicalFacilityMaster__c.ADDRESS__C": "東京都〇〇区△△町4-5-6"}, "active": true, "selection": {"object": "CWF_MedicalFacilityMaster__c", "recordType": "MASTER", "recordId": "a1F000000000000402", "name": "サンプル記念クリニック"}, "matchedName": "サンプル記念クリニック", "score": 74.0, "selectable": true, "isMaster": false}
        ]
      },
      {
        "itemId": "drg1",
        "groupId": "HG02-DRUG",
        "masterTable": "DRUG",
        "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "商品名", "columnIndex": 0},
        "inputs": [
          {"column": "DRUG.BRANDNAME", "value": "ティーエスワン配合カプセルT20 1C", "source": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "商品名", "columnIndex": 0}, "ocrConfidence": 0.91, "idpNeedReview": 0}
        ],
        "targets": {
          "DRUG.BRANDNAME": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "商品名", "columnIndex": 0},
          "DRUG.ATC": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "ATC分類", "columnIndex": 2},
          "DRUG.EFFICACY": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "薬効分類", "columnIndex": 3},
          "DRUG.YJCODE": {"type": "TABLE_CELL", "documentId": "991243705301", "tableName": "薬剤情報", "tableIndex": 1, "rowIndex": 0, "columnName": "薬価基準コード", "columnIndex": 4}
        },
        "status": "MATCHED",
        "needsReview": false,
        "master": {
          "masterTable": "DRUG",
          "object": null,
          "masterId": "D000000000000601",
          "displayName": "ティーエスワン配合カプセルＴ２０",
          "values": {"DRUG.BRANDNAME": "ティーエスワン配合カプセルＴ２０", "DRUG.GENERICNAME": "テガフール・ギメラシル・オテラシルカリウム配合剤", "DRUG.GENERICNAMEEN": "Tegafur Gimeracil Oteracil Potassium", "DRUG.YJCODE": "4229101M1033", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229", "DRUG.DATEFROM": "2009-09-01"},
          "active": true,
          "selection": null
        },
        "proposedName": null,
        "confidence": 0.98,
        "reviewReasons": [],
        "notices": [],
        "decidedBy": "RULE",
        "reason": "読取値から数量（1C）を除くと、販売名「ティーエスワン配合カプセルＴ２０」と一致したため確定した。",
        "notesForAssessor": "",
        "alternatives": [],
        "splitItems": [],
        "webEvidence": [],
        "candidates": [
          {"masterTable": "DRUG", "object": null, "masterId": "D000000000000601", "displayName": "ティーエスワン配合カプセルＴ２０", "values": {"DRUG.BRANDNAME": "ティーエスワン配合カプセルＴ２０", "DRUG.YJCODE": "4229101M1033", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229"}, "active": true, "selection": null, "matchedName": "ティーエスワン配合カプセルＴ２０", "score": 100.0, "selectable": true, "isMaster": true},
          {"masterTable": "DRUG", "object": null, "masterId": "D000000000000602", "displayName": "ティーエスワン配合カプセルＴ２５", "values": {"DRUG.BRANDNAME": "ティーエスワン配合カプセルＴ２５", "DRUG.YJCODE": "4229101M2030", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229"}, "active": true, "selection": null, "matchedName": "ティーエスワン配合カプセルＴ２５", "score": 93.1, "selectable": true, "isMaster": false},
          {"masterTable": "DRUG", "object": null, "masterId": "D000000000000603", "displayName": "ティーエスワン配合顆粒Ｔ２０", "values": {"DRUG.BRANDNAME": "ティーエスワン配合顆粒Ｔ２０", "DRUG.YJCODE": "4229101D1025", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229"}, "active": true, "selection": null, "matchedName": "ティーエスワン配合顆粒Ｔ２０", "score": 90.6, "selectable": true, "isMaster": false},
          {"masterTable": "DRUG", "object": null, "masterId": "D000000000000604", "displayName": "ティーエスワン配合顆粒Ｔ２５", "values": {"DRUG.BRANDNAME": "ティーエスワン配合顆粒Ｔ２５", "DRUG.YJCODE": "4229101D2021", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229"}, "active": true, "selection": null, "matchedName": "ティーエスワン配合顆粒Ｔ２５", "score": 88.2, "selectable": true, "isMaster": false},
          {"masterTable": "DRUG", "object": null, "masterId": "D000000000000605", "displayName": "ティーエスワン配合ＯＤ錠Ｔ２０", "values": {"DRUG.BRANDNAME": "ティーエスワン配合ＯＤ錠Ｔ２０", "DRUG.YJCODE": "4229101F1026", "DRUG.ATC": "L01BC53", "DRUG.EFFICACY": "4229"}, "active": true, "selection": null, "matchedName": "ティーエスワン配合ＯＤ錠Ｔ２０", "score": 86.5, "selectable": true, "isMaster": false}
        ]
      }
    ],
    "itemsNextCursor": null,
    "caseReview": {"executed": true, "consistent": true, "summary": "傷病・手術・医療機関・薬剤に明確な矛盾はない。", "findings": []}
  }
}
```

在此示例中，如果自动采用 `drg1`，诊疗明细书的表“薬剤情報”第 1 行的 4 个单元格中，将写入同一行的值（`ティーエスワン配合カプセルＴ２０`、`L01BC53`、`4229`、`4229101M1033`）（§5.7）。ATC 分类、药效分类是不用于匹配的列，但由于包含在行的值（`values`）中，只要设为组的 `OUTPUT` 即可写入。此外，像 `ope1`、`drg1` 这样可以自动采用的结果，也附带包括所采用的行在内的候选（`candidates`。所采用的行为 `isMaster=true`）。操作人员可以在确认界面中改为其他候选（§1.4 的 C-05）。

### 4.3 标准化对象列表 `GET /v1/standardizations/{taskId}/items`

分页返回标准化对象的结果（§4.2 的 `items` 的后续，或从头开始）。请在任务进入终止状态之后使用（结束前为 409 `TASK_NOT_FINISHED`）。

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| `cursor` | query | 可选 | §4.2 的 `itemsNextCursor`，或上一页的 `nextCursor`。省略时从头开始 |
| `limit` | query | 可选 | 1～100。默认 100 |

响应的 `data` 为 `{"items": [...], "nextCursor": …}`（`items` 的要素见 §5.3。没有后续时 `nextCursor` 为 `null`）。

### 4.4 已完成任务列表 `GET /v1/standardizations`

按结束的顺序，返回进入终止状态（`SUCCEEDED` / `FAILED` / `CANCELLED`）的任务。**IDP 请定期（例：每 5～10 秒 1 次）调用此 API，并获取列表中出现的任务的结果。** 与反复按任务查询相比，负荷更小。

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| `cursor` | query | 条件 | 上次响应的 `nextCursor`。第 2 次起必填 |
| `finishedAfter` | query | 条件 | 仅第一次调用时：从在此日期时间（Unix 毫秒）之后结束的任务开始返回 |
| `limit` | query | 可选 | 1～500。默认 100 |

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000141",
  "warnings": [],
  "data": {
    "tasks": [
      {"taskId": "MS-20261118-7Q3K9D", "clientRequestId": "CLAIM-20261118000123-v1-1", "caseNo": "CLAIM-20261118000123", "status": "SUCCEEDED", "completedAt": 1794963681300}
    ],
    "nextCursor": "c-000000001794963681300-7Q3K9D"
  }
}
```

- `tasks` 按结束的顺序排列（`completedAt` 的顺序。相同时按 `taskId` 的顺序）。同一个任务只出现 1 次。只返回该调用方的任务。
- 一定会返回 `nextCursor`。请保存并用于下次调用。没有新结束的任务时，`tasks` 为空数组，`nextCursor` 为相同的值。
- 游标在可查询的期间（§2.6）内可以使用。

### 4.5 取消请求 `POST /v1/standardizations/{taskId}/cancel`

- 取消 `PENDING` / `PROCESSING` 的任务，使其变为 `CANCELLED`。不需要请求体。
- 取消时已完成的标准化对象的结果会保留，但已取消的任务的结果请不要反映（§4.2）。
- 已经是 `CANCELLED` 时，返回相同的响应。`SUCCEEDED` / `FAILED` 时返回 409（`TASK_NOT_CANCELLABLE`）。取消与完成同时发生时，以先确定的状态为准（请通过响应的 `status` 确认）。
- 已取消的任务也会出现在已完成任务列表（§4.4）中。指定了 `callbackUrl` 的请求，也会进行通知。
- 请在案件中止时、重新识别后重新发起请求时使用。
- 响应的 `data` 为 §4.2 的任务。

### 4.6 单个值的标准化 `POST /v1/items/standardize`

在确认界面中操作人员修改了识别值时（或在原本为空的项目中输入了值时），仅对该标准化对象重新进行标准化。同步返回结果（不创建任务。在与案件队列分开的通道中处理）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `clientRequestId` | String | 可选 | 幂等键 |
| `caseNo` | String | 可选 | 案件编号（审计用） |
| `ref` | Object | 可选 | 被修改的原结果：`taskId`、`itemId`。指定后，将继承原结果的上下文（案件单据的其他项目）和回写的位置（`targets`），并且在返回确定的结果（§4.12）时，也能关联到原结果 |
| `masterTable` | String | 必填 | 主数据表（§6.1） |
| `inputs` | Object[] | 必填 | 输入：`column` 或 `hint`、`value`、`source`（可选。§5.6 的位置）。指定了 `ref` 时，只需放入修改过的输入，其他输入从原结果继承 |
| `targets` | Object | 可选 | 回写的位置（键为列，值为 §5.6 的位置）。省略并指定了 `ref` 时，为原结果的 `targets` |
| `options.allowWebSearch` | Boolean | 可选 | 默认 `true` |
| `options.includeCandidates` | Boolean | 可选 | 是否返回候选。默认 `true`（可以自动采用的结果也返回） |
| `options.maxCandidates` | Integer | 可选 | 返回候选的最大件数（包括所采用的行）。1～10。默认 5 |
| `options.timeoutSeconds` | Integer | 可选 | 5～30。默认 30。超时时，以 `UNRESOLVED`、需确认（`TIMEOUT`）返回 |

```json
{
  "clientRequestId": "CLAIM-20261118000123-dis2-r1",
  "caseNo": "CLAIM-20261118000123",
  "ref": {"taskId": "MS-20261118-7Q3K9D", "itemId": "dis2"},
  "masterTable": "DISEASE",
  "inputs": [
    {"column": "CLM_ICD10Mst__c.NAME", "value": "乳房下内側部乳癌", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名2", "fieldIndex": 4}}
  ],
  "options": {"allowWebSearch": false, "timeoutSeconds": 30}
}
```

- 响应的 `data` 为 §5.3 的一个标准化对象的结果，再加上请求中的 `ref`。`itemId` 是本次调用新分配的值（`groupId` 为原结果的值。没有 `ref` 时为 `ADHOC`）。
- 指定了对该 API Key 不可用的主数据表时返回 400（`MASTER_TABLE_NOT_ENABLED`），`ref` 的任务或标准化对象不存在时返回 404（`ITEM_NOT_FOUND`）。

### 4.7 主数据表一览 `GET /v1/masters`

返回可以进行标准化的主数据表，及其列和提示信息。**请在 IDP 的设置界面中，用于创建组**（选择主数据表，并按列和提示信息对应 IDP 的项目）。IDP 请在启动时或每天一次等时机获取。`schemaVersion` 变化时，请重新获取。

- 按主数据表列出作为来源的 **SFDC 对象**（`sources`。主数据和别名的对象），按列列出 **SFDC 的项目**（`object`、`field`）。列的键为 `对象.项目`（例：`CLM_ICD10Mst__c.ICD10__C`）。项目名是从 SFDC 取出主数据时的写法。
- **药品主数据（`DRUG`）不是 SFDC 的对象**。是 Zurich 维护的药品主数据（抗癌药、激素药、缓和医疗用药等用于支付判断的药品），与 IDP 的主数据匹配中加载的主数据相同（版本见 `masterVersion`）。`sources` 为空数组，列的 `object` 为 `null`，列的键为 `主数据表.项目`（例：`DRUG.ATC`）。没有用于登记的记录（`selectionRecordTypes` 为空），仅用于写入值。对于用标准化 API 进行药品标准化的项目，请不要重复设置 IDP 的主数据匹配（§8.2）。
- 列中列出作为来源的对象的项目，除 SFDC 的系统项目（创建日期、所有者等）外全部列出。可用于匹配的列为 `inputRole` 为 `PRIMARY`、`SUPPORTING` 的列，其他（`NONE`）为仅可用于回写（写入值）的列。SFDC 中项目增加时，此一览中也会增加。**标准化结果的行的值（`values`）中，包含此一览中所有列的值**（§5.4）。
- 主数据表的键不会变化。列的键，即使之后 SFDC 项目的名称发生变化也不会更改（§2.8 的事项 9）。
- 标准化的匹配键（包括别名，即主数据的其他写法）在标准化 API 内部。IDP 不需要持有主数据的数据。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000150",
  "warnings": [],
  "data": {
    "schemaVersion": "2026-11-19",
    "masterTables": [
      {
        "masterTable": "DISEASE", "label": "傷病名マスタ", "description": "傷病名と ICD10 コード。別名を含めて照合する", "enabled": true, "deprecated": false,
        "masterVersion": "2026-11-16", "selectionRecordTypes": ["ALIAS"], "displayColumn": "CLM_ICD10Mst__c.NAME",
        "sources": [{"object": "CLM_ICD10Mst__c", "label": "傷病・災害マスタ", "role": "MASTER"}, {"object": "CWF_ICD10MstAlias__c", "label": "傷病名別名", "role": "ALIAS"}],
        "columns": [
          {"column": "CLM_ICD10Mst__c.NAME", "object": "CLM_ICD10Mst__c", "field": "NAME", "label": "傷病名", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "PRIMARY", "writable": true, "deprecated": false},
          {"column": "CLM_ICD10Mst__c.ICD10__C", "object": "CLM_ICD10Mst__c", "field": "ICD10__C", "label": "ICD10 コード", "dataType": "CODE", "codeSystem": "ICD10", "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CLM_ICD10Mst__c.KANA__C", "object": "CLM_ICD10Mst__c", "field": "KANA__C", "label": "傷病名カナ", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CLM_ICD10Mst__c.ICD9__C", "object": "CLM_ICD10Mst__c", "field": "ICD9__C", "label": "ICD9 コード", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "CWF_ICD10MstAlias__c.NAME", "object": "CWF_ICD10MstAlias__c", "field": "NAME", "label": "傷病名別名（照合で一致した別名）", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "CWF_ICD10MstAlias__c.ID", "object": "CWF_ICD10MstAlias__c", "field": "ID", "label": "傷病名別名のレコード ID", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false}
        ],
        "hints": [{"hint": "sex", "label": "性別", "deprecated": false}, {"hint": "cause", "label": "傷病の原因", "deprecated": false}]
      },
      {
        "masterTable": "OPERATION", "label": "手術マスタ", "description": "手術名と手術コード（K コード）。別名を含めて照合する", "enabled": true, "deprecated": false,
        "masterVersion": "2026-11-16", "selectionRecordTypes": ["ALIAS"], "displayColumn": "CLM_OperationMst__c.NAME",
        "sources": [{"object": "CLM_OperationMst__c", "label": "手術マスタ", "role": "MASTER"}, {"object": "CWF_OperationMstAlias__c", "label": "手術名別名", "role": "ALIAS"}],
        "columns": [
          {"column": "CLM_OperationMst__c.NAME", "object": "CLM_OperationMst__c", "field": "NAME", "label": "手術名", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "PRIMARY", "writable": true, "deprecated": false},
          {"column": "CLM_OperationMst__c.KCODE__C", "object": "CLM_OperationMst__c", "field": "KCODE__C", "label": "手術コード（K コード）", "dataType": "CODE", "codeSystem": "KCODE", "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CLM_OperationMst__c.KCODEOPNAME__C", "object": "CLM_OperationMst__c", "field": "KCODEOPNAME__C", "label": "K コードの手術名", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CLM_OperationMst__c.OPERATIONNO__C", "object": "CLM_OperationMst__c", "field": "OPERATIONNO__C", "label": "手術番号", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "CLM_OperationMst__c.CANCEROPERATION__C", "object": "CLM_OperationMst__c", "field": "CANCEROPERATION__C", "label": "悪性新生物の手術", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "CWF_OperationMstAlias__c.ID", "object": "CWF_OperationMstAlias__c", "field": "ID", "label": "手術名別名のレコード ID", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false}
        ],
        "hints": [{"hint": "operationDate", "label": "手術日", "deprecated": false}, {"hint": "sex", "label": "性別", "deprecated": false}]
      },
      {
        "masterTable": "FACILITY", "label": "医療機関マスタ", "description": "医療機関名と所在地。別名を含めて照合する", "enabled": true, "deprecated": false,
        "masterVersion": "2026-11-16", "selectionRecordTypes": ["MASTER"], "displayColumn": "CWF_MedicalFacilityMaster__c.NAME",
        "sources": [{"object": "CWF_MedicalFacilityMaster__c", "label": "医療機関マスタ", "role": "MASTER"}, {"object": "CWF_MedicalFacilityAlias__c", "label": "医療機関別名", "role": "ALIAS"}],
        "columns": [
          {"column": "CWF_MedicalFacilityMaster__c.NAME", "object": "CWF_MedicalFacilityMaster__c", "field": "NAME", "label": "医療機関名", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "PRIMARY", "writable": true, "deprecated": false},
          {"column": "CWF_MedicalFacilityMaster__c.ADDRESS__C", "object": "CWF_MedicalFacilityMaster__c", "field": "ADDRESS__C", "label": "所在地", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CWF_MedicalFacilityMaster__c.POSTALCODE__C", "object": "CWF_MedicalFacilityMaster__c", "field": "POSTALCODE__C", "label": "郵便番号", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "CWF_MedicalFacilityMaster__c.ID", "object": "CWF_MedicalFacilityMaster__c", "field": "ID", "label": "医療機関のレコード ID", "dataType": "CODE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false}
        ],
        "hints": [{"hint": "department", "label": "診療科", "deprecated": false}]
      },
      {
        "masterTable": "DRUG", "label": "薬剤マスタ", "description": "抗がん剤・ホルモン剤・緩和薬などの医薬品（商品名〔販売名〕・一般名）と、ATC 分類・薬効分類・薬価基準コード・薬価収載日。Zurich が整備するマスタで、SFDC のオブジェクトではない", "enabled": true, "deprecated": false,
        "masterVersion": "2026-11-17", "selectionRecordTypes": [], "displayColumn": "DRUG.BRANDNAME",
        "sources": [],
        "columns": [
          {"column": "DRUG.BRANDNAME", "object": null, "field": "BRANDNAME", "label": "商品名（販売名）", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "PRIMARY", "writable": true, "deprecated": false},
          {"column": "DRUG.GENERICNAME", "object": null, "field": "GENERICNAME", "label": "一般名", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "PRIMARY", "writable": true, "deprecated": false},
          {"column": "DRUG.GENERICNAMEEN", "object": null, "field": "GENERICNAMEEN", "label": "一般名（英語）", "dataType": "TEXT", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "DRUG.ATC", "object": null, "field": "ATC", "label": "ATC 分類", "dataType": "CODE", "codeSystem": "ATC", "multiValued": true, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "DRUG.EFFICACY", "object": null, "field": "EFFICACY", "label": "薬効分類", "dataType": "CODE", "codeSystem": "EFFICACY_CLASS", "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "DRUG.YJCODE", "object": null, "field": "YJCODE", "label": "薬価基準コード", "dataType": "CODE", "codeSystem": "YJ", "multiValued": false, "inputRole": "SUPPORTING", "writable": true, "deprecated": false},
          {"column": "DRUG.DATEFROM", "object": null, "field": "DATEFROM", "label": "薬価収載日", "dataType": "DATE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false},
          {"column": "DRUG.DATETO", "object": null, "field": "DATETO", "label": "収載終了日", "dataType": "DATE", "codeSystem": null, "multiValued": false, "inputRole": "NONE", "writable": true, "deprecated": false}
        ],
        "hints": []
      }
    ]
  }
}
```

（示例中，伤病名、手术、医疗机构的列只登载了一部分。药品主数据的列，为当前全部 8 列。）

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 主数据表一览的版本。变化时请重新获取 |
| `masterTables[].masterTable` / `label` / `description` | 主数据表的键（§6.1）、显示名称、说明 |
| `masterTables[].enabled` | 该 API Key 是否可以使用。使用 `false` 的主数据表的组不会被处理（`warnings` 中为 `MASTER_TABLE_NOT_ENABLED`） |
| `masterTables[].deprecated` | 是否已不再使用。即使为 `true`，使用该键的组也会照常处理（新的设置中请不要使用） |
| `masterTables[].masterVersion` | 主数据的数据版本 |
| `masterTables[].selectionRecordTypes` | 用于登记的记录种类（§6.6）。为空数组时，此主数据表不返回用于登记的记录（`selection` 为 `null`。仅用于写入值） |
| `masterTables[].displayColumn` | 用于结果的 `displayName` 的列 |
| `masterTables[].sources` | 作为来源的 SFDC 对象：`object`（API 参照名）、`label`、`role`（§6.29：`MASTER`＝主数据，`ALIAS`＝别名）。不是 SFDC 对象的主数据表（`DRUG`）中为空数组 |
| `columns[].column` / `label` | 列的键（`对象.项目`。不是 SFDC 对象的主数据表为 `主数据表.项目`）、显示名称 |
| `columns[].object` / `field` | 作为来源的 SFDC 对象、项目。不是 SFDC 对象的主数据表中，`object` 为 `null` |
| `columns[].dataType` | 值的种类（§6.11）：`TEXT`、`CODE`、`DATE` |
| `columns[].codeSystem` | 编码的种类（§6.12）。不是编码时为 `null` |
| `columns[].multiValued` | 是否为具有多个值的列。为 `true` 的列，其值是用 `;` 分隔的一个字符串（§2.4） |
| `columns[].inputRole` | 作为输入时的角色（§6.10，固定）：`PRIMARY`（可以作为主输入）、`SUPPORTING`（辅助匹配）、`NONE`（不能作为输入。仅回写） |
| `columns[].writable` | 是否可以作为回写（写入值）目标 |
| `columns[].deprecated` | 是否已不再使用 |
| `hints[].hint` / `label` / `deprecated` | 提示信息的键、显示名称、是否已不再使用。提示信息仅用于匹配，不进行回写 |

### 4.8 默认组 `GET /v1/groups/defaults`

返回 Zurich 根据 IDP 当前的识别设置创建的组（格式与 §5.1 相同）。

- 可以导入到 IDP 的设置中，修改后使用（请在开始创建设置时使用）。
- 默认组是设置的模板。标准化 API 不会自动将其应用到请求中（请求中请发送 IDP 设置中的组。§1.2）。
- IDP 中单据类型或项目增加时，这里不会自动增加。请在 IDP 的设置中添加组。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000152",
  "warnings": [],
  "data": {
    "version": "2026-11-19",
    "groups": [
      {"groupId": "DEFAULT:HG02-OPE", "label": "手術（診療明細書2）", "masterTable": "OPERATION", "members": [
        {"column": "CLM_OperationMst__c.NAME", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術名"}},
        {"column": "CLM_OperationMst__c.KCODE__C", "mode": "INPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術コード"}},
        {"hint": "operationDate", "mode": "INPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "手術情報", "columnName": "手術日"}}
      ]},
      {"groupId": "DEFAULT:HG02-DRUG", "label": "薬剤（診療明細書2）", "masterTable": "DRUG", "members": [
        {"column": "DRUG.BRANDNAME", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "商品名"}},
        {"column": "DRUG.ATC", "mode": "OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "ATC分類"}},
        {"column": "DRUG.EFFICACY", "mode": "OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "薬効分類"}},
        {"column": "DRUG.YJCODE", "mode": "INPUT_OUTPUT", "field": {"type": "TABLE_COLUMN", "documentTypeId": "20001", "tableName": "薬剤情報", "columnName": "薬価基準コード"}}
      ]}
    ]
  }
}
```

（示例中只登载了 2 件。）

### 4.9 组设置的校验 `POST /v1/groups/validate`

确认组的设置是否有错误，并返回应用到测试单据时生成的标准化对象。**请在 IDP 的设置界面中，保存之前调用。** 不进行标准化（立即返回）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `groups` | Object[] | 必填 | 要确认的组（§5.1） |
| `documents` | Object[] | 可选 | 试着应用的单据（与 §4.1 的 `documents` 格式相同） |
| `caseResult` | Object | 可选 | 试着应用的案件的标准项目 |

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000153",
  "warnings": [],
  "data": {
    "groups": [
      {"groupId": "HE03-DIS-1", "valid": true, "errors": [], "warnings": [],
       "instances": [
         {"source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2},
          "inputs": [{"column": "CLM_ICD10Mst__c.NAME", "value": "食道癌/直腸癌", "source": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2}}],
          "targets": {"CLM_ICD10Mst__c.NAME": {"type": "FIELD", "documentId": "991243705302", "fieldName": "傷病名1", "fieldIndex": 2}}}
       ]},
      {"groupId": "HG02-DRUG-2", "valid": false,
       "errors": [{"code": "NO_PRIMARY_INPUT", "message": "主たる入力（商品名または一般名）を INPUT または INPUT_OUTPUT で入れてください。", "memberIndex": null}],
       "warnings": [], "instances": []}
    ]
  }
}
```

- `errors[].code` 为 §6.17 的值。`memberIndex` 为有错误的 `members` 的位置（从 0 开始。整个组的错误时为 `null`）。
- 有 `errors` 的组，即使放入请求中也不会进行标准化（§4.1）。

### 4.10 目录 `GET /v1/catalog`

返回所有枚举值（§6）及其显示名称（日语）。IDP 请在启动时或每天一次等时机获取，`catalogVersion` 变化时请重新获取。

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000154",
  "warnings": [],
  "data": {
    "catalogVersion": "2026-11-19",
    "enums": {
      "masterTable": [{"value": "DISEASE", "label": "傷病名マスタ"}, {"value": "OPERATION", "label": "手術マスタ"}, {"value": "FACILITY", "label": "医療機関マスタ"}, {"value": "DRUG", "label": "薬剤マスタ"}],
      "itemStatus": [{"value": "MATCHED", "label": "確定"}, {"value": "NEW_CANDIDATE", "label": "新規登録候補"}, {"value": "SPLIT", "label": "分割"}, {"value": "NOT_APPLICABLE", "label": "名寄せの対象外"}, {"value": "UNRESOLVED", "label": "判断不能"}],
      "reviewReason": [{"value": "MULTIPLE_CANDIDATES", "label": "候補を1つに決められない"}, {"value": "UNRESOLVED", "label": "判断不能"}]
    }
  }
}
```

（示例中只登载了一部分。实际响应的 `enums` 中，包含 §6 的所有枚举值。键为 §6 的“目录的键”。）

### 4.11 运行状态确认 `GET /v1/health`

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000155",
  "warnings": [],
  "data": {"status": "UP", "ready": true}
}
```

| 字段 | 说明 |
|---|---|
| `status` | `UP`（正常）／`DEGRADED`（部分功能停止。AI 不可用时等。仍然受理标准化的请求，需要 AI 的对象以 `LLM_UNAVAILABLE`、需确认返回）／`DOWN`（停止） |
| `ready` | 是否可以受理标准化的请求。为 `false` 期间（刚启动时等），对请求返回 503（`NOT_READY`） |

### 4.12 返回人工确定的结果 `POST /v1/standardizations/{taskId}/feedback`（第 2 期）

请返回在确认界面或理赔审核中确定的主数据。用于确认生产环境中的精度，以及改进主数据。自请求起 90 天以上均可受理（§2.6）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `items[].itemId` | String | 必填 | 结果所属的标准化对象（通过 §4.6 重新标准化时，也使用原结果的 `itemId`） |
| `items[].decision` | String | 必填 | `ACCEPTED`（直接采用了标准化 API 的 `master`）／`CORRECTED`（改为了其他记录。包括 `master` 为 `null` 时进行了选择的情况）／`NOT_APPLICABLE`（判定为非标准化对象）／`NEW_MASTER`（将要或已经在主数据中新登记）／`UNKNOWN`（判定为不明） |
| `items[].finalSelections` | Object[] | 条件 | 已登记的记录：`[{"object": …, "recordType": …, "recordId": …}]`（通常为 1 件）。`ACCEPTED`、`CORRECTED`，且为有用于登记的记录的主数据表时必填。`NEW_MASTER` 且尚未登记时为空数组（登记后请重新发送） |
| `items[].finalMasterId` | String | 可选 | 确定的主数据的记录 ID（已知时） |
| `items[].decidedRole` | String | 可选 | `IDP_OPERATOR`（IDP 的确认负责人）／`ASSESSOR`（理赔审核负责人）。请不要特定到个人 |
| `items[].decidedAt` | Long | 可选 | 确定的日期时间 |

```json
{
  "items": [
    {"itemId": "dis1", "decision": "ACCEPTED", "finalSelections": [{"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000101"}], "finalMasterId": "a0P000000000000101", "decidedRole": "IDP_OPERATOR", "decidedAt": 1794964200000},
    {"itemId": "dis2", "decision": "CORRECTED", "finalSelections": [{"object": "CWF_ICD10MstAlias__c", "recordType": "ALIAS", "recordId": "a0Q000000000000202"}], "finalMasterId": "a0P000000000000202", "decidedRole": "IDP_OPERATOR", "decidedAt": 1794964200000}
  ]
}
```

- 响应的 `data` 为 `{"accepted": 受理的件数, "rejected": [{"itemId": …, "reason": …}]}`。不存在的 `itemId` 等，仅该要素不受理，并放入 `rejected`（其他要素照常受理）。
- 重新发送相同的 `itemId` 时，以后发送的内容覆盖。

### 4.13 主数据的检索 `POST /v1/masters/search`（第 2 期）

在确认界面中操作人员查找其他候选时使用。使用与标准化相同的匹配方式（写法的差异、别名、编码）进行检索。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `masterTable` | String | 必填 | 主数据表（§6.1） |
| `query` | String | 必填 | 检索词 |
| `filters` | Object | 可选 | 筛选条件（键为列，值为字符串。例：`{"CLM_ICD10Mst__c.ICD10__C": "C50"}`、`{"DRUG.EFFICACY": "4229"}`） |
| `limit` | Integer | 可选 | 1～50。默认 10 |

```json
{"masterTable": "DISEASE", "query": "乳房下内側部乳癌", "filters": {}, "limit": 10}
```

响应的 `data` 为 `{"items": [...]}`，`items` 的要素为 §5.5 的候选（按分数从高到低。`values` 中包含行的所有列的值）。操作人员选择的候选，请按照 §5.7 的规则，写入正在修改的标准化对象的 `targets` 中。

### 4.14 组设置的建议 `POST /v1/groups/suggest`（第 2 期）

根据测试单据的项目名和值，由 AI 建议组的设置（将哪个项目对应到哪个主数据表的哪一列）。即使项目名不标准，也会根据值和单据的上下文进行推定。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `documents` | Object[] | 必填 | 测试单据（与 §4.1 的 `documents` 格式相同。每种单据类型 1 件以上） |
| `caseResult` | Object | 可选 | 测试案件的标准项目 |
| `masterTables` | String[] | 可选 | 限定建议的主数据表 |

- 响应的 `data` 为 `{"groups": [...], "notes": [...]}`。`groups` 的格式与 §5.1 相同，每个要素附带 `confidence`（0.0～1.0）和 `reason`（日语）。
- **建议请在由人确认之后，再放入 IDP 的设置中。** 请不要直接用于请求。

### 4.15 完成通知（指定了 `callbackUrl` 时，可选）

- 任务进入终止状态（`SUCCEEDED` / `FAILED` / `CANCELLED`）时，向 `callbackUrl` POST 以下请求体。不发送结果本身（收到后请通过 §4.2 获取）。
- `event` 为通知的种类（§6.26。可能会增加。未知的值请忽略）。
- 请求头：`X-MS-Timestamp`（Unix 毫秒）、`X-MS-Key-Id`（签名密钥的 ID）、`X-MS-Signature`（`sha256=` ＋ 对“`X-MS-Timestamp` 的值 + `.` + 请求体”计算的 HMAC-SHA256 的十六进制表示）。签名密钥与 API Key 分开签发，切换期间通过密钥的 ID 区分新旧。
- 接收方请在 5 秒内返回 2xx。未返回时，将在 1、2、4、8、16 分钟后重发，仍未送达则放弃（可以通过已完成任务列表获取）。

```json
{"event": "TASK_FINISHED", "taskId": "MS-20261118-7Q3K9D", "caseNo": "CLAIM-20261118000123", "status": "SUCCEEDED", "completedAt": 1794963681300}
```

---

## 5. 通用对象

### 5.1 标准化组（设置）

对应同一个主数据表的同一行的 IDP 项目的组合。在 IDP 的设置中创建，并按原样放入请求的 `groups` 中。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `groupId` | String | 必填 | 组的标识（IDP 设置的 ID 等）。在请求内唯一。在结果的 `groupId` 中返回 |
| `label` | String | 可选 | 显示名称（例：“伤病名1”） |
| `masterTable` | String | 必填 | 主数据表（§4.7） |
| `members` | Object[] | 必填 | 组的项目（1 件以上） |
| `members[].column` | String | 条件 | 主数据表的列的键（§4.7 的 `columns[].column`。例：`CLM_ICD10Mst__c.ICD10__C`）。与 `hint` 二选一 |
| `members[].hint` | String | 条件 | 提示信息（§4.7 的 `hints[].hint`） |
| `members[].mode` | String | 必填 | 使用方式（§6.9，固定）：`INPUT`（用于匹配。不回写）／`OUTPUT`（不用于匹配，回写所采用行的值）／`INPUT_OUTPUT`（用于匹配，并回写） |
| `members[].field` | Object | 必填 | IDP 的项目指定（§5.6） |

**设置的规则**（可以通过 §4.9 校验。不遵守规则的组不会被处理）

1. 请以 `INPUT` 或 `INPUT_OUTPUT` 放入 1 个以上的主输入（`inputRole=PRIMARY` 的列）。
2. 有多个主输入时，请设为同一单据类型（表的列则为同一个表）的项目。
3. 与主输入相同单据类型的表的列（`TABLE_COLUMN`），请设为与主输入相同的表的列（为了对齐行）。
4. 同一个列或提示信息，在一个组中请只放入 1 次。
5. 提示信息只能为 `INPUT`。`inputRole=NONE` 的列只能为 `OUTPUT`，`writable=false` 的列只能为 `INPUT`。
6. 同一个主数据表的组，可以创建任意多个。同一个项目，也可以作为多个组的输入。但是，请不要将同一个项目设为多个组的回写目标（`OUTPUT`、`INPUT_OUTPUT`）（后面的组的结果会变为需确认〔`WRITE_CONFLICT`〕）。

组的 `OUTPUT`、`INPUT_OUTPUT` 的项目，就是**写入值的设置**（将哪一列的值写入哪个项目）。不用于匹配的列（`inputRole=NONE`。编码、分类等），只要设为 `OUTPUT`，也可以作为写入目标（§5.7）。

### 5.2 组的解析（标准化对象的生成方式）

标准化 API 将请求中的组应用到案件的单据上，生成标准化对象。组的项目指定中没有出现的单据类型的单据，不应用组（`options.fallback=true` 时成为回退的对象。§4.1）。

1. **主单据**：主输入所在单据类型的单据。按主单据生成标准化对象（同一单据类型的单据有 2 件，则生成 2 件）。主输入为表的列时，按该表的行生成。
2. 主输入的值全部为空的标准化对象，不会生成（不包含在结果中）。
3. 与主单据相同单据类型的项目，从同一单据中获取（同一个表的列取同一行）。单据中有多个同名项目时，如果是主输入，则分别作为不同的标准化对象，否则使用第一个项目。
4. 其他单据类型的项目，从案件中该单据类型的单据中获取。
   - 只有 1 件时，从该单据中获取（表的列，仅限于表只有 1 行时）。
   - 没有时，作为空值处理（也不会成为回写目标）。
   - 有 2 件以上时，如果值全部相同，则将该值用于匹配，但不作为回写目标。值不同时，不用于匹配，并将标准化对象设为需确认（`AMBIGUOUS_SOURCE`）。
5. 案件的标准项目（`CASE_FIELD`），从 `caseResult` 中获取（没有 `caseResult` 时为空。`warnings` 中为 `CASE_RESULT_MISSING`）。
6. 回写目标（`OUTPUT`、`INPUT_OUTPUT`），即使项目的值为空，也会将位置放入 `targets`（以便将所采用行的值写入空的项目）。
7. 无法将回写目标的位置确定为 1 个时（4 中的 2 件以上），将该标准化对象设为需确认（§2.8 的事项 6）。

### 5.3 标准化对象的结果

| 字段 | 类型 | 说明 |
|---|---|---|
| `itemId` | String | 在任务内唯一的标识。相同的输入得到相同的值。请不要假定其格式 |
| `groupId` | String | 生成该标准化对象的组（请求中的 `groupId`。回退时为 `FALLBACK`，§4.6 中没有 `ref` 的标准化时为 `ADHOC`） |
| `masterTable` | String | 主数据表（§6.1，会增加） |
| `source` | Object | 主输入的位置（§5.6） |
| `inputs` | Object[] | 用于匹配的输入（有值的输入）：`column` 或 `hint`、`value`、`source`（§5.6）、`ocrConfidence`（IDP 的 `confidence`。没有时为 `null`）、`idpNeedReview`（将 IDP 的 `needReview` 转换为 0 或 1 的值。没有时为 `null`） |
| `targets` | Object | 回写的位置（键为列，值为 §5.6 的位置）。没有回写目标的组时为空对象 |
| `status` | String | 标准化的状态（§6.2，会增加。各状态的格式见 §5.9） |
| `needsReview` | Boolean | **是否需要人工确认（用于处理的分支）**。一定为 `true` 或 `false` |
| `master` | Object | 标准化得到的主数据的行（§5.4）。`SPLIT` 时为主要素。**`needsReview=true` 时为推定值**，可以作为确认界面的初始值。无法确定时为 `null` |
| `proposedName` | String | 未确定为 `master` 时，推定或提议的名称（新登记候选的正式名称等）。没有时为 `null` |
| `confidence` | Number | 0.0～1.0（用于显示和排序） |
| `reviewReasons` | Object[] | 需确认的原因（按重要程度排序）：`code`（§6.14，会增加）、`message`（日语） |
| `notices` | Object[] | 已确定但需要告知的事项：`code`（§6.15，会增加）、`message` |
| `decidedBy` | String | 判断的方式（§6.5，会增加） |
| `reason` | String | 判断的依据（日语，3 句以内） |
| `notesForAssessor` | String | 给确认人员的备注（没有时为空字符串） |
| `alternatives` | Object[] | 未采用的主要候选：§5.4 的行 ＋ `whyNot`（未采用的原因） |
| `splitItems` | Object[] | `SPLIT` 时的各要素（第一个为主要素）：`text`（拆分后的值）、`primary`（是否为主要素）、`master`（§5.4 或 `null`） |
| `webEvidence` | Object[] | 判断所使用的 Web 出处：`url`、`title`、`publisher`、`trust`（§6.23） |
| `candidates` | Object[] | 匹配的候选（§5.5，按分数从高到低）。**包括所采用的行（`master`）在内**，从高到低最多 `maxCandidates` 件（默认 5）。`includeCandidates=true`（默认）时，**与 `needsReview` 无关**（可以自动采用的结果也返回）。有 `master` 时，一定包含与 `master` 相同的行（`masterId` 和 `selection` 都相同的行），并设为 `isMaster=true`（即使其分数不在前列也包含，其余按分数从高到低放入）。同一主数据的其他别名，可能作为其他候选包含在内。符合的行较少时，件数也会变少。未进行匹配的对象（原因为 `NOT_PROCESSED` 的对象等）中为空 |

### 5.4 主数据的行

| 字段 | 类型 | 说明 |
|---|---|---|
| `masterTable` | String | 主数据表 |
| `object` | String | `masterId` 的记录的 SFDC 对象（例：`CLM_ICD10Mst__c`）。不是 SFDC 记录的行（`DRUG` 的行等）中为 `null` |
| `masterId` | String | 主数据的记录 ID |
| `displayName` | String | 显示名称（主数据表的 `displayColumn` 的值等） |
| `values` | Object | **行的值**（键为列〔§4.7〕，值为字符串。没有值的列不包含在内）。包含主数据表一览（§4.7）中列出的、**该行所有列**的值（包括组中未使用的列、不用于匹配的列）。写入值（回写）时使用此值（§5.7） |
| `active` | Boolean | 是否为有效的记录 |
| `selection` | Object | **用于在确认界面中选择，以及向后续系统登记的记录**：`object`（SFDC 的对象。例：`CWF_ICD10MstAlias__c`）、`recordType`（§6.6，会增加）、`recordId`、`name`。根据主数据表的不同，可能是别名的记录（`ALIAS`），也可能是主数据的记录（`MASTER`）。没有用于登记的记录的主数据表（`selectionRecordTypes` 为空。例：`DRUG`）中为 `null`。**登记时请将 `object`、`recordType`、`recordId` 成对使用** |

### 5.5 候选

在 §5.4 的行中，追加以下字段。

| 字段 | 类型 | 说明 |
|---|---|---|
| `matchedName` | String | 匹配中一致的名称（包括别名） |
| `score` | Number | 匹配的分数（0～100）。仅用于候选之间的排序 |
| `selectable` | Boolean | 是否为可以在确认界面中选择的记录 |
| `isMaster` | Boolean | 是否与标准化对象的 `master` 为同一行（`masterId` 和 `selection` 都相同）。`master` 为 `null` 的标准化对象，以及主数据检索（§4.13）的结果中，一律为 `false` |

### 5.6 项目指定与位置

**项目指定（`members[].field`。用于设置）**：通过单据类型和项目名指定（适用于所有案件的指定）。

| `type`（§6.8） | 字段 | 含义 |
|---|---|---|
| `FIELD` | `documentTypeId`、`fieldName` | 单据的项目（`fields[].name`） |
| `TABLE_COLUMN` | `documentTypeId`、`tableName`、`columnName` | 单据中表的列（`table_list[].tableName` 中单元格的 `name`）。以所有行为对象 |
| `CASE_FIELD` | `fieldName` | 案件的标准项目（`caseResult` 的项目） |

**位置（`source`、`inputs[].source`、`targets` 的值。用于结果）**：该案件中实际的位置。编号全部从 0 开始。

| `type`（§6.7） | 字段 | 含义 |
|---|---|---|
| `FIELD` | `documentId`、`fieldName`、`fieldIndex` | 单据的项目（`fieldIndex` 为在 `fields[]` 中的位置。`format=FIELDS` 的请求中为 `null`） |
| `TABLE_CELL` | `documentId`、`tableName`、`tableIndex`、`rowIndex`、`columnName`、`columnIndex` | 单据中表的单元格（`tableIndex` 为在 `table_list[]` 中的位置，`rowIndex` 为在 `table_fields[]` 中的位置，`columnIndex` 为在行中的位置） |
| `CASE_FIELD` | `fieldName` | 案件的标准项目 |

- 存在多个同名的项目或表时，请通过位置（`…Index`）区分。
- **位置的 `type` 为未知的值时，请不要自动采用该标准化对象**（§2.8）。

### 5.7 回写（写入值）规则

采用标准化对象的结果时（`needsReview=false` 自动采用时、在确认界面中选择了候选时、重新标准化时），从**所采用的行（`master`、候选、`alternatives`、`splitItems` 的 `master`、检索的结果均可）的 `values`** 中，将标准化对象的 `targets` 中各列的值，写入该位置的项目。与主数据表无关，规则相同。**请在 IDP 侧开发这一写入值的功能**（§1.4 的 A-09）。

| `targets` 的键（列） | 写入的值 |
|---|---|
| 各列 | 所采用行的 `values` 中同一列的值 |

- `targets` 根据组的 `OUTPUT`、`INPUT_OUTPUT` 的项目生成。不用于匹配的列（编码、分类等），只要设为组的 `OUTPUT`，也会包含在 `targets` 中，可以写入其值（例：将根据药品名标准化得到的行的 ATC 分类、药效分类，写入表中同一行的列）。
- 没有值（`values` 中没有该键）的列，不写入。
- `values` 中也包含 `targets` 中没有的列的值。可以用于确认界面中的显示，以及数据映射（输出）。
- 登记时，使用所采用行的 `selection`（`recordType`、`recordId`）（为 `null` 时不登记）。
- 是否回写（用规范值替换识别值，还是另外保存规范值），请根据 IDP 的界面设计决定（§9）。

### 5.8 案件整体的判断（`caseReview`）

确认案件中各标准化对象之间的一致性（伤病与手术的部位、诊疗科、性别等）的结果。

| 字段 | 类型 | 说明 |
|---|---|---|
| `executed` | Boolean | 是否执行了。只有 1 个标准化对象的案件、全部按规则确定的案件等，不执行 |
| `consistent` | Boolean | 是否没有明显的矛盾。未执行时为 `null` |
| `summary` | String | 摘要（日语） |
| `findings` | Object[] | 指出的事项：`severity`（§6.24）、`message`、`itemIds`（相关的标准化对象） |

被指出存在明显矛盾（`severity=ERROR`）的标准化对象，变为 `needsReview=true`、原因 `CASE_CONTRADICTION`。其他的指出事项，放入该对象的 `notices`（`CASE_REVIEW_NOTE`）中。

### 5.9 各状态的结果格式

| `status` | `needsReview` | `master` | 回写、登记 | 补充 |
|---|---|---|---|---|
| `MATCHED`（已确定） | `false` 或 `true` | 有（`true` 时为推定值） | `false` 时可以回写和登记 | |
| `SPLIT`（拆分） | `false` 或 `true` | 主要素 | `false` 时，只回写和登记主要素即为完整的反映（其他要素为参考信息，不自动登记） | 其他要素也需要登记时为 `needsReview=true`。`splitItems` 中包含全部要素（第一个为主要素，`primary=true`） |
| `NEW_CANDIDATE`（新登记候选） | 始终为 `true` | `null` | 不进行 | `proposedName` 中为正式名称，`webEvidence` 中为出处 |
| `NOT_APPLICABLE`（非标准化对象） | `false` 或 `true` | `null` | 不进行（保持识别值） | `false`：判断为不属于标准化对象的记载（受伤的情况等）。`true`：检查、处置等，在 `proposedName` 中附上了推定值 |
| `UNRESOLVED`（无法判断） | 始终为 `true` | `null` | 不进行 | 在确认界面中显示 `candidates`、`alternatives` |

---

## 6. 枚举值一览

“固定”在 v1 期间不会增加值。“会增加”可能会增加值（§2.8）。显示名称请从目录（§4.10）的 `enums` 中获取（“目录的键”即为 `enums` 的键）。

| # | 对象 | 目录的键 | 值 | 区分 |
|---|---|---|---|---|
| 6.1 | 主数据表（`masterTable`） | `masterTable` | `DISEASE`（伤病名主数据）、`OPERATION`（手术主数据）、`FACILITY`（医疗机构主数据）、`DRUG`（药品主数据） | 会增加 |
| 6.2 | 标准化对象的 `status` | `itemStatus` | `MATCHED`、`NEW_CANDIDATE`、`SPLIT`、`NOT_APPLICABLE`、`UNRESOLVED`（§5.9） | 会增加 |
| 6.3 | 任务的 `status` | `taskStatus` | `PENDING`（等待中）、`PROCESSING`（处理中）、`SUCCEEDED`（完成）、`FAILED`（失败）、`CANCELLED`（取消） | 固定 |
| 6.4 | 单据的 `status` | `documentStatus` | `SUCCEEDED`、`FAILED` | 固定 |
| 6.5 | `decidedBy` | `decidedBy` | `RULE`（按规则确定）、`AI`（AI 判断）、`ERROR`（无法处理） | 会增加 |
| 6.6 | `selection.recordType` | `recordType` | `ALIAS`（别名的记录）、`MASTER`（主数据的记录） | 会增加 |
| 6.7 | 位置的 `type` | `locationType` | `FIELD`（项目）、`TABLE_CELL`（表的单元格）、`CASE_FIELD`（案件的标准项目） | 会增加 |
| 6.8 | 项目指定的 `type` | `fieldRefType` | `FIELD`（项目）、`TABLE_COLUMN`（表的列）、`CASE_FIELD`（案件的标准项目） | 会增加 |
| 6.9 | 组项目的 `mode` | `memberMode` | `INPUT`、`OUTPUT`、`INPUT_OUTPUT`（§5.1） | 固定 |
| 6.10 | 列的 `inputRole` | `inputRole` | `PRIMARY`、`SUPPORTING`、`NONE`（§4.7） | 固定 |
| 6.11 | 列的 `dataType` | `dataType` | `TEXT`（文字）、`CODE`（编码）、`DATE`（日期） | 会增加 |
| 6.12 | 列的 `codeSystem` | `codeSystem` | `ICD10`、`KCODE`、`ATC`（ATC 分类）、`EFFICACY_CLASS`（药效分类）、`YJ`（药价基准编码） | 会增加 |
| 6.13 | 请求的 `priority` | `priority` | `NORMAL`（普通）、`LOW`（低。批量的重新处理等） | 会增加 |
| 6.14 | `reviewReasons[].code` | `reviewReason` | 见下表 | 会增加 |
| 6.15 | `notices[].code` | `notice` | `ICD10_MISMATCH_NOTED`（因名称与主数据完全一致而确定，但与单据上的 ICD10 不一致）、`CASE_REVIEW_NOTE`（案件整体的判断中指出的事项） | 会增加 |
| 6.16 | `warnings[].code` | `warning` | `UNKNOWN_FIELD`（请求中有未知的字段）、`INVALID_GROUP`（设置有错误的组。不处理）、`MASTER_TABLE_NOT_ENABLED`（使用该 API Key 不可用的主数据表的组。不处理）、`NO_ITEMS`（没有标准化对象）、`TOO_MANY_ITEMS`（标准化对象超出了上限）、`FALLBACK_USED`（通过回退对 IDP 中没有设置的单据类型的单据进行了标准化）、`CASE_RESULT_MISSING`（有使用 `CASE_FIELD` 的组，但没有 `caseResult`） | 会增加 |
| 6.17 | 组的错误（§4.9 的 `errors[].code`） | `groupError` | `UNKNOWN_MASTER_TABLE`、`UNKNOWN_COLUMN`、`UNKNOWN_HINT`、`NO_PRIMARY_INPUT`（没有主输入）、`PRIMARY_NOT_ALIGNED`（主输入在不同的单据类型或表中）、`TABLE_NOT_ALIGNED`（表的列与主输入在不同的表中）、`DUPLICATE_MEMBER`（同一个列或提示信息出现了 2 次）、`INVALID_MODE`（使用方式与列或提示信息不符）、`DUPLICATE_GROUP_ID`、`UNKNOWN_FIELD_TYPE`（未知的项目指定 `type`） | 会增加 |
| 6.18 | 单据的 `failure.code` | `documentFailure` | `INVALID_RESULT_JSON`（RESULT JSON 的格式不正确）、`PROCESSING_ERROR`（处理中的错误）、`CANCELLED`（已取消） | 会增加 |
| 6.19 | 任务的 `failure.code` | `taskFailure` | `INTERNAL_ERROR`（标准化 API 的故障）、`EXPIRED`（自受理起 24 小时内未能开始处理） | 会增加 |
| 6.20 | 单据的 `format` | `format` | `IDP_RESULT_JSON`、`FIELDS` | 会增加 |
| 6.21 | `decision`（§4.12） | `decision` | `ACCEPTED`、`CORRECTED`、`NOT_APPLICABLE`、`NEW_MASTER`、`UNKNOWN` | 会增加 |
| 6.22 | `decidedRole`（§4.12） | `decidedRole` | `IDP_OPERATOR`、`ASSESSOR` | 会增加 |
| 6.23 | `webEvidence[].trust` | `trust` | `HIGH`（政府机关、公共机构等）、`MEDIUM`、`LOW` | 固定 |
| 6.24 | `findings[].severity` | `severity` | `ERROR`（明显的矛盾）、`WARNING`、`INFO` | 固定 |
| 6.25 | `details[].reason`（错误） | `detailReason` | `REQUIRED`（缺少必填项）、`INVALID_TYPE`（类型错误）、`UNSUPPORTED_VALUE`（不可用的值）、`OUT_OF_RANGE`（超出范围）、`TOO_LONG`（过长）、`DUPLICATE`（重复） | 会增加 |
| 6.26 | 通知的 `event`（§4.15） | `callbackEvent` | `TASK_FINISHED`（任务进入了终止状态） | 会增加 |
| 6.27 | `health.status` | `healthStatus` | `UP`、`DEGRADED`、`DOWN` | 固定 |
| 6.28 | `errorCode`（§7） | `errorCode` | 见 §7 的表 | 会增加 |
| 6.29 | 主数据表的 `sources[].role` | `sourceRole` | `MASTER`（主数据的对象）、`ALIAS`（别名的对象） | 会增加 |

#### 需确认的原因（`reviewReasons[].code`）

| 代码 | 含义 |
|---|---|
| `BUSINESS_POLICY` | 按业务方针需要由人决定的记载（伤病名栏中只有手术名、检查或处置的记载等）。附上推定的名称 |
| `NEW_CANDIDATE` | 主数据中没有对应项，作为新登记候选（`proposedName` 中为正式名称，`webEvidence` 中为出处） |
| `MULTIPLE_CANDIDATES` | 无法将候选确定为 1 个 |
| `UNRESOLVED` | 无法判断 |
| `AMBIGUOUS_CORRECTION` | 根据错字、漏字的修正方式不同，可能成为不同的伤病或手术 |
| `MASTER_NOT_FOUND` | 判断得到的主数据记录不存在 |
| `MASTER_INACTIVE` | 判断得到的记录无效（停止使用） |
| `KCODE_CONFLICT` | 单据上的手术编码，与主数据的区分编号不一致 |
| `SEX_CONFLICT` | 性别特有的分类，与单据上的性别不一致 |
| `ICD10_CONFLICT` | 与单据上的 ICD10 不一致，且名称也与主数据不完全一致 |
| `LOW_CONFIDENCE` | 置信度低 |
| `SPLIT_NOT_CONFIRMED` | 已拆分，但不满足自动确定的条件（全部要素都能标准化到主数据等） |
| `CASE_CONTRADICTION` | 在案件整体的判断中，被指出与其他标准化对象存在明显的矛盾 |
| `AMBIGUOUS_SOURCE` | 组的项目存在于案件的多张单据中，且值不同（或无法将回写目标确定为 1 个） |
| `WRITE_CONFLICT` | 同一个位置上，有其他组的自动回写 |
| `FALLBACK_MAPPING` | 对于 IDP 中没有设置的单据的项目，标准化 API 根据项目名推测并进行了标准化（不自动确定） |
| `NOT_PROCESSED` | 未进行标准化（超出单个任务的上限等） |
| `TIMEOUT` | 未能在时间内判断 |
| `LLM_UNAVAILABLE` | AI 不可用（未能按规则确定的对象） |
| `PROCESSING_ERROR` | 处理中的错误 |

---

## 7. 错误

| HTTP / `code` | `errorCode` | 发生的条件 | 重试 |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | 输入不完整（缺少必填项、类型或值错误、单据或组超出上限）。`details` 中包含错误的位置和类型 | 不重试（修正输入） |
| 400 | `MASTER_TABLE_NOT_ENABLED` | 在 §4.6 中，指定了对该 API Key 不可用的主数据表 | 不重试 |
| 401 | `UNAUTHORIZED` | 缺少 API Key、API Key 不正确或已失效 | 不重试 |
| 403 | `FORBIDDEN` | 不在有效期内、不能使用的 API | 不重试 |
| 404 | `TASK_NOT_FOUND` | 任务不存在，或已超过可查询的期间（返回确定的结果时，为可受理的期间） | 不重试 |
| 404 | `ITEM_NOT_FOUND` | §4.6 的 `ref` 的标准化对象不存在 | 不重试 |
| 409 | `IDEMPOTENCY_CONFLICT` | 相同的 `clientRequestId` 但内容不同 | 不重试 |
| 409 | `TASK_NOT_CANCELLABLE` | 取消已结束的任务 | 不重试 |
| 409 | `TASK_NOT_FINISHED` | 在 §4.3 中，任务尚未结束 | 重试（结束之后） |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 10 MB | 不重试（拆分发送） |
| 429 | `TOO_MANY_REQUESTS` | 超出了流量上限（受理数、同时连接数、单个值的标准化的同时数）。`Retry-After` 中为需要等待的秒数 | 重试（`Retry-After` 之后） |
| 429 | `QUEUE_FULL` | 队列中的标准化对象数超出了上限。`Retry-After` 中为需要等待的秒数 | 重试（`Retry-After` 之后） |
| 500 | `INTERNAL_ERROR` | 意外的错误 | 重试（间隔一段时间，使用相同的 `clientRequestId`） |
| 503 | `NOT_READY` / `MAINTENANCE` | 启动中、维护中。`Retry-After` 中为需要等待的秒数 | 重试（`Retry-After` 之后） |

- `errorCode` 的值可能会增加。未知的值，请按 HTTP 状态码（`code`）处理。响应不是 JSON 时，也请按 HTTP 状态码处理。
- 即使部分单据无法处理，任务也为 `SUCCEEDED`，该单据以 `documents[].status=FAILED` 返回。即使部分标准化对象无法处理，该对象也以 `UNRESOLVED`、需确认（`PROCESSING_ERROR` 等）返回。**无法处理的对象，不会成为非需确认的结果。**

---

## 8. 实现指南（IDP 侧）

### 8.1 IDP 侧需要开发的内容（仅首次开发）

需要满足的要求汇总在 §1.4 中。需要开发的内容整体如下。

| 功能 | 内容 | 使用的 API |
|---|---|---|
| 组的设置界面 | 选择主数据表，并按列和提示信息，选择 IDP 的项目（单据类型和项目名、表和列名、案件的标准项目）和使用方式（`INPUT`、`OUTPUT`、`INPUT_OUTPUT`）。可以创建同一个主数据表的多个组。可以导入默认组。保存之前进行校验 | §4.7、§4.8、§4.9（第 2 期为 §4.14 的建议） |
| 请求 | 案件的 OCR 抽取之后，发送所有单据和有效的组的设置 | §4.1 |
| 完成的确认 | 定期查询已完成任务列表，获取已结束任务的结果 | §4.4、§4.2、§4.3 |
| 结果的反映（写入值） | 从所采用的行的 `values` 中，将 `targets` 中各列的值写入该位置的项目（不用于匹配的列〔编码、分类等〕，只要设为组的 `OUTPUT` 也可以写入）。通过 `needsReview` 转为确认 | §5.7 |
| 确认界面 | 显示所采用的行、候选（最多前 5 个）、原因和依据，用所选候选的值重新写入。自动采用的结果也可以改为候选。修改识别值后重新标准化 | §4.6、§5.3 |

**所有功能，请都作为与主数据表或列无关的通用处理来开发。** 这样，即使主数据表、列、组增加，也只需追加设置即可（§2.8）。

### 8.2 推荐的集成位置

推荐在与 IDP 的“主数据匹配”相同的阶段（OCR 抽取之后、OCR 抽取确认之前），以案件为单位调用。

```
开始 → 预处理 → OCR 抽取 →【标准化 API】→ OCR 抽取确认（需确认的项目）→ 数据映射 → AI 校验 → … → 输出
```

（日文正本中的 IDP 工作流节点名：開始 → 前処理 → OCR抽出 →【名寄せ API】→ OCR抽出確認 → データマッピング → AI検証 → … → 出力）

对于设为组的回写目标的项目，请不要重复设置 IDP 的“主数据匹配”（因为同一个项目会产生两个结果）。

### 8.3 推荐的步骤

```
【设置时】
1. 通过 GET /v1/masters 获取主数据表、列、提示信息的一览，显示在设置界面中
2. （首次）通过 GET /v1/groups/defaults 导入默认组
3. 负责人创建或修改组 → 通过 POST /v1/groups/validate 校验后再保存

【每个案件】
1. 案件的 OCR 抽取完成
2. POST /v1/standardizations
     caseNo、案件的所有单据（RESULT JSON 和单据类型 ID）、有效的组的设置、
     waitSeconds=10、clientRequestId={caseNo}-{版本}-{请求序号}
     | status=SUCCEEDED / FAILED / CANCELLED → 转到 4
     | status=PENDING / PROCESSING         → 保存 taskId，转到 3
3. GET /v1/standardizations?cursor={上次的 nextCursor}   [每隔 5〜10 秒。汇总所有案件]
     | 列表中出现的任务 → GET /v1/standardizations/{taskId}（后续通过 …/items?cursor=…）→ 转到 4
4. 反映结果（8.4）
     SUCCEEDED：按标准化对象反映
     FAILED   ：将组的项目全部转为人工确认
     CANCELLED：不反映
5. 在确认界面中修改了识别值时，通过 POST /v1/items/standardize 重新标准化（ref 中为原结果）
6. 确定后，向后续系统登记时，使用所采用记录的 selection（recordType、recordId）
7. （第 2 期）通过 POST /v1/standardizations/{taskId}/feedback 返回确定的结果
```

### 8.4 结果的反映

可以与 IDP 的“主数据匹配”的结果同样处理。

| 标准化 API 的结果 | IDP 中的处理（推荐） |
|---|---|
| `needsReview=false`、有 `master` | 按 §5.7 的规则，将 `master.values` 的值写入 `targets` 的项目（自动采用），并保存 `master.selection` 用于登记（为 `null` 时不登记）。`candidates` 用于在确认界面中改为其他候选 |
| `needsReview=false`、无 `master`（`NOT_APPLICABLE`） | 不回写也不登记（保持识别值） |
| `needsReview=true`、有 `master` | 不回写，作为 OCR 抽取确认的对象。将 `master` 作为初始值，将 `candidates`（与 `master` 相同的行为 `isMaster=true`）作为候选显示，并显示 `reviewReasons[].message`、`reason`、`notesForAssessor` |
| `needsReview=true`、无 `master` | 不回写，作为 OCR 抽取确认的对象。显示 `candidates`、`alternatives`、`proposedName`、`reviewReasons[].message` |
| 在确认界面中操作人员选择了候选 | 将所选候选的 `values` 的值，重新写入该标准化对象的 `targets` 中（§5.7），并保存该候选的 `selection`（第 2 期通过 §4.12 返回） |
| 用于匹配的输入（`inputs`）中，有 IDP 的 `needReview=1`（需要确认识别结果） | 即使标准化为 `needsReview=false`，也不自动采用，在识别确认之后采用。识别值被修改时，通过 §4.6 重新标准化 |
| 位置的 `type` 为未知的值 | 不自动采用，转为人工确认 |
| 单据为 `FAILED` | 将使用该单据类型项目的组的项目，转为人工确认 |
| `warnings` 中有 `INVALID_GROUP`、`MASTER_TABLE_NOT_ENABLED` | 该组未进行标准化。将组的项目转为人工确认，并修正设置 |
| `groupId` 为 `FALLBACK`（回退） | 一定以需确认返回。转为人工确认。通过单据 `warnings` 中的 `FALLBACK_USED` 发现没有设置的单据类型，并添加到 IDP 的设置中 |

- `SPLIT`（一个项目中写有多个伤病等）时，主要素为 `master`，全部要素为 `splitItems`（§5.9）。关于在确认界面中的显示，希望通过 §9 进行商讨。

### 8.5 超时、重试与发送的并行数

| API | 连接 | 等待响应（读取） | 重试 |
|---|---|---|---|
| `POST /v1/standardizations` | 5 秒 | `waitSeconds` ＋ 15 秒 | 可以使用相同的 `clientRequestId` 重发 |
| `GET /v1/standardizations`、`…/{taskId}`、`…/items` | 5 秒 | 30 秒 | 可以 |
| `POST …/cancel` | 5 秒 | 15 秒 | 可以 |
| `POST /v1/items/standardize` | 5 秒 | `timeoutSeconds` ＋ 15 秒 | 附带 `clientRequestId` 时可以 |
| `GET /v1/masters`、`/v1/groups/defaults`、`/v1/catalog`、`/v1/health`、`POST /v1/groups/validate` | 5 秒 | 15 秒 | 可以 |

- **请限制请求的发送并行数**（例：同时最多 10 件。具体值希望通过 §9 商讨）。即使积压了大量案件，只要以限制后的并行数依次发送，就会在标准化 API 的队列中依次处理。
- 429、503 请在 `Retry-After` 的秒数之后重试。500 请一边延长间隔（例：10 秒、30 秒、60 秒），一边在间隔中加入随机波动后重试（避免大量请求同时重试）。
- 任务自开始处理起 15 分钟内一定会结束。等待（`PENDING`）的时间会因繁忙而延长（参考值见 `queue`）。不存在自受理起超过 24 小时仍未结束的任务（`EXPIRED`）。

### 8.6 验收确认

验收确认时，请使用 §1.4 的要求（带编号）。请按要求逐一确认满足后，再进入联合测试。

---

## 9. 希望商讨的事项（致 NeosAI 公司）

| # | 希望商讨的事项 | Zurich 的方案 |
|---|---|---|
| 1 | 集成的位置，以及包含等待在内的处理的等待方式 | 作为 OCR 抽取的后处理，以案件为单位调用（§8.2）。通过已完成任务列表得知结束 |
| 2 | 能否开发组的设置界面（§8.1）。设置保存在哪里（业务场景的设置中，还是单据类型的设置中） | 保存在业务场景的设置中（以便创建跨越案件中多个单据类型的组） |
| 3 | 结果的保存方式：能否放入与 IDP 的主数据匹配相同的结构（规范值、候选、`dictMatchInfo`）。是通过写入值替换识别值，还是另外保存。能否在数据映射中将 `selection`（`recordType`、`recordId`）和行的值（`values`）传递到输出 | 按附录 A 的对应关系放入 |
| 4 | 需确认的条件：如何将 `needsReview=true` 应用到 OCR 抽取确认的条件中 | 新增条件“标准化需确认”，并显示原因（`reviewReasons[].message`）。不使用 IDP 的“置信度”条件 |
| 5 | 能否发送案件的标准项目（`caseResult`）。其格式（如何读取 `CASE_FIELD` 的项目名） | 按 IDP 输出的格式原样发送。项目通过 `fields[]` 的 `name`、`value` 读取 |
| 6 | 件数的预估（高峰时的案件数、单据数），以及请求的发送并行数 | 用于决定流量上限（§2.7）和标准化 API 的处理量 |
| 7 | 结果的接收方式 | 查询已完成任务列表（IDP 侧不需要接收端）。如果能建立接收端，也可以使用完成通知（§4.15） |
| 8 | `SPLIT`（拆分）、`NEW_CANDIDATE`（新登记候选）在确认界面中的显示，以及在输出中的保存方式 | 将主要素作为项目的值，在确认界面中显示全部要素 |
| 9 | IDP 侧能否加入去除个人信息项目后再发送的处理（是否发送由 Zurich 通知） | 通过项目名的列表去除 |
| 10 | 更改 RESULT JSON 的格式时的事先通知 | 希望在升级版本之前通知（标准化 API 侧会调整读取方式） |

---

## 附录 A. 放入 IDP 的 `dictMatchInfo` 时的对应关系（方案）

| IDP（`dictMatchInfo`） | 标准化 API | 备注 |
|---|---|---|
| `dictGroup` | `masterTable`（以及 `groupId`） | |
| `rows[0].row` | `master`（`object`、`masterId`、`selection`〔`object`、`recordType`、`recordId`〕、`values`） | 第 1 候选 |
| `rows[1…].row` | `candidates` 中 `isMaster=false` 的要素（与 `master` 相同的行为 `rows[0]`） | 后续的候选（自动采用的结果也附带。`candidates` 包括所采用的行，默认为前 5 个） |
| `rows[].autoAdopted` | 第 1 候选在 `needsReview=false` 时为 `true`。后续的候选为 `false` | 是否自动采用，只由 `needsReview` 决定 |
| `rows[].score` | 候选的 `score ÷ 100` | 用于排序。不作为阈值（不放入 `confidence`） |
| `rows[].matchType` | （没有对应的值） | 是否追加表示由标准化 API 判断的值，希望商讨 |
| `decisionReason` | `reviewReasons` 第一个的 `message` | 未自动采用的主要原因 |

## 附录 B. 修订履历

| 版本 | 日期 | 内容 |
|---|---|---|
| 1.0 | 2026-11-18 | 初版（开发启动用） |
| 1.1 | 2026-11-19 | 交给 NeosAI 公司之前的修订（作为 v1 的初版处理）。①在结果的行的值（`values`）中，放入行的所有列的值（§5.4）。将 IDP 侧开发的写入值的功能，明确记载于要求 S-10、A-09 以及 §5.7、§8.1。规定了多值列（`multiValued`）和日期的写法（§2.4、§4.7）②增加了药品主数据（`DRUG`。由 Zurich 维护、也加载于 IDP 主数据匹配中的药品主数据，8 列）（§4.7、§6.1、§6.12）。将金融机构（`BANK`、`BANK_BRANCH`）从对象中去除 ③包括所采用的行在内，最多返回前 5 个候选，可以自动采用的结果也返回（§5.3。为候选增加了 `isMaster`。§5.5）。增加了要求 C-05 ④认证仅使用 Bearer API Key（取消了基于来源 IP 地址的限制。§2.2、§7）⑤单个标准化对象的结果最大 100 KB，每页最多 100 件（§2.6） |

本译本依据日文版 1.1（2026-11-19）翻译。日文版修订时，本译本也会随之更新。
