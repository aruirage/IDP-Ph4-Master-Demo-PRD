import { compareSimilarityCandidates } from './masterCandidateOrder'
import { MOCK_SAMPLE_MEDIA_URL } from '@/constants/mockSampleMedia'
import { t } from '@/i18n/translate'
import { rawMockCaseList } from '@/mocks/cases'
import { planCaseLogicalFiles, resolveMockFileName } from '@/mocks/mockLogicalFilePlans'
import { getTaskById } from '@/mocks/tasks'
import type { MasterMatchConfirmRule } from '@/mocks/docTypeSettings'

export const OCR_CONFIDENCE_THRESHOLD = 85
/** Master 照合 · 式样书默认返回候选上限 */
export const MASTER_MATCH_SIMILARITY_TOP_N = 5

export type OcrMasterMatchSearchStrategy = 'ocr' | 'match' | 'code' | 'hybrid' | 'parent'

export interface OcrMasterMatchCandidate {
  sourceRecordId?: string
  hierarchyOfficial?:boolean
  hierarchyLevel?:number
  hierarchyPath?:string
  value: string
  strategy: OcrMasterMatchSearchStrategy
  sourceLabel?: string
  type?: 'recommended' | 'candidate'
  label?: string
  confidence?: number
  primary?: boolean
  score?: number
  selectable?: boolean
  isMaster?: boolean
  whyNot?: string
  selection?: {
    object: string
    recordType: string
    recordId: string
    name: string
  } | null
  masterValues?: Record<string, string>
  /** 选中后写入各关联字段的值 */
  linkedValues?: Record<string, string>
  /** 混合检索相似度（0–100），用于排序取 Top N */
  similarityScore?: number
}

export type OcrFieldAlert =
  | 'none'
  | 'low-confidence'
  | 'model-conflict'
  | 'value-out-of-range'
  | 'required-empty'
  | 'master-low-similarity'
  | 'master-empty-result'
  | 'master-low-confidence'
  | 'master-execution-error'

export interface OcrFieldBbox {
  top: number
  left: number
  width: number
  height: number
}

export interface OcrStandardizationReview {
  status: 'MATCHED' | 'SPLIT' | 'NEW_CANDIDATE' | 'NOT_APPLICABLE' | 'UNRESOLVED'
  needsReview: boolean
  confidence: number
  reason: string
  notesForAssessor: string
  reviewReasons: { code: string; message: string }[]
  alternatives: { value: string; whyNot: string; score?: number }[]
  proposedName: string
  splitItems: {
    text: string
    primary: boolean
    matchedMaster?: string
  }[]
  targets: string[]
  shouldWriteBack: boolean
  groupId?: string
}

export interface OcrExtractionField {
  id: string
  section: string
  label: string
  value: string
  /** OCR 抽出時の原始値（元に戻す用）；未指定時は value と同値 */
  ocrOriginalValue?: string
  ocrEditedValue?: string
  pendingMasterMatch?: OcrMasterMatchCandidate
  writeSourceOptions?: { id: string; label: string }[]
  selectedWriteSourceId?: string
  masterMatchError?:string
  phase3Matched?:boolean
  masterAutoAdopted?:boolean
  masterMatchStrategy?:OcrMasterMatchSearchStrategy
  masterMatchSimilarity?:number
  masterHierarchyOfficial?:boolean
  masterHierarchyLevel?:number
  masterHierarchyPath?:string
  masterReviewEnabled?:boolean
  masterDataColumnId?:string
  masterCodeColumnId?:string
  masterDataId?:string
  phase3ModelTrusted?:boolean
  apiStandardizationApplied?:boolean
  masterSelection?: OcrMasterMatchCandidate['selection']
  masterValuesSnapshot?: Record<string, string>
  /** API item.master：推荐采用的主数据行 */
  masterRecommendation?: OcrMasterMatchCandidate
  /** IDP 已按 targets 完成自动回填 */
  standardizationAutoApplied?: boolean
  standardizationReview?: OcrStandardizationReview
  confidence: number
  required: boolean
  bbox: OcrFieldBbox
  modelAlternatives?: string[]
  /** 抽出値が帳票タイプ定義の正常値範囲外 */
  valueOutOfRange?: boolean
  /** Master 照合要確認：最细规则维度（相似度低 / 结果为空 / 置信度低） */
  masterMatchConfirmRule?: MasterMatchConfirmRule
  /** Master 照合候補（類似度低時など） */
  masterMatchCandidates?: OcrMasterMatchCandidate[]
  /** Master 照合 · 按 code 检索时联合参与查询的 OCR 字段 */
  masterMatchCodeFieldRefs?: { fieldId: string; label: string; masterColumnId?: string }[]
  /** 关联至主 Master 照合字段（共享候选项与要确认状态） */
  masterMatchLinkedTo?: string
  /** Master 照合组内当前字段的配置方式。 */
  memberMode?: 'INPUT' | 'OUTPUT' | 'INPUT_OUTPUT'
  /** Zurich 标准化对象 ID。多个输入字段属于同一 item 时使用相同值。 */
  standardizationItemId?: string
  /** Master 照合値（信頼度低時の照合結果） */
  masterMatchedValue?: string
  /** 要確認フィールドの手動確認（トグル可） */
  userConfirmed?: boolean
}

export interface OcrTableColumn {
  id: string
  label: string
}

export interface OcrExtractionTable {
  id: string
  label: string
  section: string
  columns: OcrTableColumn[]
  rows: Record<string, string>[]
  originalRows?: Record<string, string>[]
  cellMetadata?: Record<string, {
    masterMatch?: boolean
    pendingValue?: string
    /** Mock matching results indexed by the latest edited OCR value. */
    masterMatches?: Record<string, string>
  }>
}

export interface OcrDocumentPage {
  id: string
  docType: string
  fileName: string
  imageUrl: string
  pageCount?: number
  fields: OcrExtractionField[]
  tables: OcrExtractionTable[]
}

export interface OcrExtractionTaskDetail {
  taskId: string
  caseId: string
  caseOrigin: string | null
  sourceFolderName: string
  pages: OcrDocumentPage[]
}

