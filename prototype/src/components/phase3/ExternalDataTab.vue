<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Delete, EditPen, Plus } from '@element-plus/icons-vue'
import { p3, type ExternalConnection, type ExternalConnectionModule } from '@/mocks/phase3'
import { MESSAGE_BOX_CONFIRM_DEFAULTS } from '@/constants/messageBox'

type Connector = NonNullable<ExternalConnection['connector']>
type Authentication = NonNullable<ExternalConnection['authentication']>

const { t } = useI18n()
const visible = ref(false)
const editing = ref('')
const draft = reactive({
  name: '',
  module: 'master-matching' as ExternalConnectionModule,
  url: '',
  secret: '',
  connector: 'standardization' as Connector,
  authentication: 'api-key-bearer' as Authentication
})
const testing = ref('')

const original = computed(() => p3.connections.find((connection) => connection.id === editing.value))
const providerOptions = computed(() => [
  { value: 'standardization' as Connector, label: t('phase3.zurichStandardizationApi') }
])
const authenticationOptions = computed(() => [
  { value: 'api-key-bearer' as Authentication, label: t('phase3.apiKeyBearerAuth') }
])
const hasStoredSecret = computed(() => Boolean(original.value?.secretConfigured))
const hasSecret = computed(() => Boolean(draft.secret.trim()) || hasStoredSecret.value)
const maskedApiKey = computed(() => original.value?.apiKeyMasked || (hasStoredSecret.value ? '••••••••••••' : ''))
const dialogTitle = computed(() =>
  editing.value ? t('phase3.editConnectionTitle') : t('phase3.addConnectionTitle')
)
const valid = computed(() =>
  Boolean(draft.name.trim())
  && /^https:\/\/\S+$/i.test(draft.url.trim())
  && hasSecret.value
  && providerOptions.value.some((option) => option.value === draft.connector)
  && authenticationOptions.value.some((option) => option.value === draft.authentication)
)
const moduleOwner = computed(() => draft.module
  ? p3.connections.find((row) => row.module === draft.module && row.id !== editing.value)
  : undefined
)
const canSave = computed(() => valid.value && !moduleOwner.value)

function open(row?: ExternalConnection) {
  editing.value = row?.id || ''
  Object.assign(draft, {
    name: row?.name || '',
    module: row?.module ?? 'master-matching',
    url: row?.url || '',
    secret: '',
    connector: row?.connector || 'standardization',
    authentication: row?.authentication || 'api-key-bearer'
  })
  visible.value = true
}

function close() {
  draft.secret = ''
}

function save() {
  if (!canSave.value) return
  const old = original.value
  const now = new Date().toLocaleString('ja-JP')
  const sameEndpoint = Boolean(
    old
    && old.url === draft.url.trim()
    && old.connector === draft.connector
    && old.authentication === draft.authentication
    && !draft.secret.trim()
  )
  const row: ExternalConnection = {
    id: old?.id || crypto.randomUUID(),
    name: draft.name.trim(),
    module: draft.module,
    url: draft.url.trim(),
    connector: draft.connector,
    authentication: draft.authentication,
    apiKeyMasked: draft.secret.trim()
      ? maskApiKey(draft.secret)
      : old?.apiKeyMasked || (hasStoredSecret.value ? '••••••••••••' : undefined),
    secretConfigured: hasSecret.value,
    created: old?.created || now,
    creator: old?.creator || '管理者',
    updated: now,
    updatedBy: '管理者',
    testStatus: sameEndpoint ? old?.testStatus : undefined,
    testedUrl: sameEndpoint ? old?.testedUrl : undefined
  }
  if (old) Object.assign(old, row)
  else p3.connections.push(row)
  draft.secret = ''
  visible.value = false
  ElMessage.success(t('phase3.saved'))
}

async function test(row: ExternalConnection) {
  if (testing.value) return
  if (!row.secretConfigured) {
    open(row)
    return
  }
  testing.value = row.id
  const snapshot = JSON.stringify([row.url, row.connector, row.authentication])
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (snapshot === JSON.stringify([row.url, row.connector, row.authentication])) {
    row.testStatus = /^https:\/\/\S+$/i.test(row.url) && !row.url.includes('/fail') ? 'success' : 'failed'
    row.testedUrl = row.url
    ElMessage[row.testStatus === 'success' ? 'success' : 'error'](
      t(row.testStatus === 'success' ? 'phase3.mockConnectionSuccess' : 'phase3.connectionFailed')
    )
  }
  testing.value = ''
}

function maskApiKey(value: string) {
  const trimmed = value.trim()
  if (trimmed.length < 8) return '••••••••'
  return `${trimmed.slice(0, 3)}••••••••${trimmed.slice(-4)}`
}

