<script setup lang="ts">
import { Plus, Search } from '@element-plus/icons-vue'

defineProps<{
  title: string
  searchPlaceholder: string
  addLabel: string
  emptyText: string
  isEmpty?: boolean
}>()

const keyword = defineModel<string>('keyword', { required: true })

const emit = defineEmits<{
  add: []
}>()
</script>

<template>
  <aside class="v-config-list-aside">
    <div class="v-config-list-aside__head">
      <div class="v-config-list-aside__title-row">
        <h2 class="v-config-list-aside__title">{{ title }}</h2>
        <slot name="header-actions" />
      </div>
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        :placeholder="searchPlaceholder"
        clearable
      />
      <el-button type="primary" :icon="Plus" class="v-config-list-aside__add" @click="emit('add')">
        {{ addLabel }}
      </el-button>
    </div>

    <ul class="v-config-list-aside__list">
      <slot />
    </ul>

    <p v-if="isEmpty" class="v-config-list-aside__empty">{{ emptyText }}</p>
  </aside>
</template>

<style lang="scss">
@import '@/styles/config-list-aside.scss';
</style>
