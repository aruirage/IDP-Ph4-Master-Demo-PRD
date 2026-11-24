<script setup lang="ts">
import MasterDataNavigation from '@/views/business-rules/master-data/MasterDataNavigation.vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Loading, MoreFilled, Plus, QuestionFilled, Refresh, WarningFilled } from '@element-plus/icons-vue'
import ConfigListAside from '@/components/ConfigListAside.vue'
import { CURRENT_USER } from '@/constants/currentUser'
import VerificationStandardFieldToggle from '@/views/business-rules/verification-settings/components/VerificationStandardFieldToggle.vue'
import { dataMappingRules } from '@/mocks/dataMapping'
import {
  findStandardizationDocumentType,
  fetchStandardizationCatalog,
  fetchStandardizationDefaultGroups,
  fetchStandardizationMasters,
  standardizationBusinessScenes,
  standardizationDocumentTypes,
  standardizationGroups as savedGroups,
  standardizationGroupsVersion,
  standardizationMasters,
  type StandardizationCatalog,
  type StandardizationDefaultGroups,
  type StandardizationMaster,
  type StandardizationGroup,
  type StandardizationGroupMember
} from '@/mocks/standardization'
import { p3 } from '@/mocks/phase3'

const { t, locale } = useI18n()
const dateLocale = computed(() => (locale.value === 'zh-CN' ? 'zh-CN' : 'ja-JP'))
const MEMBER_MODE_OPTIONS: StandardizationGroupMember['mode'][] = ['INPUT', 'OUTPUT', 'INPUT_OUTPUT']
const CONFIG_STORAGE_KEY = 'neosai-standardization-config-v13'
const MOCK_DATA_SEED = 'drug-v1.1-candidate-contract-v3'
const initialState = new URLSearchParams(window.location.search).get('state')
const forceEmptyState = initialState === 'empty'
const persistedConfig = (() => {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || 'null')
  } catch {
    return null
  }
})()
const configIsCurrent = persistedConfig?.mockDataSeed === MOCK_DATA_SEED

interface GroupHistoryEntry {
  id: string
  groupId: string
  groupLabel: string
  action: '作成' | '更新'
  detail: string
  version: string
  changedAt: string
  operator: string
}

interface StandardizationVersionSnapshot {
  version: string
  createdAt: string
  groups: StandardizationGroup[]
}

type StandardizationDefaultGroupTemplate = StandardizationDefaultGroups['groups'][number]

interface DefaultGroupDiffRow {
  sourceGroupId: string
  localGroupId?: string
  label: string
  masterTable: string
  action: 'new' | 'update' | 'unchanged'
  template: StandardizationDefaultGroupTemplate
}

interface WriteTargetConflict {
  key: string
  fieldLabel: string
  warningGroupId: string
  groups: Array<{
    groupId: string
    groupLabel: string
    memberIds: string[]
  }>
}

const hasSavedConfig = configIsCurrent && !forceEmptyState && Array.isArray(persistedConfig?.groups)
savedGroups.value = hasSavedConfig ? persistedConfig.groups : []
standardizationGroupsVersion.value = hasSavedConfig ? persistedConfig.version ?? '' : ''
const standardizationGroups = ref(cloneGroups(savedGroups.value))
const groupKeyword = ref('')
const activeGroupId = ref(standardizationGroups.value[0]?.groupId ?? '')
const editingGroupId = ref('')
const editingGroupName = ref('')
const renameInputRef = ref<{ focus: () => void } | null>(null)
const memberDialogVisible = ref(false)
const editingMemberId = ref('')
const fetchingMasters = ref(false)
const fetchingCatalog = ref(false)
const fetchingDefaultGroups = ref(false)
const saving = ref(false)
const syncedAt = ref(configIsCurrent ? persistedConfig?.schema?.syncedAt ?? '' : '')
const catalogSyncedAt = ref(configIsCurrent ? persistedConfig?.catalogSyncedAt ?? '' : '')
const defaultGroupsFetchedAt = ref(configIsCurrent ? persistedConfig?.defaultGroupsFetchedAt ?? '' : '')
const schemaVersion = ref(configIsCurrent ? persistedConfig?.schema?.schemaVersion ?? '' : '')
const masterOptions = ref<StandardizationMaster[]>(
  configIsCurrent && !forceEmptyState
    ? persistedConfig?.schema?.masterTables ?? standardizationMasters
    : standardizationMasters
)
const catalog = ref<StandardizationCatalog | null>(configIsCurrent ? persistedConfig?.catalog ?? null : null)
const historyVisible = ref(false)
const historyGroupId = ref('')
type ValidationState = 'idle' | 'validating' | 'valid' | 'warning' | 'invalid' | 'saved'
const validationState = ref<ValidationState>('idle')
const validationMessage = ref('')
const defaultGroupDialogVisible = ref(false)
const defaultGroupDiff = ref<DefaultGroupDiffRow[]>([])
const defaultGroupPreviewVersion = ref('')
const applyingDefaultGroups = ref(false)
const versionSnapshots = ref<StandardizationVersionSnapshot[]>(configIsCurrent ? persistedConfig?.snapshots ?? [] : [])
const defaultGroupsVersion = ref(configIsCurrent ? persistedConfig?.defaultGroupsVersion ?? '' : '')
const importedDefaultGroupIds = ref<Record<string, string>>(configIsCurrent ? persistedConfig?.importedDefaultGroupIds ?? {} : {})

const groupHistory = ref<GroupHistoryEntry[]>([])
if (configIsCurrent && persistedConfig?.history?.length) {
  groupHistory.value = (persistedConfig.history as Array<Omit<GroupHistoryEntry, 'action'> & { action: string }>)
    .filter((entry) => entry.action !== '削除')
    .map((entry) => ({
      ...entry,
      action: entry.action === '作成' ? '作成' : '更新'
    }))
}

watch(
  [savedGroups, standardizationGroupsVersion],
  () => {
    if (forceEmptyState) return
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({
      mockDataSeed: MOCK_DATA_SEED,
      groups: savedGroups.value,
      version: standardizationGroupsVersion.value,
      history: groupHistory.value,
      schema: {
        schemaVersion: schemaVersion.value,
        syncedAt: syncedAt.value,
        masterTables: masterOptions.value
      },
      catalog: catalog.value,
      catalogSyncedAt: catalogSyncedAt.value,
      defaultGroupsFetchedAt: defaultGroupsFetchedAt.value,
      snapshots: versionSnapshots.value,
      defaultGroupsVersion: defaultGroupsVersion.value,
      importedDefaultGroupIds: importedDefaultGroupIds.value
    }))
  },
  { deep: true }
)

watch(
  standardizationGroups,
  () => {
    validationState.value = 'idle'
    validationMessage.value = ''
  },
  { deep: true }
)

const forceNoApi = initialState === 'no-api'
const apiConfigured = computed(() => {
  if (forceNoApi) return false
  const connection = p3.connections.find((item) => item.module === 'master-matching')
  return connection?.testStatus === 'success' && connection.testedUrl === connection.url
})
const defaultGroupNewCount = computed(
  () => defaultGroupDiff.value.filter((row) => row.action === 'new').length
)
const defaultGroupUpdateCount = computed(
  () => defaultGroupDiff.value.filter((row) => row.action === 'update').length
)
const hasDefaultGroupChanges = computed(
  () => defaultGroupNewCount.value + defaultGroupUpdateCount.value > 0
)

