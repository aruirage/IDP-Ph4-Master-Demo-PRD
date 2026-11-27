## 第 4 章｜本期接口与主要字段

本章只列 IDP 本期使用的接口及主要字段。必填条件、完整结构和错误码以客户 API v1.2 式样书为准，不在 PRD 重复维护字段字典。下列接口由 IDP 后端对接，前端调用 IDP 自身服务。

### 4.1 API 设定与组配置

| 接口或配置 | 使用时机 | 本期主要数据 |
| --- | --- | --- |
| API 连接设定 | 管理员设置并测试连接 | Base URL、API Key、连接状态；认证信息由后端安全保存，不明文回显 |
| GET /v1/masters | 获取主数据及可配置项目 | schemaVersion、masterTables 中的 masterTable、label、columns、hints；项目的 column 或 hint、label、configuration |
| GET /v1/catalog | 获取照合方式显示名 | `data.enums.memberMode[].value`、`data.enums.memberMode[].label` |
| GET /v1/groups/defaults | 导入默认组 | 默认组的 groupId、label、masterTable、members |
| POST /v1/groups/validate | 保存当前组前校验跨组重复 | 请求包含当前组和其他已保存的有效组；返回每组 valid、errors，以及错误的 memberIndex、relatedGroupId 和 message |

以下 configuration 字段来自 `GET /v1/masters` 响应的 `data.masterTables[].columns[]` 或 `data.masterTables[].hints[]`。

| 配置数据 | 本期用途 |
| --- | --- |
| groupId、label、masterTable、members | 标识组、显示组名、指定主数据表及字段映射 |
| 成员的 column 或 hint、mode、field | 指定主数据项目、读取／回写方式及 IDP 字段引用 |
| `configuration.roleLabel` | 前端直接显示角色 |
| `configuration.allowedModes` | 限定可选照合方式 |
| `configuration.canBePrimary` | 后端保存时判断是否存在有效主输入 |
| sceneIds | IDP 内部适用场景，发送客户 API 前移除 |
| groupsVersion | 后端生成并随整案请求发送，记录本次使用的配置版本 |

### 4.2 工作流整案照合

| 接口 | 调用顺序与用途 |
| --- | --- |
| POST /v1/standardizations | 工作流每次执行到节点，提交当时案件全部文件的结果、数据映射结果及有效组；取得 taskId 和状态 |
| GET /v1/standardizations | 查询已完成任务，按 cursor 继续获取 |
| GET /v1/standardizations/{taskId} | 获取任务状态和结果 |
| GET /v1/standardizations/{taskId}/items | 结果含 itemsNextCursor 时继续取齐照合对象 |
| POST /v1/standardizations/{taskId}/cancel | 需要中止旧任务时请求取消；以后端实际状态为准 |

| 主要字段 | IDP 如何使用 |
| --- | --- |
| sceneId、documents、groups、groupsVersion | 提交当前场景、全案单据结果及本次有效组配置 |
| caseResult、caseFieldConflicts | 使用标准字段时提交数据映射结果及其冲突信息 |
| taskId、status | 关联本次异步任务；完成后取得完整结果再衔接确认或后续流程 |
| cursor、itemsNextCursor | 处理任务列表和结果分页，避免遗漏 |
| items | 当前任务的照合对象结果，交给统一结果处理逻辑 |

请求按当前全案快照提交。Task 状态表示本次请求的处理结果，后续文件到达时由下一次工作流执行提交最新全案。

### 4.3 OCR 确认与重新照合

#### 接口与调用顺序

