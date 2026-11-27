<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { mockUiText } from '@/i18n/mockUiText'
import { Check, CircleCheck, Search, RefreshLeft } from '@element-plus/icons-vue'
import {
  OCR_CONFIDENCE_THRESHOLD,
  getFieldAlert,
  getFieldAlertLabel,
  getMasterMatchDropdownOptions,
  getModelResultOptions,
  getStandardizationPresentation,
  hasMasterMatchDropdown,
  hasModelConflict,
  isFieldUserConfirmed,
  isMasterMatchGroupRestored,
  needsFieldReview,
  type OcrExtractionField,
  type OcrExtractionTable,
  type OcrFieldAlert,
  type OcrMasterMatchCandidate
} from '@/mocks/ocrExtractionTask'
import { PLACEHOLDER } from '@/constants/placeholders'

const props = defineProps<{
  fields: OcrExtractionField[]
  tables?: OcrExtractionTable[]
  selectedFieldId: string | null
  readonly?: boolean
  restandardizeEligibleFieldIds?: string[]
  restandardizingFieldIds?: string[]
}>()

const tables = computed(() => props.tables ?? [])
const { t } = useI18n()

const tableRowCount = computed(() =>
  tables.value.reduce((sum, table) => sum + table.rows.length, 0)
)

const showReviewOnly = defineModel<boolean>('showReviewOnly', { default: false })
const activeDataTab = ref<'text' | 'table'>('text')

const pendingReviewCount = computed(
  () => props.fields.filter((field) => needsFieldReview(field, props.fields) ).length
)

const displayFields = computed(() =>
  showReviewOnly.value
    ? props.fields.filter((field) => needsFieldReview(field, props.fields) )
    : props.fields
)

const emit = defineEmits<{
  selectField: [fieldId: string]
  updateValue: [fieldId: string, value: string]
  resolveValue: [fieldId: string, value: string]
  selectMasterMatch: [fieldId: string, candidate: OcrMasterMatchCandidate]
  selectWriteSource: [fieldId: string, sourceId: string]
  updateTableCell: [tableId: string, rowIndex: number, columnId: string, value: string]
  restoreTableCell: [tableId: string, rowIndex: number, columnId: string]
  restandardizeTableCell: [tableId: string, rowIndex: number, columnId: string]
  toggleConfirm: [fieldId: string]
  restoreValue: [fieldId: string]
  restandardize: [fieldIds: string[]]
}>()

const scrollRef = ref<HTMLElement | null>(null)
const rowRefs = ref<Record<string, HTMLElement>>({})

const alertClassMap: Record<OcrFieldAlert, string> = {
  none: '',
  'low-confidence': 'is-low-confidence',
  'model-conflict': 'is-model-conflict',
  'value-out-of-range': 'is-value-out-of-range',
  'required-empty': 'is-required-empty',
  'master-low-similarity': 'is-master-match',
  'master-empty-result': 'is-master-match',
  'master-low-confidence': 'is-master-match',
  'master-execution-error': 'is-master-match'
}

function candidateSourceLabel(item: OcrMasterMatchCandidate): string {
  if (item.label) return item.label
  if (item.strategy === 'ocr') return t('tasks.ocr.ocrOriginal')
  return (item.type === 'recommended' || item.isMaster) ? t('tasks.ocr.masterRecommended') : t('tasks.ocr.masterCandidate')
}

function isMasterField(field: OcrExtractionField) {
  return Boolean(
    field.memberMode || field.standardizationReview || field.apiStandardizationApplied ||
    field.standardizationItemId || field.masterDataId || field.masterRecommendation ||
    field.masterMatchCandidates?.length || field.masterMatchConfirmRule ||
    field.masterMatchLinkedTo || field.masterMatchedValue || field.masterMatchStrategy ||
    field.masterValuesSnapshot || field.masterReviewEnabled || field.masterDataColumnId ||
    field.masterCodeColumnId
  )
}
function canRestandardize(field: OcrExtractionField): boolean {
  return !props.readonly
    && isMasterField(field)
    && !field.masterMatchLinkedTo
    && field.memberMode !== 'OUTPUT'
}
function isRestandardizeEligible(fieldId: string): boolean {
  return (props.restandardizeEligibleFieldIds ?? []).includes(fieldId)
}
function isRestandardizing(fieldId: string): boolean {
  return (props.restandardizingFieldIds ?? []).includes(fieldId)
}
function candidateOwner(field: OcrExtractionField): OcrExtractionField | undefined {
  if (field.memberMode === 'INPUT' || field.memberMode === 'OUTPUT') return undefined
  if (!field.standardizationItemId) return field.masterMatchLinkedTo ? undefined : field
  if (field.standardizationReview) return field
  return props.fields.find((member) =>
    member.standardizationItemId === field.standardizationItemId && member.standardizationReview
  )
}