const memberDraft = reactive<StandardizationGroupMember>({
  id: '',
  column: '',
  hint: '',
  mode: 'INPUT_OUTPUT',
  field: {
    type: 'FIELD',
    documentTypeId: '20002',
    fieldName: ''
  }
})

const filteredGroups = computed(() => {
  const keyword = groupKeyword.value.trim().toLowerCase()
  if (!keyword) return standardizationGroups.value
  return standardizationGroups.value.filter((group) =>
    group.label.toLowerCase().includes(keyword)
  )
})

const historyRows = computed(() =>
  groupHistory.value.filter((item) => item.groupId === historyGroupId.value)
)

const activeGroup = computed(() =>
  standardizationGroups.value.find((group) => group.groupId === activeGroupId.value) ?? null
)


const writeTargetConflicts = computed<WriteTargetConflict[]>(() => {
  const buckets = new Map<string, {
    fieldLabel: string
    groups: Map<string, { groupLabel: string; memberIds: string[] }>
  }>()

  standardizationGroups.value.forEach((group) => {
    group.members.forEach((member) => {
      if (member.mode === 'INPUT') return
      const key = memberFieldKey(member)
      const bucket = buckets.get(key) ?? {
        fieldLabel: getMemberFieldLabel(member),
        groups: new Map<string, { groupLabel: string; memberIds: string[] }>()
      }
      const groupBucket = bucket.groups.get(group.groupId) ?? {
        groupLabel: group.label,
        memberIds: []
      }
      groupBucket.memberIds.push(member.id)
      bucket.groups.set(group.groupId, groupBucket)
      buckets.set(key, bucket)
    })
  })

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.groups.size > 1)
    .map(([key, bucket]) => {
      const groups = [...bucket.groups.entries()].map(([groupId, group]) => ({
        groupId,
        groupLabel: group.groupLabel,
        memberIds: group.memberIds
      }))
      return {
        key,
        fieldLabel: bucket.fieldLabel,
        warningGroupId: groups[groups.length - 1].groupId,
        groups
      }
    })
})

const activeMaster = computed(() =>
  activeGroup.value
    ? masterOptions.value.find((master) => master.masterTable === activeGroup.value?.masterTable) ?? null
    : null
)

