import { ref } from 'vue'

export type StandardizationMode = 'INPUT' | 'OUTPUT' | 'INPUT_OUTPUT'
export type StandardizationFieldType = 'FIELD' | 'TABLE_COLUMN' | 'CASE_FIELD'
export type StandardizationInputRole = 'PRIMARY' | 'SUPPORTING' | 'NONE'

export interface StandardizationMasterColumn {
  column: string
  label: string
  inputRole: StandardizationInputRole
  writable: boolean
  deprecated?: boolean
}

export interface StandardizationMasterHint {
  hint: string
  label: string
  deprecated?: boolean
}

export interface StandardizationMaster {
  masterTable: string
  label: string
  columns: StandardizationMasterColumn[]
  hints: StandardizationMasterHint[]
  enabled?: boolean
  deprecated?: boolean
  masterVersion?: string
  displayColumn?: string
}

export interface StandardizationMasterSchema {
  schemaVersion: string
  masterTables: StandardizationMaster[]
}

export interface StandardizationCatalogEntry {
  value: string
  label: string
}

export interface StandardizationCatalog {
  catalogVersion: string
  enums: Record<string, StandardizationCatalogEntry[]>
}

export interface StandardizationDefaultGroups {
  version: string
  groups: Array<Omit<StandardizationGroup, 'sceneIds'> & { sceneIds?: string[] }>
}

export interface StandardizationDocumentType {
  id: string
  label: string
  fields: string[]
  tables: Record<string, string[]>
}

export interface StandardizationMemberField {
  type: StandardizationFieldType
  documentTypeId: string
  fieldName?: string
  tableName?: string
  columnName?: string
}

export interface StandardizationGroupMember {
  id: string
  column?: string
  hint?: string
  mode: StandardizationMode
  field: StandardizationMemberField
}

export interface StandardizationGroup {
  groupId: string
  /** Zurich default group ID when this group was imported from defaults. */
  sourceDefaultGroupId?: string
  label: string
  masterTable: string
  sceneIds: string[]
  members: StandardizationGroupMember[]
}

export interface StandardizationBusinessScene {
  id: string
  label: string
  documentTypeIds: string[]
}

