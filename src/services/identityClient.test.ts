import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseProblemDetails, validatePasswordPolicy } from './identityClient.ts'

describe('identityClient helpers', () => {
  it('valida política de contraseñas 8-40 caracteres con letra, número y símbolo', () => {
    assert.notEqual(validatePasswordPolicy('Ab1!'), null)
    assert.notEqual(validatePasswordPolicy('a'.repeat(38) + '1!a'), null) // 41 caracteres
    assert.notEqual(validatePasswordPolicy('12345678!'), null)
    assert.notEqual(validatePasswordPolicy('Abcdefgh!'), null)
    assert.notEqual(validatePasswordPolicy('Abcdefg1'), null)
    assert.notEqual(validatePasswordPolicy('Abcdef 1'), null)

    assert.equal(validatePasswordPolicy('Vital2026!'), null)
    assert.equal(validatePasswordPolicy('Aa1!aaaa'), null)
  })

  it('extrae metadatos de ProblemDetails incluyendo lockout exponencial 429', () => {
    const lockout = parseProblemDetails(
      429,
      {
        title: 'ACCOUNT_LOCKED_OUT',
        detail: 'Demasiados intentos fallidos. Intenta nuevamente en 60 segundos.',
        code: 'ACCOUNT_LOCKED_OUT',
        retryAfterSeconds: 60,
        lockoutUntilGmt6: '2026-11-21T12:01:00-06:00',
      },
      'Error genérico',
    )

    assert.equal(lockout.status, 429)
    assert.equal(lockout.code, 'ACCOUNT_LOCKED_OUT')
    assert.equal(lockout.retryAfterSeconds, 60)
    assert.equal(lockout.lockoutUntilGmt6, '2026-11-21T12:01:00-06:00')

    const fallback = parseProblemDetails(503, null, 'Servicio temporalmente no disponible')
    assert.equal(fallback.code, 'HTTP_503')
    assert.equal(fallback.message, 'Servicio temporalmente no disponible')
  })
})
