/** Built-document checks, run by pwa:launch-test with synthetic accounts. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Chromium cannot reproduce iOS chrome: replace only standalone/inset facts.
function emulateStandalone(source, inset) {
  return source
    .replaceAll('(display-mode: standalone)', '(min-width: 0px)')
    .replaceAll(/env\(safe-area-inset-top(?:,\s*0px)?\)/g, `${inset}px`)
}

export async function verifyStandaloneSafeArea(browser, origin, apiPort) {
  const publicRoot = new URL('../.output/public/', import.meta.url)
  const { buildId } = JSON.parse(
    await readFile(new URL('version.json', publicRoot), 'utf8'),
  )
  const shellName = `pwa-shell-${buildId}.html`
  const cachedShell = await readFile(new URL(shellName, publicRoot), 'utf8')
  for (const mode of ['light', 'dark', 'oled']) {
    for (const shape of [
      { width: 744, height: 1133, inset: 0 },
      { width: 1133, height: 744, inset: 0 },
      { width: 430, height: 932, inset: 59 },
    ]) {
      for (const cached of [true, false]) {
        const context = await browser.newContext({
          viewport: { width: shape.width, height: shape.height },
          hasTouch: true,
          isMobile: true,
          serviceWorkers: 'block',
        })
        try {
          await context.addCookies([
            { name: 'splice_access_token', value: 'alice', url: origin },
            {
              name: 'splice_appearance',
              value: encodeURIComponent(JSON.stringify({ mode, accent: null })),
              url: origin,
            },
          ])
          let blockApplication = true
          await context.route('**/*', async (route) => {
            const request = route.request()
            const url = new URL(request.url())
            if (url.port === '3000') {
              const response = await fetch(
                `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`,
                {
                  headers: { Cookie: 'splice_access_token=alice' },
                },
              )
              return route.fulfill({
                status: response.status,
                contentType: 'application/json',
                body: await response.text(),
              })
            }
            if (request.resourceType() === 'script' && blockApplication)
              return route.abort()
            if (request.resourceType() === 'document') {
              const html = cached
                ? cachedShell
                : await (await route.fetch()).text()
              return route.fulfill({
                contentType: 'text/html',
                body: emulateStandalone(html, shape.inset),
              })
            }
            if (request.resourceType() === 'stylesheet') {
              const response = await route.fetch()
              return route.fulfill({
                response,
                body: emulateStandalone(await response.text(), shape.inset),
              })
            }
            return route.continue()
          })
          const page = await context.newPage()
          const errors = []
          page.on('pageerror', (error) => {
            // Start's inline bootstrap attempts an import even with its external
            // module deliberately blocked. It has not hydrated in this phase.
            if (
              blockApplication &&
              error.message.startsWith(
                'Failed to fetch dynamically imported module:',
              )
            )
              return
            errors.push(error.message)
          })
          await page.goto(`${origin}${cached ? '/' : '/home'}`)
          const surface = page.locator('.splice-pwa-safe-area')
          assert.equal(
            await surface.count(),
            1,
            'Initial HTML must paint one top surface',
          )
          assert.deepEqual(await surface.boundingBox(), {
            x: 0,
            y: 0,
            width: shape.width,
            height: Math.max(12, shape.inset),
          })
          assert.match(
            await surface.evaluate(
              (el) => getComputedStyle(el).backgroundColor,
            ),
            /^rgb\(\d+, \d+, \d+\)$/,
            'Top surface must be opaque',
          )
          assert.equal(
            await surface.evaluate((el) => {
              const probe = document.createElement('div')
              probe.style.backgroundColor = getComputedStyle(
                document.documentElement,
              ).getPropertyValue('--splice-launch-canvas')
              document.body.appendChild(probe)
              const expected = getComputedStyle(probe).backgroundColor
              probe.remove()
              return getComputedStyle(el).backgroundColor === expected
            }),
            true,
            'Top surface must match the launch appearance',
          )
          assert.equal(
            await surface.evaluate((el) => getComputedStyle(el).pointerEvents),
            'none',
          )
          if (cached)
            assert.equal(
              await page.locator('header').count(),
              0,
              'Application scripts must be blocked',
            )
          else
            assert.equal(
              (await page.locator('header').boundingBox()).height,
              60 + shape.inset,
            )
          // Exercise React's replacement of the cached document and rotation.
          if (cached) {
            blockApplication = false
            await page.reload()
            await page
              .getByText('ACCOUNT_ALICE', { exact: true })
              .first()
              .waitFor()
            // React reinstalls the inline production stylesheet. Reapply only
            // Chromium's synthetic standalone/inset facts after that replacement.
            const css = await page
              .locator('head style')
              .evaluateAll((styles) =>
                styles
                  .map((style) => style.textContent)
                  .find((text) => text.includes('.splice-pwa-safe-area')),
              )
            assert.ok(css)
            await page.addStyleTag({
              content: emulateStandalone(css, shape.inset),
            })
            assert.equal(
              await surface.count(),
              1,
              'React must retain exactly one surface',
            )
            assert.equal(
              (await page.locator('header').boundingBox()).height,
              60 + shape.inset,
            )
            assert.equal(
              await surface.evaluate(
                (el) => getComputedStyle(el).backgroundColor,
              ),
              await page
                .locator('header')
                .evaluate((el) => getComputedStyle(el).backgroundColor),
              'Mounted surface must match the current header theme',
            )
            const toggle = page.getByRole('button', { name: 'Open navigation' })
            await toggle.focus()
            for (const viewport of shape.inset === 0
              ? [
                  { width: shape.height, height: shape.width },
                  { width: shape.width, height: shape.height },
                ]
              : [{ width: shape.width, height: shape.height }]) {
              await page.setViewportSize(viewport)
              assert.deepEqual(await surface.boundingBox(), {
                x: 0,
                y: 0,
                width: viewport.width,
                height: Math.max(12, shape.inset),
              })
              assert.equal(
                (await page.locator('header').boundingBox()).height,
                60 + shape.inset,
                'Startup surface must not add header padding',
              )
              assert.equal(
                await toggle.evaluate((el) => el === document.activeElement),
                true,
              )
              assert.equal(
                await surface.evaluate((el) => {
                  el.style.pointerEvents = 'auto'
                  const headerIsAbove = !!document
                    .elementFromPoint(innerWidth / 2, 4)
                    ?.closest('header')
                  el.style.removeProperty('pointer-events')
                  return headerIsAbove
                }),
                true,
                'Mounted header must cover startup surface',
              )
            }
          }
          assert.deepEqual(errors, [], 'Launch must hydrate without errors')
          console.log(
            `PASS: ${cached ? 'cached' : 'SSR'} ${mode} ${shape.width}px pre-React safe area`,
          )
        } finally {
          await context.close()
        }
      }
    }
  }
}