export const standardizationMasters: StandardizationMaster[] = [
  {
    masterTable: 'DISEASE',
    label: '傷病名マスタ',
    columns: [
      { column: 'CLM_ICD10Mst__c.NAME', label: '傷病名', inputRole: 'PRIMARY', writable: true },
      { column: 'CLM_ICD10Mst__c.ICD10__C', label: 'ICD10コード', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_ICD10Mst__c.KANA__C', label: '傷病名カナ', inputRole: 'NONE', writable: true }
    ],
    hints: [
      { hint: 'sex', label: '性別' },
      { hint: 'cause', label: '傷病の原因' }
    ]
  },
  {
    masterTable: 'OPERATION',
    label: '手術マスタ',
    columns: [
      { column: 'CLM_OperationMst__c.NAME', label: '手術名', inputRole: 'PRIMARY', writable: true },
      { column: 'CLM_OperationMst__c.KCODE__C', label: '手術コード（Kコード）', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_OperationMst__c.KCODEOPNAME__C', label: 'Kコードの手術名', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_OperationMst__c.OPERATIONNO__C', label: '手術番号', inputRole: 'NONE', writable: true }
    ],
    hints: [{ hint: 'operationDate', label: '手術日' }]
  },
  {
    masterTable: 'FACILITY',
    label: '医療機関マスタ',
    columns: [
      { column: 'CWF_MedicalFacilityMaster__c.NAME', label: '医療機関名', inputRole: 'PRIMARY', writable: true },
      { column: 'CWF_MedicalFacilityMaster__c.ADDRESS__C', label: '所在地', inputRole: 'SUPPORTING', writable: true },
      { column: 'CWF_MedicalFacilityMaster__c.POSTALCODE__C', label: '郵便番号', inputRole: 'SUPPORTING', writable: true }
    ],
    hints: [{ hint: 'department', label: '診療科' }]
  },
  {
    masterTable: 'DRUG',
    label: '薬剤マスタ',
    columns: [
      { column: 'DRUG.BRANDNAME', label: '商品名', inputRole: 'PRIMARY', writable: true },
      { column: 'DRUG.GENERICNAME', label: '一般名', inputRole: 'PRIMARY', writable: true },
      { column: 'DRUG.GENERICNAMEEN', label: '一般名（英語）', inputRole: 'NONE', writable: true },
      { column: 'DRUG.ATC', label: 'ATC分類', inputRole: 'NONE', writable: true },
      { column: 'DRUG.EFFICACY', label: '薬効分類', inputRole: 'NONE', writable: true },
      { column: 'DRUG.YJCODE', label: '薬価基準コード', inputRole: 'SUPPORTING', writable: true },
      { column: 'DRUG.DATEFROM', label: '薬価収載日', inputRole: 'NONE', writable: true },
      { column: 'DRUG.DATETO', label: '収載終了日', inputRole: 'NONE', writable: true }
    ],
    hints: [
      { hint: 'dosageForm', label: '剤形' },
      { hint: 'prescriptionCategory', label: '処方区分' }
    ]
  }
]

export const standardizationDocumentTypes: StandardizationDocumentType[] = [
  {
    id: '20001',
    label: '診療明細書',
    fields: ['医療機関名', '所在地', '診療科', '傷病名'],
    tables: {
      診療明細: ['診療日', '診療内容', '点数', '自己負担額'],
      手術情報: ['手術日', '手術名', '手術コード'],
      薬剤情報: ['商品名', '一般名', 'ATC分類', '薬効分類', '薬価基準コード', '剤形', '処方区分']
    }
  },
  {
    id: '20002',
    label: '診断書',
    fields: ['傷病名1', '傷病名1_ICD10', '傷病名2', '医療機関名', '所在地', '性別', '傷病の原因', '診療科'],
    tables: {}
  },
  {
    id: '20003',
    label: '保険金請求書',
    fields: ['振込先金融機関', '振込先支店', '金融機関コード', '支店コード'],
    tables: {}
  }
]

const sceneDefinitions: StandardizationBusinessScene[] = [
  { id: 'claim', label: '保険金請求', documentTypeIds: ['20001', '20002', '20003'] },
  { id: 'hospitalization', label: '入院請求', documentTypeIds: ['20001', '20002'] },
  { id: 'surgery-benefit', label: '手術給付金請求', documentTypeIds: ['20001', '20002'] },
  { id: 'outpatient-benefit', label: '通院給付金請求', documentTypeIds: ['20002'] }
]

const allSceneDocumentTypeIds = sceneDefinitions.reduce<string[]>(
  (ids, scene, index) =>
    index === 0
      ? [...scene.documentTypeIds]
      : ids.filter((id) => scene.documentTypeIds.includes(id)),
  []
)

export const standardizationBusinessScenes: StandardizationBusinessScene[] = [
  { id: 'all', label: '全シーン', documentTypeIds: allSceneDocumentTypeIds },
  ...sceneDefinitions
]

function commonDocumentTypeIdsForScenes(sceneIds: string[]) {
  const scenes = sceneIds
    .map((sceneId) => standardizationBusinessScenes.find((scene) => scene.id === sceneId))
    .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene))
  if (!scenes.length) return []
  return scenes.reduce<string[]>(
    (ids, scene, index) =>
      index === 0
        ? [...scene.documentTypeIds]
        : ids.filter((id) => scene.documentTypeIds.includes(id)),
    []
  )
}

export const standardizationGroups = ref<StandardizationGroup[]>([])

export const standardizationGroupsVersion = ref('')

