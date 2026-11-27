<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import ConfigListAside from '@/components/ConfigListAside.vue'
import { MESSAGE_BOX_CONFIRM_DEFAULTS } from '@/constants/messageBox'
import {
  getStandardizationColumn,
  getStandardizationMasterTable,
  standardizationDocTypes,
  standardizationGroups,
  standardizationMasterTables,
  standardizationTrialResults,
  type StandardizationFieldType,
  type StandardizationGroup,
  type StandardizationMember,
  type StandardizationMode
} from '@/mocks/standardizationGroups'

const { t } = useI18n()
const activeTab = ref<'groups' | 'trial'>('groups')
const keyword = ref('')
const activeGroupId = ref(standardizationGroups.value[0]?.id ?? '')
const schemaVersion = ref('2026-11-19')
const groupsVersion = ref('2026-11-18-01')
const trialRunning = ref(false)
const trialVisible = ref(false)
const validation = ref<{ groupId: string; errors: string[]; passed: boolean } | null>(null)

const filteredGroups = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return standardizationGroups.value
  return standardizationGroups.value.filter((group) =>
    `${group.id} ${group.label} ${group.masterTable}`.toLowerCase().includes(q)
  )
})

const activeGroup = computed(
  () => standardizationGroups.value.find((group) => group.id === activeGroupId.value) ?? null
)
const activeMaster = computed(() =>
  activeGroup.value ? getStandardizationMasterTable(activeGroup.value.masterTable) : undefined
)

const modeOptions = computed<{ value: StandardizationMode; label: string }[]>(() => [
  { value: 'INPUT', label: t('businessRules.standardization.modeInput') },
  { value: 'OUTPUT', label: t('businessRules.standardization.modeOutput') },
  { value: 'INPUT_OUTPUT', label: t('businessRules.standardization.modeInputOutput') }
])
const fieldTypeOptions = computed<{ value: StandardizationFieldType; label: string }[]>(() => [
  { value: 'FIELD', label: t('businessRules.standardization.fieldTypeField') },
  { value: 'TABLE_COLUMN', label: t('businessRules.standardization.fieldTypeTable') },
  { value: 'CASE_FIELD', label: t('businessRules.standardization.fieldTypeCase') }
])

const fieldNameMap: Record<string, string[]> = {
  '20001': ['病院住所', '診療科'],
  '20002': ['傷病名1', '傷病名1_ICD10', '傷病名2', '医療機関名'],
  '20003': ['振込先金融機関', '振込先支店', '金融機関コード', '支店コード']
}
const caseFieldOptions = ['性別', '診療科']

function selectGroup(id: string) {
  activeGroupId.value = id
  validation.value = null
}

function createMember(masterTable = activeGroup.value?.masterTable ?? 'DISEASE'): StandardizationMember {
  const master = getStandardizationMasterTable(masterTable)
  return {
    id: `member-${Date.now()}`,
    column: master?.columns[0]?.column ?? '',
    mode: 'INPUT',
    fieldType: 'FIELD',
    documentTypeId: '20002',
    fieldName: '傷病名1'
  }
}

function addGroup() {
  const group: StandardizationGroup = {
    id: `GROUP-${Date.now()}`,
    label: t('businessRules.standardization.newGroup'),
    masterTable: 'DISEASE',
    updatedAt: '—',
    members: [createMember('DISEASE')]
  }
  standardizationGroups.value.unshift(group)
  activeGroupId.value = group.id
  validation.value = null
}