function commonSceneDocumentTypeIds(sceneIds: string[]) {
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

const availableDocumentTypes = computed(() => {
  const group = activeGroup.value
  if (!group?.sceneIds.length) return []
  const commonIds = commonSceneDocumentTypeIds(group.sceneIds)
  return standardizationDocumentTypes.filter((documentType) => commonIds.includes(documentType.id))
})

const canAddField = computed(
  () => Boolean(activeGroup.value?.sceneIds.length && availableDocumentTypes.value.length)
)

function masterTableLabel(master: StandardizationMaster) {
  return master.label
}

function masterTableDisplayLabel(masterTable: string) {
  const master = masterOptions.value.find((item) => item.masterTable === masterTable)
  const mockMaster = standardizationMasters.find((item) => item.masterTable === masterTable)
  return master?.label ?? mockMaster?.label ?? masterTable
}

function cloneGroups(groups: StandardizationGroup[]) {
  return JSON.parse(JSON.stringify(groups)) as StandardizationGroup[]
}

function nextGroupsVersion() {
  const current = standardizationGroupsVersion.value
  const today = new Date().toLocaleDateString('sv-SE')
  const currentDate = current.slice(0, 10)
  const currentSequence = Number(current.split('-').at(-1))
  const sequence = currentDate === today && Number.isFinite(currentSequence) ? currentSequence + 1 : 1
  return `${today}-${String(sequence).padStart(2, '0')}`
}

function createVersionSnapshot() {
  versionSnapshots.value.unshift({
    version: standardizationGroupsVersion.value,
    createdAt: new Date().toLocaleString(dateLocale.value),
    groups: cloneGroups(standardizationGroups.value)
  })
}

const masterColumnOptions = computed(() =>
  (activeMaster.value?.columns ?? []).map((column) => ({
    value: `column:${column.column}`,
    label: column.label,
    column: column.column,
    hint: '',
    role: column.inputRole,
    writable: column.writable
  }))
)

const masterHintOptions = computed(() =>
  (activeMaster.value?.hints ?? []).map((hint) => ({
    value: `hint:${hint.hint}`,
    label: hint.label,
    column: '',
    hint: hint.hint,
    role: 'SUPPORTING' as const,
    writable: false
  }))
)

const masterItemOptions = computed(() => [
  ...masterColumnOptions.value,
  ...masterHintOptions.value
])

const draftDocumentType = computed(() =>
  findStandardizationDocumentType(memberDraft.field.documentTypeId)
)

const useCaseField = computed({
  get: () => memberDraft.field.type === 'CASE_FIELD',
  set: (enabled: boolean) => {
    memberDraft.field.type = enabled ? 'CASE_FIELD' : 'FIELD'
    memberDraft.field.documentTypeId = enabled ? '' : availableDocumentTypes.value[0]?.id ?? ''
    memberDraft.field.fieldName = ''
    memberDraft.field.tableName = ''
    memberDraft.field.columnName = ''
  }
})

const draftSourceOptions = computed(() => {
  if (memberDraft.field.type === 'CASE_FIELD') {
    return dataMappingRules.value.map((rule) => ({
      value: `case:${rule.standardField}`,
      label: `${rule.displayLabel}（${rule.standardField}）`,
      tableName: '',
      columnName: ''
    }))
  }
  const documentType = draftDocumentType.value
  if (!documentType) return []
  return [
    ...documentType.fields.map((field) => ({
      value: `field:${field}`,
      label: field,
      tableName: '',
      columnName: ''
    })),
    ...Object.entries(documentType.tables).flatMap(([tableName, columns]) =>
      columns.map((columnName) => ({
        value: `table:${tableName}:${columnName}`,
        label: `${t('standardization.table')} › ${tableName} › ${columnName}`,
        tableName,
        columnName
      }))
    )
  ]
})

const draftSourceValue = computed({
  get: () => {
    if (memberDraft.field.type === 'CASE_FIELD') {
      return memberDraft.field.fieldName ? `case:${memberDraft.field.fieldName}` : ''
    }
    if (memberDraft.field.type === 'TABLE_COLUMN') {
      return memberDraft.field.tableName && memberDraft.field.columnName
        ? `table:${memberDraft.field.tableName}:${memberDraft.field.columnName}`
        : ''
    }
    return memberDraft.field.fieldName
      ? `field:${memberDraft.field.documentTypeId}:${memberDraft.field.fieldName}`
      : ''
  },
  set: (value: string) => {
    if (memberDraft.field.type === 'CASE_FIELD') {
      memberDraft.field.fieldName = value.startsWith('case:') ? value.slice(5) : ''
      return
    }
    const option = draftSourceOptions.value.find((item) => item.value === value)
    if (!option) return
    memberDraft.field.type = option.tableName ? 'TABLE_COLUMN' : 'FIELD'
    memberDraft.field.fieldName = option.columnName || option.label
    memberDraft.field.tableName = option.tableName
    memberDraft.field.columnName = option.columnName
  }
})

function newMemberId() {
  return `member-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function selectGroup(group: StandardizationGroup) {
  activeGroupId.value = group.groupId
}

function addGroup() {
  const group: StandardizationGroup = {
    groupId: crypto.randomUUID(),
    label: t('standardization.newGroupName'),
    masterTable: '',
    sceneIds: ['all'],
    members: []
  }
  standardizationGroups.value.unshift(group)
  activeGroupId.value = group.groupId
  recordHistory(group, '作成', t('standardization.historyGroupCreated', { name: group.label }))
}

function recordHistory(group: StandardizationGroup, action: GroupHistoryEntry['action'], detail: string) {
  groupHistory.value.unshift({
    id: crypto.randomUUID(),
    groupId: group.groupId,
    groupLabel: group.label,
    action,
    detail,
    version: standardizationGroupsVersion.value,
    changedAt: new Date().toLocaleString(dateLocale.value),
    operator: CURRENT_USER.name
  })
}

function copyGroup(group: StandardizationGroup) {
  const idMap = new Map(group.members.map((member) => [member.id, newMemberId()]))
  const copy: StandardizationGroup = {
    groupId: crypto.randomUUID(),
    label: `${group.label}${t('standardization.copySuffix')}`,
    masterTable: group.masterTable,
    sceneIds: [...group.sceneIds],
    members: group.members.map((member) => ({
      ...member,
      id: idMap.get(member.id) ?? newMemberId(),
      field: { ...member.field }
    }))
  }
  standardizationGroups.value.unshift(copy)
  activeGroupId.value = copy.groupId
  recordHistory(copy, '作成', t('standardization.historyCopied', { name: group.label }))
}

function startRenameGroup(group: StandardizationGroup) {
  activeGroupId.value = group.groupId
  editingGroupId.value = group.groupId
  editingGroupName.value = group.label
  nextTick(() => renameInputRef.value?.focus())
}

function cancelRenameGroup() {
  editingGroupId.value = ''
  editingGroupName.value = ''
}

function commitRenameGroup(group: StandardizationGroup) {
  if (editingGroupId.value !== group.groupId) return
  const nextLabel = editingGroupName.value.trim()
  if (!nextLabel || nextLabel === group.label) {
    cancelRenameGroup()
    return
  }
  const previous = group.label
  group.label = nextLabel
  recordHistory(group, '更新', t('standardization.historyRenamed', { before: previous, after: nextLabel }))
  cancelRenameGroup()
}

async function removeGroup(group: StandardizationGroup) {
  await ElMessageBox.confirm(
    t('standardization.confirmDeleteGroup', { name: group.label }),
    t('standardization.confirmDeleteTitle'),
    { type: 'warning', confirmButtonText: t('standardization.ok'), cancelButtonText: t('standardization.cancel') }
  )
  const index = standardizationGroups.value.findIndex((item) => item.groupId === group.groupId)
  standardizationGroups.value = standardizationGroups.value.filter(
    (item) => item.groupId !== group.groupId
  )
  activeGroupId.value = standardizationGroups.value[Math.min(index, standardizationGroups.value.length - 1)]?.groupId ?? ''
}

function openHistory(group: StandardizationGroup) {
  historyGroupId.value = group.groupId
  historyVisible.value = true
}

function handleGroupMenu(command: string, group: StandardizationGroup) {
  if (command === 'copy') copyGroup(group)
  else if (command === 'rename') startRenameGroup(group)
  else if (command === 'delete') void removeGroup(group)
  else if (command === 'history') openHistory(group)
}

function onDocumentTypeChange() {
  memberDraft.field.fieldName = ''
  memberDraft.field.tableName = ''
  memberDraft.field.columnName = ''
}

function selectMasterTable(value: string) {
  if (!activeGroup.value) return
  activeGroup.value.masterTable = value
}

function onSceneSelectionChange(sceneIds: string[]) {
  if (!activeGroup.value) return
  const previous = activeGroup.value.sceneIds
  const hasAll = sceneIds.includes('all')
  const hadAll = previous.includes('all')
  if (hasAll && !hadAll) {
    activeGroup.value.sceneIds = ['all']
    return
  }
  if (hadAll && sceneIds.some((sceneId) => sceneId !== 'all')) {
    activeGroup.value.sceneIds = sceneIds.filter((sceneId) => sceneId !== 'all')
    return
  }
  activeGroup.value.sceneIds = sceneIds
}

function onMasterItemChange(value: string) {
  const option = masterItemOptions.value.find((item) => item.value === value)
  memberDraft.column = option?.column || undefined
  memberDraft.hint = option?.hint || undefined
  if (option?.hint) memberDraft.mode = 'INPUT'
  if (option?.role === 'NONE') memberDraft.mode = 'OUTPUT'
}

function openMemberDialog(member?: StandardizationGroupMember) {
  if (!member && !canAddField.value) {
    ElMessage.warning(t('standardization.alertNoDocument'))
    return
  }
  editingMemberId.value = member?.id ?? ''
  memberDraft.externalFieldName = member?.externalFieldName
  Object.assign(memberDraft, member
    ? { ...member, field: { ...member.field } }
    : {
        id: newMemberId(),
        column: '',
        hint: '',
        mode: 'INPUT_OUTPUT',
        field: {
          type: 'FIELD',
          documentTypeId: availableDocumentTypes.value[0]?.id ?? '',
          fieldName: ''
        }
      })
  memberDialogVisible.value = true
}

function saveMember() {
  if (!activeGroup.value) return
  if (!memberDraft.field.fieldName && !memberDraft.field.columnName) {
    ElMessage.warning(t('standardization.alertSelectField'))
    return
  }
  if (memberDraft.field.type === 'TABLE_COLUMN' && !memberDraft.field.columnName) {
    ElMessage.warning(t('standardization.alertSelectTableColumn'))
    return
  }
  if (!memberDraft.column && !memberDraft.hint) {
    ElMessage.warning(t('standardization.alertSelectMasterItem'))
    return
  }
  if (
    memberDraft.field.type !== 'CASE_FIELD' &&
    !availableDocumentTypes.value.some(
      (documentType) => documentType.id === memberDraft.field.documentTypeId
    )
  ) {
    ElMessage.warning(t('standardization.alertSceneDocument'))
    return
  }
  const duplicate = activeGroup.value.members.some(
    (member) =>
      member.id !== editingMemberId.value &&
      ((memberDraft.column && member.column === memberDraft.column) ||
        (memberDraft.hint && member.hint === memberDraft.hint))
  )
  if (duplicate) {
    ElMessage.warning(t('standardization.alertDuplicateMasterItem'))
    return
  }
  const nextId = editingMemberId.value || memberDraft.id
  const next: StandardizationGroupMember = {
    id: nextId,
    column: memberDraft.column || undefined,
    hint: memberDraft.hint || undefined,
    mode: memberDraft.mode,
    field: { ...memberDraft.field }
  }
  const index = activeGroup.value.members.findIndex((member) => member.id === next.id)
  if (index >= 0) activeGroup.value.members[index] = next
  else activeGroup.value.members.push(next)
  memberDialogVisible.value = false
}

function removeMember(memberId: string) {
  if (!activeGroup.value) return
  activeGroup.value.members = activeGroup.value.members.filter((member) => member.id !== memberId)
}

function getMasterItem(member: StandardizationGroupMember) {
  return masterItemOptions.value.find(
    (item) =>
      (member.column && item.column === member.column) ||
      (member.hint && item.hint === member.hint)
  )
}

function isMasterItemUsedInGroup(value: string) {
  if (!activeGroup.value) return false
  const [kind, ...keyParts] = value.split(':')
  const key = keyParts.join(':')
  return activeGroup.value.members.some((member) =>
    member.id !== editingMemberId.value &&
    (kind === 'column' ? member.column === key : member.hint === key)
  )
}

function getMemberFieldLabel(member: StandardizationGroupMember) {
  if (!member.field.fieldName && !member.field.columnName) {
    return ''
  }
  if (member.field.type === 'CASE_FIELD') {
    const standard = dataMappingRules.value.find(
      (rule) => rule.standardField === member.field.fieldName
    )
    return `${t('standardization.standardField')} › ${standard?.displayLabel ?? member.field.fieldName}`
  }
  const documentType = findStandardizationDocumentType(member.field.documentTypeId)
  return member.field.type === 'TABLE_COLUMN'
    ? `${documentType?.label ?? ''} › ${member.field.tableName} › ${member.field.columnName}`
    : `${documentType?.label ?? ''} › ${member.field.fieldName}`
}

function memberFieldKey(member: StandardizationGroupMember) {
  if (member.field.type === 'CASE_FIELD') return `case:${member.field.fieldName ?? ''}`
  if (member.field.type === 'TABLE_COLUMN') {
    return `${member.field.documentTypeId}:table:${member.field.tableName}:${member.field.columnName}`
  }
  return `${member.field.documentTypeId}:field:${member.field.fieldName ?? ''}`
}

function actionLabel(action: GroupHistoryEntry['action']) {
  return action === '作成'
    ? t('standardization.historyCreate')
    : t('standardization.update')
}

function displayHistoryDetail(detail: string) {
  if (locale.value !== 'zh-CN') return detail
  return detail.split('、').map((segment) => {
    let match = segment.match(/^照合グループ「(.+)」を作成$/)
    if (match) return t('standardization.historyGroupCreated', { name: match[1] })
    match = segment.match(/^「(.+)」からコピー$/)
    if (match) return t('standardization.historyCopied', { name: match[1] })
    match = segment.match(/^グループ名を「(.+)」から「(.+)」に変更$/)
    if (match) return t('standardization.historyRenamed', { before: match[1], after: match[2] })
    match = segment.match(/^マスタを「(.+)」から「(.+)」に変更$/)
    if (match) return t('standardization.historyMasterChanged', { before: match[1], after: match[2] })
    match = segment.match(/^適用シーンを「(.+)」から「(.+)」に変更$/)
    if (match) return t('standardization.historyScenesChanged', { before: match[1], after: match[2] })
    match = segment.match(/^照合フィールドを追加：(.+)$/)
    if (match) return t('standardization.historyFieldsAdded', { names: match[1] })
    match = segment.match(/^照合フィールドを削除：(.+)$/)
    if (match) return t('standardization.historyFieldsRemoved', { names: match[1] })
    match = segment.match(/^照合フィールドを変更：(.+)$/)
    if (match) return t('standardization.historyFieldsChanged', { names: match[1] })
    match = segment.match(/^既定グループ「(.+)」を取り込み$/)
    if (match) return t('standardization.historyDefaultImported', { name: match[1] })
    match = segment.match(/^既定グループ「(.+)」を更新$/)
    if (match) return t('standardization.historyDefaultUpdated', { name: match[1] })
    match = segment.match(/^マスタを「(.+)」、適用シーンを「(.+)」に設定し、照合フィールド(.+)件を登録$/)
    if (match) return t('standardization.historyInitialDetail', { master: match[1], scenes: match[2], count: match[3] })
    return segment
  }).join('、')
}

function writeTargetConflictMessage(conflict: WriteTargetConflict) {
  const labelCounts = new Map<string, number>()
  conflict.groups.forEach((group) => {
    labelCounts.set(group.groupLabel, (labelCounts.get(group.groupLabel) ?? 0) + 1)
  })
  const groupSummary = Array.from(labelCounts, ([label, count]) =>
    count > 1 ? `「${label}」×${count}` : `「${label}」`
  ).join('、')
  return groupSummary
}

function modeDisabled(mode: StandardizationGroupMember['mode']) {
  const masterColumn = getMasterItem(memberDraft)
  if (!masterColumn) return false
  if (masterColumn.hint) return mode !== 'INPUT'
  if (masterColumn.role === 'NONE' && !masterColumn.writable) return true
  if (masterColumn.role === 'NONE') return mode !== 'OUTPUT'
  if (!masterColumn.writable) return mode !== 'INPUT'
  return false
}

function validateGroup(group: StandardizationGroup) {
  const errors: string[] = []
  const master = masterOptions.value.find((item) => item.masterTable === group.masterTable)
  if (!group.label.trim()) errors.push(t('standardization.validationGroupName'))
  if (!master) errors.push(t('standardization.validationMaster'))
  if (!group.sceneIds.length) errors.push(t('standardization.validationScenes'))
  if (!group.members.length) errors.push(t('standardization.validationFields'))
  const refs = group.members.map((member) => member.column || member.hint).filter(Boolean)
  if (new Set(refs).size !== refs.length) errors.push(t('standardization.validationDuplicateMaster'))
  const hasPrimaryInput = group.members.some((member) => {
    if (member.mode === 'OUTPUT') return false
    return master?.columns.find((column) => column.column === member.column)?.inputRole === 'PRIMARY'
  })
  if (!hasPrimaryInput) errors.push(t('standardization.validationPrimaryRequired'))

  const primaryInputs = group.members.filter((member) => {
    if (member.mode === 'OUTPUT') return false
    return master?.columns.find((column) => column.column === member.column)?.inputRole === 'PRIMARY'
  })
  const documentPrimaryInputs = primaryInputs.filter((member) => member.field.type !== 'CASE_FIELD')
  if (documentPrimaryInputs.length > 1) {
    const documentTypeIds = new Set(documentPrimaryInputs.map((member) => member.field.documentTypeId))
    if (documentTypeIds.size > 1) {
      errors.push(t('standardization.validationPrimaryDocType'))
    }
    const tablePrimaryInputs = documentPrimaryInputs.filter((member) => member.field.type === 'TABLE_COLUMN')
    if (tablePrimaryInputs.length > 1) {
      const tableNames = new Set(tablePrimaryInputs.map((member) => member.field.tableName))
      if (tableNames.size > 1) errors.push(t('standardization.validationPrimaryTable'))
    }
  }

  const tablePrimary = documentPrimaryInputs.find((member) => member.field.type === 'TABLE_COLUMN')
  if (tablePrimary) {
    const misaligned = group.members.find(
      (member) =>
        member.field.type === 'TABLE_COLUMN' &&
        member.field.documentTypeId === tablePrimary.field.documentTypeId &&
        member.field.tableName !== tablePrimary.field.tableName
    )
    if (misaligned) errors.push(t('standardization.validationSameTable'))
  }

  if (group.sceneIds.length) {
    const commonDocumentTypeIds = commonSceneDocumentTypeIds(group.sceneIds)
    const unsupported = group.members.find(
      (member) =>
        member.field.type !== 'CASE_FIELD'
        && !commonDocumentTypeIds.includes(member.field.documentTypeId)
    )
    if (unsupported) {
      errors.push(t('standardization.validationUnsupportedField'))
    }
  }

  for (const member of group.members) {
    const masterColumn = master?.columns.find((column) => column.column === member.column)
    if (!masterColumn && !master?.hints.some((hint) => hint.hint === member.hint)) {
      errors.push(t('standardization.alertSelectMasterItem'))
    }
    if (member.hint && member.mode !== 'INPUT') {
      errors.push(t('standardization.validationHintInputOnly'))
    }
    if (masterColumn?.inputRole === 'NONE' && !masterColumn.writable) {
      errors.push(t('standardization.validationMasterUnusable'))
    } else if (masterColumn?.inputRole === 'NONE' && member.mode !== 'OUTPUT') {
      errors.push(t('standardization.validationOutputOnly'))
    }
    if (masterColumn && !masterColumn.writable && member.mode !== 'INPUT') {
      errors.push(t('standardization.validationReadonlyInputOnly'))
    }
    if (member.field.type === 'CASE_FIELD') {
      if (!dataMappingRules.value.some((rule) => rule.standardField === member.field.fieldName)) {
        errors.push(t('standardization.validationStandardFieldMissing'))
        break
      }
      continue
    }
    const documentType = findStandardizationDocumentType(member.field.documentTypeId)
    if (!documentType) {
      errors.push(t('standardization.validationDocTypeMissing'))
      break
    }
    const fieldExists = member.field.type === 'TABLE_COLUMN'
      ? Boolean(
          member.field.tableName &&
            member.field.columnName &&
            documentType.tables[member.field.tableName]?.includes(member.field.columnName)
        )
      : documentType.fields.includes(member.field.fieldName ?? '')
    if (!fieldExists) {
      errors.push(t('standardization.validationFieldMissing', { documentType: documentType.label }))
      break
    }
  }

  return errors
}

async function saveSettings() {
  if (!activeGroup.value) return
  saving.value = true
  try {
    const firstError = standardizationGroups.value.flatMap((group) =>
      validateGroup(group).map((message) => `${group.label}：${message}`)
    )[0]
    if (firstError) {
      validationState.value = 'invalid'
      validationMessage.value = firstError
      ElMessage.warning(firstError)
      return
    }
    const warnings = writeTargetConflicts.value.map(writeTargetConflictMessage)
    if (warnings.length) ElMessage.warning(warnings.join('、'))
    const previousGroups = savedGroups.value
    savedGroups.value = cloneGroups(standardizationGroups.value)
    standardizationGroupsVersion.value = nextGroupsVersion()
    createVersionSnapshot()
    standardizationGroups.value.forEach((group) => {
      const previous = previousGroups.find((item) => item.groupId === group.groupId)
      const detail = describeSavedGroupChanges(group, previous)
      if (detail) recordHistory(group, '更新', detail)
    })
    validationState.value = 'saved'
    validationMessage.value = t('standardization.saved')
    ElMessage.success(t('standardization.saveSuccess'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('standardization.saveFailed'))
  } finally {
    saving.value = false
  }
}

function closeSettings() {
  activeGroupId.value = ''
}

async function fetchMasters(options: { silent?: boolean } = {}) {
  if (fetchingMasters.value) return false
  fetchingMasters.value = true
  try {
    const result = await fetchStandardizationMasters()
    masterOptions.value = result.masterTables
    schemaVersion.value = result.schemaVersion
    syncedAt.value = new Date().toLocaleString(dateLocale.value)
    if (!options.silent) ElMessage.success(t('standardization.syncSuccess'))
    return true
  } catch (error) {
    if (!options.silent) {
      ElMessage.error(error instanceof Error ? error.message : t('standardization.syncPartialFailed'))
    }
    return false
  } finally {
    fetchingMasters.value = false
  }
}

async function fetchCatalog(options: { silent?: boolean } = {}) {
  if (fetchingCatalog.value) return false
  fetchingCatalog.value = true
  try {
    catalog.value = await fetchStandardizationCatalog()
    catalogSyncedAt.value = new Date().toLocaleString(dateLocale.value)
    if (!options.silent) ElMessage.success(t('standardization.syncSuccess'))
    return true
  } catch (error) {
    if (!options.silent) {
      ElMessage.error(error instanceof Error ? error.message : t('standardization.catalogSyncFailed'))
    }
    return false
  } finally {
    fetchingCatalog.value = false
  }
}

async function fetchDefaultGroups(options: { silent?: boolean } = {}) {
  if (fetchingDefaultGroups.value) return false
  fetchingDefaultGroups.value = true
  try {
    const defaults = await fetchStandardizationDefaultGroups()
    defaultGroupPreviewVersion.value = defaults.version
    defaultGroupDiff.value = buildDefaultGroupDiff(defaults)
    defaultGroupDialogVisible.value = true
    defaultGroupsFetchedAt.value = new Date().toLocaleString(dateLocale.value)
    if (!options.silent && !hasDefaultGroupChanges.value) {
      ElMessage.info(t('standardization.defaultNoChanges'))
    }
    return true
  } catch (error) {
    if (!options.silent) {
      ElMessage.error(error instanceof Error ? error.message : t('standardization.defaultFetchFailed'))
    }
    return false
  } finally {
    fetchingDefaultGroups.value = false
  }
}

async function ensureMasterDataLoaded(visible: boolean) {
  if (!visible || !apiConfigured.value) return
  const [mastersLoaded, catalogLoaded] = await Promise.all([
    fetchMasters({ silent: true }),
    fetchCatalog({ silent: true })
  ])
  if (!mastersLoaded || !catalogLoaded) {
    ElMessage.warning(t('standardization.syncPartialUpdateFailed'))
  }
}

function groupSignature(group: Pick<StandardizationGroup, 'label' | 'masterTable' | 'members'>) {
  return JSON.stringify({
    label: group.label,
    masterTable: group.masterTable,
    members: group.members.map((member) => ({
      column: member.column,
      hint: member.hint,
      mode: member.mode,
      type: member.field.type,
      documentTypeId: member.field.documentTypeId,
      fieldName: member.field.fieldName,
      tableName: member.field.tableName,
      columnName: member.field.columnName
    }))
  })
}

function sceneLabels(sceneIds: string[]) {
  return sceneIds
    .map((sceneId) => standardizationBusinessScenes.find((scene) => scene.id === sceneId)?.label ?? sceneId)
    .join('、')
}

function summarizeMemberLabels(members: StandardizationGroupMember[]) {
  const labels = members.map(getMemberFieldLabel)
  return `${labels.slice(0, 3).join('、')}${labels.length > 3 ? t('standardization.moreItems', { count: labels.length - 3 }) : ''}`
}

function describeSavedGroupChanges(group: StandardizationGroup, previous?: StandardizationGroup) {
  const currentScenes = sceneLabels(group.sceneIds)
  if (!previous) {
    return t('standardization.historyInitialDetail', {
      master: masterTableDisplayLabel(group.masterTable),
      scenes: currentScenes,
      count: group.members.length
    })
  }

  const changes: string[] = []
  if (group.label !== previous.label) {
    changes.push(t('standardization.historyRenamed', { before: previous.label, after: group.label }))
  }
  if (group.masterTable !== previous.masterTable) {
    changes.push(t('standardization.historyMasterChanged', {
      before: masterTableDisplayLabel(previous.masterTable),
      after: masterTableDisplayLabel(group.masterTable)
    }))
  }
  if (sceneLabels(group.sceneIds) !== sceneLabels(previous.sceneIds)) {
    changes.push(t('standardization.historyScenesChanged', {
      before: sceneLabels(previous.sceneIds),
      after: currentScenes
    }))
  }

  const previousMembers = new Map(previous.members.map((member) => [member.id, member]))
  const currentMemberIds = new Set(group.members.map((member) => member.id))
  const added = group.members.filter((member) => !previousMembers.has(member.id))
  const removed = previous.members.filter((member) => !currentMemberIds.has(member.id))
  const changed = group.members.filter((member) => {
    const oldMember = previousMembers.get(member.id)
    return oldMember && JSON.stringify(oldMember) !== JSON.stringify(member)
  })

  if (added.length) changes.push(t('standardization.historyFieldsAdded', { names: summarizeMemberLabels(added) }))
  if (removed.length) changes.push(t('standardization.historyFieldsRemoved', { names: summarizeMemberLabels(removed) }))
  if (changed.length) changes.push(t('standardization.historyFieldsChanged', { names: summarizeMemberLabels(changed) }))

  return changes.join('、')
}

function buildDefaultGroupDiff(defaults: StandardizationDefaultGroups): DefaultGroupDiffRow[] {
  return defaults.groups.map((template) => {
    const mappedGroupId = importedDefaultGroupIds.value[template.groupId]
    const mappedGroup = mappedGroupId
      ? standardizationGroups.value.find((group) => group.groupId === mappedGroupId)
      : standardizationGroups.value.find((group) => group.sourceDefaultGroupId === template.groupId)
    if (mappedGroup) {
      return {
        sourceGroupId: template.groupId,
        localGroupId: mappedGroup.groupId,
        label: template.label,
        masterTable: template.masterTable,
        action: (mappedGroup.sourceDefaultSignature ?? groupSignature(mappedGroup)) === groupSignature(template) ? 'unchanged' : 'update',
        template
      }
    }
    return {
      sourceGroupId: template.groupId,
      label: template.label,
      masterTable: template.masterTable,
      action: 'new',
      template
    }
  })
}

function templateMembers(template: StandardizationDefaultGroupTemplate): StandardizationGroupMember[] {
  return template.members.map((member) => ({
    ...member,
    id: newMemberId(),
    externalFieldName: member.field.columnName ?? member.field.fieldName,
    field: { type: member.field.type, documentTypeId: '' }
  }))
}

function applyDefaultGroups() {
  if (applyingDefaultGroups.value || !hasDefaultGroupChanges.value) return
  applyingDefaultGroups.value = true
  try {
    let inserted = 0
    let updated = 0
    defaultGroupDiff.value.forEach((row) => {
      if (row.action === 'unchanged') {
        if (!importedDefaultGroupIds.value[row.sourceGroupId] && row.localGroupId) {
          importedDefaultGroupIds.value[row.sourceGroupId] = row.localGroupId
        }
        const matchedGroup = standardizationGroups.value.find(
          (group) => group.groupId === row.localGroupId
        )
        if (matchedGroup) matchedGroup.sourceDefaultGroupId = row.sourceGroupId
        return
      }
      if (row.action === 'new') {
        const group: StandardizationGroup = {
          groupId: crypto.randomUUID(),
          sourceDefaultGroupId: row.sourceGroupId,
          sourceDefaultSignature: groupSignature(row.template),
          label: row.template.label,
          masterTable: row.template.masterTable,
          sceneIds: [],
          members: templateMembers(row.template)
        }
        standardizationGroups.value.unshift(group)
        importedDefaultGroupIds.value[row.sourceGroupId] = group.groupId
        inserted += 1
        return
      }
      if (row.action !== 'update') return
      const localGroup = standardizationGroups.value.find((group) => group.groupId === row.localGroupId)
      if (!localGroup) return
      localGroup.label = row.template.label
      localGroup.masterTable = row.template.masterTable
      localGroup.members = templateMembers(row.template)
      localGroup.sourceDefaultGroupId = row.sourceGroupId
      localGroup.sourceDefaultSignature = groupSignature(row.template)
      updated += 1
    })
    defaultGroupsVersion.value = defaultGroupPreviewVersion.value
    defaultGroupDialogVisible.value = false
    activeGroupId.value = activeGroupId.value || standardizationGroups.value[0]?.groupId || ''
    ElMessage.success(t('standardization.defaultUpdated', { inserted, updated }))
  } finally {
    applyingDefaultGroups.value = false
  }
}

</script>

<template>
  <div class="standardization-page v-content-wrap">
    <MasterDataNavigation />

    <div v-if="apiConfigured" class="standardization-page__layout">
      <ConfigListAside
        v-model:keyword="groupKeyword"
        :title="$t('standardization.groupList')"
        :search-placeholder="$t('standardization.searchGroups')"
        :add-label="$t('standardization.add')"
        :empty-text="$t('standardization.emptyGroups')"
        :is-empty="filteredGroups.length === 0"
        @add="addGroup"
      >
        <template #header-actions>
          <div class="standardization-page__default-group-actions">
            <el-button
              type="primary"
              plain
              circle
              :icon="Refresh"
              :loading="fetchingDefaultGroups"
              :disabled="fetchingDefaultGroups"
              class="standardization-page__default-groups"
              :aria-label="$t('standardization.defaultButton')"
              @click="fetchDefaultGroups()"
            />
          </div>
        </template>
        <li
          v-for="group in filteredGroups"
          :key="group.groupId"
          class="v-config-list-aside__list-item"
          :class="{
            'is-active': activeGroupId === group.groupId,
            'is-renaming': editingGroupId === group.groupId
          }"
          @click="selectGroup(group)"
        >
          <template v-if="editingGroupId === group.groupId">
            <el-input
              ref="renameInputRef"
              v-model="editingGroupName"
              class="v-config-list-aside__list-rename-input"
              size="small"
              @click.stop
              @keyup.enter.stop="commitRenameGroup(group)"
              @keyup.esc.stop="cancelRenameGroup"
              @blur="commitRenameGroup(group)"
            />
            <div class="v-config-list-aside__list-rename-actions" @click.stop>
              <button
                type="button"
                class="v-config-list-aside__list-rename-btn"
                @mousedown.prevent
                @click="commitRenameGroup(group)"
              >
                {{ $t('standardization.save') }}
              </button>
              <button
                type="button"
                class="v-config-list-aside__list-rename-btn is-cancel"
                @mousedown.prevent
                @click="cancelRenameGroup"
              >
                {{ $t('standardization.cancel') }}
              </button>
            </div>
          </template>
          <span v-else class="v-config-list-aside__list-name">{{ group.label }}</span>
          <el-dropdown
            v-if="editingGroupId !== group.groupId"
            trigger="hover"
            @click.stop
            @command="(command: string) => handleGroupMenu(command, group)"
          >
            <button type="button" class="v-config-list-aside__list-menu" @click.stop>
              <el-icon :size="16"><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="copy">{{ $t('standardization.copy') }}</el-dropdown-item>
                <el-dropdown-item command="rename">{{ $t('standardization.rename') }}</el-dropdown-item>
                <el-dropdown-item command="delete" class="standardization-page__delete-item">{{ $t('standardization.delete') }}</el-dropdown-item>
                <el-dropdown-item command="history">{{ $t('standardization.history') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </li>
      </ConfigListAside>

      <section v-if="activeGroup" class="standardization-page__main">
        <div class="standardization-page__main-scroll">
          <div class="standardization-page__form-grid">
            <AppFormItem :label="$t('standardization.groupName')" required>
              <el-input v-model="activeGroup.label" />
            </AppFormItem>
            <AppFormItem :label="$t('standardization.master')" required>
              <el-select
                :model-value="activeGroup.masterTable"
                :loading="fetchingMasters"
                :placeholder="$t('standardization.selectMaster')"
                @visible-change="ensureMasterDataLoaded"
                @update:model-value="selectMasterTable"
              >
                <el-option
                  v-for="master in masterOptions"
                  :key="master.masterTable"
                  :label="`${masterTableLabel(master)}${master.enabled === false ? $t('standardization.unavailable') : ''}`"
                  :value="master.masterTable"
                  :disabled="master.enabled === false"
                />
              </el-select>
            </AppFormItem>
            <AppFormItem class="standardization-page__scene-field" :label="$t('standardization.scenes')" required>
              <el-select
                :model-value="activeGroup.sceneIds"
                multiple
                collapse-tags
                collapse-tags-tooltip
                :max-collapse-tags="5"
                @update:model-value="onSceneSelectionChange"
              >
                <el-option
                  v-for="scene in standardizationBusinessScenes"
                  :key="scene.id"
                  :label="scene.label"
                  :value="scene.id"
                />
              </el-select>
            </AppFormItem>
          </div>

          <div class="standardization-page__section-head">
            <h2>{{ $t('standardization.matchFields') }}</h2>
            <el-button
              type="primary"
              :icon="Plus"
              :disabled="!canAddField"
              @click="openMemberDialog()"
            >
              {{ $t('standardization.addField') }}
            </el-button>
          </div>

          <el-table
            :data="activeGroup.members"
            border
            class="standardization-page__mapping-table"
            :header-cell-style="{ textAlign: 'left' }"
          >
            <el-table-column :label="$t('standardization.no')" width="64">
              <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column :label="$t('standardization.masterItem')" min-width="160">
              <template #default="{ row }">
                <span class="standardization-page__master-column-name">
                  {{ getMasterItem(row)?.label ?? row.column ?? row.hint ?? '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('standardization.field')" min-width="220">
              <template #default="{ row }">{{ getMemberFieldLabel(row) }}</template>
            </el-table-column>
            <el-table-column width="150">
              <template #header>
                <span class="standardization-page__column-heading">
                  {{ $t('standardization.mode') }}
                  <el-tooltip placement="top">
                    <template #content>
                      <div class="standardization-page__tooltip-lines">
                        <span>{{ $t('standardization.modeInputHint') }}</span>
                        <span>{{ $t('standardization.modeInputOutputHint') }}</span>
                        <span>{{ $t('standardization.modeOutputHint') }}</span>
                      </div>
                    </template>
                    <el-icon><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <template #default="{ row }">{{ row.mode }}</template>
            </el-table-column>
            <el-table-column :label="$t('standardization.role')" width="135">
              <template #default="{ row }">{{ row.column ? getMasterItem(row)?.role ?? '—' : '—' }}</template>
            </el-table-column>
            <el-table-column :label="$t('standardization.writable')" width="130">
              <template #default="{ row }">{{ row.column ? getMasterItem(row)?.writable ?? '—' : '—' }}</template>
            </el-table-column>
            <el-table-column :label="$t('standardization.actions')" width="120" align="right" header-align="left" fixed="right">
              <template #default="{ row }">
                <div class="standardization-page__row-actions">
                  <el-button link type="primary" @click="openMemberDialog(row)">{{ $t('standardization.edit') }}</el-button>
                  <el-button link type="danger" @click="removeMember(row.id)">{{ $t('standardization.delete') }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

        </div>

        <footer class="standardization-page__footer">
          <div
            v-if="validationMessage"
            class="standardization-page__validation"
            :class="`is-${validationState}`"
            aria-live="polite"
          >
            <el-icon v-if="validationState === 'validating'" class="is-spinning"><Loading /></el-icon>
            <el-icon v-else-if="validationState === 'valid' || validationState === 'saved'"><CircleCheck /></el-icon>
            <el-icon v-else-if="validationState === 'warning' || validationState === 'invalid'"><WarningFilled /></el-icon>
            <span>{{ validationMessage }}</span>
          </div>
          <div class="standardization-page__footer-actions">
            <el-button @click="closeSettings">{{ $t('standardization.close') }}</el-button>
            <el-button
              type="primary"
              :loading="saving"
              :disabled="saving"
              @click="saveSettings"
            >
              {{ $t('standardization.save') }}
            </el-button>
          </div>
        </footer>
      </section>

      <section v-else class="standardization-page__main standardization-page__main--empty">
        <div v-if="!standardizationGroups.length" class="standardization-page__empty-state">
          <el-empty :description="$t('standardization.emptyGroups')" :image-size="100" />
          <ol class="standardization-page__empty-steps">
            <li>{{ $t('standardization.emptyGuideDefaultGroup') }}</li>
          </ol>
        </div>
        <el-empty v-else :description="$t('standardization.selectGroup')" :image-size="100" />
      </section>
    </div>


    <section v-else class="standardization-page__api-empty">
      <el-empty
        :description="$t('standardization.apiNotConfigured')"
        :image-size="112"
      />
    </section>

    <el-dialog
      v-model="memberDialogVisible"
      :title="editingMemberId ? $t('standardization.editFieldTitle') : $t('standardization.addFieldTitle')"
      width="640px"
    >
      <el-form label-position="top">
        <div class="standardization-page__dialog-grid">
          <el-form-item :label="$t('standardization.masterItem')" required>
            <el-select
              :model-value="memberDraft.column ? `column:${memberDraft.column}` : memberDraft.hint ? `hint:${memberDraft.hint}` : ''"
              @visible-change="ensureMasterDataLoaded"
              :loading="fetchingMasters"
              @change="onMasterItemChange"
            >
              <el-option-group label="Column">
                <el-option
                  v-for="item in masterColumnOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                  :disabled="isMasterItemUsedInGroup(item.value)"
                >
                  <div class="standardization-page__master-option">
                    <span :title="item.label">{{ item.label }}</span>
                    <span>{{ item.role }}</span>
                  </div>
                </el-option>
              </el-option-group>
              <el-option-group v-if="masterHintOptions.length" label="Hint">
                <el-option
                  v-for="item in masterHintOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                  :disabled="isMasterItemUsedInGroup(item.value)"
                />
              </el-option-group>
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('standardization.mode')" required>
            <el-select v-model="memberDraft.mode">
              <el-option
                v-for="option in MEMBER_MODE_OPTIONS"
                :key="option"
                :label="option"
                :value="option"
                :disabled="modeDisabled(option)"
              />
            </el-select>
          </el-form-item>
        </div>
        <div class="standardization-page__field-target-section">
          <div class="standardization-page__field-target-head">
            <span>{{ $t('standardization.field') }}</span>
            <VerificationStandardFieldToggle v-model="useCaseField" />
          </div>
          <div class="standardization-page__dialog-grid">
            <el-form-item v-if="!useCaseField" :label="$t('standardization.docType')" required>
              <el-select v-model="memberDraft.field.documentTypeId" @change="onDocumentTypeChange">
                <el-option
                  v-for="documentType in availableDocumentTypes"
                  :key="documentType.id"
                  :label="documentType.label"
                  :value="documentType.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-else :label="$t('standardization.target')">
              <div class="standardization-page__field-target-context">{{ $t('standardization.caseStandardField') }}</div>
            </el-form-item>
            <el-form-item :label="useCaseField ? $t('standardization.standardField') : $t('standardization.field')" required>
              <el-select v-model="draftSourceValue" :placeholder="memberDraft.externalFieldName || undefined">
                <el-option
                  v-for="field in draftSourceOptions"
                  :key="field.value"
                  :label="field.label"
                  :value="field.value"
                />
              </el-select>
            </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="memberDialogVisible = false">{{ $t('standardization.cancel') }}</el-button>
        <el-button type="primary" @click="saveMember">{{ $t('standardization.ok') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyVisible" :title="$t('standardization.historyTitle')" width="760px">
      <el-table :data="historyRows" border max-height="420">
        <el-table-column prop="changedAt" :label="$t('standardization.dateTime')" width="180" />
        <el-table-column prop="action" :label="$t('standardization.actions')" width="110">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column prop="operator" :label="$t('standardization.operator')" width="110" />
        <el-table-column prop="detail" :label="$t('standardization.detail')" min-width="300">
          <template #default="{ row }">{{ displayHistoryDetail(row.detail) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="primary" @click="historyVisible = false">{{ $t('standardization.close') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="defaultGroupDialogVisible"
      :title="$t('standardization.defaultGroupTitle')"
      width="760px"
    >
      <el-table :data="defaultGroupDiff" border max-height="420">
        <el-table-column prop="label" :label="$t('standardization.groupName')" min-width="220" />
        <el-table-column :label="$t('standardization.master')" min-width="180">
          <template #default="{ row }">
            {{ masterTableDisplayLabel(row.masterTable) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('standardization.itemCount')" width="100" align="right">
          <template #default="{ row }">{{ $t('standardization.countItems', { count: row.template.members.length }) }}</template>
        </el-table-column>
        <el-table-column :label="$t('standardization.status')" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.action === 'new' ? 'primary' : row.action === 'update' ? 'warning' : 'info'"
              effect="light"
            >
              {{ row.action === 'new' ? $t('standardization.new') : row.action === 'update' ? $t('standardization.update') : $t('standardization.unchanged') }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="defaultGroupDialogVisible = false">{{ $t('standardization.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="applyingDefaultGroups"
          :disabled="!hasDefaultGroupChanges || applyingDefaultGroups"
          @click="applyDefaultGroups"
        >
          {{ $t('standardization.update') }}
        </el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped lang="scss">
.standardization-page {
  display: flex;
  flex-direction: column;
  gap: var(--app-page-gap);
  padding: 24px;
  color: var(--text-primary);

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.3;
    }
  }

  &__header-actions,
  &__default-group-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__sync-status {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  &__sync-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-primary);
    font-weight: 600;
  }

  &__sync-warning {
    margin: 0;
    font-size: 16px;
    line-height: 1.7;
  }

  &__layout {
    display: flex;
    align-items: stretch;
    gap: var(--app-page-gap);
    min-height: 620px;
  }

  &__api-empty {
    display: grid;
    place-items: center;
    min-height: 560px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #fff;
  }

  &__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: #fff;
  }

  &__main--empty {
    align-items: center;
    justify-content: center;
  }

  &__empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 560px;
    padding: 32px;
  }

  &__empty-steps {
    margin: 0 0 20px;
    padding-left: 20px;
    color: var(--text-secondary);
    line-height: 1.8;
  }

  &__main-scroll {
    flex: 1;
    min-height: 0;
    padding: 16px;
    overflow: auto;
  }

  &__form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px 20px;
    align-items: start;
  }

  &__scene-field {
    grid-column: 1 / -1;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 8px 0 10px;

    h2 {
      margin: 0;
      font-size: 18px;
    }
  }

  &__footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-color);
    background: #fafbfc;
  }

  &__master-option {
    display: flex;
    justify-content: space-between;
    gap: 12px;

    span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span:last-child {
      flex-shrink: 0;
      color: var(--el-text-color-secondary);
    }
  }

  &__footer-actions {
    margin-inline-start: auto;
    display: flex;
    flex-shrink: 0;
    gap: var(--app-action-bar-gap);

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }
  }

  &__validation {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 15px;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &.is-validating {
      color: var(--el-color-primary);
    }

    &.is-valid,
    &.is-saved {
      color: var(--el-color-success);
    }

    &.is-warning {
      color: var(--el-color-warning);
    }

    &.is-invalid {
      color: var(--el-color-danger);
    }

    .is-spinning {
      animation: standardization-spin 0.9s linear infinite;
    }
  }

  &__dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
  }

  &__field-target-section {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
  }

  &__field-target-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 700;
  }

  &__field-target-context {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 0 11px;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    color: var(--text-secondary);
    font-size: 13px;
  }

  &__mapping-table {
    :deep(.el-table__inner-wrapper) {
      overflow: hidden;
      border-radius: 10px;
    }

    :deep(.el-table__header-wrapper th.el-table__cell) {
      height: 44px;
      border-bottom-color: #d5e1f3;
      background: #eef5ff;
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 700;
    }
  }

  &__master-column-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  &__master-column-name {
    line-height: 1.4;
  }

  &__role-tag {
    height: 18px;
    padding: 0 5px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    line-height: 16px;

    border-color: #d0d5dd;
    background: #f9fafb;
    color: #475467;

    &.is-primary {
      border-color: #b9cdf2;
      background: #eef4ff;
      color: #175cd3;
    }

    &.is-supporting {
      border-color: #b8dfca;
      background: #edf9f2;
      color: #087a4b;
    }

    &.is-none {
      border-color: #efd7a3;
      background: #fff8e7;
      color: #8f5700;
    }

    &.is-hint {
      border-color: #d0d5dd;
      background: #f2f4f7;
      color: #475467;
    }
  }

  &__column-heading {
    display: inline-flex;
    align-items: center;
    gap: 4px;

    .el-icon {
      color: var(--text-secondary);
      font-size: 13px;
      cursor: help;
    }
  }

  &__row-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    white-space: nowrap;
  }

  &__validation-role {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;

    i {
      width: 7px;
      height: 7px;
      flex: none;
      border-radius: 50%;
      background: currentColor;
    }

    &.is-primary { color: var(--el-color-primary); }
    &.is-supporting { color: var(--text-secondary); }
    &.is-output { color: var(--el-color-warning); }
    &.is-error { color: var(--el-color-danger); }
    &.is-checking { color: var(--el-color-primary); }
    &.is-idle { color: var(--text-secondary); font-weight: 400; }
  }

  &__default-groups {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    padding: 0;
  }

}

@keyframes standardization-spin {
  to {
    transform: rotate(360deg);
  }
}

:global(.standardization-page__tooltip-lines) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 320px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .standardization-page__layout {
    flex-direction: column;
  }

  .standardization-page__form-grid,
  .standardization-page__dialog-grid {
    grid-template-columns: 1fr;
  }

}

</style>
