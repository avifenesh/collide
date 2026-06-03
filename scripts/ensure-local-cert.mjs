import { mkdir, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const keyPath = resolve('.cert/localhost-key.pem')
const certPath = resolve('.cert/localhost-cert.pem')

const exists = await Promise.all([
  stat(keyPath).then(() => true).catch(() => false),
  stat(certPath).then(() => true).catch(() => false),
])

if (exists.every(Boolean)) {
  process.exit(0)
}

await mkdir(dirname(keyPath), { recursive: true })

const result = spawnSync('openssl', [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-sha256',
  '-days',
  '30',
  '-keyout',
  keyPath,
  '-out',
  certPath,
  '-subj',
  '/CN=localhost',
  '-addext',
  'subjectAltName=DNS:localhost,IP:127.0.0.1',
], {
  stdio: 'inherit',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
