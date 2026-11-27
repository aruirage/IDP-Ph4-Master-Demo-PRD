<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mockUiText } from '@/i18n/mockUiText'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import OcrDocumentPreview from './components/OcrDocumentPreview.vue'
import OcrFieldPanel from './components/OcrFieldPanel.vue'
import {
  applyMasterMatchSelection,
  canCompleteOcr,
  countPendingReviews,
  getOcrExtractionTask,
  getMasterMatchPrimaryField,
  getStandardizationPresentation,
  needsFieldReview,
  restoreMasterMatchGroup,
  toggleMasterMatchGroupConfirm,
  type OcrDocumentPage,
  type OcrExtractionField,
  type OcrMasterMatchCandidate
} from '@/mocks/ocrExtractionTask'
import { MESSAGE_BOX_CONFIRM_DEFAULTS } from '@/constants/messageBox'
import { confirmTaskAbort, confirmTaskSupplement } from '@/utils/taskFooterActions'
import { useTaskViewMode } from '@/composables/useTaskViewMode'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { isViewOnly } = useTaskViewMode()

const taskId = computed(() => String(route.params.id ?? ''))
const initialTask = computed(() => getOcrExtractionTask(taskId.value))

const pages = ref<OcrDocumentPage[]>([])
const activePageId = ref<string>('')
const selectedFieldId = ref<string | null>(null)
const showReviewOnly = ref(false)
const restandardizeEligibleFieldIds = ref<string[]>([])
const restandardizingFieldIds = ref<string[]>([])
const fieldPanelRef = ref<InstanceType<typeof OcrFieldPanel> | null>(null)

