const { chromium, browserLaunchOptions } = require('./browser-test-runtime.cjs')

;(async () => {
  const browser = await chromium.launch(browserLaunchOptions)
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('http://127.0.0.1:4176/')
    await page.locator('[data-module=detail-master-standardization-config]').click()
    await page.getByRole('tab', { name: '文档＋原型', exact: true }).click()

    await page.locator('#prd-ask-button').click()
    const ask = page.locator('#prd-ask-drawer')
    await ask.waitFor()
    await ask.locator('textarea').fill('主数据同步会清除什么')
    await ask.getByRole('button', { name: '发送', exact: true }).click()
    await ask.locator('.prd-answer-source').first().waitFor()
    await ask.getByRole('button', { name: '收起', exact: true }).click()

    await page.locator('#prd-history-button').click()
    await page.locator('#prd-history-dialog').waitFor()
    await page.locator('#prd-history-dialog').locator('[data-close]').first().click()

    await page.locator('#page-select').selectOption('master-standardization-config')
    await page.waitForFunction(
      () => document.querySelector('#page-select').value === 'master-standardization-config'
    )

    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('link', { name: '在新标签页打开完整原型', exact: true }).click()
    const popup = await popupPromise
    await popup.waitForURL(/v4\/standardization\?prd=master-standardization-config/)
    if (await popup.locator('#review-layout').count()) throw Error('Standalone includes PRD')
    await popup.close()

    await page.screenshot({ path: '/tmp/prd-simplified-actions.png' })
    if (errors.length) throw Error(errors.join('\n'))
    console.log('PASS PRD QA, version menu, page switch, and standalone prototype link')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