function hasMasterCandidates(field: OcrExtractionField): boolean {
  const owner = candidateOwner(field)
  return Boolean(owner && hasMasterMatchDropdown(owner, props.fields))
}

const expandedCandidates = ref<Record<string,boolean>>({})
watch(()=>props.fields,()=>{expandedCandidates.value={}},{immediate:true})
const batchConfirmSelection = ref(false)
const hasRestandardizableItems = computed(() => activeDataTab.value === 'text'
  ? props.fields.some(canRestandardize)
  : !props.readonly && tables.value.some((table) => table.rows.some((_, rowIndex) =>
    table.columns.some((column) => tableCellMetadata(table, rowIndex, column.id)?.masterMatch)
  ))
)
const eligibleTextRestandardizeFieldIds = computed(() => (props.restandardizeEligibleFieldIds ?? []).filter((fieldId) => {
  const field = props.fields.find((item) => item.id === fieldId)
  return field ? canRestandardize(field) : false
}))
const eligibleTableRestandardizeCells = computed(() => tables.value.flatMap((table) =>
  table.rows.flatMap((_, rowIndex) => table.columns
    .filter((column) => canRestandardizeTableCell(table, rowIndex, column.id))
    .map((column) => ({ tableId: table.id, rowIndex, columnId: column.id })))
))
const eligibleRestandardizeCount = computed(() => eligibleTextRestandardizeFieldIds.value.length + eligibleTableRestandardizeCells.value.length)
function restandardizeOne(fieldId: string) {
  if (!isRestandardizeEligible(fieldId) || isRestandardizing(fieldId)) return
  emit('restandardize', [fieldId])
}
function restandardizeSelected() {
  if (!eligibleRestandardizeCount.value) return
  if (eligibleTextRestandardizeFieldIds.value.length) {
    emit('restandardize', eligibleTextRestandardizeFieldIds.value)
  }
  eligibleTableRestandardizeCells.value.forEach(({ tableId, rowIndex, columnId }) => {
    emit('restandardizeTableCell', tableId, rowIndex, columnId)
  })
}
function candidateKey(item:OcrMasterMatchCandidate){return `${item.strategy}:${item.primary === undefined ? '' : item.primary ? 'primary' : 'additional'}:${item.value}`}
function reviewNeedsConfirmation(field: OcrExtractionField): boolean {
  return getStandardizationPresentation(field)?.needsReview === true
}
function candidates(field: OcrExtractionField) {
  const owner = candidateOwner(field)
  return owner ? getMasterMatchDropdownOptions(owner, props.fields) : []
}
function selectedCandidate(field:OcrExtractionField){
 const owner = candidateOwner(field)
 if (!owner) return undefined
 if (owner.pendingMasterMatch) return owner.pendingMasterMatch
 return candidates(field).find(item=>{
 const values=item.linkedValues||{[owner.id]:item.value}
 return (item.strategy===(owner.masterHierarchyOfficial?'parent':owner.masterMatchStrategy)||item.strategy==='ocr')&&Object.entries(values).every(([id,value])=>(!props.fields.some(member=>member.id===id)||props.fields.find(member=>member.id===id)!.value===value))
})}
function displayedCandidate(field:OcrExtractionField){
 const selected=selectedCandidate(field)
 return selected && selected.strategy !== 'ocr' ? selected
   : candidates(field).find((item) => item.isMaster) ?? candidates(field).find((item) => item.strategy !== 'ocr')
}
function primaryReviewReason(field: OcrExtractionField): string {
  return mockUiText(getStandardizationPresentation(field)?.reviewReason ?? '')
}
function fieldReviewReason(field: OcrExtractionField): string {
  const masterReason = primaryReviewReason(field)
  if (masterReason) return masterReason
  const alert = fieldAlert(field)
  if (alert === 'none' || !needsFieldReview(field, props.fields)) return ''
  return (field.masterMatchError ? mockUiText(field.masterMatchError) : getFieldAlertLabel(alert)) ?? ''
}
function reviewRemarks(field: OcrExtractionField) {
  return getStandardizationPresentation(field)?.remarks ?? []
}
function chooseCandidate(field:OcrExtractionField,key:string){const item=candidates(field).find(item=>candidateKey(item)===key);if(item)emit('selectMasterMatch',field.id,item)}
function chooseWriteSource(field: OcrExtractionField, sourceId: string) {
  const owner = candidateOwner(field)
  if (owner) emit('selectWriteSource', owner.id, sourceId)
}
function tableCellMetadata(table: OcrExtractionTable, rowIndex: number, columnId: string) {
  return table.cellMetadata?.[`${rowIndex}:${columnId}`]
}
function canRestandardizeTableCell(table: OcrExtractionTable, rowIndex: number, columnId: string) {
  const metadata = tableCellMetadata(table, rowIndex, columnId)
  return Boolean(metadata?.masterMatch && metadata.pendingValue !== undefined)
}
function setRowRef(fieldId: string, el: Element | ComponentPublicInstance | null) {
  const node = el instanceof HTMLElement ? el : (el as ComponentPublicInstance | null)?.$el
  if (node instanceof HTMLElement) {
    rowRefs.value[fieldId] = node
  } else {
    delete rowRefs.value[fieldId]
  }
}