async function deleteGroup(group: StandardizationGroup) {
  if (standardizationGroups.value.length <= 1) {
    ElMessage.warning(t('businessRules.standardization.keepOneGroup'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('businessRules.standardization.deleteConfirm', { name: group.label }),
      t('businessRules.standardization.deleteTitle'),
      MESSAGE_BOX_CONFIRM_DEFAULTS
    )
    standardizationGroups.value = standardizationGroups.value.filter((item) => item.id !== group.id)
    activeGroupId.value = standardizationGroups.value[0]?.id ?? ''
    validation.value = null
  } catch {
    // cancelled
  }
}

function addMember() {
  activeGroup.value?.members.push(createMember())
}

function removeMember(id: string) {
  if (!activeGroup.value) return
  activeGroup.value.members = activeGroup.value.members.filter((member) => member.id !== id)
}

function masterColumnOptions() {
  if (!activeMaster.value) return []
  return [
    ...activeMaster.value.columns.map((column) => ({
      value: `column:${column.column}`,
      label: `${column.label}（${column.inputRole === 'PRIMARY' ? '主' : column.inputRole === 'SUPPORTING' ? '補助' : '出力'}）`
    })),
    ...activeMaster.value.hints.map((hint) => ({
      value: `hint:${hint.hint}`,
      label: `${hint.label}（ヒント）`
    }))
  ]
}

function memberSourceValue(member: StandardizationMember) {
  return member.hint ? `hint:${member.hint}` : `column:${member.column ?? ''}`
}

function setMemberSource(member: StandardizationMember, value: string) {
  if (value.startsWith('hint:')) {
    member.hint = value.slice(5)
    delete member.column
    return
  }
  member.column = value.slice(7)
  delete member.hint
}

function fieldNameOptions(member: StandardizationMember) {
  return member.fieldType === 'CASE_FIELD' ? caseFieldOptions : fieldNameMap[member.documentTypeId] ?? []
}

function columnNameOptions(member: StandardizationMember) {
  return member.documentTypeId === '20001' ? ['手術名', '手術コード', '手術日'] : []
}

function onFieldTypeChange(member: StandardizationMember) {
  if (member.fieldType === 'CASE_FIELD') {
    member.documentTypeId = ''
    member.fieldName = '性別'
    delete member.tableName
    delete member.columnName
    return
  }
  if (!member.documentTypeId) member.documentTypeId = '20002'
  if (member.fieldType === 'TABLE_COLUMN') {
    member.tableName = '手術情報'
    member.columnName = '手術名'
    member.fieldName = '手術名'
    return
  }
  delete member.tableName
  delete member.columnName
  member.fieldName = fieldNameMap[member.documentTypeId]?.[0] ?? ''
}

function validateGroup(group: StandardizationGroup) {
  const errors: string[] = []
  const seen = new Set<string>()
  const hasPrimary = group.members.some((member) => {
    if (!member.column) return false
    const column = getStandardizationColumn(group.masterTable, member.column)
    return member.mode !== 'OUTPUT' && column?.inputRole === 'PRIMARY'
  })
  if (!hasPrimary) errors.push(t('businessRules.standardization.noPrimary'))

  for (const member of group.members) {
    const key = member.hint ? `hint:${member.hint}` : `column:${member.column ?? ''}`
    if (seen.has(key)) errors.push(t('businessRules.standardization.duplicateMember'))
    seen.add(key)
    const column = member.column ? getStandardizationColumn(group.masterTable, member.column) : undefined
    if (member.mode !== 'INPUT' && column && !column.writable) {
      errors.push(t('businessRules.standardization.invalidOutput'))
    }
  }

  const unique = [...new Set(errors)]
  validation.value = { groupId: group.id, errors: unique, passed: unique.length === 0 }
  if (unique.length) ElMessage.warning(t('businessRules.standardization.validationFailed'))
  else ElMessage.success(t('businessRules.standardization.validationPassed'))
  return unique.length === 0
}

function saveGroup() {
  if (!activeGroup.value) return
  if (!validateGroup(activeGroup.value)) return
  activeGroup.value.updatedAt = '2026-11-19 15:00'
  ElMessage.success(t('businessRules.standardization.saved'))
}

function publishGroups() {
  const invalid = standardizationGroups.value.find((group) => !validateGroup(group))
  if (invalid) return
  groupsVersion.value = '2026-11-19-01'
  ElMessage.success(t('businessRules.standardization.published'))
}

function runTrial() {
  if (trialRunning.value) return
  trialRunning.value = true
  window.setTimeout(() => {
    trialRunning.value = false
    trialVisible.value = true
  }, 500)
}

function statusType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'UNRESOLVED') return 'warning'
  if (status === 'NOT_APPLICABLE') return 'info'
  return 'success'
}
</script>

