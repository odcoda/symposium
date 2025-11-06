import { Buffer } from 'buffer'

import { createId } from '@/utils/id'

const DEFAULT_VERIFIER_LENGTH = 96

const toBase64Url = (input: Uint8Array | ArrayBuffer) =>
  Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')

const randomBytes = (length: number) => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint8Array(length))
  }

  const array = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    array[index] = Math.floor(Math.random() * 256)
  }
  return array
}

export const generateCodeVerifier = (length = DEFAULT_VERIFIER_LENGTH) => {
  const bytes = randomBytes(length)
  return toBase64Url(bytes)
}

export const generateCodeChallenge = async (verifier: string) => {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return toBase64Url(digest)
  }

  throw new Error('SubtleCrypto not available for PKCE')
}

export const generateState = () => createId()