function selectField(fieldId: string) {
  emit('selectField', fieldId)
}

function updateValue(fieldId: string, value: string) {
  emit('updateValue', fieldId, value)
}

function resolveValue(fieldId: string, value: string) {
  emit('resolveValue', fieldId, value)
}

function toggleConfirm(fieldId: string) {
  emit('toggleConfirm', fieldId)
}

function fieldAlert(field: OcrExtractionField): OcrFieldAlert {
  return getFieldAlert(field, props.fields)
}

function isLinkedTarget(field: OcrExtractionField): boolean {
  return Boolean(field.masterMatchLinkedTo)
}

function restoreValue(fieldId: string) {
  emit('restoreValue', fieldId)
}

function rowAlertClass(field: OcrExtractionField): string {
  if (isLinkedTarget(field)) return 'is-linked-target'
  const alert = fieldAlert(field)
  if (needsFieldReview(field, props.fields)) return alertClassMap[alert]
  if (alert !== 'none' && isFieldUserConfirmed(field, props.fields)) {
    return 'is-user-confirmed'
  }
  if (field.standardizationReview && field.standardizationReview.needsReview === false) {
    return reviewNeedsConfirmation(field) ? 'is-master-match' : 'is-standardization-adopted'
  }
  return ''
}

function isRestoreDisabled(field: OcrExtractionField): boolean {
  if (!isMasterField(field)) {
    return field.value === (field.ocrOriginalValue ?? field.value)
  }
  return isMasterMatchGroupRestored(field, props.fields)
}

function isRowVisible(fieldId: string): boolean {
  const container = scrollRef.value
  const row = rowRefs.value[fieldId]
  if (!container || !row) return true

  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  return rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom
}

async function scrollToField(fieldId: string) {
  if (!fieldId || isRowVisible(fieldId)) return
  await nextTick()
  rowRefs.value[fieldId]?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
}

defineExpose({ scrollToField })
</script>