/** 保険金請求書（HA21-001）デモ用フィールド — 座標は PDF プレビューに合わせて調整 */
function createClaimFormFields(): OcrExtractionField[] {
  return [
    {
      id: 'f-policy-no',
      section: '契約情報',
      label: '証券番号',
      value: '01848019-004-001',
      confidence: 96,
      required: true,
      bbox: { top: 14.8, left: 56.5, width: 24.5, height: 2.0 }
    },
    {
      id: 'f-contractor-name',
      section: '契約情報',
      label: 'ご契約者氏名',
      value: '山田 太郎',
      confidence: 91,
      required: true,
      bbox: { top: 18.6, left: 38.5, width: 18.5, height: 2.0 },
      modelAlternatives: ['山田 太朗', '山田太郎']
    },
    {
      id: 'f-contractor-kana',
      section: '契約情報',
      label: 'ご契約者氏名（カナ）',
      value: 'ヤマダタロウ',
      confidence: 78,
      required: true,
      bbox: { top: 21.8, left: 38.5, width: 20.5, height: 2.0 }
    },
    {
      id: 'f-insured-name',
      section: '被保険者情報',
      label: '被保険者氏名',
      value: '山田 花子',
      confidence: 94,
      required: true,
      bbox: { top: 29.2, left: 38.5, width: 18.5, height: 2.0 }
    },
    {
      id: 'f-birth-date',
      section: '被保険者情報',
      label: '生年月日',
      value: '1985-03-15',
      confidence: 89,
      required: true,
      bbox: { top: 36.8, left: 38.5, width: 15.5, height: 2.0 }
    },
    {
      id: 'f-address',
      section: '被保険者情報',
      label: '住所',
      value: '東京都千代田区千代田1-1',
      confidence: 72,
      required: true,
      bbox: { top: 43.2, left: 38.5, width: 38.5, height: 2.2 }
    },
    {
      id: 'f-illness',
      section: '請求内容',
      label: '事故・傷病名',
      value: '急性虫垂炎',
      confidence: 86,
      required: true,
      bbox: { top: 52.4, left: 38.5, width: 22.5, height: 2.0 },
      modelAlternatives: ['急性虫垂炎', '急性虫垂炎（術後）']
    },
    {
      id: 'f-admission-date',
      section: '請求内容',
      label: '入院日',
      value: '2025-09-20',
      confidence: 88,
      required: true,
      bbox: { top: 59.6, left: 38.5, width: 13.5, height: 2.0 }
    },
    {
      id: 'f-discharge-date',
      section: '請求内容',
      label: '退院日',
      value: '2025-09-28',
      confidence: 91,
      required: false,
      bbox: { top: 59.6, left: 58.5, width: 13.5, height: 2.0 }
    },
    {
      id: 'f-bank-name',
      section: '振込先',
      label: '金融機関名',
      value: 'みずほ銀行',
      confidence: 94,
      required: true,
      bbox: { top: 71.8, left: 38.5, width: 19.5, height: 2.0 }
    },
    {
      id: 'f-account-no',
      section: '振込先',
      label: '口座番号',
      value: '1234567',
      confidence: 91,
      required: true,
      bbox: { top: 78.6, left: 51.5, width: 13.5, height: 2.0 }
    },
    {
      id: 'f-form-date',
      section: 'その他',
      label: '記入日',
      value: '2025-10-13',
      confidence: 97,
      required: true,
      bbox: { top: 89.8, left: 73.5, width: 13.5, height: 1.8 }
    }
  ]
}

function createStandardizationReview(
  status: OcrStandardizationReview['status'],
  needsReview: boolean,
  reason: string,
  overrides: Partial<Omit<OcrStandardizationReview, 'status' | 'needsReview' | 'reason'>> = {}
): OcrStandardizationReview {
  return {
    status,
    needsReview,
    confidence: 0.9,
    reason,
    notesForAssessor: '',
    reviewReasons: [],
    alternatives: [],
    proposedName: '',
    splitItems: [],
    shouldWriteBack: false,
    targets: [],
    groupId: '',
    ...overrides
  }
}

