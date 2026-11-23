<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <main class="v-version-entry">
    <section class="v-version-entry__card">
      <p class="v-version-entry__eyebrow">NEOSAI IDP</p>
      <h1>四期</h1>
      <p class="v-version-entry__summary">
        主数据标准化、任务运行与人工确认增量原型。
      </p>
      <div class="v-version-entry__actions">
        <el-button type="primary" @click="router.push('/v4/standardization')">
          打开四期原型
        </el-button>
        <a class="v-version-entry__prd" href="/PRD.zh-CN.md" target="_blank" rel="noreferrer">
          四期 PRD
        </a>
      </div>
    </section>
  </main>
</template>

<style scoped>
.v-version-entry {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: #f5f7fa;
}

.v-version-entry__card {
  width: min(680px, 100%);
  padding: 44px;
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.v-version-entry__eyebrow {
  margin: 0 0 8px;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .08em;
}

h1 {
  margin: 0;
  font-size: 36px;
}

.v-version-entry__summary {
  margin: 14px 0 28px;
  color: var(--text-secondary);
}

.v-version-entry__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.v-version-entry__prd {
  color: var(--el-color-primary);
  text-decoration: none;
  margin-left: 4px;
}
</style>