<template>
  <div class="v-ocr-fields">
    <div class="v-ocr-fields__header">
      <div class="v-ocr-fields__header-actions">
        <div class="v-ocr-fields__stats">
          <span class="v-ocr-fields__stat">{{ $t('tasks.common.countFields', { count: fields.length }) }}</span>
          <span v-if="pendingReviewCount > 0" class="v-ocr-fields__stat is-danger">
            {{ $t('tasks.common.pendingReview', { count: pendingReviewCount }) }}
          </span>
          <span v-else class="v-ocr-fields__stat is-ok">{{ $t('tasks.common.allConfirmed') }}</span>
        </div>
        <el-button
          v-if="hasRestandardizableItems"
          class="v-ocr-fields__restandardize-all"
          size="small"
          :icon="Search"
          :disabled="readonly || eligibleRestandardizeCount === 0"
          @click.stop="restandardizeSelected"
        >
          {{ $t(activeDataTab === 'table' ? 'tasks.ocr.restandardizeTablesSelected' : 'tasks.ocr.restandardizeSelected') }}
        </el-button>
        <label class="v-ocr-fields__filter" @click.stop>
          <span class="v-ocr-fields__filter-label">{{ $t('tasks.common.reviewOnly') }}</span>
          <el-switch v-model="showReviewOnly" size="small" />
        </label>
        <el-checkbox
          v-model="batchConfirmSelection"
          :disabled="readonly"
          @click.stop
        >
          {{ $t('tasks.ocr.selectAllForRestandardize') }}
        </el-checkbox>
      </div>
    </div>
    <el-tabs v-if="tables.length" v-model="activeDataTab" class="v-ocr-fields__data-tabs">
      <el-tab-pane :label="$t('businessRules.docType.tab.textRead')" name="text" />
      <el-tab-pane :label="$t('businessRules.docType.tab.tableRead')" name="table" />
    </el-tabs>
    <div ref="scrollRef" class="v-ocr-fields__scroll">
      <section v-if="activeDataTab === 'text' && fields.length" class="v-ocr-fields__section">
        <h4 class="v-ocr-fields__section-title">{{ $t('tasks.common.field') }}</h4>
        <el-empty
          v-if="displayFields.length === 0"
          :description="showReviewOnly ? $t('tasks.ocr.noReviewFields') : $t('tasks.ocr.noFields')"
          :image-size="64"
        />
        <div
          v-for="field in displayFields"
          :key="field.id"
          :ref="(el) => setRowRef(field.id, el)"
          class="v-ocr-fields__row"
          :class="[rowAlertClass(field), { 'is-selected': selectedFieldId === field.id }]"
          @click="selectField(field.id)"
        >
          <div class="v-ocr-fields__row-head">
            <div class="v-ocr-fields__row-title">
              <span class="v-ocr-fields__label">
                {{ mockUiText(field.label) }}
                <span v-if="field.required" class="v-ocr-fields__required">*</span>
              </span>
            </div>
            <span
              v-if="!isMasterField(field)" class="v-ocr-fields__confidence"
              :class="{ 'is-low': field.confidence < OCR_CONFIDENCE_THRESHOLD }"
            >
              {{ $t('tasks.common.confidence', { percent: field.confidence }) }}
            </span>
          </div>


          <div class="v-ocr-fields__input-row">
            <el-select
              v-if="hasModelConflict(field)"
              :model-value="field.value"
              filterable
              allow-create
              default-first-option
              clearable
              :disabled="readonly"
              class="v-ocr-fields__input"
              :placeholder="PLACEHOLDER.SELECT_OR_INPUT"
              @click.stop
              @update:model-value="(value: string) => resolveValue(field.id, value ?? '')"
            >
              <el-option
                v-for="option in getModelResultOptions(field)"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>

            <el-input v-else-if="hasMasterCandidates(field)" :model-value="field.value" :disabled="readonly" class="v-ocr-fields__input" @click.stop @update:model-value="(value:string)=>updateValue(field.id,value)"/>


            <el-input
              v-else
              :model-value="field.value"
              class="v-ocr-fields__input"
              :disabled="readonly"
              :placeholder="field.required ? PLACEHOLDER.REQUIRED : PLACEHOLDER.EMPTY"
              @click.stop
              @update:model-value="(value: string) => updateValue(field.id, value)"
            />



            <el-tooltip v-if="!readonly" :content="$t('tasks.common.restoreOcrValue')" placement="top">
              <span class="v-ocr-fields__restore-wrap" @click.stop>
                <el-button
                  class="v-ocr-fields__restore"
                  :icon="RefreshLeft"
                  :disabled="isRestoreDisabled(field)"
                  :aria-label="$t('tasks.common.restoreOcrValue')"
                  @click="restoreValue(field.id)"
                />
              </span>
            </el-tooltip>

            <el-tooltip
              v-if="!readonly && canRestandardize(field)"
              :content="isRestandardizeEligible(field.id) ? $t('tasks.ocr.restandardize') : $t('tasks.ocr.restandardizeCachedValue')"
              placement="top"
            >
              <span class="v-ocr-fields__restore-wrap" @click.stop>
                <el-button
                  class="v-ocr-fields__restandardize"
                  :icon="Search"
                  :loading="isRestandardizing(field.id)"
                  :disabled="!isRestandardizeEligible(field.id) || isRestandardizing(field.id)"
                  :aria-label="$t('tasks.ocr.restandardize')"
                  @click="restandardizeOne(field.id)"
                />
              </span>
            </el-tooltip>

            <el-button
              v-if="!readonly && !isLinkedTarget(field) && fieldAlert(field) !== 'none'"
              :type="isFieldUserConfirmed(field, fields) ? 'success' : 'primary'"
              size="small"
              class="v-ocr-fields__confirm"
              :icon="isFieldUserConfirmed(field, fields) ? CircleCheck : Check"
              @click.stop="toggleConfirm(field.id)"
            >
              {{ isFieldUserConfirmed(field, fields) ? $t('tasks.common.confirmed') : $t('tasks.common.confirmAction') }}
            </el-button>
          </div>

          <div v-if="hasMasterCandidates(field)" class="p3-inline-candidates" @click.stop>
            <button v-if="displayedCandidate(field)" type="button" class="p3-candidate-header" :aria-expanded="!!expandedCandidates[field.id]" @click="expandedCandidates[field.id]=!expandedCandidates[field.id]">
              <span class="p3-candidate-title">
                <el-tag size="small" effect="light" class="p3-match-source-tag" :class="{'is-ocr':displayedCandidate(field)!.strategy==='ocr'}">{{ candidateSourceLabel(displayedCandidate(field)!) }}</el-tag>
                <span>{{ displayedCandidate(field)!.value }}</span>
              </span>
              <span class="p3-candidate-meta">
                <el-tag v-if="displayedCandidate(field)!.primary !== undefined" class="p3-candidate-role-tag" size="small" effect="plain">{{ $t(displayedCandidate(field)!.primary ? 'tasks.ocr.primarySplit' : 'tasks.ocr.additionalSplit') }}</el-tag>
                <span v-if="displayedCandidate(field)!.confidence !== undefined" class="p3-candidate-confidence">{{ displayedCandidate(field)!.confidence }}</span>
              </span>
              <span class="p3-candidate-chevron" aria-hidden="true">{{expandedCandidates[field.id]?'⌃':'⌄'}}</span>
            </button>
            <div v-if="expandedCandidates[field.id]" :id="'master-candidates-'+field.id" class="p3-candidate-options">
              <div role="radiogroup" :aria-label="$t('phase3.selectCandidate')">
                <button v-for="item in candidates(field)" :key="candidateKey(item)" type="button" role="radio" :aria-checked="!!selectedCandidate(field) && candidateKey(selectedCandidate(field)!)===candidateKey(item)" :disabled="readonly || item.selectable === false" class="p3-candidate-option" @click="chooseCandidate(field,candidateKey(item))">
                  <span class="p3-candidate-radio" :class="{'is-selected':!!selectedCandidate(field) && candidateKey(selectedCandidate(field)!)===candidateKey(item)}"></span>
                  <span class="p3-candidate-title"><el-tag size="small" effect="light" class="p3-match-source-tag" :class="{'is-ocr':item.strategy==='ocr'}">{{candidateSourceLabel(item)}}</el-tag><span>{{item.value}}</span></span>
                  <span class="p3-candidate-meta">
                    <el-tag v-if="item.primary !== undefined" class="p3-candidate-role-tag" size="small" effect="plain">{{ $t(item.primary ? 'tasks.ocr.primarySplit' : 'tasks.ocr.additionalSplit') }}</el-tag>
                    <span v-if="item.confidence !== undefined" class="p3-candidate-confidence">{{ item.confidence }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div v-if="expandedCandidates[field.id] && field.standardizationReview && !hasMasterCandidates(field)" class="p3-match-detail"><el-tag size="small" effect="light" class="p3-match-source-tag">{{ $t('tasks.ocr.masterMatch') }}</el-tag><span>{{field.value}}</span></div>
          <div
            v-if="reviewNeedsConfirmation(field) && candidateOwner(field)?.writeSourceOptions?.length"
            class="p4-write-source-picker"
            @click.stop
          >
            <label :for="`write-source-${field.id}`">{{ $t('tasks.ocr.writeSource') }}</label>
            <el-select
              :id="`write-source-${field.id}`"
              :model-value="candidateOwner(field)?.selectedWriteSourceId"
              :placeholder="$t('tasks.ocr.chooseWriteSource')"
              :disabled="readonly"
              @change="(value: string) => chooseWriteSource(field, value)"
            >
              <el-option
                v-for="source in candidateOwner(field)?.writeSourceOptions"
                :key="source.id"
                :label="source.label"
                :value="source.id"
              />
            </el-select>
          </div>
          <div
            v-if="fieldReviewReason(field) || reviewRemarks(field).length"
            class="p4-standardization-summary"
          >
            <div v-if="fieldReviewReason(field)" class="p4-standardization-summary__reason-section">
              <p><strong>{{ $t('tasks.ocr.reviewReason') }}：</strong>{{ fieldReviewReason(field) }}</p>
            </div>
            <div v-if="reviewRemarks(field).length" class="p4-standardization-summary__meta-list">
              <p v-for="(remark, index) in reviewRemarks(field)" :key="index" class="p4-standardization-summary__meta-row">
                <strong>{{ remark.label }}</strong><span>{{ mockUiText(remark.value) }}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeDataTab === 'table' && tables.length" class="v-ocr-fields__section is-table">
        <h4 class="v-ocr-fields__section-title">{{ $t('tasks.common.table') }}</h4>
        <div class="v-ocr-fields__table-total">{{ $t('tasks.common.countRows', { count: tableRowCount }) }}</div>
        <div
          v-for="table in tables"
          :key="table.id"
          class="v-ocr-fields__table-block"
        >
          <div class="v-ocr-fields__table-head">
            <span class="v-ocr-fields__table-badge">{{ $t('tasks.common.table') }}</span>
            <h5 class="v-ocr-fields__table-title">{{ mockUiText(table.label) }}</h5>
            <span class="v-ocr-fields__table-meta">{{ $t('tasks.common.countRows', { count: table.rows.length }) }}</span>
          </div>
          <div class="v-ocr-fields__table-scroll">
            <table class="v-ocr-fields__inner-table">
              <thead>
                <tr>
                  <th v-for="column in table.columns" :key="column.id" :title="mockUiText(column.label)">
                    {{ mockUiText(column.label) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in table.rows" :key="`${table.id}-${rowIndex}`">
                  <td
                    v-for="column in table.columns"
                    :key="column.id"
                    :title="row[column.id] ?? ''"
                  >
                    <div class="v-ocr-fields__table-cell-editor" @click.stop>
                      <el-input
                        :model-value="row[column.id] ?? ''"
                        size="small"
                        :disabled="readonly"
                        :placeholder="PLACEHOLDER.EMPTY"
                        @update:model-value="(value: string) => emit('updateTableCell', table.id, rowIndex, column.id, value)"
                      />
                      <el-tooltip :content="$t('tasks.common.restoreOcrValue')" placement="top">
                        <el-button
                          class="v-ocr-fields__restore"
                          size="small"
                          :icon="RefreshLeft"
                          :disabled="readonly || row[column.id] === table.originalRows?.[rowIndex]?.[column.id]"
                          :aria-label="$t('tasks.common.restoreOcrValue')"
                          @click.stop="emit('restoreTableCell', table.id, rowIndex, column.id)"
                        />
                      </el-tooltip>
                      <el-tooltip v-if="tableCellMetadata(table, rowIndex, column.id)?.masterMatch" :content="$t('tasks.ocr.restandardize')" placement="top">
                        <el-button
                          class="v-ocr-fields__restandardize"
                          size="small"
                          :icon="Search"
                          :disabled="readonly || !canRestandardizeTableCell(table, rowIndex, column.id)"
                          :aria-label="$t('tasks.ocr.restandardize')"
                          @click.stop="emit('restandardizeTableCell', table.id, rowIndex, column.id)"
                        />
                      </el-tooltip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <el-empty
        v-if="!fields.length && !tables.length"
        :description="$t('tasks.ocr.noExtractResult')"
        :image-size="64"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">

.v-ocr-fields {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: #fff;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-section-gap);
    min-height: var(--ocr-card-header-height, 52px);
    padding: 0 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: var(--app-section-gap);
    margin-left: auto;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  &__filter {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  &__restandardize-all {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-7);
    background: var(--el-color-primary-light-9);
    font-weight: 500;

    &:hover:not(:disabled) {
      color: var(--el-color-primary-dark-2);
      border-color: var(--el-color-primary-light-5);
      background: var(--el-color-primary-light-8);
    }
  }

  &__filter-label {
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  &__data-tabs {
    flex-shrink: 0;
    padding: 0 16px;

    :deep(.el-tabs__header) {
      margin: 0;
    }

    :deep(.el-tabs__nav-wrap::after) {
      height: 1px;
      background-color: var(--border-color);
    }

    :deep(.el-tabs__item) {
      height: 42px;
      font-size: var(--app-font-size-base);
    }
  }

  &__stat {
    padding: 4px 10px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
    background: #f9fafb;
    white-space: nowrap;

    &.is-danger {
      border-color: #fecdca;
      color: var(--el-color-danger);
      background: #fff5f5;
    }

    &.is-ok {
      border-color: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }
  }

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: var(--app-panel-padding);

    &:not(:last-child) {
      border-bottom: 1px solid var(--border-color);
    }

    &.is-table {
      background: #fafbfc;
      gap: 12px;
    }
  }

  &__section-title {
    margin: 0;
    font-size: var(--app-font-size-base);
    font-weight: 600;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  &__table-total {
    color: var(--text-secondary);
    font-size: var(--app-font-size-base);
  }

  &__section.is-table &__section-title {
    color: var(--text-secondary);
  }

  &__table-block {
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #fff;
    overflow: hidden;
  }

  &__table-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
    background: #f9fafb;
    flex-wrap: wrap;
  }

  &__table-badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    white-space: nowrap;
  }

  &__table-title {
    margin: 0;
    font-size: var(--app-font-size-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  &__table-meta {
    margin-left: auto;
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__table-scroll {
    overflow-x: auto;
  }

  &__table-cell-editor {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 220px;

    :deep(.el-input) {
      flex: 1;
      min-width: 100px;
    }

    :deep(.el-button) {
      flex: none;
    }
  }

  &__inner-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    min-width: 520px;

    thead th {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      background: #f9fafb;
      font-size: var(--app-font-size-base);
      font-weight: 600;
      color: var(--text-secondary);
      text-align: left;
      white-space: nowrap;
    }

    tbody td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      font-size: var(--app-font-size-base);
      color: var(--text-primary);
      white-space: nowrap;
    }

    tbody tr:last-child td {
      border-bottom: none;
    }
  }

  &__row {
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #f9fafb;
    cursor: pointer;
    transition: border-color var(--transition-time-02), background var(--transition-time-02);

    &.is-low-confidence,
    &.is-model-conflict,
    &.is-value-out-of-range,
    &.is-required-empty,
    &.is-master-match {
      border-color: var(--el-color-danger);
      background: #fff5f5;

      &.is-selected {
        box-shadow: 0 0 0 3px rgba(227, 27, 84, 0.12);
      }
    }

    &.is-user-confirmed {
      border-color: var(--el-color-success-light-5);
      background: #f6ffed;

      &.is-selected {
        box-shadow: 0 0 0 3px rgba(34, 160, 107, 0.12);
      }
    }

    &.is-linked-target {
      border-color: var(--el-border-color-lighter);
      background: var(--el-fill-color-lighter);
    }

  }

  &__row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-section-gap);
    margin-bottom: 8px;
  }

  &__label {
    font-size: var(--app-font-size-base);
    font-weight: 500;
    color: var(--text-primary);
  }

  &__row-title {
    display: flex;
    align-items: center;
    gap: 0;
    min-width: 0;
    flex-wrap: wrap;

    .el-checkbox {
      margin-right: 0;
    }
  }

  &__required {
    color: var(--el-color-danger);
    margin-left: 2px;
  }

  &__confidence {
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
    white-space: nowrap;

    &.is-low {
      color: var(--el-color-danger);
      font-weight: 600;
    }
  }

  &__input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
  }

  &__alert-reason {
    margin: 6px 0 0;
    font-size: var(--app-font-size-base);
    color: var(--el-color-danger);
    line-height: 1.4;
  }

  &__master-option {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    text-align: left;
  }

  &__master-tag {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    color: #6941c6;
    background: #f4f3ff;
    white-space: nowrap;
  }

  &__master-value {
    flex: 1;
    min-width: 0;
    font-size: var(--app-font-size-base);
    color: var(--text-primary);
    word-break: break-all;
    text-align: left;
  }

  &__input {
    flex: 1;
    min-width: 0;
  }

  &__restore-wrap {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
  }

  &__restore,
  &__restandardize,
  &__confirm {
    flex-shrink: 0;
  }

  :deep(.v-ocr-fields__restore.el-button),
  :deep(.v-ocr-fields__restandardize.el-button) {
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 6px;
  }

  :deep(.v-ocr-fields__restore.el-button) {
    color: var(--el-text-color-secondary);
    border-color: var(--el-border-color);
    background: var(--el-bg-color);
  }

  :deep(.v-ocr-fields__restore.el-button:hover:not(:disabled)) {
    color: var(--el-text-color-primary);
    border-color: var(--el-border-color-darker);
    background: var(--el-fill-color-light);
  }

  :deep(.v-ocr-fields__restandardize.el-button) {
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
  }

  :deep(.v-ocr-fields__restandardize.el-button:hover:not(:disabled)) {
    color: var(--el-color-primary-dark-2);
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-8);
  }

  :deep(.v-ocr-fields__confirm.el-button) {
    padding: 5px 10px;
    font-size: var(--app-font-size-base);
    font-weight: 500;
  }

  :deep(.el-input__inner) {
    font-size: var(--app-font-size-base);
  }
}
</style>

