<script setup lang="ts">
import { computed, ref } from 'vue'
import { templateValidation, OCR_TEMPLATE_MAX_COUNT } from '@/mocks/ocrTemplateValidation'
import { useI18n } from 'vue-i18n'
import { Plus, Delete, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { p3, ocrTemplates, type OcrModelTemplate } from '@/mocks/phase3'
import { getOcrAvailableModelOptions } from '@/mocks/modelSettings'
import { docTypeDefinitions } from '@/mocks/docTypeSettings'
import RequiredTag from '@/components/RequiredTag.vue'

const { t } = useI18n()
const rows = ref<OcrModelTemplate[]>(JSON.parse(JSON.stringify(ocrTemplates())))
const fallback = ref(p3.ocr.fallbackId || rows.value[0]?.id)
const defaultTemplate = computed(() => rows.value.find((row) => row.id === fallback.value)!)
const customTemplates = computed(() => rows.value.filter((row) => row.id !== fallback.value))
const options = computed(() => getOcrAvailableModelOptions())
const emit = defineEmits<{ save: [] }>()

const templateMax = OCR_TEMPLATE_MAX_COUNT
const customCount = computed(() => customTemplates.value.length)
const atTemplateLimit = computed(() => customCount.value >= templateMax)

function add() {
  if (atTemplateLimit.value) {
    ElMessage.warning(t('phase3.templateLimitExceeded', { max: templateMax }))
    return
  }
  rows.value.push({ id: crypto.randomUUID(), name: '', main: '', verify: [], docTypes: [] })
}

function remove(row: OcrModelTemplate) {
  if (row.id !== fallback.value) rows.value = rows.value.filter((r) => r.id !== row.id)
}

function save() {
  const error = templateValidation(
    rows.value,
    fallback.value,
    docTypeDefinitions.value.map((d) => ({ id: d.id, name: d.name }))
  )
  if (error) {
    ElMessage.warning(t('phase3.templateSaveFailed', { message: error }))
    return false
  }
  const copies = JSON.parse(JSON.stringify(rows.value)) as OcrModelTemplate[]
  const base = copies.find((r) => r.id === fallback.value)!
  base.docTypes = []
  Object.assign(p3.ocr, {
    templates: copies,
    fallbackId: fallback.value,
    main: base.main,
    verify: [...base.verify]
  })
  return true
}

defineExpose({ save })
</script>

<template>
  <section class="p3-ocr-templates">
    <header>
      <h3>{{ t('phase3.ocrTemplates') }}</h3>
      <div class="p3-template-actions">
        <el-button type="primary" @click="emit('save')">{{ t('phase3.save') }}</el-button>
      </div>
    </header>

    <section v-if="defaultTemplate" class="p3-default-template">
      <h3 class="p3-default-heading">
        {{ t('phase3.fallbackTemplate') }}
        <el-tooltip :content="t('phase3.fallbackTip')">
          <el-icon tabindex="0" :aria-label="t('phase3.fallbackTip')"><InfoFilled /></el-icon>
        </el-tooltip>
      </h3>
      <div class="p3-default-models">
        <label>
          <span class="p3-field-label">{{ t('phase3.mainModel') }}<RequiredTag /></span>
          <el-select
            v-model="defaultTemplate.main"
            @change="defaultTemplate.verify = defaultTemplate.verify.filter((id) => id !== defaultTemplate.main)"
          >
            <el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </label>
        <label>
          {{ t('phase3.verifyModels') }}
          <el-select v-model="defaultTemplate.verify" multiple collapse-tags collapse-tags-tooltip clearable>
            <el-option
              v-for="o in options.filter((o) => o.value !== defaultTemplate.main)"
              :key="o.value"
              :value="o.value"
              :label="o.label"
            />
          </el-select>
        </label>
      </div>
    </section>

    <div class="p3-custom-toolbar">
      <h3 class="p3-custom-heading">{{ t('phase3.customTemplates') }}</h3>
      <div class="p3-custom-actions">
        <span
          class="p3-template-count"
          :title="t('phase3.templateLimitHint', { max: templateMax })"
        >
          {{ t('phase3.templateCount', { count: customCount, max: templateMax }) }}
        </span>
        <el-button :icon="Plus" :disabled="atTemplateLimit" @click="add">
          {{ t('phase3.addTemplate') }}
        </el-button>
      </div>
    </div>

    <el-table :data="customTemplates" border>
      <el-table-column :label="t('phase3.templateName')" min-width="150">
        <template #header>{{ t('phase3.templateName') }}<RequiredTag /></template>
        <template #default="{ row }"><el-input v-model="row.name" /></template>
      </el-table-column>
      <el-table-column min-width="190">
        <template #header>
          {{ t('phase3.mainModel') }}
          <el-tooltip :content="t('phase3.mainModelTip')"><el-icon><InfoFilled /></el-icon></el-tooltip>
          <RequiredTag />
        </template>
        <template #default="{ row }">
          <el-select v-model="row.main" @change="row.verify = row.verify.filter((id: string) => id !== row.main)">
            <el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column min-width="190">
        <template #header>
          {{ t('phase3.verifyModels') }}
          <el-tooltip :content="t('phase3.verifyModelsTip')"><el-icon><InfoFilled /></el-icon></el-tooltip>
        </template>
        <template #default="{ row }">
          <el-select v-model="row.verify" multiple collapse-tags collapse-tags-tooltip clearable>
            <el-option
              v-for="o in options.filter((o) => o.value !== row.main)"
              :key="o.value"
              :value="o.value"
              :label="o.label"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column :label="t('phase3.targetDocTypes')" min-width="220">
        <template #header>{{ t('phase3.targetDocTypes') }}<RequiredTag /></template>
        <template #default="{ row }">
          <el-select v-model="row.docTypes" multiple collapse-tags collapse-tags-tooltip clearable>
            <el-option
              v-for="d in docTypeDefinitions"
              :key="d.id"
              :value="d.id"
              :label="d.name"
              :disabled="rows.some((r) => r.id !== fallback && r.id !== row.id && r.docTypes.includes(d.id))"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column width="60">
        <template #default="{ row }">
          <el-button link :icon="Delete" :aria-label="t('phase3.delete')" @click="remove(row)" />
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.p3-ocr-templates {
  margin-top: 0;
}
.p3-field-label {
  display: inline-flex;
  align-items: center;
}
.p3-template-actions {
  display: flex;
  gap: 10px;
}
.p3-ocr-templates header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.p3-ocr-templates h3 {
  font-size: 18px;
  margin: 0;
}
.el-select {
  width: 100%;
}
</style>

<style scoped>
.p3-default-template {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 20px;
  margin-bottom: 24px;
}
.p3-default-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px !important;
}
.p3-default-heading .el-icon {
  font-size: 15px;
  color: var(--el-text-color-secondary);
}
.p3-default-models {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.p3-default-models label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.p3-custom-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}
.p3-custom-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.p3-custom-heading {
  margin: 0 !important;
}
.p3-template-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  cursor: help;
}
</style>