export function createStandardizationMockGroups(): StandardizationGroup[] {
  return [
    {
      groupId: 'mock-disease-common',
      label: '傷病名（共通）',
      masterTable: 'DISEASE',
      sceneIds: ['claim', 'hospitalization'],
      members: [
        {
          id: 'mock-disease-common-name',
          column: 'CLM_ICD10Mst__c.NAME',
          mode: 'INPUT_OUTPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '傷病名1'
          }
        },
        {
          id: 'mock-disease-common-code',
          column: 'CLM_ICD10Mst__c.ICD10__C',
          mode: 'INPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '傷病名1_ICD10'
          }
        },
        {
          id: 'mock-disease-common-sex',
          hint: 'sex',
          mode: 'INPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '性別'
          }
        }
      ]
    },
    {
      groupId: 'mock-disease-supporting',
      label: '傷病名（補助判定）',
      masterTable: 'DISEASE',
      sceneIds: ['claim', 'hospitalization'],
      members: [
        {
          id: 'mock-disease-supporting-name',
          column: 'CLM_ICD10Mst__c.NAME',
          mode: 'INPUT_OUTPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20001',
            fieldName: '傷病名'
          }
        },
        {
          id: 'mock-disease-supporting-code',
          column: 'CLM_ICD10Mst__c.ICD10__C',
          mode: 'OUTPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '傷病名1'
          }
        },
        {
          id: 'mock-disease-supporting-cause',
          hint: 'cause',
          mode: 'INPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '傷病の原因'
          }
        }
      ]
    },
    {
      groupId: 'mock-disease-shared-input',
      label: '傷病名（入力共用）',
      masterTable: 'DISEASE',
      sceneIds: ['claim', 'hospitalization'],
      members: [
        {
          id: 'mock-disease-shared-input-name',
          column: 'CLM_ICD10Mst__c.NAME',
          mode: 'INPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '傷病名1'
          }
        }
      ]
    },
    {
      groupId: 'mock-drug-table',
      label: '薬剤（診療明細書）',
      masterTable: 'DRUG',
      sceneIds: ['claim', 'hospitalization'],
      members: [
        {
          id: 'mock-drug-table-name',
          column: 'DRUG.BRANDNAME',
          mode: 'INPUT_OUTPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: '商品名'
          }
        },
        {
          id: 'mock-drug-table-generic-name',
          column: 'DRUG.GENERICNAME',
          mode: 'INPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: '一般名'
          }
        },
        {
          id: 'mock-drug-table-atc',
          column: 'DRUG.ATC',
          mode: 'OUTPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: 'ATC分類'
          }
        },
        {
          id: 'mock-drug-table-efficacy',
          column: 'DRUG.EFFICACY',
          mode: 'OUTPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: '薬効分類'
          }
        },
        {
          id: 'mock-drug-table-yjcode',
          column: 'DRUG.YJCODE',
          mode: 'INPUT_OUTPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: '薬価基準コード'
          }
        },
        {
          id: 'mock-drug-table-dosage-form',
          hint: 'dosageForm',
          mode: 'INPUT',
          field: {
            type: 'TABLE_COLUMN',
            documentTypeId: '20001',
            tableName: '薬剤情報',
            columnName: '剤形'
          }
        }
      ]
    },
    {
      groupId: 'mock-facility-common',
      label: '医療機関（共通）',
      masterTable: 'FACILITY',
      sceneIds: ['all'],
      members: [
        {
          id: 'mock-facility-common-name',
          column: 'CWF_MedicalFacilityMaster__c.NAME',
          mode: 'INPUT_OUTPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '医療機関名'
          }
        },
        {
          id: 'mock-facility-common-department',
          hint: 'department',
          mode: 'INPUT',
          field: {
            type: 'FIELD',
            documentTypeId: '20002',
            fieldName: '診療科'
          }
        }
      ]
    }
  ]
}

export function findStandardizationMaster(masterTable: string) {
  return standardizationMasters.find((master) => master.masterTable === masterTable) ?? null
}

export function findStandardizationDocumentType(documentTypeId: string) {
  return standardizationDocumentTypes.find((documentType) => documentType.id === documentTypeId) ?? null
}