| 顺序 | 接口 | 调用时机 | 用途 |
| --- | --- | --- | --- |
| 1 | `GET /v1/standardizations/{taskId}` | 工作流完成整案请求后，进入确认页或恢复确认页 | 获取任务状态、主要照合结果及 `itemsNextCursor` |
| 2 | `GET /v1/standardizations/{taskId}/items?cursor=...` | `itemsNextCursor` 或上一页 `nextCursor` 存在时 | 分页取齐当前任务的全部照合对象 |
| 3 | `POST /v1/items/standardize` | 操作员修改照合输入并点击单项或一括「再照合」 | 使用页面缓存最新值重新照合被修改字段所属的 item，同步返回新结果 |
| 4 | `POST /v1/standardizations` | 修改案件标准字段，或单据追加、替换、重新处理导致整案输入变化 | 使用最新全案数据重新提交请求，不用于单据字段的局部重新照合 |

普通候选确认、保留 OCR 原值和选择已有候选不需要调用 Zurich 接口。确认结果由 IDP 保存到自身的确认记录中。

IDP 以 `groupId + source` 关联确认项目及结果。API 返回的 `fieldId` 仅作为兼容字段由后端接收和保存。

#### 重新照合调用规则

重新照合使用 `POST /v1/items/standardize`，主要提交 `ref`、`masterTable` 和修改后的 `inputs`。有原结果时，`ref` 引用原 `taskId` 和 `itemId`。原本为空、尚无照合对象时，按式样书使用 `groupId` 和 `source` 引用配置及位置。

修改值直接取页面缓存，无需先保存。同一 item 的多个修改合并为一次请求，其他输入从原结果继承。接口同步返回，不创建新的 Task。新结果更新当前 item 及关联回填结果，其他 item 保持原结果。文本字段和表格字段均适用。



#### 主要字段

| 结果字段 | 本期用途 |
| --- | --- |
| `status` | 用于识别任务和结果状态，不作为确认页按场景切换结构的依据 |
| itemId、groupId | 关联照合对象及其配置组 |
| inputs | 照合输入及原值；重新照合时继承未修改的输入 |
| needsReview | 决定是否人工确认；缺失或 null 按需确认处理 |
| shouldWriteBack | 决定是否回写；缺失或 null 不回写 |
| `master` | 自动采用或作为初始值的主数据行；使用 `master.values` 回写 |
| `targets` | 回写位置；按列将所采用行的值写入对应位置 |
| `masterDataMatches` | 统一候选列表；使用 label、type、confidence、primary 以及每项自己的 master、targets，不由前端按场景重新拼装 |
| reviewReason、remarks | 确认原因和其他信息，有内容则展示，无内容则隐藏 |

### 4.4 公共处理

- code、msg、requestId 用于判断接口成功与否、提示错误和后端排障；业务任务状态另看 status。
- 保存校验或运行接口失败时保留当前配置或字段值，提示错误并按对应流程重试，不把失败当作成功。
- API Key、请求快照、默认组来源及版本信息由后端维护。前端只展示业务需要的状态和内容。


### 4.5 分模块调用示例

以下示例统一使用展开缩进；每个例子只表达一个调用场景。客户接口均携带已配置的认证头，API Key 不在示例中展示。

#### API 设定｜连接测试

本期连接测试由 IDP 后端调用需要认证的主数据一览接口，验证地址和认证是否可用。请求及响应示例见下一节，认证按式样书通用认证规则携带。IDP 内部测试接口结构后续由开发定义。

```http
GET /v1/masters
```

成功取得合法响应时显示连接成功；认证失败、网络异常或响应错误时显示连接失败，不覆盖已保存配置。

#### 组配置｜获取可配置项目

展开主数据下拉，取得角色及可选方式。

式样书 §4.7 摘录。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/masters
```

无请求体。

**响应**

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "schemaVersion": "2026-11-25",
    "masterTables": [
      {
        "masterTable": "DISEASE",
        "label": "傷病名マスタ",
        "columns": [
          {
            "column": "CLM_ICD10Mst__c.NAME",
            "label": "傷病名",
            "configuration": {
              "roleLabel": "主入力・書き戻し可",
              "allowedModes": [
                "INPUT",
                "OUTPUT",
                "INPUT_OUTPUT"
              ],
              "canBePrimary": true
            }
          },
          {
            "column": "CLM_ICD10Mst__c.ICD10__C",
            "label": "ICD10 コード",
            "configuration": {
              "roleLabel": "補助入力・書き戻し可",
              "allowedModes": [
                "INPUT",
                "OUTPUT",
                "INPUT_OUTPUT"
              ],
              "canBePrimary": false
            }
          }
        ],
        "hints": [
          {
            "hint": "sex",
            "label": "性別",
            "deprecated": false,
            "configuration": {
              "roleLabel": "ヒント（照合に使うだけ）",
              "allowedModes": [
                "INPUT"
              ],
              "canBePrimary": false
            }
          }
        ]
      }
    ]
  }
}
```

