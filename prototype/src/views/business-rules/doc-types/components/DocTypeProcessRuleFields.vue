<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  processRuleOptions,
  syncMasterMatchRuleFields,
  type DocTypeProcessRuleFields
} from '@/mocks/docTypeSettings'

defineProps<{multipleQrEnabled?:boolean}>()
const rule = defineModel<DocTypeProcessRuleFields>({ required: true })

const processRuleOptionList = computed(() => processRuleOptions())

watch(
  () => rule.value.ruleType,
  () => {
    syncMasterMatchRuleFields(rule.value)
    if(rule.value.ruleType==='qrcode'){rule.value.qrMode||='full';rule.value.qrDelimiter??='_';rule.value.qrIndex??=1}
  },
  { immediate: true }
)
</script>

<template>
  <div
    class="v-doc-type-process-rule-fields"
    :class="{ 'is-qrcode': rule.ruleType==='qrcode' }"
  >
    <el-select
      v-model="rule.ruleType"
      clearable
      :placeholder="$t('businessRules.docType.rule.selectProcessRule')"
      class="v-doc-type-process-rule-fields__rule-type"
    >
      <el-option
        v-for="option in processRuleOptionList"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <template v-if="rule.ruleType==='qrcode'"><div class="p3-qr"><el-select :model-value="rule.qrMode||'full'" @update:model-value="(v:'full'|'split')=>rule.qrMode=v" :aria-label="$t('phase3.qrMode')"><el-option value="full" :label="$t('phase3.qrFull')"/><el-option value="split" :label="$t('phase3.qrSplit')"/></el-select><template v-if="rule.qrMode==='split'"><el-input v-model="rule.qrDelimiter" :placeholder="$t('phase3.delimiter')" :aria-label="$t('phase3.delimiter')"/><el-input-number v-model="rule.qrIndex" :min="1" :step="1" step-strictly :aria-label="$t('phase3.ordinal')"/></template></div></template>
    <p v-if="rule.ruleType==='qrcode'&&multipleQrEnabled" class="p3-qr-priority">{{$t('phase3.qrPriorityTip')}}</p>
  </div>
</template>

<style scoped lang="scss">
.v-doc-type-process-rule-fields {
  width: 100%;
  max-width: 300px;

  &__rule-type {
    width: 100%;
    max-width: 100%;
  }

}
</style>

<style scoped>
.v-doc-type-process-rule-fields.is-qrcode{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:100%;max-width:300px}
.v-doc-type-process-rule-fields.is-qrcode .v-doc-type-process-rule-fields__rule-type{width:100%;max-width:none}
.p3-qr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr);gap:8px;width:100%;margin:0}
.p3-qr .el-select,.p3-qr .el-input,.p3-qr .el-input-number{width:100%;min-width:0}
</style>

<style scoped>.p3-qr-priority{font-size:15px;line-height:1.6;margin:8px 0;color:var(--el-text-color-secondary)}</style>