export async function fetchStandardizationMasters(): Promise<StandardizationMasterSchema> {
  await new Promise((resolve) => window.setTimeout(resolve, 900))
  return {
    schemaVersion: '2026-11-19',
    masterTables: standardizationMasters.map((master) => ({
      ...master,
      columns: master.columns.map((column) => ({ ...column })),
      hints: master.hints.map((hint) => ({ ...hint }))
    }))
  }
}

export async function fetchStandardizationCatalog(): Promise<StandardizationCatalog> {
  await new Promise((resolve) => window.setTimeout(resolve, 700))
  return {
    catalogVersion: '2026-11-18',
    enums: {
      masterTable: standardizationMasters.map((master) => ({
        value: master.masterTable,
        label: master.label
      })),
      memberMode: [
        { value: 'INPUT', label: '照合のみ' },
        { value: 'OUTPUT', label: '反映のみ' },
        { value: 'INPUT_OUTPUT', label: '照合して反映' }
      ],
      inputRole: [
        { value: 'PRIMARY', label: '主要列' },
        { value: 'SUPPORTING', label: '補助列' },
        { value: 'NONE', label: '反映専用' }
      ],
      fieldRefType: [
        { value: 'FIELD', label: 'フィールド' },
        { value: 'TABLE_COLUMN', label: 'テーブル列' },
        { value: 'CASE_FIELD', label: '案件項目' }
      ],
      itemStatus: [
        { value: 'MATCHED', label: '確定' },
        { value: 'NEW_CANDIDATE', label: '新規登録候補' },
        { value: 'SPLIT', label: '分割' },
        { value: 'NOT_APPLICABLE', label: '名寄せの対象外' },
        { value: 'UNRESOLVED', label: '判断不能' }
      ]
    }
  }
}

export async function fetchStandardizationDefaultGroups(): Promise<StandardizationDefaultGroups> {
  await new Promise((resolve) => window.setTimeout(resolve, 900))
  return {
    version: '2026-11-21',
    groups: [
      {
        groupId: 'DEFAULT:DISEASE-ALL',
        label: '傷病名（全シーン）',
        masterTable: 'DISEASE',
        members: [
          {
            id: 'default-disease-name',
            column: 'CLM_ICD10Mst__c.NAME',
            mode: 'INPUT_OUTPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '傷病名1'
            }
          },
          {
            id: 'default-disease-code',
            column: 'CLM_ICD10Mst__c.ICD10__C',
            mode: 'INPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '傷病名1_ICD10'
            }
          },
          {
            id: 'default-disease-sex',
            hint: 'sex',
            mode: 'INPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '性別'
            }
          },
          {
            id: 'default-disease-cause',
            hint: 'cause',
            mode: 'INPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '傷病の原因'
            }
          }
        ]
      },
      {
        groupId: 'DEFAULT:FACILITY-ALL',
        label: '受診医療機関（全シーン）',
        masterTable: 'FACILITY',
        members: [
          {
            id: 'default-facility-name',
            column: 'CWF_MedicalFacilityMaster__c.NAME',
            mode: 'INPUT_OUTPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '医療機関名'
            }
          },
          {
            id: 'default-facility-department',
            hint: 'department',
            mode: 'INPUT',
            field: {
              type: 'FIELD',
              documentTypeId: '20002',
              fieldName: '診療科'
            }
          }
        ]
      },
      {
        groupId: 'DEFAULT:OPERATION',
        label: '手術（診療明細書）',
        masterTable: 'OPERATION',
        sceneIds: ['claim', 'hospitalization', 'surgery-benefit'],
        members: [
          {
            id: 'default-operation-name',
            column: 'CLM_OperationMst__c.NAME',
            mode: 'INPUT_OUTPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '手術情報',
              columnName: '手術名'
            }
          },
          {
            id: 'default-operation-code',
            column: 'CLM_OperationMst__c.KCODE__C',
            mode: 'INPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '手術情報',
              columnName: '手術コード'
            }
          },
          {
            id: 'default-operation-date',
            hint: 'operationDate',
            mode: 'INPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '手術情報',
              columnName: '手術日'
            }
          }
        ]
      },
      {
        groupId: 'DEFAULT:DRUG-MEDICAL',
        label: '薬剤（診療明細書）',
        masterTable: 'DRUG',
        sceneIds: ['claim', 'hospitalization', 'surgery-benefit'],
        members: [
          {
            id: 'default-drug-name',
            column: 'DRUG.BRANDNAME',
            mode: 'INPUT_OUTPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '薬剤情報',
              columnName: '商品名'
            }
          },
          {
            id: 'default-drug-atc',
            column: 'DRUG.ATC',
            mode: 'OUTPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '薬剤情報',
              columnName: 'ATC分類'
            }
          },
          {
            id: 'default-drug-efficacy',
            column: 'DRUG.EFFICACY',
            mode: 'OUTPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '薬剤情報',
              columnName: '薬効分類'
            }
          },
          {
            id: 'default-drug-yjcode',
            column: 'DRUG.YJCODE',
            mode: 'INPUT_OUTPUT',
            field: {
              type: 'TABLE_COLUMN',
              documentTypeId: '20001',
              tableName: '薬剤情報',
              columnName: '薬価基準コード'
            }
          }
        ]
      }
    ]
  }
}