<template>
  <div class="v-content-wrap v-standardization">
    <section class="v-standardization__head">
      <div>
        <h1 class="v-standardization__title">{{ t('businessRules.standardization.title') }}</h1>
        <div class="v-standardization__meta">
          <span>{{ t('businessRules.standardization.provider') }} · {{ t('businessRules.standardization.providerValue') }}</span>
          <span>{{ t('businessRules.standardization.schemaVersion') }} · {{ schemaVersion }}</span>
          <span>{{ t('businessRules.standardization.groupsVersion') }} · {{ groupsVersion }}</span>
        </div>
      </div>
      <div class="v-standardization__head-actions">
        <el-button :icon="Refresh" @click="runTrial">{{ t('businessRules.standardization.trialRun') }}</el-button>
        <el-button @click="publishGroups">{{ t('businessRules.standardization.publish') }}</el-button>
      </div>
    </section>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('businessRules.standardization.tabGroups')" name="groups">
        <div class="v-standardization__layout">
          <ConfigListAside
            v-model:keyword="keyword"
            :title="t('businessRules.standardization.groupList')"
            :search-placeholder="t('businessRules.standardization.searchGroup')"
            :add-label="t('businessRules.standardization.addGroup')"
            :empty-text="t('businessRules.standardization.emptyGroup')"
            :is-empty="filteredGroups.length === 0"
            @add="addGroup"
          >
            <li v-for="group in filteredGroups" :key="group.id">
              <button
                type="button"
                class="v-standardization__group-item"
                :class="{ 'is-active': group.id === activeGroupId }"
                @click="selectGroup(group.id)"
              >
                <span>{{ group.label }}</span>
                <small>{{ group.masterTable }}</small>
              </button>
            </li>
          </ConfigListAside>

          <section v-if="activeGroup" class="v-standardization__editor">
            <div class="v-standardization__section-head">
              <h2>{{ t('businessRules.standardization.basicInfo') }}</h2>
              <el-button link type="danger" :icon="Delete" @click="deleteGroup(activeGroup)">
                {{ t('businessRules.standardization.delete') }}
              </el-button>
            </div>
            <div class="v-standardization__form-grid">
              <label>
                <span>{{ t('businessRules.standardization.groupName') }}</span>
                <el-input v-model="activeGroup.label" />
              </label>
              <label>
                <span>{{ t('businessRules.standardization.masterTable') }}</span>
                <el-select v-model="activeGroup.masterTable" class="wh-full">
                  <el-option
                    v-for="master in standardizationMasterTables"
                    :key="master.masterTable"
                    :label="master.label"
                    :value="master.masterTable"
                  />
                </el-select>
              </label>
            </div>
            <p class="v-standardization__description">{{ activeMaster?.description }}</p>

            <div class="v-standardization__section-head">
              <h2>{{ t('businessRules.standardization.memberTitle') }}</h2>
              <el-button :icon="Plus" @click="addMember">{{ t('businessRules.standardization.addMember') }}</el-button>
            </div>

            <el-table :data="activeGroup.members" border class="v-standardization__members">
              <el-table-column :label="t('businessRules.standardization.column')" min-width="170">
                <template #default="{ row }">
                  <el-select :model-value="memberSourceValue(row)" filterable class="wh-full" @change="(value: string) => setMemberSource(row, value)">
                    <el-option v-for="option in masterColumnOptions()" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('businessRules.standardization.mode')" width="110">
                <template #default="{ row }">
                  <el-select v-model="row.mode" class="wh-full">
                    <el-option v-for="option in modeOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('businessRules.standardization.fieldType')" width="110">
                <template #default="{ row }">
                  <el-select v-model="row.fieldType" class="wh-full" @change="onFieldTypeChange(row)">
                    <el-option v-for="option in fieldTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('businessRules.standardization.docType')" width="120">
                <template #default="{ row }">
                  <span v-if="row.fieldType === 'CASE_FIELD'">—</span>
                  <el-select v-else v-model="row.documentTypeId" class="wh-full">
                    <el-option v-for="docType in standardizationDocTypes" :key="docType.value" :label="docType.label" :value="docType.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('businessRules.standardization.target')" min-width="150">
                <template #default="{ row }">
                  <div v-if="row.fieldType === 'TABLE_COLUMN'" class="v-standardization__stack">
                    <el-input v-model="row.tableName" />
                    <el-select v-model="row.columnName">
                      <el-option v-for="name in columnNameOptions(row)" :key="name" :label="name" :value="name" />
                    </el-select>
                  </div>
                  <el-select v-else v-model="row.fieldName" class="wh-full" filterable>
                    <el-option v-for="name in fieldNameOptions(row)" :key="name" :label="name" :value="name" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column width="48" align="center">
                <template #default="{ row }">
                  <el-button link type="danger" :icon="Delete" @click="removeMember(row.id)" />
                </template>
              </el-table-column>
            </el-table>

            <el-alert
              v-if="validation && validation.groupId === activeGroup.id"
              :type="validation.passed ? 'success' : 'error'"
              :closable="false"
              show-icon
            >
              <template #title>
                {{ validation.passed ? t('businessRules.standardization.validationPassed') : t('businessRules.standardization.validationFailed') }}
              </template>
              <ul v-if="validation.errors.length">
                <li v-for="error in validation.errors" :key="error">{{ error }}</li>
              </ul>
            </el-alert>

            <div class="v-standardization__footer">
              <el-button :icon="Check" @click="validateGroup(activeGroup)">{{ t('businessRules.standardization.validate') }}</el-button>
              <el-button type="primary" @click="saveGroup">{{ t('businessRules.standardization.save') }}</el-button>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('businessRules.standardization.tabTrial')" name="trial">
        <section class="v-standardization__trial">
          <div class="v-standardization__section-head">
            <h2>{{ t('businessRules.standardization.trialTitle') }}</h2>
            <el-button type="primary" :loading="trialRunning" @click="runTrial">{{ t('businessRules.standardization.trialRun') }}</el-button>
          </div>
          <div class="v-standardization__sample">
            <span>{{ t('businessRules.standardization.trialSample') }}</span>
            <strong>{{ t('businessRules.standardization.trialSampleValue') }}</strong>
          </div>

          <div v-if="trialVisible" class="v-standardization__results">
            <article v-for="result in standardizationTrialResults" :key="result.itemId" class="v-standardization__result-card">
              <header class="v-standardization__result-head">
                <div>
                  <h3>{{ result.groupLabel }}</h3>
                  <p>{{ result.sourceLabel }}</p>
                </div>
                <div class="v-standardization__result-tags">
                  <el-tag :type="statusType(result.status)" effect="light">{{ result.status }}</el-tag>
                  <el-tag :type="result.needsReview ? 'warning' : 'success'" effect="plain">
                    {{ result.needsReview ? t('businessRules.standardization.needsReview') : t('businessRules.standardization.autoAdopted') }}
                  </el-tag>
                </div>
              </header>
              <div class="v-standardization__result-body">
                <div v-if="result.displayName"><span>{{ t('businessRules.standardization.masterRow') }}</span><strong>{{ result.displayName }}</strong></div>
                <div v-if="Object.keys(result.values).length">
                  <span>{{ t('businessRules.standardization.writeTargets') }}</span>
                  <ul><li v-for="(value, column) in result.values" :key="column"><code>{{ column }}</code> → {{ value }}</li></ul>
                </div>
                <div v-if="result.reasons.length" class="is-warning">
                  <span>{{ t('businessRules.standardization.reviewReasons') }}</span>
                  <ul><li v-for="reason in result.reasons" :key="reason">{{ reason }}</li></ul>
                </div>
                <div v-if="result.candidates.length">
                  <span>{{ t('businessRules.standardization.candidates') }}</span>
                  <ul><li v-for="candidate in result.candidates" :key="candidate.name">{{ candidate.name }} · {{ candidate.score.toFixed(1) }}</li></ul>
                </div>
                <div v-if="result.splitItems.length">
                  <span>{{ t('businessRules.standardization.splitItems') }}</span>
                  <div class="v-standardization__split">
                    <el-tag v-for="item in result.splitItems" :key="item.text" :type="item.primary ? 'primary' : 'info'" effect="plain">
                      {{ item.text }}<template v-if="item.primary"> · {{ t('businessRules.standardization.primary') }}</template>
                    </el-tag>
                  </div>
                </div>
                <div v-if="result.selection">
                  <span>{{ t('businessRules.standardization.selection') }}</span>
                  <p>{{ result.selection.object }} / {{ result.selection.recordType }} / {{ result.selection.recordId }}</p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped lang="scss">
