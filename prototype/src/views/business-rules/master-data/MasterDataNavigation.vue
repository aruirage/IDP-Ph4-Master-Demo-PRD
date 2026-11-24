<template>
  <header class="master-data-navigation">
    <h1>{{ $t('menu.masterData') }}</h1>
    <nav :aria-label="$t('menu.masterData')">
      <RouterLink :to="{ name: 'MasterData' }">
        {{ $t('menu.internalMasterData') }}
      </RouterLink>
      <RouterLink :to="{ name: 'StandardizationSettings' }">
        {{ $t('menu.standardization') }}
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.master-data-navigation h1 {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: 600;
}

.master-data-navigation nav {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.master-data-navigation a {
  padding: 10px 0;
  border-bottom: 2px solid transparent;
  color: var(--el-text-color-regular);
  font-size: 15px;
  text-decoration: none;
}

.master-data-navigation a.router-link-exact-active {
  border-bottom-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