function createPhase4MasterStandardizationFields(needsReview: boolean): OcrExtractionField[] {
  const drugRows = [
    {
      name: 'ティーエスワン配合カプセルT20',
      generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
      genericEn: 'Tegafur Gimeracil Oteracil Potassium',
      atc: 'L01BC53',
      efficacy: '4229',
      yjcode: '4229101M1033',
      dateFrom: '2014-03-18',
      dateTo: '',
      score: 96,
      label: 'マスタ推奨'
    },
    {
      name: 'ティーエスワン配合カプセルT25',
      generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
      genericEn: 'Tegafur Gimeracil Oteracil Potassium',
      atc: 'L01BC53',
      efficacy: '4229',
      yjcode: '4229101M2030',
      dateFrom: '2014-03-18',
      dateTo: '',
      score: 90,
      label: 'マスタ候補'
    },
    {
      name: 'ティーエスワン配合顆粒T20',
      generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
      genericEn: 'Tegafur Gimeracil Oteracil Potassium',
      atc: 'L01BC53',
      efficacy: '4229',
      yjcode: '4229101D1025',
      dateFrom: '2014-03-18',
      dateTo: '',
      score: 86,
      label: 'マスタ候補'
    },
    {
      name: 'ティーエスワン配合OD錠T20',
      generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
      genericEn: 'Tegafur Gimeracil Oteracil Potassium',
      atc: 'L01BC53',
      efficacy: '4229',
      yjcode: '4229101F1026',
      dateFrom: '2014-03-18',
      dateTo: '',
      score: 83,
      label: 'マスタ候補'
    },
    {
      name: 'ティーエスワン配合顆粒T25',
      generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
      genericEn: 'Tegafur Gimeracil Oteracil Potassium',
      atc: 'L01BC53',
      efficacy: '4229',
      yjcode: '4229101D2021',
      dateFrom: '2014-03-18',
      dateTo: '',
      score: 80,
      label: 'マスタ候補'
    }
  ]
  const recommended = drugRows[0]
  const candidateOptions: OcrMasterMatchCandidate[] = drugRows.map((row, index) => ({
    value: row.name,
    sourceRecordId: `DRUG-${row.yjcode}`,
    strategy: 'hybrid',
    sourceLabel: row.label,
    score: row.score,
    selectable: true,
    isMaster: index === 0,
    selection: null,
    masterValues: {
      'DRUG.BRANDNAME': row.name,
      'DRUG.GENERICNAME': row.generic,
      'DRUG.GENERICNAMEEN': row.genericEn,
      'DRUG.ATC': row.atc,
      'DRUG.EFFICACY': row.efficacy,
      'DRUG.YJCODE': row.yjcode,
      'DRUG.DATEFROM': row.dateFrom,
      'DRUG.DATETO': row.dateTo
    },
    similarityScore: row.score,
    linkedValues: {
      'p4-io-drug-name': row.name,
      'p4-in-drug-generic': row.generic,
      'p4-out-drug-atc': row.atc,
      'p4-out-drug-efficacy': row.efficacy,
      'p4-io-drug-yjcode': row.yjcode
    },
    whyNot: index === 0 ? undefined : '主入力の規格・剤形と完全一致しない候補です'
  }))
  const recommendedMaster = candidateOptions[0]
  const alternativeCandidates = candidateOptions.slice(1, MASTER_MATCH_SIMILARITY_TOP_N)
  const review = createStandardizationReview(
    'MATCHED',
    needsReview,
    needsReview
      ? '商品名から同一の薬剤行を推定しました。候補を確認してください。'
      : '商品名が同一の薬剤行に一致しました。',
    {
      confidence: 0.9,
      notesForAssessor: needsReview ? '入力欄の OCR 抽出値と推奨する薬剤行を確認してください。' : '',
      reviewReasons: needsReview
        ? [
            { code: 'MULTIPLE_CANDIDATES', message: '規格の異なる薬剤候補が複数あります。' },
            { code: 'AMBIGUOUS_CORRECTION', message: '剤形・規格の表記ゆれにより候補を1件に決められません。' }
          ]
        : [],
      alternatives: needsReview ? drugRows.slice(1).map((row) => ({ value: row.name, whyNot: '主入力の規格・剤形と完全一致しない候補です', score: row.score })) : [],
      proposedName: '',
      shouldWriteBack: true,
      targets: ['商品名', '一般名', 'ATC分類', '薬効分類', '薬価基準コード']
    }
  )
  const autoProps = needsReview
    ? {}
    : {
        masterAutoAdopted: true,
        masterMatchStrategy: 'hybrid' as const,
        masterMatchSimilarity: recommended.score,
        masterMatchedValue: recommended.name
      }
  const targetValues = needsReview
    ? {
        name: 'ティーエスワン配合カプセルT20 1C',
        generic: 'テガフール・ギメラシル・オテラシルカリウム配合剤',
        atc: 'L00',
        efficacy: '0000',
        yjcode: '4229101M0000'
      }
    : {
        name: recommended.name,
        generic: recommended.generic,
        atc: recommended.atc,
        efficacy: recommended.efficacy,
        yjcode: recommended.yjcode
      }

  return [
    {
      id: 'p4-in-drug-generic',
      section: '照合項目',
      label: '一般名',
      value: targetValues.generic,
      ocrOriginalValue: targetValues.generic,
      confidence: 95,
      required: false,
      memberMode: 'INPUT',
      standardizationItemId: 'p4-drug-item-1',
      bbox: { top: 54, left: 32, width: 28, height: 2.2 }
    },
    {
      id: 'p4-io-drug-yjcode',
      section: '照合項目',
      label: '薬価基準コード',
      value: targetValues.yjcode,
      ocrOriginalValue: '4229101M0000',
      confidence: 95,
      required: false,
      memberMode: 'OUTPUT',
      standardizationItemId: 'p4-drug-item-1',
      masterMatchLinkedTo: 'p4-io-drug-name',
      standardizationAutoApplied: !needsReview,
      masterSelection: recommendedMaster.selection,
      masterValuesSnapshot: recommendedMaster.masterValues,
      bbox: { top: 57, left: 32, width: 28, height: 2.2 }
    },
    {
      id: 'p4-io-drug-name',
      section: '照合項目',
      label: '商品名',
      value: targetValues.name,
      ocrOriginalValue: 'ティーエスワン配合カプセルT20 1C',
      confidence: 96,
      required: true,
      memberMode: 'INPUT_OUTPUT',
      standardizationItemId: 'p4-drug-item-1',
      masterDataId: 'master-medicine-info',
      apiStandardizationApplied: true,
      ...(needsReview ? { masterMatchConfirmRule: 'low-similarity' as const } : autoProps),
      standardizationAutoApplied: !needsReview,
      masterSelection: recommendedMaster.selection,
      masterValuesSnapshot: recommendedMaster.masterValues,
      masterRecommendation: recommendedMaster,
      standardizationReview: review,
      masterMatchCandidates: alternativeCandidates,
      bbox: { top: 60, left: 32, width: 28, height: 2.2 }
    },
    {
      id: 'p4-out-drug-atc',
      section: '照合項目',
      label: 'ATC分類',
      value: targetValues.atc,
      ocrOriginalValue: 'L00',
      confidence: 96,
      required: true,
      memberMode: 'OUTPUT',
      standardizationItemId: 'p4-drug-item-1',
      masterMatchLinkedTo: 'p4-io-drug-name',
      standardizationAutoApplied: !needsReview,
      ...(needsReview ? {} : { masterAutoAdopted: true, masterMatchStrategy: 'hybrid' as const, masterMatchSimilarity: recommended.score }),
      masterSelection: recommendedMaster.selection,
      masterValuesSnapshot: recommendedMaster.masterValues,
      bbox: { top: 63, left: 32, width: 28, height: 2.2 }
    },
    {
      id: 'p4-out-drug-efficacy',
      section: '照合項目',
      label: '薬効分類',
      value: targetValues.efficacy,
      ocrOriginalValue: '0000',
      confidence: 96,
      required: false,
      memberMode: 'OUTPUT',
      standardizationItemId: 'p4-drug-item-1',
      masterMatchLinkedTo: 'p4-io-drug-name',
      standardizationAutoApplied: !needsReview,
      ...(needsReview ? {} : { masterAutoAdopted: true, masterMatchStrategy: 'hybrid' as const, masterMatchSimilarity: recommended.score }),
      masterSelection: recommendedMaster.selection,
      masterValuesSnapshot: recommendedMaster.masterValues,
      bbox: { top: 66, left: 32, width: 28, height: 2.2 }
    }
  ]
}