<style scoped>.p3-ocr-original{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}.p3-ocr-original label{font-size:15px;color:var(--text-secondary)}</style>

<style scoped>.p3-ocr-original{margin:12px 0 0}.p3-ocr-original summary{color:var(--el-color-primary);cursor:pointer;margin-bottom:8px}.p3-match-path{font-size:15px;color:var(--el-text-color-secondary);line-height:1.6;margin:8px 0}</style>

<style scoped>.p3-match-detail{padding:6px 10px;border:1px solid var(--el-border-color-lighter);border-radius:4px;margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}.p3-match-detail .p3-match-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;font-size:13px;color:var(--el-text-color-secondary);overflow-wrap:anywhere}.p3-candidate-path{display:block;flex-basis:100%;font-size:12px;color:var(--el-text-color-secondary);white-space:normal;line-height:1.5}.v-ocr-fields__master-option{flex-wrap:wrap}</style>

<style>.p3-master-candidate-popper .el-select-dropdown__item{height:auto;min-height:40px;padding:10px 14px;line-height:1.5}.p3-master-candidate{display:flex;align-items:center;gap:10px}.p3-candidate-title{display:flex;align-items:center;gap:8px;white-space:nowrap}.p3-candidate-radio{width:15px;height:15px;border:1px solid var(--el-border-color);border-radius:50%;flex:none;margin-top:3px}.p3-candidate-radio.is-selected{border:5px solid var(--el-color-primary)}.p3-master-candidate-select{width:100%;margin-top:7px}</style>