</details>

**IDP 处理：** 显示 label 和 roleLabel，按 allowedModes 提供选项。

#### 组配置｜获取方式名称

取得照合方式的日文显示名。

式样书 §4.10 摘录。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/catalog
```

无请求体。

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "catalogVersion": "2026-11-25",
    "enums": {
      "memberMode": [
        {
          "value": "INPUT",
          "label": "読み取り（照合に使う）"
        },
        {
          "value": "OUTPUT",
          "label": "書き戻し"
        },
        {
          "value": "INPUT_OUTPUT",
          "label": "読み取り・書き戻し"
        }
      ]
    }
  }
}
```

**IDP 处理：** 按 value 关联选项，显示 label。

#### 组配置｜导入默认组

点击既定グループ，获取模板后载入草稿。

式样书 §4.8 摘录。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/groups/defaults
```

无请求体。

**响应**

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "version": "2026-11-19",
    "groups": [
      {
        "groupId": "DEFAULT:HG02-OPE",
        "label": "手術（診療明細書2）",
        "masterTable": "OPERATION",
        "members": [
          {
            "column": "CLM_OperationMst__c.NAME",
            "mode": "INPUT_OUTPUT",
            "field": {
              "type": "TABLE_COLUMN",
              "documentTypeId": "20001",
              "tableName": "手術情報",
              "columnName": "手術名"
            }
          },
          {
            "column": "CLM_OperationMst__c.KCODE__C",
            "mode": "INPUT",
            "field": {
              "type": "TABLE_COLUMN",
              "documentTypeId": "20001",
              "tableName": "手術情報",
              "columnName": "手術コード"
            }
          },
          {
            "hint": "operationDate",
            "mode": "INPUT",
            "field": {
              "type": "TABLE_COLUMN",
              "documentTypeId": "20001",
              "tableName": "手術情報",
              "columnName": "手術日"
            }
          }
        ]
      }
    ]
  }
}
```

</details>

**IDP 处理：** 默认组按已保存的来源组 ID 与本地组匹配，不使用组名匹配。来源 ID 已对应时在当前组内覆盖更新，未对应时追加新组。首次导入时，适用场景和 IDP 字段映射均置空。后续组内覆盖时，保留原适用场景。主数据项目和字段名称完全一致的成员保留原 IDP 字段映射，名称或字段类型变化时只清空该成员字段。保存前仍需完整校验。

#### 组配置｜保存校验

保存当前组时，请求包含当前组和其他已保存的有效组，用于检查跨组重复。以下展示当前组通过校验的结果；跨组重复时返回 FIELD_IN_OTHER_GROUP 并阻止当前组保存。

请求按 §4.9 规则 mock，响应为成功结构示意；实际 groupId 与提交组对应。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
POST /v1/groups/validate
```

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "groups": [
    {
      "groupId": "DEFAULT:HG02-OPE",
      "label": "手術（診療明細書2）",
      "masterTable": "OPERATION",
      "members": [
        {
          "column": "CLM_OperationMst__c.NAME",
          "mode": "INPUT_OUTPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術名"
          }
        },
        {
          "column": "CLM_OperationMst__c.KCODE__C",
          "mode": "INPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術コード"
          }
        },
        {
          "hint": "operationDate",
          "mode": "INPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術日"
          }
        }
      ]
    }
  ]
}
```