export interface StandardizationGroupValidationError {
  code: string
  message: string
  memberIndex: number | null
}

export interface StandardizationGroupValidationResult {
  groupId: string
  valid: boolean
  errors: StandardizationGroupValidationError[]
  warnings: string[]
}

function memberFieldKey(member: StandardizationGroupMember) {
  if (member.field.type === 'CASE_FIELD') return `case:${member.field.fieldName ?? ''}`
  if (member.field.type === 'TABLE_COLUMN') {
    return `${member.field.documentTypeId}:table:${member.field.tableName}:${member.field.columnName}`
  }
  return `${member.field.documentTypeId}:field:${member.field.fieldName ?? ''}`
}

export async function validateStandardizationGroups(
  groups: StandardizationGroup[]
): Promise<StandardizationGroupValidationResult[]> {
  await new Promise((resolve) => window.setTimeout(resolve, 400))
  const groupIds = new Set<string>()
  const results = groups.map((group) => {
    const errors: StandardizationGroupValidationError[] = []
    const warnings: string[] = []
    if (groupIds.has(group.groupId)) {
      errors.push({ code: 'DUPLICATE_GROUP_ID', message: 'グループIDが重複しています', memberIndex: null })
    }
    groupIds.add(group.groupId)

    const master = findStandardizationMaster(group.masterTable)
    if (!master) {
      errors.push({ code: 'UNKNOWN_MASTER_TABLE', message: '主データが見つかりません', memberIndex: null })
    } else {
      if (master.enabled === false) {
        errors.push({ code: 'MASTER_TABLE_NOT_ENABLED', message: 'この主データは利用できません', memberIndex: null })
      }
    }

    const memberRefs = group.members.map((member) => member.column || member.hint).filter(Boolean)
    if (new Set(memberRefs).size !== memberRefs.length) {
      errors.push({ code: 'DUPLICATE_MEMBER', message: '同じマスタ列またはヒントが重複しています', memberIndex: null })
    }

    const commonDocumentTypeIds = commonDocumentTypeIdsForScenes(group.sceneIds)
    group.members.forEach((member, memberIndex) => {
      if (member.field.type === 'CASE_FIELD') {
        if (!member.field.fieldName?.trim()) {
          errors.push({
            code: 'UNKNOWN_FIELD',
            message: '標準フィールドが見つかりません',
            memberIndex
          })
        }
        return
      }
      if (!commonDocumentTypeIds.includes(member.field.documentTypeId)) {
        errors.push({
          code: 'FIELD_NOT_IN_SCENE',
          message: '選択した適用シーンの共通帳票にないフィールドです',
          memberIndex
        })
      }
    })

    group.members.forEach((member, memberIndex) => {
      const column = master?.columns.find((item) => item.column === member.column)
      const hint = master?.hints.find((item) => item.hint === member.hint)
      if (!column && !hint) {
        errors.push({ code: 'UNKNOWN_COLUMN', message: 'マスタ項目が見つかりません', memberIndex })
        return
      }
      if (hint && member.mode !== 'INPUT') {
        errors.push({ code: 'INVALID_MODE', message: 'ヒントは照合のみ指定できます', memberIndex })
      }
      if (column?.inputRole === 'NONE' && !column.writable) {
        errors.push({
          code: 'INVALID_MODE',
          message: '照合にも反映にも使用できないマスタ列です',
          memberIndex
        })
      } else if (column?.inputRole === 'NONE' && member.mode !== 'OUTPUT') {
        errors.push({
          code: 'INVALID_MODE',
          message: 'このマスタ項目は OUTPUT を指定してください',
          memberIndex
        })
      }
      if (column && !column.writable && member.mode !== 'INPUT') {
        errors.push({ code: 'INVALID_MODE', message: 'このマスタ項目は照合のみ指定できます', memberIndex })
      }
    })

    const hasPrimaryInput = group.members.some((member) => {
      if (member.mode === 'OUTPUT') return false
      const column = master?.columns.find((item) => item.column === member.column)
      return column?.inputRole === 'PRIMARY'
    })
    if (!hasPrimaryInput) {
      errors.push({ code: 'NO_PRIMARY_INPUT', message: '主要入力を1件以上設定してください', memberIndex: null })
    }

    const primaryInputs = group.members.filter((member) => {
      if (member.mode === 'OUTPUT') return false
      return master?.columns.find((column) => column.column === member.column)?.inputRole === 'PRIMARY'
    })
    const documentPrimaryInputs = primaryInputs.filter((member) => member.field.type !== 'CASE_FIELD')
    if (documentPrimaryInputs.length > 1) {
      if (new Set(documentPrimaryInputs.map((member) => member.field.documentTypeId)).size > 1) {
        errors.push({ code: 'PRIMARY_NOT_ALIGNED', message: '複数の主要入力は同じ帳票タイプにしてください', memberIndex: null })
      }
      const tablePrimaryInputs = documentPrimaryInputs.filter((member) => member.field.type === 'TABLE_COLUMN')
      if (tablePrimaryInputs.length > 1 && new Set(tablePrimaryInputs.map((member) => member.field.tableName)).size > 1) {
        errors.push({ code: 'TABLE_NOT_ALIGNED', message: 'テーブル列の主要入力は同じテーブルにしてください', memberIndex: null })
      }
    }

    const tablePrimary = documentPrimaryInputs.find((member) => member.field.type === 'TABLE_COLUMN')
    if (tablePrimary) {
      const misalignedIndex = group.members.findIndex(
        (member) =>
          member.field.type === 'TABLE_COLUMN' &&
          member.field.documentTypeId === tablePrimary.field.documentTypeId &&
          member.field.tableName !== tablePrimary.field.tableName
      )
      if (misalignedIndex >= 0) {
        errors.push({ code: 'TABLE_NOT_ALIGNED', message: '同じ帳票内のテーブル列は主入力と同じテーブルにしてください', memberIndex: misalignedIndex })
      }
    }

    return {
      groupId: group.groupId,
      valid: errors.length === 0,
      errors,
      warnings
    }
  })

  const outputOwners = new Map<string, { groupId: string; groupIndex: number }>()
  groups.forEach((group, groupIndex) => {
    group.members.forEach((member) => {
      if (member.mode === 'INPUT') return
      const key = memberFieldKey(member)
      const owner = outputOwners.get(key)
      if (owner && owner.groupId !== group.groupId) {
        const message = '同じ項目が複数の照合グループの反映先になっています'
        if (!results[groupIndex].warnings.includes(message)) {
          results[groupIndex].warnings.push(message)
        }
      } else {
        outputOwners.set(key, { groupId: group.groupId, groupIndex })
      }
    })
  })

  return results
}