<style>.p3-master-candidate>div{min-width:0;flex:1}.p3-candidate-title>span:not(.el-tag){flex-shrink:0}.p3-candidate-title .p3-candidate-inline-path{flex:1;flex-shrink:1!important;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--el-text-color-secondary);font-size:12px}</style>

<style scoped>.p3-candidate-inline-path,.p3-match-detail .p3-match-path{background:var(--el-fill-color-light);border-radius:3px;padding:2px 7px;font-size:12px;flex:0 0 auto!important;white-space:nowrap}.p3-match-detail>span:not(.el-tag){font-weight:500}.p3-match-detail .p3-match-path{margin-left:auto}</style>

<style scoped>
.p3-inline-candidates{margin-top:2px;width:100%}
.p3-candidate-header,.p3-candidate-option{display:flex;align-items:center;gap:10px;width:100%;text-align:left;font:inherit;background:var(--el-bg-color);color:var(--el-text-color-regular);cursor:pointer}
.p3-candidate-header{min-height:34px;padding:4px 12px;border:1px solid var(--el-border-color-light);border-radius:4px;justify-content:flex-start;gap:10px}
.p3-candidates-toggle{width:28px;height:32px;flex:0 0 28px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--el-text-color-regular);font-size:20px;cursor:pointer}
.p3-candidates-toggle:hover{background:var(--el-fill-color-light)}
.p3-candidates-toggle:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}
.p3-candidate-header:hover{background:var(--el-fill-color-light)}
.p3-candidate-header:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}
.p3-candidate-chevron{font-size:20px;flex-shrink:0}
.p3-candidate-options{margin-top:4px;border:1px solid var(--el-border-color-light);border-radius:6px;padding:4px 0;background:var(--el-bg-color)}
.p3-candidate-option{min-height:34px;padding:5px 12px;border:0}
.p3-candidate-option:hover{background:var(--el-fill-color-light)}
.p3-candidate-option:disabled{cursor:default}
.p3-candidate-title{min-width:0;flex-wrap:wrap}
</style>