.v-standardization {
  padding: 24px 28px 40px;

  &__head { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
  &__title { margin: 0; font-size: 28px; }
  &__meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 8px; font-size: 15px; color: var(--el-text-color-secondary); }
  &__head-actions, &__footer { display: flex; gap: 10px; align-items: center; }
  &__layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
  &__group-item { display: flex; width: 100%; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
  &__group-item.is-active { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
  &__group-item small { color: var(--el-text-color-secondary); }
  &__editor, &__trial { min-width: 0; padding: 20px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); }
  &__section-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; }
  &__section-head h2 { margin: 0; font-size: 18px; }
  &__form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  &__form-grid label { display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
  &__description { margin: 14px 0 22px; font-size: 15px; color: var(--el-text-color-secondary); }
  &__members { margin-bottom: 16px; }
  &__stack { display: flex; flex-direction: column; gap: 8px; }
  &__footer { justify-content: flex-end; }
  &__sample { display: flex; gap: 12px; margin-bottom: 18px; font-size: 15px; color: var(--el-text-color-secondary); }
  &__sample strong { color: var(--el-text-color-primary); }
  &__results { display: grid; gap: 16px; }
  &__result-card { padding: 16px 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
  &__result-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
  &__result-head h3 { margin: 0; font-size: 17px; }
  &__result-head p { margin: 4px 0 0; font-size: 15px; color: var(--el-text-color-secondary); }
  &__result-tags { display: flex; gap: 8px; flex-wrap: wrap; }
  &__result-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; font-size: 15px; }
  &__result-body span { display: block; margin-bottom: 4px; color: var(--el-text-color-secondary); }
  &__result-body ul { margin: 0; padding-left: 18px; }
  &__result-body code { font-family: inherit; font-size: 15px; }
  &__result-body .is-warning > span { color: var(--el-color-warning); }
  &__split { display: flex; flex-wrap: wrap; gap: 8px; }
}

@media (max-width: 1180px) {
  .v-standardization__layout, .v-standardization__result-body { grid-template-columns: 1fr; }
}
</style>
