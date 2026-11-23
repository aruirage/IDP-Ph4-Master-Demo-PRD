<script setup lang="ts">
import { computed, ref, unref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import ImageViewerFloatingToolbar from '@/components/ImageViewerFloatingToolbar.vue'
import {
  DEFAULT_PROCESS_CONFIDENCE,
  type DocTypeDefinition,
  type DocTypeProcessRuleFields
} from '@/mocks/docTypeSettings'
import DocTypeSamplePreview from './DocTypeSamplePreview.vue'

const { t } = useI18n()

const docType = defineModel<DocTypeDefinition>({ required: true })

const activeTab = ref<'text' | 'table'>('text')
const previewRef = ref<InstanceType<typeof DocTypeSamplePreview> | null>(null)
const testImageUrl = ref('')
const hasTestResult = ref(false)

const displayImageUrl = computed(
  () => testImageUrl.value || docType.value.sampleImageUrl
)

const previewZoom = computed(() => unref(previewRef.value?.zoom) ?? 100)

type ReadSource = 'qr-postprocess' | 'qr-multiple' | 'ocr'

interface TextTestRow {
  fieldId: string
  itemName: string
  extractedValue: string
  confidence: number
  source: ReadSource
  qrDetail: string
}

interface TableTestRow {
  tableId: string
  tableName: string
  columnId: string
  columnKey: string
  extractedValue: string
  confidence: number
  source: ReadSource
  qrDetail: string
}

const textTestRows = ref<TextTestRow[]>([])
const tableTestRows = ref<TableTestRow[]>([])

function resolveReadSource(rule: DocTypeProcessRuleFields | undefined, isTable: boolean): ReadSource {
  if (rule?.ruleType !== 'qrcode') return 'ocr'
  // 第2步の複数QR読取はテキスト項目全体を対象にするため、テーブル列は第3步の後処理QRを使う
  if (!isTable && docType.value.ocrRead.multipleQrEnabled) return 'qr-multiple'
  return 'qr-postprocess'
}

function resolveQrDetail(rule: DocTypeProcessRuleFields | undefined): string {
  if (rule?.ruleType !== 'qrcode' || rule.qrMode !== 'split') return ''
  const delimiter = rule.qrDelimiter || '_'
  const index = Number(rule.qrIndex) || 1
  return t('businessRules.docType.test.qrRuleDetail', { delimiter, index })
}

const activeTestRows = computed(() =>
  activeTab.value === 'text' ? textTestRows.value : tableTestRows.value
)

const sourceCounts = computed(() => {
  const counts = { post: 0, multiple: 0, ocr: 0 }
  activeTestRows.value.forEach((row) => {
    if (row.source === 'qr-postprocess') counts.post += 1
    else if (row.source === 'qr-multiple') counts.multiple += 1
    else counts.ocr += 1
  })
  return counts
})

const readSummary = computed(() => {
  const text = t('businessRules.docType.test.readSummary', {
    qr: sourceCounts.value.post,
    ocr: sourceCounts.value.ocr
  })
  return sourceCounts.value.multiple
    ? `${text} ${t('businessRules.docType.test.readSummaryMultiple', { count: sourceCounts.value.multiple })}`
    : text
})

function readSourceLabel(source: ReadSource): string {
  if (source === 'qr-postprocess') return t('businessRules.docType.test.readQrPost')
  if (source === 'qr-multiple') return t('businessRules.docType.test.readQrMultiple')
  return t('businessRules.docType.test.readOcr')
}

function onToolbarFit() {
  previewRef.value?.applyFitZoom()
}

function onToolbarRotateLeft() {
  previewRef.value?.rotateLeft()
}

function onToolbarRotateRight() {
  previewRef.value?.rotateRight()
}

function onToolbarZoomIn() {
  previewRef.value?.zoomIn()
}

function onToolbarZoomOut() {
  previewRef.value?.zoomOut()
}

function resolveMockValue(
  sample: string,
  rule: DocTypeProcessRuleFields | undefined,
  source: ReadSource
): string {
  const base = sample || '—'
  if (source !== 'qr-postprocess' || rule?.qrMode !== 'split') return base
  const delimiter = rule.qrDelimiter || '_'
  const index = Number(rule.qrIndex) || 1
  return base.split(delimiter)[index - 1] || base
}

function buildMockResults() {
  textTestRows.value = docType.value.ocrRead.textFields
    .filter((field) => field.itemName.trim())
    .map((field) => {
      const rule = docType.value.processRules.textFields.find((item) => item.fieldId === field.id)
      const source = resolveReadSource(rule, false)
      return {
        fieldId: field.id,
        itemName: field.itemName,
        extractedValue: resolveMockValue(field.correctSample, rule, source),
        confidence: rule?.confidence ?? DEFAULT_PROCESS_CONFIDENCE,
        source,
        qrDetail: resolveQrDetail(rule)
      }
    })

  tableTestRows.value = docType.value.ocrRead.tables.flatMap((table) =>
    table.columns
      .filter((column) => column.columnKey.trim())
      .map((column) => {
        const rule = docType.value.processRules.tableColumns.find(
          (item) => item.tableId === table.id && item.columnId === column.id
        )
        const source = resolveReadSource(rule, true)
        return {
          tableId: table.id,
          tableName: table.name,
          columnId: column.id,
          columnKey: column.columnKey,
          extractedValue: resolveMockValue(column.correctSample, rule, source),
          confidence: rule?.confidence ?? DEFAULT_PROCESS_CONFIDENCE,
          source,
          qrDetail: resolveQrDetail(rule)
        }
      })
  )
}

function runTest() {
  if (!displayImageUrl.value) {
    ElMessage.warning(t('businessRules.docType.message.testFileRequired'))
    return
  }
  buildMockResults()
  hasTestResult.value = true
  ElMessage.success(t('businessRules.docType.message.testDone'))
}

function setTestFile(file: File) {
  if (testImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(testImageUrl.value)
  }
  testImageUrl.value = URL.createObjectURL(file)
  hasTestResult.value = false
  textTestRows.value = []
  tableTestRows.value = []
  ElMessage.success(t('businessRules.docType.message.testFileSelected'))
}

defineExpose({
  runTest,
  setTestFile
})
</script>

<template>
  <div class="v-doc-type-test v-doc-type-workspace v-doc-type-workspace--2-3">
    <div class="v-doc-type-test__preview">
      <ImageViewerFloatingToolbar
        variant="dock"
        class="v-doc-type-test__preview-toolbar"
        :show-navigation="false"
        :show-crop="false"
        :show-fit="true"
        :zoom="previewZoom"
        @fit="onToolbarFit"
        @rotate-left="onToolbarRotateLeft"
        @rotate-right="onToolbarRotateRight"
        @zoom-in="onToolbarZoomIn"
        @zoom-out="onToolbarZoomOut"
      />

      <DocTypeSamplePreview
        ref="previewRef"
        :image-url="displayImageUrl"
        hide-toolbar
      />
    </div>

    <div class="v-doc-type-test__panel">
      <el-tabs v-model="activeTab" stretch class="v-doc-type-test__tabs">
        <el-tab-pane :label="$t('businessRules.docType.tab.textRead')" name="text" />
        <el-tab-pane :label="$t('businessRules.docType.tab.tableRead')" name="table" />
      </el-tabs>

      <div class="v-doc-type-test__panel-body">
          <div v-if="hasTestResult" class="v-doc-type-test__read-summary">
            <span class="v-doc-type-test__read-summary-text">{{ readSummary }}</span>
            <el-tooltip :content="$t('businessRules.docType.test.readMethodHint')" placement="top">
              <el-icon
                class="v-doc-type-test__read-summary-icon"
                tabindex="0"
                :aria-label="$t('businessRules.docType.test.readMethodHint')"
              >
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </div>

          <template v-if="!hasTestResult">
            <div class="v-doc-type-test__empty">
              {{ $t('businessRules.docType.test.runHint') }}
            </div>
          </template>

          <template v-else-if="activeTab === 'text'">
            <div v-if="textTestRows.length" class="v-doc-type-test__cards">
              <article
                v-for="(row, index) in textTestRows"
                :key="row.fieldId"
                class="v-doc-type-test__card"
              >
                <header class="v-doc-type-test__card-head">
                  <strong class="v-doc-type-test__card-no">#{{ index + 1 }}</strong>
                  <el-tooltip v-if="row.qrDetail" :content="row.qrDetail" placement="top">
                    <span
                      class="v-doc-type-test__source-tag"
                      :class="{ 'is-ocr': row.source === 'ocr' }"
                    >
                      {{ readSourceLabel(row.source) }}
                    </span>
                  </el-tooltip>
                  <span
                    v-else
                    class="v-doc-type-test__source-tag"
                    :class="{ 'is-ocr': row.source === 'ocr' }"
                  >
                    {{ readSourceLabel(row.source) }}
                  </span>
                </header>
                <label class="v-doc-type-test__card-label">{{ row.itemName }}</label>
                <el-input :model-value="row.extractedValue" readonly />
              </article>
            </div>
            <div v-else class="v-doc-type-test__empty">{{ $t('businessRules.docType.test.noTextItems') }}</div>
          </template>

          <template v-else>
            <el-table
              v-if="tableTestRows.length"
              :data="tableTestRows"
              border
              class="v-doc-type-test__table v-doc-type-table"
            >
              <el-table-column
                type="index"
                :label="$t('common.index')"
                width="80"
                align="center"
                header-class-name="v-list-table__index-col"
                class-name="v-list-table__index-col"
              />
              <el-table-column :label="$t('businessRules.docType.column.tableName')" min-width="100" prop="tableName" />
              <el-table-column :label="$t('businessRules.docType.column.columnKey')" min-width="190">
                <template #default="{ row }">
                  <div class="v-doc-type-test__column-key">
                    <span>{{ row.columnKey }}</span>
                    <el-tooltip v-if="row.qrDetail" :content="row.qrDetail" placement="top">
                      <span
                        class="v-doc-type-test__source-tag"
                        :class="{ 'is-ocr': row.source === 'ocr' }"
                      >
                        {{ readSourceLabel(row.source) }}
                      </span>
                    </el-tooltip>
                    <span
                      v-else
                      class="v-doc-type-test__source-tag"
                      :class="{ 'is-ocr': row.source === 'ocr' }"
                    >
                      {{ readSourceLabel(row.source) }}
                    </span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="$t('businessRules.docType.column.extractedValue')" min-width="130" prop="extractedValue" />
              <el-table-column :label="$t('businessRules.docType.column.confidence')" width="104" align="center">
                <template #default="{ row }">
                  {{ row.confidence.toFixed(2) }}%
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="v-doc-type-test__empty">{{ $t('businessRules.docType.test.noTableColumns') }}</div>
          </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import './doc-type-workspace.scss';

.v-doc-type-test {
  flex: 1;
  min-height: 0;

  &__preview {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
  }

  &__preview-toolbar {
    flex-shrink: 0;
  }

  &__tabs {
    flex-shrink: 0;
    width: 100%;

    :deep(.el-tabs__header) {
      margin-bottom: 0;
    }

    :deep(.el-tabs__nav-wrap) {
      padding: 0 var(--app-panel-padding);
    }

    :deep(.el-tabs__item) {
      font-size: var(--app-font-size-base);
      height: 40px;
      padding: 0 12px;
    }

    :deep(.el-tabs__nav-wrap::after) {
      height: 1px;
      background-color: var(--border-color);
    }
  }

  &__panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
  }

  &__panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--app-panel-padding);
  }

  &__table {
    width: 100%;
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__card {
    padding: 16px 18px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: #fff;
  }

  &__card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  &__card-no {
    font-size: var(--app-font-size-base);
    font-weight: 600;
  }

  &__card-label {
    display: block;
    margin-bottom: 6px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  &__column-key {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__read-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
  }

  &__read-summary-icon {
    color: var(--text-secondary);
    cursor: help;
  }

  &__source-tag {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 6px;
    background: #eef4ff;
    color: #3538cd;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;

    &.is-ocr {
      background: #f2f4f7;
      color: #667085;
    }
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 240px;
    font-size: var(--app-font-size-base);
    color: var(--text-secondary);
    text-align: center;
  }
}
</style>