<style scoped>
.p3-match-source-tag{--el-tag-bg-color:var(--el-color-primary-light-9);--el-tag-border-color:var(--el-color-primary-light-9);--el-tag-text-color:var(--el-color-primary)}
.p3-match-source-tag.is-ocr{--el-tag-bg-color:var(--el-fill-color-light);--el-tag-border-color:var(--el-fill-color-light);--el-tag-text-color:var(--el-text-color-regular)}
.p3-candidate-title .p3-match-source-tag{display:inline-flex;justify-content:center;box-sizing:border-box;width:76px;height:24px;padding:0 6px;font-size:12px;flex:none}
.p3-candidate-header .p3-candidate-title,.p3-candidate-option .p3-candidate-title{flex:1;flex-wrap:nowrap;overflow:hidden}
.p3-candidate-header .p3-candidate-title>span:not(.el-tag),.p3-candidate-option .p3-candidate-title>span:not(.el-tag){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p3-candidate-meta{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-left:auto;flex:none;white-space:nowrap}
.p3-candidate-role-tag{height:20px;padding:0 5px;font-size:11px;line-height:18px}
.p3-candidate-confidence{font-size:12px;color:var(--el-text-color-secondary);white-space:nowrap}
.p3-candidate-chevron{margin-left:10px;flex:none}
</style>


<style scoped>
.p4-write-source-picker {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 6px 10px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.72);
}

.p4-write-source-picker label {
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.p4-write-source-picker__hint {
  grid-column: 2;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.p4-standardization-summary {
  margin-top: 8px;
}

.p4-standardization-summary__reason-section {
  margin: 0;
  color: var(--el-color-danger);
  font-size: 14px;
  line-height: 1.5;

  p {
    margin: 0;
  }

  strong {
    font-weight: 600;
  }
}

.p4-standardization-summary__meta-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.p4-standardization-summary__meta-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;

  strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

</style>

<style lang="scss">
.v-ocr-fields__master-popper {
  .el-autocomplete-suggestion__list li {
    height: auto;
    min-height: 34px;
    padding: 8px 12px;
    line-height: 1.4;
  }
}
</style>

