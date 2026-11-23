const { chromium, browserLaunchOptions } = require('./browser-test-runtime.cjs')
const fs = require('fs/promises')
const { pathToFileURL } = require('url')

;(async () => {
  const browser = await chromium.launch(browserLaunchOptions)
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
      acceptDownloads: true
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('http://127.0.0.1:4176/')
    await page.locator('[data-module=detail-master-standardization-config]').click()
    await page.getByRole('tab', { name: '文档＋原型', exact: true }).click()

    await page.locator('#export-button').click()
    const dialog = page.locator('.prd-download-dialog')
    await dialog.locator('[name=role]').selectOption('frontend')
    await dialog.locator('[name=scope]').selectOption('all')
    const htmlDownloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '下载', exact: true }).click()
    const htmlDownload = await htmlDownloadPromise
    const htmlFile = '/tmp/prd-download-frontend.html'
    await htmlDownload.saveAs(htmlFile)
    const html = await fs.readFile(htmlFile, 'utf8')
    if (html.includes('<iframe')) throw Error('Prototype bundled in PRD')
    if (!html.includes('前端视角') || !html.includes('<svg')) throw Error('Missing role or diagrams')

    const offline = await browser.newPage()
    const offlineErrors = []
    offline.on('pageerror', (error) => offlineErrors.push(error.message))
    await offline.goto(pathToFileURL(htmlFile).href)
    await offline.locator('.diagram-viewer').first().waitFor()
    if (offlineErrors.length) throw Error(offlineErrors.join('\n'))
    await offline.close()

    await page.locator('#export-button').click()
    await dialog.locator('[name=format]').selectOption('md')
    const mdDownloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '下载', exact: true }).click()
    const mdDownload = await mdDownloadPromise
    await mdDownload.saveAs('/tmp/prd-download.md')
    const markdown = await fs.readFile('/tmp/prd-download.md', 'utf8')
    if (!markdown.includes('#') || markdown.includes('<iframe')) throw Error('Invalid Markdown download')

    await page.frameLocator('#prototype-stage iframe').locator('.standardization-page__header h1').waitFor()
    const screenshotPromise = page.waitForEvent('download')
    await page.locator('#capture-prototype-button').click()
    const screenshot = await screenshotPromise
    await screenshot.saveAs('/tmp/prd-prototype-capture.png')
    const png = await fs.readFile('/tmp/prd-prototype-capture.png')
    if (png.length < 10000) throw Error('Screenshot empty')
    if (errors.length) throw Error(errors.join('\n'))
    console.log('PASS PRD-only role/version HTML download with offline diagrams and current prototype PNG screenshot')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
