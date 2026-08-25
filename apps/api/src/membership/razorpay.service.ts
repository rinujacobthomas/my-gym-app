import { Injectable } from '@nestjs/common'
import { createHmac } from 'node:crypto'

/**
 * Hand-rolled Razorpay REST client (Orders API + signature verification).
 * No SDK dependency: three endpoints and two HMAC checks is the whole surface we need.
 * All amounts are paise integers end-to-end; the client never gets to state an amount.
 */
@Injectable()
export class RazorpayService {
  private authHeader() {
    const key = process.env.RAZORPAY_KEY_ID || ''
    const secret = process.env.RAZORPAY_KEY_SECRET || ''
    return 'Basic ' + Buffer.from(key + ':' + secret).toString('base64')
  }
  get keyId() { return process.env.RAZORPAY_KEY_ID || '' }
  get configured() { return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET }

  async createOrder(amountPaise: number, receipt: string, notes: Record<string, string> = {}) {
    if (!this.configured) throw new Error('Razorpay not configured')
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
    })
    if (!r.ok) throw new Error('Razorpay order failed: ' + (await r.text()))
    return r.json()
  }

  async fetchPayment(paymentId: string) {
    const r = await fetch('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { Authorization: this.authHeader() },
    })
    if (!r.ok) throw new Error('Razorpay payment fetch failed')
    return r.json()
  }

  /** Checkout success path: order_id|payment_id signed with key_secret. */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
    const expect = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(orderId + '|' + paymentId).digest('hex')
    return timingSafeEqualHex(expect, signature)
  }

  /** Webhook body verification with the webhook secret. `body` must be the raw bytes. */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string) {
    const expect = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawBody).digest('hex')
    return timingSafeEqualHex(expect, signature)
  }
}

function timingSafeEqualHex(a: string, b?: string) {
  if (!b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