async function remove(row: ExternalConnection) {
  const usageHint = row.module === 'master-matching'
    ? t('businessRules.model.message.deleteUsageHint', { usages: t('phase3.masterMatchingModule') })
    : ''

  try {
    await ElMessageBox.confirm(
      t('businessRules.model.message.deleteConfirm', { name: row.name, usageHint }),
      t('businessRules.model.message.deleteTitle'),
      { ...MESSAGE_BOX_CONFIRM_DEFAULTS, type: 'warning' }
    )
  } catch {
    return
  }

  p3.connections = p3.connections.filter((connection) => connection.id !== row.id)
  for (const config of Object.values(p3.masters)) {
    if (config.connection === row.id) config.connection = ''
  }
}
</script>

<template>
  <div class="p3-connections">
    <div class="p3-end">
      <el-button type="primary" :icon="Plus" @click="open()">{{ t('phase3.addConnection') }}</el-button>
    </div>

    <el-table :data="p3.connections" border>
      <el-table-column type="index" label="No." width="64" />
      <el-table-column prop="name" :label="t('phase3.name')" min-width="160" />
      <el-table-column :label="t('phase3.connectionModule')" min-width="160">
        <template #default="{ row }">
          {{ row.module ? t('phase3.masterMatchingModule') : '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="url" :label="t('phase3.baseUrl')" min-width="240" show-overflow-tooltip />
      <el-table-column prop="created" :label="t('phase3.created')" min-width="180" />
      <el-table-column :label="t('phase3.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.testStatus === 'success' && row.testedUrl === row.url ? 'success' : row.testStatus === 'failed' ? 'danger' : 'info'">
            {{ row.testStatus ? t(row.testStatus === 'success' && row.testedUrl === row.url ? 'phase3.connectionValid' : 'phase3.connectionInvalid') : '未確認' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="creator" :label="t('phase3.creator')" width="120" />
      <el-table-column :label="t('phase3.connectionAudit')" min-width="180">
        <template #default="{ row }">
          {{ row.updated || '—' }}<span v-if="row.updatedBy"> / {{ row.updatedBy }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('phase3.actions')" width="280">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :icon="Connection"
            :loading="testing === row.id"
            :disabled="Boolean(testing) && testing !== row.id"
            @click="test(row)"
          >
            {{ t('phase3.connectionTest') }}
          </el-button>
          <el-button link type="primary" :icon="EditPen" @click="open(row)">{{ t('phase3.edit') }}</el-button>
          <el-button link type="danger" :icon="Delete" @click="remove(row)">{{ t('phase3.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="visible"
      :title="dialogTitle"
      width="600px"
      destroy-on-close
      @closed="close"
    >
      <el-form label-position="top">
        <el-form-item required>
          <template #label>
            <span>{{ t('phase3.name') }}</span><span class="p3-required-tag">必須</span>
          </template>
          <el-input v-model="draft.name" />
        </el-form-item>

        <el-form-item
          :label="t('phase3.connectionUsageAssignment')"
          required
          :error="moduleOwner ? t('phase3.connectionModuleOccupied', { name: moduleOwner.name }) : undefined"
        >
          <el-select v-model="draft.module">
            <el-option value="master-matching" :label="t('phase3.masterMatchingModule')" />
          </el-select>
        </el-form-item>

        <el-form-item required>
          <template #label>
            <span>{{ t('phase3.provider') }}</span><span class="p3-required-tag">必須</span>
          </template>
          <el-select v-model="draft.connector">
            <el-option
              v-for="option in providerOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item required>
          <template #label>
            <span>{{ t('phase3.authentication') }}</span><span class="p3-required-tag">必須</span>
          </template>
          <el-select v-model="draft.authentication">
            <el-option
              v-for="option in authenticationOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item required>
          <template #label>
            <span>{{ t('phase3.baseUrl') }}</span><span class="p3-required-tag">必須</span>
          </template>
          <el-input v-model="draft.url" placeholder="https://standardization.example.internal" />
        </el-form-item>

        <el-form-item
          :required="!hasStoredSecret"
        >
          <template #label>
            <span>{{ hasStoredSecret ? t('phase3.apiKeyEditLabel') : t('phase3.apiKey') }}</span>
            <span v-if="!hasStoredSecret" class="p3-required-tag">必須</span>
          </template>
          <el-input
            v-model="draft.secret"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="t('phase3.apiKeyPlaceholder')"
          />
          <p v-if="maskedApiKey" class="p3-registered-key">
            {{ t('phase3.registeredApiKey') }}：{{ maskedApiKey }}
          </p>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="visible = false">{{ t('phase3.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canSave" @click="save">{{ t('phase3.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.p3-connections :deep(.el-select) {
  width: 100%;
}

.p3-end {
  display: flex;
  justify-content: flex-end;
  margin: 8px 0 16px;
}

.p3-registered-key {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  line-height: 1.6;
}

.p3-required-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: #fff1f3;
  color: #e31b54;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
}
</style>