</details>

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "groups": [
      {
        "groupId": "HE03-DIS-1",
        "valid": true,
        "errors": []
      }
    ]
  }
}
```

**IDP 处理：** 存在错误则停止保存，Toast 提示占用组并保留草稿。

#### 工作流｜发起整案照合

工作流执行到节点，以当时全案数据提交；示例仅保留第一组和第一份单据。

式样书 §4.1 摘录。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
POST /v1/standardizations
```

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "clientRequestId": "CLAIM-20261118000123-v1-1",
  "caseNo": "CLAIM-20261118000123",
  "sceneId": "1001",
  "groupsVersion": "2026-11-19-01",
  "caseResult": {
    "fields": [
      {
        "name": "性別",
        "value": "女"
      }
    ]
  },
  "groups": [
    {
      "groupId": "HG02-OPE",
      "label": "手術",
      "masterTable": "OPERATION",
      "members": [
        {
          "column": "CLM_OperationMst__c.NAME",
          "mode": "INPUT_OUTPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術名"
          }
        },
        {
          "column": "CLM_OperationMst__c.KCODE__C",
          "mode": "INPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術コード"
          }
        },
        {
          "hint": "operationDate",
          "mode": "INPUT",
          "field": {
            "type": "TABLE_COLUMN",
            "documentTypeId": "20001",
            "tableName": "手術情報",
            "columnName": "手術日"
          }
        }
      ]
    }
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
          {
            "name": "帳票ID",
            "value": "HG02-001",
            "confidence": 1.0,
            "needReview": 0
          },
          {
            "name": "病院住所",
            "value": "東京都〇〇区〇〇町1-2-3",
            "confidence": 0.95,
            "needReview": 0
          },
          {
            "name": "診療科",
            "value": "循環器内科",
            "confidence": 0.98,
            "needReview": 0
          }
        ],
        "table_list": [
          {
            "tableName": "手術情報",
            "table_fields": [
              [
                {
                  "name": "手術名",
                  "value": "経皮的冠動脈形成術（その他のもの）",
                  "confidence": 0.93,
                  "needReview": 0
                },
                {
                  "name": "手術日",
                  "value": "2026-10-02",
                  "confidence": 0.99,
                  "needReview": 0
                },
                {
                  "name": "手術コード",
                  "value": "K5463",
                  "confidence": 0.96,
                  "needReview": 0
                }
              ]
            ]
          },
          {
            "tableName": "薬剤情報",
            "table_fields": [
              [
                {
                  "name": "商品名",
                  "value": "ティーエスワン配合カプセルT20 1C",
                  "confidence": 0.91,
                  "needReview": 0
                },
                {
                  "name": "回数",
                  "value": "28",
                  "confidence": 0.97,
                  "needReview": 0
                },
                {
                  "name": "ATC分類",
                  "value": "",
                  "confidence": null,
                  "needReview": 0
                },
                {
                  "name": "薬効分類",
                  "value": "",
                  "confidence": null,
                  "needReview": 0
                },
                {
                  "name": "薬価基準コード",
                  "value": "",
                  "confidence": null,
                  "needReview": 0
                }
              ]
            ]
          }
        ]
      }
    }
  ]
}
```

</details>

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "taskId": "MS-20261118-7Q3K9D",
    "status": "PENDING",
    "pollAfterMs": 5000
  }
}
```

**IDP 处理：** 保存 taskId；未完成时继续等待。后续工作流执行时重新提交最新全案数据。

#### 工作流｜获取已结束任务

后端定期获取结束任务，第二次起带上次返回的 nextCursor。

响应为式样书 §4.4 原例；请求游标为占位 mock。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/standardizations?cursor=c-previous&limit=100
```

无请求体。

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-20261118-000141",
  "warnings": [],
  "data": {
    "tasks": [
      {
        "taskId": "MS-20261118-7Q3K9D",
        "clientRequestId": "CLAIM-20261118000123-v1-1",
        "caseNo": "CLAIM-20261118000123",
        "status": "SUCCEEDED",
        "completedAt": 1794963681300
      }
    ],
    "nextCursor": "c-000000001794963681300-7Q3K9D"
  }
}
```

