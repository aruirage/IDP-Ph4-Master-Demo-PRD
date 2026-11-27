import { ref } from 'vue'

export type StandardizationMode = 'INPUT' | 'OUTPUT' | 'INPUT_OUTPUT'
export type StandardizationFieldType = 'FIELD' | 'TABLE_COLUMN' | 'CASE_FIELD'
export type StandardizationRole = 'PRIMARY' | 'SUPPORTING' | 'NONE'

export interface StandardizationColumn {
  column: string
  label: string
  inputRole: StandardizationRole
  writable: boolean
}

export interface StandardizationHint {
  hint: string
  label: string
}

export interface StandardizationMasterTable {
  masterTable: string
  label: string
  description: string
  columns: StandardizationColumn[]
  hints: StandardizationHint[]
}

export interface StandardizationMember {
  id: string
  column?: string
  hint?: string
  mode: StandardizationMode
  fieldType: StandardizationFieldType
  documentTypeId: string
  fieldName: string
  tableName?: string
  columnName?: string
}

export interface StandardizationGroup {
  id: string
  label: string
  masterTable: string
  members: StandardizationMember[]
  updatedAt: string
}

export const standardizationMasterTables: StandardizationMasterTable[] = [
  {
    masterTable: 'DISEASE',
    label: '傷病名マスタ',
    description: '傷病名とICD10コード。別名を含めて照合する',
    columns: [
      { column: 'CLM_ICD10Mst__c.NAME', label: '傷病名', inputRole: 'PRIMARY', writable: true },
      { column: 'CLM_ICD10Mst__c.ICD10__C', label: 'ICD10コード', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_ICD10Mst__c.KANA__C', label: '傷病名カナ', inputRole: 'SUPPORTING', writable: true }
    ],
    hints: [
      { hint: 'sex', label: '性別' },
      { hint: 'cause', label: '傷病の原因' }
    ]
  },
  {
    masterTable: 'OPERATION',
    label: '手術マスタ',
    description: '手術名とKコード。別名を含めて照合する',
    columns: [
      { column: 'CLM_OperationMst__c.NAME', label: '手術名', inputRole: 'PRIMARY', writable: true },
      { column: 'CLM_OperationMst__c.KCODE__C', label: '手術コード（Kコード）', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_OperationMst__c.KCODEOPNAME__C', label: 'Kコード手術名', inputRole: 'SUPPORTING', writable: true }
    ],
    hints: [
      { hint: 'operationDate', label: '手術日' },
      { hint: 'sex', label: '性別' }
    ]
  },
  {
    masterTable: 'BANK_BRANCH',
    label: '銀行支店マスタ',
    description: '金融機関と支店の組。振込先の登録に使う',
    columns: [
      { column: 'CLM_BankBranchMst__c.BANKNAME__C', label: '金融機関名', inputRole: 'PRIMARY', writable: true },
      { column: 'CLM_BankBranchMst__c.BRANCHNAME__C', label: '支店名', inputRole: 'SUPPORTING', writable: true },
      { column: 'CLM_BankBranchMst__c.BANKCODE__C', label: '金融機関コード', inputRole: 'NONE', writable: true },
      { column: 'CLM_BankBranchMst__c.BRANCHCODE__C', label: '支店コード', inputRole: 'NONE', writable: true }
    ],
    hints: []
  },
  {
    masterTable: 'FACILITY',
    label: '医療機関マスタ',
    description: '医療機関名と所在地。別名を含めて照合する',
    columns: [
      { column: 'CWF_MedicalFacilityMaster__c.NAME', label: '医療機関名', inputRole: 'PRIMARY', writable: true },
      { column: 'CWF_MedicalFacilityMaster__c.ADDRESS__C', label: '所在地', inputRole: 'SUPPORTING', writable: true },
      { column: 'CWF_MedicalFacilityMaster__c.POSTALCODE__C', label: '郵便番号', inputRole: 'SUPPORTING', writable: true }
    ],
    hints: [{ hint: 'department', label: '診療科' }]
  }
]

export const standardizationDocTypes = [
  { value: '20001', label: '診療明細書' },
  { value: '20002', label: '診断書' },
  { value: '20003', label: '保険金請求書' }
]

export const standardizationGroups = ref<StandardizationGroup[]>([
  {
    id: 'HE03-DIS-1',
    label: '傷病名1',
    masterTable: 'DISEASE',
    updatedAt: '2026-11-18 14:20',
    members: [
      { id: 'm-disease-name', column: 'CLM_ICD10Mst__c.NAME', mode: 'INPUT_OUTPUT', fieldType: 'FIELD', documentTypeId: '20002', fieldName: '傷病名1' },
      { id: 'm-disease-code', column: 'CLM_ICD10Mst__c.ICD10__C', mode: 'INPUT', fieldType: 'FIELD', documentTypeId: '20002', fieldName: '傷病名1_ICD10' },
      { id: 'm-disease-sex', hint: 'sex', mode: 'INPUT', fieldType: 'CASE_FIELD', documentTypeId: '', fieldName: '性別' }
    ]
  },
  {
    id: 'HG02-OPE',
    label: '手術',
    masterTable: 'OPERATION',
    updatedAt: '2026-11-18 14:26',
    members: [
      { id: 'm-operation-name', column: 'CLM_OperationMst__c.NAME', mode: 'INPUT_OUTPUT', fieldType: 'TABLE_COLUMN', documentTypeId: '20001', fieldName: '手術名', tableName: '手術情報', columnName: '手術名' },
      { id: 'm-operation-code', column: 'CLM_OperationMst__c.KCODE__C', mode: 'INPUT', fieldType: 'TABLE_COLUMN', documentTypeId: '20001', fieldName: '手術コード', tableName: '手術情報', columnName: '手術コード' }
    ]
  },
  {
    id: 'HA01-BANK',
    label: '振込先',
    masterTable: 'BANK_BRANCH',
    updatedAt: '2026-11-18 15:02',
    members: [
      { id: 'm-bank-name', column: 'CLM_BankBranchMst__c.BANKNAME__C', mode: 'INPUT_OUTPUT', fieldType: 'FIELD', documentTypeId: '20003', fieldName: '振込先金融機関' },
      { id: 'm-bank-branch', column: 'CLM_BankBranchMst__c.BRANCHNAME__C', mode: 'INPUT_OUTPUT', fieldType: 'FIELD', documentTypeId: '20003', fieldName: '振込先支店' },
      { id: 'm-bank-code', column: 'CLM_BankBranchMst__c.BANKCODE__C', mode: 'OUTPUT', fieldType: 'FIELD', documentTypeId: '20003', fieldName: '金融機関コード' },
      { id: 'm-branch-code', column: 'CLM_BankBranchMst__c.BRANCHCODE__C', mode: 'OUTPUT', fieldType: 'FIELD', documentTypeId: '20003', fieldName: '支店コード' }
    ]
  },
  {
    id: 'FAC-1',
    label: '医療機関',
    masterTable: 'FACILITY',
    updatedAt: '2026-11-18 15:16',
    members: [
      { id: 'm-facility-name', column: 'CWF_MedicalFacilityMaster__c.NAME', mode: 'INPUT_OUTPUT', fieldType: 'FIELD', documentTypeId: '20002', fieldName: '医療機関名' },
      { id: 'm-facility-address', column: 'CWF_MedicalFacilityMaster__c.ADDRESS__C', mode: 'INPUT', fieldType: 'FIELD', documentTypeId: '20001', fieldName: '病院住所' },
      { id: 'm-facility-department', hint: 'department', mode: 'INPUT', fieldType: 'CASE_FIELD', documentTypeId: '', fieldName: '診療科' }
    ]
  }
])

export interface StandardizationTrialResult {
  itemId: string
  groupLabel: string
  status: 'MATCHED' | 'SPLIT' | 'UNRESOLVED'
  needsReview: boolean
  sourceLabel: string
  displayName: string | null
  values: Record<string, string>
  selection: { object: string; recordType: string; recordId: string } | null
  reasons: string[]
  candidates: { name: string; score: number }[]
  splitItems: { text: string; primary: boolean }[]
}

export const standardizationTrialResults: StandardizationTrialResult[] = [
  {
    itemId: 'dis1',
    groupLabel: '傷病名1',
    status: 'SPLIT',
    needsReview: false,
    sourceLabel: '診断書 / 傷病名1',
    displayName: '食道癌',
    values: { 'CLM_ICD10Mst__c.NAME': '食道癌', 'CLM_ICD10Mst__c.ICD10__C': 'C159' },
    selection: { object: 'CWF_ICD10MstAlias__c', recordType: 'ALIAS', recordId: 'a0Q000000000000101' },
    reasons: [],
    candidates: [],
    splitItems: [{ text: '食道癌', primary: true }, { text: '直腸癌', primary: false }]
  },
  {
    itemId: 'dis2',
    groupLabel: '傷病名1',
    status: 'UNRESOLVED',
    needsReview: true,
    sourceLabel: '診断書 / 傷病名2',
    displayName: null,
    values: {},
    selection: null,
    reasons: ['複数候補が同点で、内側・外側を判断できない'],
    candidates: [
      { name: '乳房下外側部乳癌', score: 91.7 },
      { name: '乳房下内側部乳癌', score: 91.7 }
    ],
    splitItems: []
  },
  {
    itemId: 'bnk1',
    groupLabel: '振込先',
    status: 'MATCHED',
    needsReview: false,
    sourceLabel: '保険金請求書 / 振込先金融機関',
    displayName: 'サンプル銀行 中央支店',
    values: {
      'CLM_BankBranchMst__c.BANKNAME__C': 'サンプル銀行',
      'CLM_BankBranchMst__c.BRANCHNAME__C': '中央支店',
      'CLM_BankBranchMst__c.BANKCODE__C': '0123',
      'CLM_BankBranchMst__c.BRANCHCODE__C': '456'
    },
    selection: { object: 'CLM_BankBranchMst__c', recordType: 'MASTER', recordId: 'a2B000000000000501' },
    reasons: [],
    candidates: [],
    splitItems: []
  }
]

export function getStandardizationMasterTable(key: string) {
  return standardizationMasterTables.find((item) => item.masterTable === key)
}

export function getStandardizationColumn(masterTable: string, column: string) {
  return getStandardizationMasterTable(masterTable)?.columns.find((item) => item.column === column)
}
