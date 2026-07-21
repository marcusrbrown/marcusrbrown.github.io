import {Buffer} from 'node:buffer'
import {mkdtemp, readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {inflateSync} from 'node:zlib'

import {expect, test} from '@playwright/test'
import {captureTargetEvidence, validatePng} from '../../scripts/live-audit/evidence'

const containsRedPixel = (png: Buffer): boolean => {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const channels = png[25] === 6 ? 4 : png[25] === 2 ? 3 : 0
  if (channels === 0) return false
  const compressed: Buffer[] = []
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(compressed))
  const byte = (value: Uint8Array, index: number): number => value[index] ?? 0
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y += 1) {
    const filter = byte(raw, y * (stride + 1))
    for (let x = 0; x < stride; x += 1) {
      const current = byte(raw, y * (stride + 1) + x + 1)
      const left = x >= channels ? byte(pixels, y * stride + x - channels) : 0
      const above = y > 0 ? byte(pixels, (y - 1) * stride + x) : 0
      const upperLeft = y > 0 && x >= channels ? byte(pixels, (y - 1) * stride + x - channels) : 0
      const predictor =
        filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : filter === 4
                ? left + above - upperLeft
                : 0
      pixels[y * stride + x] = (current + predictor) & 255
    }
  }
  for (let i = 0; i < pixels.length; i += channels)
    if (byte(pixels, i) > 150 && byte(pixels, i + 1) < 80 && byte(pixels, i + 2) < 80) return true
  return false
}

test.describe('live audit evidence capture', () => {
  test('captures a visible below-fold target in independent context and crop PNGs', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => {
      const target = document.createElement('section')
      target.dataset.testid = 'audit-below-fold-target'
      target.textContent = 'Controlled below-fold audit target'
      target.style.cssText =
        'margin-top:1400px;margin-bottom:200px;width:240px;height:90px;background:var(--color-error,#dc2626);color:white;display:block'
      document.body.append(target)
    })
    const output = await mkdtemp(path.join(os.tmpdir(), 'live-audit-e2e-'))
    const evidence = await captureTargetEvidence(page, {kind: 'test-id', value: 'audit-below-fold-target'}, output)
    const context = await readFile(path.join(output, evidence.context.path))
    const crop = await readFile(path.join(output, evidence.crop.path))
    const targetBox = await page.getByTestId('audit-below-fold-target').boundingBox()
    expect(targetBox).not.toBeNull()
    expect(targetBox?.y).toBeGreaterThanOrEqual(0)
    expect(targetBox ? targetBox.y + targetBox.height : 0).toBeLessThanOrEqual(900)
    expect(validatePng(context).width).toBeGreaterThan(validatePng(crop).width)
    expect(validatePng(crop).height).toBeGreaterThan(89)
    expect(containsRedPixel(context)).toBe(true)
    expect(evidence.context.path).not.toContain('/')
    expect(evidence.crop.path).toMatch(/-crop\.png$/)
  })

  test('captures a bounded viewport region as a real clipped crop', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const output = await mkdtemp(path.join(os.tmpdir(), 'live-audit-region-'))
    const evidence = await captureTargetEvidence(page, {kind: 'region', x: 10, y: 10, width: 120, height: 80}, output)
    const crop = await readFile(path.join(output, evidence.crop.path))
    expect(validatePng(crop)).toEqual({width: 120, height: 80})
  })

  test('rejects missing and ambiguous closed targets', async ({page}) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const output = await mkdtemp(path.join(os.tmpdir(), 'live-audit-target-errors-'))
    await expect(captureTargetEvidence(page, {kind: 'test-id', value: 'missing-target'}, output)).rejects.toThrow(
      /target/,
    )
    await page.evaluate(() => {
      for (const color of ['red', 'blue']) {
        const element = document.createElement('div')
        element.dataset.testid = 'ambiguous-target'
        element.textContent = color
        element.style.cssText = 'width:20px;height:20px;display:block'
        document.body.append(element)
      }
    })
    await expect(captureTargetEvidence(page, {kind: 'test-id', value: 'ambiguous-target'}, output)).rejects.toThrow(
      /ambiguous/,
    )
  })
})