watch(
  initialTask,
  (task) => {
    if (!task) {
      pages.value = []
      activePageId.value = ''
      selectedFieldId.value = null
      restandardizeEligibleFieldIds.value = []
      return
    }
    pages.value = task.pages.map((page, index) => JSON.parse(
      JSON.stringify(page).replace(/"p4-/g, `"file${index}-p4-`)
    ))
    restandardizeEligibleFieldIds.value = []
    activePageId.value = task.pages[0]?.id ?? ''
    selectedFieldId.value = task.pages[0]?.fields[0]?.id ?? null
  },
  { immediate: true }
)

const activePage = computed(
  () => pages.value.find((page) => page.id === activePageId.value) ?? null
)

const activeFields = computed(() => activePage.value?.fields ?? [])
const activeTables = computed(() => activePage.value?.tables ?? [])

const visibleFields = computed(() =>
  showReviewOnly.value
    ? activeFields.value.filter((field) => needsFieldReview(field, activeFields.value))
    : activeFields.value
)

const allFields = computed(() => pages.value.flatMap((page) => page.fields))

const canComplete = computed(() => canCompleteOcr(allFields.value))

watch([showReviewOnly, visibleFields], () => {
  if (!selectedFieldId.value) return
  if (!visibleFields.value.some((field) => field.id === selectedFieldId.value)) {
    selectedFieldId.value = visibleFields.value[0]?.id ?? null
  }
})

function pendingReviewsForPage(page: OcrDocumentPage): number {
  return countPendingReviews(page.fields)
}

function findField(fieldId: string) {
  for (const page of pages.value) {
    const field = page.fields.find((item) => item.id === fieldId)
    if (field) return field
  }
  return null
}

function findTable(tableId: string) {
  for (const page of pages.value) {
    const table = page.tables.find((item) => item.id === tableId)
    if (table) return table
  }
  return null
}

function updateTableCell(tableId: string, rowIndex: number, columnId: string, value: string) {
  const table = findTable(tableId)
  if (!table?.rows[rowIndex]) return
  table.rows[rowIndex][columnId] = value
  const metadata = table.cellMetadata?.[`${rowIndex}:${columnId}`]
  if (!metadata?.masterMatch) return
  const original = table.originalRows?.[rowIndex]?.[columnId]
  if (value === original) delete metadata.pendingValue
  else metadata.pendingValue = value
}

function restoreTableCell(tableId: string, rowIndex: number, columnId: string) {
  const table = findTable(tableId)
  const original = table?.originalRows?.[rowIndex]?.[columnId]
  if (table?.rows[rowIndex] && original !== undefined) {
    table.rows[rowIndex][columnId] = original
    const metadata = table.cellMetadata?.[`${rowIndex}:${columnId}`]
    if (metadata) delete metadata.pendingValue
  }
}

function restandardizeTableCell(tableId: string, rowIndex: number, columnId: string) {
  const table = findTable(tableId)
  const metadata = table?.cellMetadata?.[`${rowIndex}:${columnId}`]
  const pendingValue = metadata?.pendingValue
  const result = pendingValue === undefined ? undefined : metadata?.masterMatches?.[pendingValue]
  if (table?.rows[rowIndex] && result !== undefined) {
    table.rows[rowIndex][columnId] = result
    if (metadata) delete metadata.pendingValue
    ElMessage.success(t('tasks.ocr.restandardizeSuccess', { count: 1 }))
  } else {
    ElMessage.warning(t('tasks.ocr.restandardizeNoMatch'))
  }
}

function isRestandardizableField(field: OcrExtractionField): boolean {
  return Boolean(
    field.memberMode
      || field.standardizationReview
      || field.apiStandardizationApplied
      || field.masterDataId
      || field.masterRecommendation
      || field.masterMatchCandidates?.length
      || field.masterMatchConfirmRule
      || field.masterMatchedValue
      || field.masterMatchStrategy
  ) && !field.masterMatchLinkedTo && field.memberMode !== 'OUTPUT'
}

function markFieldChanged(field: OcrExtractionField, previousValue: string) {
  delete field.pendingMasterMatch
  if (field.value === previousValue || !isRestandardizableField(field)) return
  field.ocrEditedValue = field.value
  if (!restandardizeEligibleFieldIds.value.includes(field.id)) {
    restandardizeEligibleFieldIds.value.push(field.id)
  }
}

function selectPage(pageId: string) {
  activePageId.value = pageId
  const page = pages.value.find((item) => item.id === pageId)
  selectedFieldId.value = page?.fields[0]?.id ?? null
}

function selectField(fieldId: string) {
  selectedFieldId.value = fieldId
}

function updateFieldValue(fieldId: string, value: string) {
  const field = findField(fieldId)
  if (field) {
    const previousValue = field.value
    field.value = value
    markFieldChanged(field, previousValue)
    delete field.masterAutoAdopted
    delete field.masterHierarchyOfficial
    delete field.masterHierarchyLevel
    delete field.masterHierarchyPath
    delete field.masterMatchStrategy
    delete field.masterMatchSimilarity
    delete field.masterSelection
    delete field.masterValuesSnapshot
    field.userConfirmed = false
  }
}

function resolveFieldValue(fieldId: string, value: string) {
  const field = findField(fieldId)
  if (field) {
    const previousValue = field.value
    field.value = value
    markFieldChanged(field, previousValue)
    delete field.masterAutoAdopted
    delete field.masterHierarchyOfficial
    delete field.masterHierarchyLevel
    delete field.masterHierarchyPath
    delete field.masterMatchStrategy
    delete field.masterMatchSimilarity
    delete field.masterSelection
    delete field.masterValuesSnapshot
    delete field.modelAlternatives
    field.userConfirmed = false
  }
}

function applySelectedCandidate(owner: OcrExtractionField, candidate: OcrMasterMatchCandidate) {
  if (owner.writeSourceOptions?.length) {
    const destination = pages.value.find((page) => page.id === owner.selectedWriteSourceId)
    const target = destination?.fields.find((field) => field.label === owner.label.replace('薬剤名', '商品名'))
    if (!target) return
    applyMasterMatchSelection(allFields.value, { ...candidate, linkedValues: { [target.id]: candidate.value } })
    owner.masterSelection = candidate.selection
    owner.masterValuesSnapshot = candidate.masterValues
    return
  }
  applyMasterMatchSelection(allFields.value, candidate)
}

function toggleFieldConfirm(fieldId: string) {
  const field = findField(fieldId)
  if (!field) return
  const owner = getMasterMatchPrimaryField(field, allFields.value)
  const presentation = getStandardizationPresentation(owner)
  if (!owner.userConfirmed && owner.writeSourceOptions?.length && !owner.selectedWriteSourceId) {
    ElMessage.warning(t('tasks.ocr.chooseWriteSourceFirst'))
    return
  }
  if (!owner.userConfirmed && presentation?.needsReview && presentation.shouldWriteBack) {
    const selected = owner.pendingMasterMatch ?? (
      restandardizeEligibleFieldIds.value.includes(owner.id)
        ? undefined
        : presentation.masterDataMatches.find((option) => option.isMaster && option.selectable !== false)
    )
    if (selected) applySelectedCandidate(owner, selected)
  }
  if (owner.pendingMasterMatch && presentation?.shouldWriteBack === false) {
    owner.masterSelection = owner.pendingMasterMatch.selection
    owner.masterValuesSnapshot = owner.pendingMasterMatch.masterValues
  }
  delete owner.pendingMasterMatch
  toggleMasterMatchGroupConfirm(field, allFields.value)
}

function selectWriteSource(fieldId: string, sourceId: string) {
  const field = findField(fieldId)
  if (!field?.writeSourceOptions?.some((option) => option.id === sourceId)) return
  field.selectedWriteSourceId = sourceId
}

function restoreFieldValue(fieldId: string) {
  const field = findField(fieldId)
  if (!field) return
  delete getMasterMatchPrimaryField(field, allFields.value).pendingMasterMatch
  restoreMasterMatchGroup(field, activeFields.value)
  delete field.ocrEditedValue
  restandardizeEligibleFieldIds.value = restandardizeEligibleFieldIds.value.filter((id) => id !== fieldId)
}

function selectMasterMatch(fieldId: string, candidate: OcrMasterMatchCandidate) {
  const field = findField(fieldId)
  if (!field || candidate.selectable === false) return
  const owner = getMasterMatchPrimaryField(field, allFields.value)
  const presentation = getStandardizationPresentation(owner)
  if (presentation?.needsReview || presentation?.shouldWriteBack === false) {
    owner.pendingMasterMatch = candidate
    owner.userConfirmed = false
    return
  }
  applySelectedCandidate(owner, candidate)
}

function goBack() {
  router.push('/tasks')
}

async function handleSave() {
  ElMessage.success(t('tasks.common.saveSuccess'))
}

async function handleRestandardize(fieldIds: string[]) {
  if (restandardizingFieldIds.value.length) return
  const edits = fieldIds.flatMap((id) => {
    const field = findField(id)
    return field && isRestandardizableField(field) && restandardizeEligibleFieldIds.value.includes(id)
      ? [{ field, value: field.ocrEditedValue ?? field.value }]
      : []
  })
  if (!edits.length) return

  restandardizingFieldIds.value = edits.map(({ field }) => field.id)
  try {
    await new Promise((resolve) => setTimeout(resolve, 450))
    const completedIds = new Set<string>()
    for (const { field, value } of edits) {
      if ((field.ocrEditedValue ?? field.value) !== value) continue
      const presentation = getStandardizationPresentation(field)
      const candidate = presentation?.masterDataMatches.find((option) =>
        option.selectable !== false && option.value === value
      )
      if (field.standardizationReview) {
        field.standardizationReview.needsReview = !candidate
        field.standardizationReview.reviewReasons = candidate
          ? []
          : [{ code: 'UNRESOLVED', message: t('tasks.ocr.restandardizeNoMatch') }]
        field.standardizationReview.reason = ''
        field.standardizationReview.notesForAssessor = ''
        field.standardizationReview.proposedName = ''
        field.masterRecommendation = candidate
        field.masterMatchCandidates = candidate ? [candidate] : []
      }
      delete field.pendingMasterMatch
      field.userConfirmed = false
      if (candidate && presentation?.shouldWriteBack) applyMasterMatchSelection(allFields.value, candidate)
      completedIds.add(field.id)
    }
    restandardizeEligibleFieldIds.value = restandardizeEligibleFieldIds.value.filter((id) => !completedIds.has(id))
    if (completedIds.size) ElMessage.success(t('tasks.ocr.restandardizeSuccess', { count: completedIds.size }))
  } finally {
    restandardizingFieldIds.value = []
  }
}

async function handleSupplement() {
  try {
    await confirmTaskSupplement(t)
    ElMessage.warning(t('tasks.common.supplementSuccess'))
    router.push('/tasks')
  } catch {
    // cancelled
  }
}

async function handleAbortCase() {
  if (!initialTask.value) return
  try {
    await confirmTaskAbort(t, initialTask.value.caseId)
    ElMessage.success(t('tasks.common.abortSuccess'))
    router.push('/tasks')
  } catch {
    // cancelled
  }
}

async function handleComplete() {
  if (!canComplete.value) return

  await ElMessageBox.confirm(t('tasks.ocr.messages.completeConfirm'), t('tasks.ocr.complete'), {
    ...MESSAGE_BOX_CONFIRM_DEFAULTS,
    type: 'info'
  })
  ElMessage.success(t('tasks.ocr.messages.completeSuccess'))
  router.push('/tasks')
}

</script>

<template>
  <div class="v-content-wrap v-ocr-task">
    <template v-if="initialTask && activePage">
      <section class="v-ocr-task__summary">
        <button type="button" class="v-ocr-task__back" @click="goBack">
          <el-icon :size="16"><ArrowLeft /></el-icon>
          {{ $t('menu.tasks') }}
        </button>
        <h1 class="v-ocr-task__title">{{ $t('tasks.ocr.title') }}</h1>
        <div class="v-ocr-task__summary-items">
          <span class="v-ocr-task__summary-inline">
            <span class="v-ocr-task__summary-label">{{ $t('tasks.common.businessKey') }}</span>
            {{ initialTask.caseOrigin ?? '—' }}
          </span>
        </div>
      </section>

      <el-tabs
        :model-value="activePageId"
        type="card"
        class="v-ocr-task__file-tabs"
        @tab-change="(name: string | number) => selectPage(String(name))"
      >
        <el-tab-pane
          v-for="page in pages"
          :key="page.id"
          :name="page.id"
        >
          <template #label>
            <span class="v-ocr-task__tab-label">
              <span class="v-ocr-task__tab-doc">{{ mockUiText(page.docType) }}</span>
              <el-badge
                v-if="pendingReviewsForPage(page) > 0"
                :value="pendingReviewsForPage(page)"
                type="danger"
                class="v-ocr-task__tab-badge"
              />
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="v-ocr-task__workspace">
        <OcrDocumentPreview
          class="v-ocr-task__preview"
          :image-url="activePage.imageUrl"
          :page-count="activePage.pageCount ?? 1"
        />

        <OcrFieldPanel
          ref="fieldPanelRef"
          v-model:show-review-only="showReviewOnly"
          class="v-ocr-task__fields"
          :fields="activeFields"
          :tables="activeTables"
          :selected-field-id="selectedFieldId"
          :readonly="isViewOnly"
          :restandardize-eligible-field-ids="restandardizeEligibleFieldIds"
          :restandardizing-field-ids="restandardizingFieldIds"
          @select-field="selectField"
          @update-value="updateFieldValue"
          @resolve-value="resolveFieldValue"
          @toggle-confirm="toggleFieldConfirm"
          @restore-value="restoreFieldValue"
          @select-master-match="selectMasterMatch"
          @select-write-source="selectWriteSource"
          @update-table-cell="updateTableCell"
          @restore-table-cell="restoreTableCell"
          @restandardize-table-cell="restandardizeTableCell"
          @restandardize="handleRestandardize"
        />
      </div>

      <footer class="v-ocr-task__footer">
        <div class="v-ocr-task__footer-actions">
          <el-button @click="goBack">{{ $t('tasks.common.close') }}</el-button>
          <template v-if="!isViewOnly">
            <el-button type="danger" plain @click="handleAbortCase">
              {{ $t('tasks.common.abortCase') }}
            </el-button>
            <el-button type="warning" @click="handleSupplement">
              {{ $t('tasks.verification.supplement') }}
            </el-button>
            <el-button type="primary" @click="handleSave">
              {{ $t('tasks.common.save') }}
            </el-button>
            <el-button type="primary" :disabled="!canComplete" @click="handleComplete">
              {{ $t('tasks.ocr.complete') }}
            </el-button>
          </template>
        </div>
      </footer>
    </template>

    <el-empty v-else :description="$t('tasks.common.taskNotFound')" :image-size="100">
      <el-button type="primary" @click="goBack">{{ $t('tasks.common.backToList') }}</el-button>
    </el-empty>
  </div>
</template>

<style scoped lang="scss">
.v-ocr-task {
  --ocr-page-padding: 12px;
  --ocr-row-gap: 8px;
  --ocr-card-header-height: 52px;

  display: flex;
  flex-direction: column;
  gap: var(--ocr-row-gap);
  height: calc(100vh - var(--top-header-total-height));
  min-height: unset;
  max-height: calc(100vh - var(--top-header-total-height));
  overflow: hidden;
  box-sizing: border-box;
  padding: var(--ocr-page-padding) !important;

  &.v-content-wrap {
    min-height: unset;
  }

  &__back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--el-color-primary);
    font-size: var(--app-font-size-base);
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }

  &__title {
    margin: 0;
    font-size: var(--app-font-size-base);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  &__summary {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--app-section-gap) 16px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #fff;
  }

  &__summary-items {
    display: flex;
    align-items: center;
    gap: var(--app-section-gap);
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }

  &__summary-inline {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
    font-size: var(--app-font-size-base);
    font-weight: 500;
    color: var(--text-primary);
  }

  &__summary-label {
    font-weight: 400;
    color: var(--text-secondary);
  }

  &__summary-divider {
    width: 1px;
    height: 14px;
    background: var(--border-color);
    flex-shrink: 0;
  }

  &__file-tabs {
    flex-shrink: 0;
    width: 100%;

    :deep(.el-tabs__content) {
      display: none;
    }

    :deep(.el-tabs__header) {
      margin-bottom: 0;
      width: 100%;
    }

    :deep(.el-tabs__nav-wrap) {
      margin-bottom: 0;
    }

    :deep(.el-tabs__nav) {
      border: none;
      gap: 8px;
      float: none;
    }

    :deep(.el-tabs__item) {
      height: auto;
      padding: 8px 14px;
      line-height: 1.35;
      margin-left: 0 !important;
      border: 1px solid var(--border-color) !important;
      border-radius: 8px;
      background: #fff;
      color: var(--text-secondary);
      font-size: var(--app-font-size-base);
      transition: none;

      &:first-child {
        border-left: 1px solid var(--border-color) !important;
      }

      &:hover {
        color: var(--text-secondary);
      }

      &.is-active {
        border-color: var(--el-color-primary) !important;
        background: var(--el-color-primary-light-9);
        color: var(--el-color-primary);

        &:hover {
          color: var(--el-color-primary);
        }

        .v-ocr-task__tab-doc {
          color: var(--el-color-primary);
        }
      }
    }
  }

  &__tab-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 280px;
  }

  &__tab-doc {
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  &__tab-file {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }

  &__tab-badge {
    :deep(.el-badge__content) {
      position: static;
      transform: none;
    }
  }

  &__workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ocr-row-gap);
    align-items: stretch;
    overflow: hidden;

    @media (max-width: 1100px) {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(320px, 45vh) minmax(0, 1fr);
    }
  }

  &__preview,
  &__fields {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    --ocr-card-header-height: 52px;
  }

  &__footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--app-section-gap);
    margin: 0 calc(-1 * var(--ocr-page-padding)) calc(-1 * var(--ocr-page-padding));
    padding: 10px var(--ocr-page-padding);
    border-top: 1px solid var(--border-color);
    background: #fff;
  }

  &__footer-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--app-section-gap);
    flex-wrap: wrap;
  }
}
</style>