**IDP 处理：** 保存 nextCursor，再按 taskId 获取完整结果。

#### 工作流与 OCR 确认｜取得照合结果

任务完成后，取得供确认页使用的结果。

式样书 §4.2 摘录。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/standardizations/MS-20261118-7Q3K9D
```

无请求体。

**响应**

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "taskId": "MS-20261118-7Q3K9D",
    "status": "SUCCEEDED",
    "items": [
      {
        "itemId": "ope1",
        "fieldId": "fd-9c1e5a20",
        "groupId": "HG02-OPE",
        "needsReview": false,
        "shouldWriteBack": true,
        "masterDataMatches": [
          {
            "type": "recommended",
            "label": "マスタ推奨",
            "value": "経皮的冠動脈形成術（その他のもの）",
            "confidence": 100.0,
            "primary": true,
            "master": {
              "masterTable": "OPERATION",
              "object": "CLM_OperationMst__c",
              "masterId": "a0V000000000000301",
              "displayName": "経皮的冠動脈形成術",
              "values": {
                "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
                "CLM_OperationMst__c.KCODE__C": "K546-00",
                "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（その他のもの）"
              },
              "active": true,
              "selection": {
                "object": "CWF_OperationMstAlias__c",
                "recordType": "ALIAS",
                "recordId": "a0W000000000000301",
                "name": "経皮的冠動脈形成術（その他のもの）"
              }
            },
            "targets": {
              "CLM_OperationMst__c.NAME": {
                "type": "TABLE_CELL",
                "documentId": "991243705301",
                "tableName": "手術情報",
                "tableIndex": 0,
                "rowIndex": 0,
                "columnName": "手術名",
                "columnIndex": 0
              }
            }
          },
          {
            "type": "candidate",
            "label": "マスタ候補",
            "value": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）",
            "confidence": 88.4,
            "primary": true,
            "master": {
              "masterTable": "OPERATION",
              "object": "CLM_OperationMst__c",
              "masterId": "a0V000000000000301",
              "displayName": "経皮的冠動脈形成術",
              "values": {
                "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
                "CLM_OperationMst__c.KCODE__C": "K546-00",
                "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"
              },
              "active": true,
              "selection": {
                "object": "CWF_OperationMstAlias__c",
                "recordType": "ALIAS",
                "recordId": "a0W000000000000302",
                "name": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"
              }
            },
            "targets": {
              "CLM_OperationMst__c.NAME": {
                "type": "TABLE_CELL",
                "documentId": "991243705301",
                "tableName": "手術情報",
                "tableIndex": 0,
                "rowIndex": 0,
                "columnName": "手術名",
                "columnIndex": 0
              }
            }
          },
          {
            "type": "candidate",
            "label": "マスタ候補",
            "value": "経皮的冠動脈形成術（不安定狭心症に対するもの）",
            "confidence": 87.9,
            "primary": true,
            "master": {
              "masterTable": "OPERATION",
              "object": "CLM_OperationMst__c",
              "masterId": "a0V000000000000301",
              "displayName": "経皮的冠動脈形成術",
              "values": {
                "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
                "CLM_OperationMst__c.KCODE__C": "K546-00",
                "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（不安定狭心症に対するもの）"
              },
              "active": true,
              "selection": {
                "object": "CWF_OperationMstAlias__c",
                "recordType": "ALIAS",
                "recordId": "a0W000000000000303",
                "name": "経皮的冠動脈形成術（不安定狭心症に対するもの）"
              }
            },
            "targets": {
              "CLM_OperationMst__c.NAME": {
                "type": "TABLE_CELL",
                "documentId": "991243705301",
                "tableName": "手術情報",
                "tableIndex": 0,
                "rowIndex": 0,
                "columnName": "手術名",
                "columnIndex": 0
              }
            }
          },
          {
            "type": "candidate",
            "label": "マスタ候補",
            "value": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
            "confidence": 80.2,
            "primary": true,
            "master": {
              "masterTable": "OPERATION",
              "object": "CLM_OperationMst__c",
              "masterId": "a0V000000000000311",
              "displayName": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
              "values": {
                "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
                "CLM_OperationMst__c.KCODE__C": "K548-00",
                "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）"
              },
              "active": true,
              "selection": {
                "object": "CWF_OperationMstAlias__c",
                "recordType": "ALIAS",
                "recordId": "a0W000000000000311",
                "name": "経皮的冠動脈形成術（特殊カテーテルによるもの）"
              }
            },
            "targets": {
              "CLM_OperationMst__c.NAME": {
                "type": "TABLE_CELL",
                "documentId": "991243705301",
                "tableName": "手術情報",
                "tableIndex": 0,
                "rowIndex": 0,
                "columnName": "手術名",
                "columnIndex": 0
              }
            }
          },
          {
            "type": "candidate",
            "label": "マスタ候補",
            "value": "経皮的冠動脈ステント留置術（その他のもの）",
            "confidence": 76.5,
            "primary": true,
            "master": {
              "masterTable": "OPERATION",
              "object": "CLM_OperationMst__c",
              "masterId": "a0V000000000000312",
              "displayName": "経皮的冠動脈ステント留置術",
              "values": {
                "CLM_OperationMst__c.NAME": "経皮的冠動脈ステント留置術",
                "CLM_OperationMst__c.KCODE__C": "K549-00",
                "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈ステント留置術（その他のもの）"
              },
              "active": true,
              "selection": {
                "object": "CWF_OperationMstAlias__c",
                "recordType": "ALIAS",
                "recordId": "a0W000000000000312",
                "name": "経皮的冠動脈ステント留置術（その他のもの）"
              }
            },
            "targets": {
              "CLM_OperationMst__c.NAME": {
                "type": "TABLE_CELL",
                "documentId": "991243705301",
                "tableName": "手術情報",
                "tableIndex": 0,
                "rowIndex": 0,
                "columnName": "手術名",
                "columnIndex": 0
              }
            }
          }
        ],
        "reviewReason": null,
        "remarks": [
          {
            "label": "照合根拠",
            "value": "読取値が、画面で選べる別名「経皮的冠動脈形成術（その他のもの）」と完全に一致し、帳票の手術コードとも矛盾しないため確定した。"
          }
        ]
      }
    ],
    "itemsNextCursor": null
  }
}
```

