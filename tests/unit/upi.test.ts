import { describe, expect, it } from 'vitest'
import {
  buildUpiLink,
  detectPlatform,
  isValidVpa,
  settleRoute,
  type UpiLinkInput,
} from '@/lib/upi/link'
import { fromMajor, money } from '@/lib/money'

const BASE: UpiLinkInput = {
  vpa: 'priya@okhdfcbank',
  payeeName: 'Priya',
  amount: fromMajor('340', 'INR'),
  note: 'Baaki · Goa Trip',
  reference: 'stl_8f2a41',
}

const params = (href: string) => new URLSearchParams(href.split('?')[1])

describe('VPA validation', () => {
  it('accepts the handles people actually have', () => {
    for (const vpa of [
      'priya@okhdfcbank',
      'aditya.kansal@ybl',
      '9876543210@paytm',
      'a_b-c@upi',
    ]) {
      expect(isValidVpa(vpa)).toBe(true)
    }
  })

  it('rejects things that would send money to a stranger', () => {
    for (const vpa of [
      'priya',
      'priya@',
      '@okhdfcbank',
      'priya@@ybl',
      'priya @ybl',
      '.a@ybl',
    ]) {
      expect(isValidVpa(vpa)).toBe(false)
    }
  })
})

describe('building the link', () => {
  it('prefills payee, amount, currency, note and reference', () => {
    const p = params(buildUpiLink(BASE))
    expect(p.get('pa')).toBe('priya@okhdfcbank')
    expect(p.get('pn')).toBe('Priya')
    expect(p.get('am')).toBe('340.00')
    expect(p.get('cu')).toBe('INR')
    expect(p.get('tn')).toBe('Baaki · Goa Trip')
    expect(p.get('tr')).toBe('stl8f2a41')
  })

  it('uses the generic intent by default and app schemes on request', () => {
    expect(buildUpiLink(BASE).startsWith('upi://pay?')).toBe(true)
    expect(buildUpiLink({ ...BASE, app: 'gpay' }).startsWith('gpay://upi/pay?')).toBe(true)
    expect(buildUpiLink({ ...BASE, app: 'phonepe' }).startsWith('phonepe://pay?')).toBe(
      true,
    )
    expect(buildUpiLink({ ...BASE, app: 'paytm' }).startsWith('paytmmp://pay?')).toBe(true)
  })

  it('sends the exact amount, paise and all', () => {
    expect(
      params(buildUpiLink({ ...BASE, amount: fromMajor('0.05', 'INR') })).get('am'),
    ).toBe('0.05')
    expect(
      params(buildUpiLink({ ...BASE, amount: fromMajor('123456.78', 'INR') })).get('am'),
    ).toBe('123456.78')
  })

  it('trims notes to what payment apps will carry', () => {
    const long = 'x'.repeat(120)
    expect(params(buildUpiLink({ ...BASE, note: long })).get('tn')!.length).toBe(50)
  })

  it('refuses anything that would send the wrong money', () => {
    expect(() => buildUpiLink({ ...BASE, vpa: 'not-a-vpa' })).toThrow(/not a valid UPI ID/)
    expect(() => buildUpiLink({ ...BASE, amount: fromMajor('10', 'USD') })).toThrow(/INR/)
    expect(() => buildUpiLink({ ...BASE, amount: money(0n, 'INR') })).toThrow(
      /greater than zero/,
    )
    expect(() => buildUpiLink({ ...BASE, amount: fromMajor('-5', 'INR') })).toThrow(
      /greater than zero/,
    )
  })
})

describe('device routing', () => {
  it('reads the platform off the user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'ios',
    )
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other')
  })

  it('gives Android the one-tap intent', () => {
    const route = settleRoute(BASE, 'android')
    expect(route.kind).toBe('intent')
    expect(route.links).toHaveLength(1)
    expect(route.links[0].href.startsWith('upi://pay?')).toBe(true)
  })

  it('gives iOS a picker, because it does not register the generic scheme', () => {
    const route = settleRoute(BASE, 'ios')
    expect(route.kind).toBe('app-picker')
    expect(route.links.map((l) => l.app)).toEqual(['gpay', 'phonepe', 'paytm', 'bhim'])
    expect(route.links.every((l) => params(l.href).get('am') === '340.00')).toBe(true)
  })

  it('falls back to a QR payload on desktop', () => {
    expect(settleRoute(BASE, 'other').kind).toBe('qr')
  })

  it('always offers the plain UPI ID, because deep links do fail', () => {
    for (const platform of ['android', 'ios', 'other'] as const) {
      expect(settleRoute(BASE, platform).copyVpa).toBe('priya@okhdfcbank')
    }
  })
})