function createPhase4StatusFields(): OcrExtractionField[] {
  const diseaseSelection = {
    object: 'CWF_ICD10MstAlias__c',
    recordType: 'ALIAS',
    recordId: 'ICD10-1型糖尿病',
    name: '1型糖尿病'
  }
  const diagnosisCandidates: OcrMasterMatchCandidate[] = [
    {
      value: '1型糖尿病',
      strategy: 'hybrid',
      sourceLabel: 'マスタ推奨',
      score: 91,
      selectable: true,
      isMaster: true,
      selection: diseaseSelection,
      linkedValues: { 'p4-split-auto': '1型糖尿病', 'p4-split-review': '1型糖尿病' },
      similarityScore: 91
    },
    {
      value: '2型糖尿病',
      strategy: 'hybrid',
      sourceLabel: 'マスタ候補',
      score: 84,
      selectable: true,
      isMaster: false,
      selection: { object: 'CWF_ICD10MstAlias__c', recordType: 'ALIAS', recordId: 'ICD10-2型糖尿病', name: '2型糖尿病' },
      linkedValues: { 'p4-split-auto': '2型糖尿病', 'p4-split-review': '2型糖尿病' },
      similarityScore: 84
    }
  ]
  const recommendedDiagnosis = diagnosisCandidates[0]
  const alternativeDiagnosisCandidates = diagnosisCandidates.slice(1, 1 + MASTER_MATCH_SIMILARITY_TOP_N)
  const splitCandidates = (fieldId: string): OcrMasterMatchCandidate[] => [
    ...[recommendedDiagnosis, ...alternativeDiagnosisCandidates].map((candidate) => ({
      ...candidate,
      primary: true,
      linkedValues: { [fieldId]: candidate.value }
    })),
    ...[
      { value: '糖尿病性腎症', score: 86, recommended: true },
      { value: '糖尿病性腎障害', score: 82, recommended: false }
    ].map(({ value, score, recommended }) => ({
      value,
      score,
      strategy: 'hybrid' as const,
      type: recommended ? 'recommended' as const : 'candidate' as const,
      primary: false,
      selectable: true,
      linkedValues: { [fieldId]: value }
    }))
  ]
  return [
    {
      id: 'p4-split-auto',
      section: '状態別',
      label: '傷病名',
      value: '1型糖尿病',
      ocrOriginalValue: '1型糖尿病および糖尿病性腎症',
      confidence: 94,
      required: true,
      apiStandardizationApplied: true,
      masterAutoAdopted: true,
      masterMatchStrategy: 'hybrid',
      masterMatchSimilarity: recommendedDiagnosis.score,
      masterMatchedValue: recommendedDiagnosis.value,
      standardizationAutoApplied: true,
      masterSelection: diseaseSelection,
      masterMatchCandidates: splitCandidates('p4-split-auto'),
      standardizationReview: createStandardizationReview('SPLIT', false, '主要素を確定しました。追加要素も候補から選択できます。', {
        confidence: 0.93,
        shouldWriteBack: true,
        splitItems: [
          { text: '1型糖尿病', primary: true, matchedMaster: '1型糖尿病' },
          { text: '糖尿病性腎症', primary: false, matchedMaster: '糖尿病性腎症' }
        ],
        targets: ['傷病名']
      }),
      bbox: { top: 75, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-split-review',
      section: '状態別',
      label: '傷病名',
      value: '1型糖尿病',
      ocrOriginalValue: '1型糖尿病および糖尿病性腎症',
      confidence: 91,
      required: true,
      masterDataId: 'master-disease',
      masterMatchConfirmRule: 'low-similarity',
      apiStandardizationApplied: true,
      masterMatchCandidates: splitCandidates('p4-split-review'),
      standardizationReview: createStandardizationReview('SPLIT', true, '複数の傷病名に分割されました。主要素を確認してください。', {
        confidence: 0.72,
        shouldWriteBack: true,
        reviewReasons: [{ code: 'SPLIT_NOT_CONFIRMED', message: '分割後の各要素の照合結果を確定できません。' }],
        alternatives: [{ value: '2型糖尿病', whyNot: '主入力との一致度が低い候補です', score: 84 }],
        splitItems: [
          { text: '1型糖尿病', primary: true, matchedMaster: '1型糖尿病' },
          { text: '糖尿病性腎症', primary: false, matchedMaster: '糖尿病性腎症' }
        ],
        targets: ['傷病名']
      }),
      bbox: { top: 78, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-not-applicable-auto',
      section: '状態別',
      label: '打撲',
      value: '打撲',
      ocrOriginalValue: '打撲',
      confidence: 93,
      required: false,
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview('NOT_APPLICABLE', false, '傷病名の標準化対象ではない記載です。OCR 抽出値を保持します。', {
        confidence: 0.96,
        targets: []
      }),
      bbox: { top: 81, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-not-applicable-review',
      section: '状態別',
      label: '検査',
      value: '血液検査',
      ocrOriginalValue: '血液検査',
      confidence: 88,
      required: false,
      masterDataId: 'master-disease',
      masterMatchConfirmRule: 'empty-result',
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview('NOT_APPLICABLE', true, '標準化対象外の可能性があります。確認してください。', {
        confidence: 0.58,
        reviewReasons: [{ code: 'BUSINESS_POLICY', message: '傷病名欄に検査名が記載されています。' }],
        proposedName: '',
        targets: []
      }),
      bbox: { top: 84, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-new-candidate',
      section: '状態別',
      label: '傷病名',
      value: '自己炎症症候群',
      ocrOriginalValue: '自己炎症症候群',
      confidence: 89,
      required: true,
      masterDataId: 'master-disease',
      masterMatchConfirmRule: 'empty-result',
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview('NEW_CANDIDATE', true, '主データに一致する行がありません。新規登録候補を確認してください。', {
        confidence: 0.69,
        reviewReasons: [
          { code: 'NEW_CANDIDATE', message: '主データに一致する行がないため、新規登録候補です。' },
          { code: 'MASTER_NOT_FOUND', message: '名称に対応する主データレコードが見つかりません。' }
        ],
        proposedName: '自己炎症症候群',
        targets: ['傷病名']
      }),
      bbox: { top: 87, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-unresolved',
      section: '状態別',
      label: '傷病名',
      value: '四肢のしびれ',
      ocrOriginalValue: '四肢のしびれ',
      confidence: 86,
      required: true,
      masterDataId: 'master-disease',
      masterMatchConfirmRule: 'low-similarity',
      apiStandardizationApplied: true,
      masterMatchCandidates: [
        { value: '末梢神経障害', strategy: 'hybrid', sourceLabel: 'マスタ候補', score: 72, selectable: true, linkedValues: { 'p4-unresolved': '末梢神経障害' }, similarityScore: 72 },
        { value: 'しびれ', strategy: 'hybrid', sourceLabel: 'マスタ候補', score: 68, selectable: true, linkedValues: { 'p4-unresolved': 'しびれ' }, similarityScore: 68 }
      ],
      standardizationReview: createStandardizationReview('UNRESOLVED', true, '主データ行を判断できません。候補を確認してください。', {
        confidence: 0.42,
        shouldWriteBack: true,
        reviewReasons: [
          { code: 'UNRESOLVED', message: '一致する主データ行を判断できません。' },
          { code: 'LOW_CONFIDENCE', message: '複数候補のスコアが近く、自動確定できません。' }
        ],
        alternatives: [
          { value: '末梢神経障害', whyNot: '主入力との一致度が低い候補です', score: 72 },
          { value: 'しびれ', whyNot: '主入力との一致度が低い候補です', score: 68 }
        ],
        targets: ['傷病名']
      }),
      bbox: { top: 90, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-no-target',
      section: '状態別',
      label: '支払方法',
      value: '現金',
      ocrOriginalValue: '現金',
      confidence: 96,
      required: false,
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview('NOT_APPLICABLE', false, '主データ照合の対象外です。OCR 抽出値を保持します。', {
        confidence: 0.97,
        targets: []
      }),
      bbox: { top: 93, left: 32, width: 32, height: 2.2 }
    }
  ]
}

function createPhase4ExceptionFields(): OcrExtractionField[] {
  const candidate = (value: string, label = 'マスタ候補', fieldId = 'p4-ambiguous-source'): OcrMasterMatchCandidate => ({
    value,
    strategy: 'hybrid',
    sourceLabel: label,
    score: 76,
    selectable: true,
    isMaster: false,
    linkedValues: { [fieldId]: value },
    similarityScore: 76
  })
  return [
    {
      id: 'p4-ambiguous-source',
      section: '例外',
      label: '薬剤名',
      value: 'ティーエスワンT20',
      ocrOriginalValue: 'ティーエスワンT20',
      confidence: 92,
      required: true,
      masterDataId: 'master-medicine-info',
      masterMatchConfirmRule: 'low-similarity',
      writeSourceOptions: [
        { id: 'F2', label: '診断書-1・商品名' },
        { id: 'F3', label: '診断書-2・商品名' }
      ],
      apiStandardizationApplied: true,
      masterRecommendation: { ...candidate('ティーエスワン配合カプセルT20', 'マスタ推奨'), isMaster: true },
      masterMatchCandidates: [candidate('ティーエスワン配合顆粒T20')],
      standardizationReview: createStandardizationReview('MATCHED', true, '書き込み先の商品名が複数の診断書にあり、1つに決められません。', {
        confidence: 0.61,
        shouldWriteBack: true,
        reviewReasons: [{ code: 'AMBIGUOUS_SOURCE', message: '書き込み先のファイルを確認してください。' }],
        targets: ['商品名']
      }),
      bbox: { top: 72, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-write-conflict',
      section: '例外',
      label: '薬効分類',
      value: '0000',
      ocrOriginalValue: '0000',
      confidence: 93,
      required: true,
      masterDataId: 'master-medicine-info',
      masterMatchConfirmRule: 'low-similarity',
      apiStandardizationApplied: true,
      masterRecommendation: { ...candidate('4229', 'マスタ推奨', 'p4-write-conflict'), isMaster: true },
      masterMatchCandidates: [candidate('4228', 'マスタ候補', 'p4-write-conflict')],
      standardizationReview: createStandardizationReview('MATCHED', true, '同じ項目が別の照合グループからも反映されています。', {
        confidence: 0.64,
        reviewReasons: [{ code: 'WRITE_CONFLICT', message: '同じ反映位置に複数の照合グループが設定されています。' }],
        targets: ['薬効分類']
      }),
      bbox: { top: 75, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-invalid-group',
      section: '例外',
      label: '傷病名',
      value: '胃潰瘍',
      ocrOriginalValue: '胃潰瘍',
      confidence: 92,
      required: true,
      masterDataId: 'master-disease',
      masterMatchError: 'マスタ照合に失敗しました',
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview('UNRESOLVED', true, '照合グループの設定が無効なため、結果を確定できません。', {
        confidence: 0,
        reviewReasons: [{ code: 'INVALID_GROUP', message: '照合グループの設定が無効です。' }],
        targets: ['傷病名']
      }),
      bbox: { top: 81, left: 32, width: 32, height: 2.2 }
    },
    {
      id: 'p4-invalid-needs-review',
      section: '例外',
      label: '傷病名',
      value: '胆嚢炎',
      ocrOriginalValue: '胆嚢炎',
      confidence: 88,
      required: true,
      apiStandardizationApplied: true,
      standardizationReview: createStandardizationReview(
        'UNRESOLVED',
        false,
        '書き込み先を特定できないため、OCR 抽出値を保持します。',
        {
          shouldWriteBack: false,
          reviewReasons: [],
          targets: []
        }
      ),
      bbox: { top: 84, left: 32, width: 32, height: 2.2 }
    }
  ]
}

const RICH_TASKS: Record<string, Omit<OcrExtractionTaskDetail, 'taskId'>> = {
  'TASK-OCR-001': {
    caseId: 'CLAIM-20251024000003',
    caseOrigin: 'REQ-2025-0018908',
    sourceFolderName: '田中花子_手術請求',
    pages: [
      {
        id: 'page-phase4-master-standardization-review',
        docType: '申請書-1',
        fileName: '',
        imageUrl: MOCK_SAMPLE_MEDIA_URL,
        pageCount: 1,
        fields: [
          ...createPhase4MasterStandardizationFields(true),
          ...createPhase4StatusFields().filter((field) => field.standardizationReview?.needsReview !== false),
          ...createPhase4ExceptionFields()
        ],
        tables: [{
          id: 'p4-medication-table',
          label: '薬剤明細',
          section: '明細',
          columns: [
            { id: 'drug-name', label: '薬剤名' },
            { id: 'drug-code', label: '薬剤コード' }
          ],
          rows: [
            { 'drug-name': 'アスピリン腸溶錠', 'drug-code': '000000' },
            { 'drug-name': '胃薬A', 'drug-code': '未照合' }
          ],
          cellMetadata: {
            '1:drug-name': {
              masterMatch: true,
              masterMatches: { 胃薬A: '胃薬標準錠10mg' }
            }
          }
        }]
      },
      {
        id: 'page-phase4-master-standardization-auto',
        docType: '申請書-2',
        fileName: '',
        imageUrl: MOCK_SAMPLE_MEDIA_URL,
        pageCount: 1,
        fields: [
          ...createPhase4MasterStandardizationFields(false),
          ...createPhase4StatusFields().filter((field) => field.standardizationReview?.needsReview === false)
        ],
        tables: []
      },
      ...['F2', 'F3'].map((id, index) => ({
        id,
        docType: `診断書-${index + 1}`,
        fileName: '',
        imageUrl: MOCK_SAMPLE_MEDIA_URL,
        pageCount: 1,
        fields: [{ id: `${id}-product`, section: '基本情報', label: '商品名', value: 'ティーエスワンT20', ocrOriginalValue: 'ティーエスワンT20', confidence: 92, required: false, bbox: { top: 30, left: 30, width: 35, height: 3 } }],
        tables: []
      }))
    ]
  },
  'TASK-OCR-002': {
    caseId: 'CLAIM-20251022000001',
    caseOrigin: 'REQ-2025-0018865',
    sourceFolderName: '小林直樹_入院請求',
    pages: [
      {
        id: 'page-claim-2',
        docType: '保険金請求書',
        fileName: '',
        imageUrl: MOCK_SAMPLE_MEDIA_URL,
        fields: createClaimFormFields().map((field) => {
          if (field.id === 'f-insured-name') {
            return { ...field, value: '小林 直樹', confidence: 88 }
          }
          if (field.id === 'f-contractor-name') {
            return { ...field, value: '小林 直樹', modelAlternatives: undefined }
          }
          if (field.id === 'f-illness') {
            return { ...field, value: '腰椎ヘルニア', confidence: 81, modelAlternatives: undefined }
          }
          if (field.id === 'f-admission-date') {
            return { ...field, value: '2025-08-12', confidence: 86 }
          }
          if (field.id === 'f-address') {
            return { ...field, value: '神奈川県横浜市西区みなとみらい2-2-1', confidence: 63 }
          }
          if (field.id === 'f-account-no') {
            return { ...field, value: '7654321', confidence: 74 }
          }
          return field
        }),
        tables: []
      }
    ]
  }
}

function normalizeField(field: OcrExtractionField): OcrExtractionField {
  const ocrOriginalValue = field.ocrOriginalValue ?? field.value
  const value =
    field.masterMatchConfirmRule === 'empty-result' && !field.value.trim() && ocrOriginalValue.trim()
      ? ocrOriginalValue
      : field.value

  return {
    ...field,
    value,
    ocrOriginalValue,
    userConfirmed: field.userConfirmed ?? false,
    bbox: { ...field.bbox },
    modelAlternatives: field.modelAlternatives ? [...field.modelAlternatives] : undefined,
    masterMatchCandidates: field.masterMatchCandidates
      ? field.masterMatchCandidates.map((item) => ({
          ...item,
          linkedValues: item.linkedValues ? { ...item.linkedValues } : undefined
        }))
      : undefined,
    masterRecommendation: field.masterRecommendation ? { ...field.masterRecommendation } : undefined,
    masterMatchCodeFieldRefs: field.masterMatchCodeFieldRefs
      ? field.masterMatchCodeFieldRefs.map((item) => ({ ...item }))
      : undefined
  }
}

function cloneTables(tables: OcrExtractionTable[]): OcrExtractionTable[] {
  return tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) => ({ ...column })),
    rows: table.rows.map((row) => ({ ...row })),
    originalRows: (table.originalRows ?? table.rows).map((row) => ({ ...row })),
    cellMetadata: table.cellMetadata ? structuredClone(table.cellMetadata) : undefined
  }))
}

function cloneFields(fields: OcrExtractionField[]): OcrExtractionField[] {
  return fields.map((field) => normalizeField(field))
}

/** 要確認（赤枠）かつ未確認 */
export function getMasterMatchPrimaryField(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): OcrExtractionField {
  if (field.masterMatchLinkedTo) {
    const primary = allFields.find((item) => item.id === field.masterMatchLinkedTo)
    if (primary) return primary
  }
  return field
}

export function getMasterMatchGroupFieldIds(primary: OcrExtractionField): string[] {
  const refs = primary.masterMatchCodeFieldRefs
  if (refs?.length) return refs.map((ref) => ref.fieldId)
  return [primary.id]
}

export function isFieldUserConfirmed(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): boolean {
  const primary = getMasterMatchPrimaryField(field, allFields)
  if (primary.masterMatchConfirmRule && field.masterMatchLinkedTo) {
    return primary.userConfirmed ?? false
  }
  return field.userConfirmed ?? false
}

export function needsFieldReview(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): boolean {
  return getFieldAlert(field, allFields) !== 'none' && !isFieldUserConfirmed(field, allFields)
}

function masterMatchAlertFromRule(rule: MasterMatchConfirmRule): OcrFieldAlert {
  switch (rule) {
    case 'low-similarity':
      return 'master-low-similarity'
    case 'empty-result':
      return 'master-empty-result'
    case 'low-confidence':
      return 'master-low-confidence'
  }
}

export function hasMasterMatchReview(field: OcrExtractionField): boolean {
  return Boolean(field.masterMatchConfirmRule) && !field.masterAutoAdopted && getMasterMatchDropdownOptions(field).some(item => item.strategy !== 'ocr')
}

export function getFieldAlert(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): OcrFieldAlert {
  const primary = getMasterMatchPrimaryField(field, allFields)
  if (primary.standardizationReview?.needsReview) return 'master-low-similarity'
  if (!primary.standardizationReview && (field.masterMatchError || primary.masterMatchError))return 'master-execution-error'
  if (!primary.standardizationReview && primary.masterMatchConfirmRule && primary.masterReviewEnabled!==false && !primary.masterAutoAdopted && (primary.masterDataId || getMasterMatchDropdownOptions(primary, allFields).some(item => item.strategy !== 'ocr'))) {
    return masterMatchAlertFromRule(primary.masterMatchConfirmRule)
  }
  const hasMasterValue=!!field.masterMatchStrategy&&field.masterMatchStrategy!=='ocr'
  if (!hasMasterValue && !field.masterAutoAdopted && field.modelAlternatives?.length) return 'model-conflict'
  if (field.valueOutOfRange) return 'value-out-of-range'
  if (!field.value.trim() && field.required) return 'required-empty'
  if (!hasMasterValue && !field.masterAutoAdopted && field.confidence < OCR_CONFIDENCE_THRESHOLD) return 'low-confidence'
  return 'none'
}

export function hasModelConflict(field: OcrExtractionField): boolean {
  return Boolean(field.modelAlternatives?.length)
}

export function getModelResultOptions(field: OcrExtractionField): string[] {
  const options = [field.value, ...(field.modelAlternatives ?? [])]
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(options)]
}

/** OCR 抽出原始値 */
export function getOcrExtractedValue(field: OcrExtractionField): string {
  return (field.ocrOriginalValue ?? field.value).trim()
}

function buildOcrLinkedValues(
  primary: OcrExtractionField,
  allFields: OcrExtractionField[]
): Record<string, string> {
  const linkedValues: Record<string, string> = {}
  for (const fieldId of getMasterMatchGroupFieldIds(primary)) {
    const source = allFields.find((item) => item.id === fieldId)
    if (source) linkedValues[fieldId] = getOcrExtractedValue(source)
  }
  return linkedValues
}

export function applyMasterMatchSelection(
  allFields: OcrExtractionField[],
  candidate: OcrMasterMatchCandidate
): void {
  const linkedValues = candidate.linkedValues
  if (linkedValues && Object.keys(linkedValues).length > 0) {
    for (const [fieldId, value] of Object.entries(linkedValues)) {
      const target = allFields.find((item) => item.id === fieldId)
      if (target) {
        target.masterAutoAdopted=false
        target.masterHierarchyOfficial=candidate.hierarchyOfficial
        target.masterHierarchyLevel=candidate.hierarchyLevel
        target.masterHierarchyPath=candidate.hierarchyPath
        target.masterMatchStrategy=candidate.strategy
        target.masterMatchSimilarity=candidate.similarityScore
        target.masterSelection=candidate.selection ?? target.masterSelection
        target.masterValuesSnapshot=candidate.masterValues ?? target.masterValuesSnapshot
        if (target.memberMode !== 'INPUT') target.value = value
        target.userConfirmed = false
        target.standardizationAutoApplied = false
      }
    }
    return
  }

  const target = allFields.find((item) =>
    getMasterMatchDropdownOptions(item, allFields).some(
      (option) => option.value === candidate.value && option.strategy === candidate.strategy
    )
  )
  if (target) {
    target.masterAutoAdopted=false
        target.masterHierarchyOfficial=candidate.hierarchyOfficial
        target.masterHierarchyLevel=candidate.hierarchyLevel
        target.masterHierarchyPath=candidate.hierarchyPath
        target.masterMatchStrategy=candidate.strategy
        target.masterMatchSimilarity=candidate.similarityScore
    target.masterSelection=candidate.selection ?? target.masterSelection
    target.masterValuesSnapshot=candidate.masterValues ?? target.masterValuesSnapshot
    target.value = candidate.value
    target.userConfirmed = false
    target.standardizationAutoApplied = false
  }
}

export function restoreMasterMatchGroup(
  field: OcrExtractionField,
  allFields: OcrExtractionField[]
): void {
  const primary=getMasterMatchPrimaryField(field,allFields)
  const groupIds = new Set([
    ...getMasterMatchGroupFieldIds(primary),
    ...allFields.filter((item) => item.masterMatchLinkedTo === primary.id).map((item) => item.id)
  ])
  for(const id of groupIds){
    const target=allFields.find(member=>member.id===id)
    if(!target)continue
    delete target.masterAutoAdopted
    delete target.masterHierarchyOfficial
    delete target.masterHierarchyLevel
    delete target.masterHierarchyPath
    delete target.masterMatchStrategy
    delete target.masterMatchSimilarity
    delete target.masterSelection
    delete target.masterValuesSnapshot
    target.standardizationAutoApplied = false
    target.value=target.ocrOriginalValue??target.value
    target.userConfirmed=false
  }
}

export function toggleMasterMatchGroupConfirm(
  field: OcrExtractionField,
  allFields: OcrExtractionField[]
): void {
  const primary = getMasterMatchPrimaryField(field, allFields)
  if (!primary.masterMatchConfirmRule) {
    field.userConfirmed = !(field.userConfirmed ?? false)
    return
  }

  const next = !(primary.userConfirmed ?? false)
  const groupIds = new Set([
    ...getMasterMatchGroupFieldIds(primary),
    ...allFields.filter((item) => item.masterMatchLinkedTo === primary.id).map((item) => item.id)
  ])
  for (const fieldId of groupIds) {
    const target = allFields.find((item) => item.id === fieldId)
    if (target) target.userConfirmed = next
  }
}

export function isMasterMatchGroupRestored(
  field: OcrExtractionField,
  allFields: OcrExtractionField[]
): boolean {
  const primary=getMasterMatchPrimaryField(field,allFields)
  const groupIds = new Set([
    ...getMasterMatchGroupFieldIds(primary),
    ...allFields.filter((item) => item.masterMatchLinkedTo === primary.id).map((item) => item.id)
  ])
  return [...groupIds].every(id=>{
    const target=allFields.find(member=>member.id===id)
    return !target||target.value===(target.ocrOriginalValue??target.value)
  })
}

/** Master 照合候補：code 検索を先頭、混合检索按相似度取 Top N */
export function getSortedMasterMatchCandidates(
  field: OcrExtractionField
): OcrMasterMatchCandidate[] {
  const list = [...new Map((field.masterMatchCandidates ?? []).map(item=>[`${item.strategy}:${item.value}:${JSON.stringify(item.linkedValues||{})}`,item])).values()]
  const exact = list.filter(item=>item.strategy==='code')
  const codeItems = exact
  const hybridItems = list
    .filter((item) => item.strategy === 'hybrid')
    .sort(compareSimilarityCandidates)
  return [
    ...codeItems,
    ...hybridItems,
    ...list.filter(item => item.strategy === 'parent' || item.strategy === 'match')
  ].slice(0, MASTER_MATCH_SIMILARITY_TOP_N)
}

/**
 * v1.2 の候補を再現する。master は必ず一覧に含め、全体を maxCandidates 件までにする。
 * API は master を含む candidates を needsReview の値にかかわらず返す。
 */
export function getStandardizationApiCandidates(
  field: OcrExtractionField,
  maxCandidates = MASTER_MATCH_SIMILARITY_TOP_N
): OcrMasterMatchCandidate[] {
  const source = field.masterRecommendation
    ? field
    : field.masterMatchLinkedTo
      ? field
      : field
  const results: OcrMasterMatchCandidate[] = []
  const seen = new Set<string>()

  const push = (candidate: OcrMasterMatchCandidate | undefined) => {
    if (!candidate) return
    const key = candidate.selection?.recordId
      ?? candidate.sourceRecordId
      ?? `${candidate.strategy}:${candidate.value}`
    if (seen.has(key)) return
    seen.add(key)
    results.push({ ...candidate })
  }

  if (source.masterRecommendation) {
    push({
      ...source.masterRecommendation,
      isMaster: true,
      sourceLabel: source.masterRecommendation.sourceLabel || 'マスタ推奨'
    })
  }
  for (const candidate of source.masterMatchCandidates ?? []) {
    push({
      ...candidate,
      isMaster: candidate.isMaster === true,
      sourceLabel: candidate.sourceLabel || 'マスタ候補'
    })
  }

  return results.slice(0, Math.max(1, maxCandidates))
}

/** Mock of the proposed confirmation-page response. */
export function getStandardizationPresentation(field: OcrExtractionField) {
  const review = field.standardizationReview
  if (!review) return undefined

  const masterDataMatches = getStandardizationApiCandidates(field).map((match) => ({
    ...match,
    type: match.type ?? (match.isMaster ? 'recommended' as const : 'candidate' as const),
    label: t(match.type === 'recommended' || match.isMaster ? 'tasks.ocr.masterRecommended' : 'tasks.ocr.masterCandidate'),
    confidence: match.confidence ?? match.score ?? match.similarityScore
  }))
  return {
    needsReview: review.needsReview,
    shouldWriteBack: review.shouldWriteBack,
    masterDataMatches,
    reviewReason: review.reviewReasons[0]?.message ?? '',
    remarks: [
      { label: t('tasks.ocr.proposedName'), value: review.proposedName },
      { label: t('tasks.ocr.reviewBasis'), value: review.reason },
      { label: t('tasks.ocr.confirmMemo'), value: review.notesForAssessor }
    ].filter((remark) => remark.value)
  }
}

/** Master 照合要確認フィールドのドロップダウン候補 */
export function getMasterMatchDropdownOptions(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): OcrMasterMatchCandidate[] {
  const primary = getMasterMatchPrimaryField(field, allFields)
  const rule = primary.masterMatchConfirmRule
  if (!rule && !primary.masterRecommendation && !primary.masterMatchStrategy && !primary.masterMatchCandidates?.length) return []

  const ocrDisplay = getOcrExtractedValue(field)
  const seen = new Set<string>()
  const options: OcrMasterMatchCandidate[] = []

  const pushCandidate = (candidate: OcrMasterMatchCandidate) => {
    const groupIds=getMasterMatchGroupFieldIds(primary)
    const trimmed = groupIds.length>1&&candidate.linkedValues?groupIds.map(id=>candidate.linkedValues?.[id]?.trim()||'（空欄）').join('-'):(candidate.linkedValues?.[field.id] ?? candidate.value).trim()
    const identityKey = candidate.selection?.recordId ?? candidate.sourceRecordId ?? candidate.strategy
    const key = `${identityKey}:${trimmed}`
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    options.push({
      ...candidate,
      value: trimmed,
      linkedValues: candidate.linkedValues ? { ...candidate.linkedValues } : undefined
    })
  }

  const presentation = getStandardizationPresentation(primary)
  if (presentation) {
    if (!presentation.masterDataMatches.some((match) => match.selectable !== false)) return []
    for (const match of presentation.masterDataMatches) pushCandidate(match)
    return options
  }

  if (rule === 'low-confidence') {
    if (ocrDisplay) {
      pushCandidate({
        strategy: 'ocr',
        value: ocrDisplay,
        linkedValues: { [field.id]: ocrDisplay }
      })
    }
    for (const candidate of getStandardizationApiCandidates(primary)) pushCandidate(candidate)
    return options
  }

  if (rule === 'low-similarity') {
    const ocrLinkedValues = buildOcrLinkedValues(primary, allFields)
    if (ocrDisplay) {
      pushCandidate({
        strategy: 'ocr',
        value: ocrDisplay,
        linkedValues: ocrLinkedValues
      })
    }
    for (const candidate of getStandardizationApiCandidates(primary)) pushCandidate(candidate)
    return options
  }

  for (const candidate of getStandardizationApiCandidates(primary)) pushCandidate(candidate)
  return options
}

export function hasMasterMatchDropdown(
  field: OcrExtractionField,
  allFields: OcrExtractionField[] = []
): boolean {
  const primary = getMasterMatchPrimaryField(field, allFields)
  if (!primary.masterMatchConfirmRule && !primary.masterRecommendation && !primary.masterMatchStrategy && !primary.masterMatchCandidates?.length) return false
  return getMasterMatchDropdownOptions(field, allFields).some(item => item.strategy !== 'ocr')
}

export function getMasterMatchOptionLabel(strategy: OcrMasterMatchSearchStrategy): string {
  switch (strategy) {
    case 'ocr':
      return t('tasks.ocr.masterOption.ocrValue')
    case 'parent':
      return t('phase3.parentMatch')
    case 'match':
      return t('tasks.ocr.masterOption.matchValue')
    case 'code':
      return t('businessRules.docType.options.strategyCode')
    case 'hybrid':
      return t('businessRules.docType.options.strategyHybrid')
  }
}

export type OcrManualReviewRuleKey = Extract<OcrFieldAlert, 'low-confidence' | 'model-conflict' | 'value-out-of-range'> | 'low-confidence-out-of-range'

export function getOcrManualReviewRuleOptions(): { key: OcrManualReviewRuleKey; label: string }[] {
  return [
    { key: 'low-confidence', label: t('tasks.ocr.alerts.lowConfidence') },
    { key: 'model-conflict', label: t('tasks.ocr.alerts.modelConflict') }
  ]
}

/** @deprecated 互換用。新規は getOcrManualReviewRuleOptions() を使用 */
export const OCR_MANUAL_REVIEW_RULE_OPTIONS = getOcrManualReviewRuleOptions()

export function getFieldAlertLabel(alert: OcrFieldAlert): string | null {
  switch (alert) {
    case 'low-confidence':
      return t('tasks.ocr.alerts.lowConfidence')
    case 'model-conflict':
      return t('tasks.ocr.alerts.modelConflict')
    case 'value-out-of-range':
      return t('tasks.ocr.alerts.outOfRange')
    case 'required-empty':
      return t('tasks.ocr.alerts.requiredEmpty')
    case 'master-low-similarity':
    case 'master-empty-result':
    case 'master-low-confidence':
      return null
    case 'master-execution-error':
      return t('phase3.matchExecutionError')
    default:
      return null
  }
}

export function countFieldAlerts(fields: OcrExtractionField[]): Record<OcrFieldAlert, number> {
  const counts: Record<OcrFieldAlert, number> = {
    none: 0,
    'low-confidence': 0,
    'model-conflict': 0,
    'value-out-of-range': 0,
    'required-empty': 0,
    'master-low-similarity': 0,
    'master-empty-result': 0,
    'master-low-confidence': 0,
    'master-execution-error': 0
  }
  fields.forEach((field) => {
    if (needsFieldReview(field, fields)) {
      counts[getFieldAlert(field, fields)] += 1
    }
  })
  return counts
}

export function countPendingReviews(fields: OcrExtractionField[]): number {
  return fields.filter(
    (field) => !field.masterMatchLinkedTo && needsFieldReview(field, fields)
  ).length
}

export function canCompleteOcr(fields: OcrExtractionField[]): boolean {
  return !fields.some((field) => needsFieldReview(field, fields))
}

export function completeBlockReason(fields: OcrExtractionField[]): string {
  const pending = fields.filter((field) => needsFieldReview(field, fields))
  const masterMatch = pending.filter((field) => hasMasterMatchReview(field)).length
  const modelConflict = pending.filter((field) => getFieldAlert(field, fields) === 'model-conflict').length
  const outOfRange = pending.filter((field) => getFieldAlert(field, fields) === 'value-out-of-range').length
  const lowConfidence = pending.filter((field) => getFieldAlert(field, fields) === 'low-confidence').length
  if (masterMatch > 0) {
    return t('tasks.ocr.messages.blockMasterMatch', { count: masterMatch })
  }
  if (modelConflict > 0) {
    return t('tasks.ocr.messages.blockModelConflict', { count: modelConflict })
  }
  if (outOfRange > 0) {
    return t('tasks.ocr.messages.blockOutOfRange', { count: outOfRange })
  }
  if (lowConfidence > 0) {
    return t('tasks.ocr.messages.blockLowConfidence', { count: lowConfidence })
  }
  return ''
}

export function groupFieldsBySection(
  fields: OcrExtractionField[]
): { section: string; fields: OcrExtractionField[] }[] {
  const map = new Map<string, OcrExtractionField[]>()
  fields.forEach((field) => {
    const list = map.get(field.section) ?? []
    list.push(field)
    map.set(field.section, list)
  })
  return Array.from(map.entries()).map(([section, sectionFields]) => ({
    section,
    fields: sectionFields
  }))
}

function withLogicalPageFileNames(
  caseId: string,
  pages: OcrDocumentPage[],
  fallback: { receivedAt: string; fileCount: number; uploadedDocTypes: string[] }
): OcrDocumentPage[] {
  const caseItem = rawMockCaseList.find((item) => item.caseId === caseId)
  const plans = planCaseLogicalFiles({
    caseId,
    receivedAt: caseItem?.receivedAt ?? fallback.receivedAt,
    fileCount: Math.max(caseItem?.fileCount ?? fallback.fileCount, pages.length),
    uploadedDocTypes: caseItem?.uploadedDocTypes ?? fallback.uploadedDocTypes
  })

  return pages.map((page, index) => ({
    ...page,
    fileName: resolveMockFileName(plans[index] ?? plans[0]!)
  }))
}

export function getOcrExtractionTask(taskId: string): OcrExtractionTaskDetail | null {
  const task = getTaskById(taskId)
  if (!task || task.taskType !== 'ocr-extraction') return null

  const rich = RICH_TASKS[taskId]
  if (rich) {
    return {
      taskId,
      ...rich,
      pages: withLogicalPageFileNames(rich.caseId, rich.pages, {
        receivedAt: '2025-10-24',
        fileCount: rich.pages.length,
        uploadedDocTypes: rich.pages.map((page) => page.docType)
      }).map((page) => ({
        ...page,
        fields: cloneFields(page.fields),
        tables: cloneTables(page.tables ?? [])
      }))
    }
  }

  return {
    taskId,
    caseId: task.caseId,
    caseOrigin: task.caseOrigin,
    sourceFolderName: task.sourceFolderName,
    pages: withLogicalPageFileNames(
      task.caseId,
      [
        {
          id: 'page-default',
          docType: '保険金請求書',
          fileName: '',
          imageUrl: MOCK_SAMPLE_MEDIA_URL,
          fields: cloneFields(createClaimFormFields()),
          tables: []
        }
      ],
      {
        receivedAt: '2025-10-24',
        fileCount: 1,
        uploadedDocTypes: ['保険金請求書']
      }
    )
  }
}