</details>

**IDP 处理：** 按 needsReview 和 shouldWriteBack 分流，候选及原因直接交确认页显示。

#### 工作流｜取齐分页结果

itemsNextCursor 非空时继续获取；示例为空末页。

按式样书 §4.3 规则 mock。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
GET /v1/standardizations/MS-20261118-7Q3K9D/items?cursor=cursor-example&limit=100
```

无请求体。

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

**IDP 处理：** 汇总所有页，nextCursor 为 null 后结束取数。

#### 工作流｜取消旧任务

案件中止或重新请求前，需要取消未结束的旧任务。

按式样书 §4.5 规则 mock。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
POST /v1/standardizations/MS-20261118-7Q3K9D/cancel
```

无请求体。

**响应**

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "taskId": "MS-20261118-7Q3K9D",
    "status": "CANCELLED"
  }
}
```

**IDP 处理：** 取消结果不采用；若任务已完成，按接口实际状态处理。

#### OCR 确认｜修改输入后重新照合

操作员修改伤病名，点击再照合，直接提交缓存最新值。

请求为式样书 §4.6 原例；响应为 §4.6 规定的对象结构 mock，业务值仅示意，非该输入的真实匹配结果。以下 JSON 仅展示本场景主要字段，省略其他字段，不替代完整契约。

**请求**

```http
POST /v1/items/standardize
```

```json
{
  "clientRequestId": "CLAIM-20261118000123-dis2-r1",
  "caseNo": "CLAIM-20261118000123",
  "ref": {
    "taskId": "MS-20261118-7Q3K9D",
    "itemId": "dis2"
  },
  "masterTable": "DISEASE",
  "inputs": [
    {
      "column": "CLM_ICD10Mst__c.NAME",
      "value": "乳房下内側部乳癌",
      "source": {
        "type": "FIELD",
        "documentId": "991243705302",
        "fieldName": "傷病名2",
        "fieldIndex": 4
      }
    }
  ],
  "options": {
    "allowWebSearch": false,
    "timeoutSeconds": 30
  }
}
```

**响应**

<details>
<summary>展开 JSON 示例</summary>

```json
{
  "code": 0,
  "msg": "",
  "requestId": "req-example",
  "data": {
    "itemId": "restandardized-example",
    "fieldId": "fd-9c1e5a20",
    "groupId": "HG02-OPE",
    "needsReview": false,
    "shouldWriteBack": true,
    "master": {
      "masterTable": "OPERATION",
      "object": "CLM_OperationMst__c",
      "masterId": "a0V000000000000301",
      "displayName": "経皮的冠動脈形成術",
      "values": {
        "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
        "CLM_OperationMst__c.KCODE__C": "K546-00",
        "CLM_OperationMst__c.KCODEOPNAME__C": "経皮的冠動脈形成術（その他のもの）",
        "CLM_OperationMst__c.KANA1__C": "ケイヒテキカンドウミャクケイセイジュツ",
        "CLM_OperationMst__c.CANCEROPERATION__C": "false",
        "CLM_OperationMst__c.CWFDENTISTRY__C": "false",
        "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（その他のもの）",
        "CWF_OperationMstAlias__c.ID": "a0W000000000000301"
      },
      "active": true,
      "selection": {
        "object": "CWF_OperationMstAlias__c",
        "recordType": "ALIAS",
        "recordId": "a0W000000000000301",
        "name": "経皮的冠動脈形成術（その他のもの）"
      }
    },
    "targets": {
      "CLM_OperationMst__c.NAME": {
        "type": "TABLE_CELL",
        "documentId": "991243705301",
        "tableName": "手術情報",
        "tableIndex": 0,
        "rowIndex": 0,
        "columnName": "手術名",
        "columnIndex": 0
      }
    },
    "masterDataMatches": [
      {
        "type": "recommended",
        "label": "マスタ推奨",
        "value": "経皮的冠動脈形成術（その他のもの）",
        "confidence": 100.0,
        "primary": true,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000301",
          "displayName": "経皮的冠動脈形成術",
          "values": {
            "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
            "CLM_OperationMst__c.KCODE__C": "K546-00",
            "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（その他のもの）"
          },
          "active": true,
          "selection": {
            "object": "CWF_OperationMstAlias__c",
            "recordType": "ALIAS",
            "recordId": "a0W000000000000301",
            "name": "経皮的冠動脈形成術（その他のもの）"
          }
        },
        "targets": {
          "CLM_OperationMst__c.NAME": {
            "type": "TABLE_CELL",
            "documentId": "991243705301",
            "tableName": "手術情報",
            "tableIndex": 0,
            "rowIndex": 0,
            "columnName": "手術名",
            "columnIndex": 0
          }
        }
      },
      {
        "type": "candidate",
        "label": "マスタ候補",
        "value": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）",
        "confidence": 88.4,
        "primary": true,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000301",
          "displayName": "経皮的冠動脈形成術",
          "values": {
            "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
            "CLM_OperationMst__c.KCODE__C": "K546-00",
            "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"
          },
          "active": true,
          "selection": {
            "object": "CWF_OperationMstAlias__c",
            "recordType": "ALIAS",
            "recordId": "a0W000000000000302",
            "name": "経皮的冠動脈形成術（急性心筋梗塞に対するもの）"
          }
        },
        "targets": {
          "CLM_OperationMst__c.NAME": {
            "type": "TABLE_CELL",
            "documentId": "991243705301",
            "tableName": "手術情報",
            "tableIndex": 0,
            "rowIndex": 0,
            "columnName": "手術名",
            "columnIndex": 0
          }
        }
      },
      {
        "type": "candidate",
        "label": "マスタ候補",
        "value": "経皮的冠動脈形成術（不安定狭心症に対するもの）",
        "confidence": 87.9,
        "primary": true,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000301",
          "displayName": "経皮的冠動脈形成術",
          "values": {
            "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術",
            "CLM_OperationMst__c.KCODE__C": "K546-00",
            "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（不安定狭心症に対するもの）"
          },
          "active": true,
          "selection": {
            "object": "CWF_OperationMstAlias__c",
            "recordType": "ALIAS",
            "recordId": "a0W000000000000303",
            "name": "経皮的冠動脈形成術（不安定狭心症に対するもの）"
          }
        },
        "targets": {
          "CLM_OperationMst__c.NAME": {
            "type": "TABLE_CELL",
            "documentId": "991243705301",
            "tableName": "手術情報",
            "tableIndex": 0,
            "rowIndex": 0,
            "columnName": "手術名",
            "columnIndex": 0
          }
        }
      },
      {
        "type": "candidate",
        "label": "マスタ候補",
        "value": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
        "confidence": 80.2,
        "primary": true,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000311",
          "displayName": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
          "values": {
            "CLM_OperationMst__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）",
            "CLM_OperationMst__c.KCODE__C": "K548-00",
            "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈形成術（特殊カテーテルによるもの）"
          },
          "active": true,
          "selection": {
            "object": "CWF_OperationMstAlias__c",
            "recordType": "ALIAS",
            "recordId": "a0W000000000000311",
            "name": "経皮的冠動脈形成術（特殊カテーテルによるもの）"
          }
        },
        "targets": {
          "CLM_OperationMst__c.NAME": {
            "type": "TABLE_CELL",
            "documentId": "991243705301",
            "tableName": "手術情報",
            "tableIndex": 0,
            "rowIndex": 0,
            "columnName": "手術名",
            "columnIndex": 0
          }
        }
      },
      {
        "type": "candidate",
        "label": "マスタ候補",
        "value": "経皮的冠動脈ステント留置術（その他のもの）",
        "confidence": 76.5,
        "primary": true,
        "master": {
          "masterTable": "OPERATION",
          "object": "CLM_OperationMst__c",
          "masterId": "a0V000000000000312",
          "displayName": "経皮的冠動脈ステント留置術",
          "values": {
            "CLM_OperationMst__c.NAME": "経皮的冠動脈ステント留置術",
            "CLM_OperationMst__c.KCODE__C": "K549-00",
            "CWF_OperationMstAlias__c.NAME": "経皮的冠動脈ステント留置術（その他のもの）"
          },
          "active": true,
          "selection": {
            "object": "CWF_OperationMstAlias__c",
            "recordType": "ALIAS",
            "recordId": "a0W000000000000312",
            "name": "経皮的冠動脈ステント留置術（その他のもの）"
          }
        },
        "targets": {
          "CLM_OperationMst__c.NAME": {
            "type": "TABLE_CELL",
            "documentId": "991243705301",
            "tableName": "手術情報",
            "tableIndex": 0,
            "rowIndex": 0,
            "columnName": "手術名",
            "columnIndex": 0
          }
        }
      }
    ],
    "reviewReason": null,
    "remarks": [
      {
        "label": "照合根拠",
        "value": "読取値が、画面で選べる別名「経皮的冠動脈形成術（その他のもの）」と完全に一致し、帳票の手術コードとも矛盾しないため確定した。"
      }
    ],
    "ref": {
      "taskId": "MS-20261118-7Q3K9D",
      "itemId": "dis2"
    }
  }
}
```

</details>

**IDP 处理：** 继承未修改输入，更新当前对象及关联结果；一括按对象合并后分别调用此接口，不新增批量接口。
