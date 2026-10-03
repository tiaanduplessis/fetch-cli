'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const URL = require('url').URL
const spawn = require('child_process').spawn
const root = path.resolve(__dirname, '..')
const fixture = path.join(__dirname, 'fixtures')
const entry = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'index.js')
const servers = []
const ports = []
const observations = []
const sensitive = {
  Authorization: 'Bearer synthetic-test-token',
  Cookie: 'fixture=only',
  Cookie2: 'fixture=only',
  'WWW-Authenticate': 'synthetic-challenge',
  'X-Fixture': 'ordinary-header'
}
let passed = 0
let failed = 0

function listen (secure) {
  return new Promise((resolve, reject) => {
    const handler = (req, res) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        const url = new URL(req.url, 'http://source.test')
        observations.push({ headers: req.headers, method: req.method, body: body, path: url.pathname })
        if (url.pathname === '/redirect') {
          res.writeHead(Number(url.searchParams.get('status') || 302), { location: url.searchParams.get('to') })
          return res.end()
        }
        if (url.pathname === '/reset') return req.socket.destroy()
        if (url.pathname === '/large') return res.end('x'.repeat(1000))
        if (url.pathname === '/text') return res.end('fixture plain text')
        if (url.pathname === '/missing') res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ message: 'fixture response' }))
      })
    }
    const server = secure ? https.createServer({
      key: fs.readFileSync(path.join(fixture, 'key.pem')),
      cert: fs.readFileSync(path.join(fixture, 'cert.pem'))
    }, handler) : http.createServer(handler)
    servers.push(server)
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      ports.push(server.address().port)
      resolve(server.address().port)
    })
  })
}

function cli (args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--require', path.join(fixture, 'loopback-only.js'), entry].concat(args), {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.TMPDIR || process.env.TEMP || '/tmp',
        NODE_EXTRA_CA_CERTS: path.join(fixture, 'cert.pem'),
        FETCH_CLI_TEST_PORTS: JSON.stringify(ports),
        FORCE_COLOR: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('CLI exceeded the 10 second fixture deadline'))
    }, 10000)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', code => {
      clearTimeout(timeout)
      resolve({ code: code, stdout: stdout, stderr: stderr })
    })
  })
}

async function request (url, config, flags) {
  observations.length = 0
  const result = await cli([url, '--config=' + JSON.stringify(Object.assign({ retries: 0, headers: sensitive }, config))].concat(flags || []))
  assert.strictEqual(result.code, 0, result.stderr)
  return result
}

function redirect (from, to, status) {
  return from + '/redirect?status=' + (status || 302) + '&to=' + encodeURIComponent(to)
}

function checkHeaders (stripped) {
  const headers = observations[observations.length - 1].headers
  Object.keys(sensitive).forEach(name => {
    const expected = stripped && name !== 'X-Fixture' ? undefined : sensitive[name]
    assert.strictEqual(headers[name.toLowerCase()], expected, name)
  })
}

async function test (name, fn) {
  try {
    await fn()
    passed++
    console.log('ok - ' + name)
  } catch (error) {
    failed++
    console.error('not ok - ' + name + '\n' + error.stack)
  }
}

async function main () {
  const first = await listen(false)
  const second = await listen(false)
  const secure = await listen(true)
  const source = 'http://source.test:' + first
  const same = 'http://source.test:' + second
  const target = 'http://target.test:' + second
  const subdomain = 'http://sub.source.test:' + second
  const lookalike = 'http://evilsource.test:' + second
  const tls = 'https://source.test:' + secure

  await test('help and version do not make requests', async () => {
    const before = observations.length
    assert.strictEqual((await cli(['--help'])).code, 0)
    assert.strictEqual((await cli(['--version'])).stdout.trim(), require('../package.json').version)
    assert.strictEqual(observations.length, before)
  })
  await test('missing URL reports usage', async () => {
    const result = await cli([])
    assert.notStrictEqual(result.code, 0)
    assert(result.stderr.indexOf('Not enough non-option arguments') !== -1)
  })
  await test('HTTP JSON output and direct request headers', async () => {
    const result = await request(source + '/echo')
    assert(result.stdout.indexOf('200 OK') !== -1)
    assert(result.stdout.indexOf('fixture response') !== -1)
    assert.strictEqual(observations[0].method, 'GET')
    checkHeaders(false)
  })
  await test('HTTPS works with a trusted local fixture certificate', async () => {
    const result = await request(tls + '/echo')
    assert(result.stdout.indexOf('200 OK') !== -1)
    checkHeaders(false)
  })
  await test('plain text and HTTP error responses remain visible', async () => {
    assert((await request(source + '/text')).stdout.indexOf('fixture plain text') !== -1)
    assert((await request(source + '/missing')).stdout.indexOf('404 Not Found') !== -1)
  })
  await test('configured POST preserves its body', async () => {
    await request(source + '/echo', { method: 'POST', body: 'synthetic-body' })
    assert.strictEqual(observations[0].method, 'POST')
    assert.strictEqual(observations[0].body, 'synthetic-body')
  })
  await test('--post sends POST with no configured body', async () => {
    const result = await request(source + '/echo', {}, ['--post'])
    assert(result.stdout.indexOf('200 OK') !== -1)
    assert.strictEqual(observations.length, 1)
    assert.strictEqual(observations[0].method, 'POST')
    assert.strictEqual(observations[0].body, '')
    checkHeaders(false)
  })
  await test('--post preserves configured body and headers', async () => {
    await request(source + '/echo', { body: 'synthetic-body' }, ['--post'])
    assert.strictEqual(observations.length, 1)
    assert.strictEqual(observations[0].method, 'POST')
    assert.strictEqual(observations[0].body, 'synthetic-body')
    checkHeaders(false)
  })
  await test('--post works before the URL without --config', async () => {
    observations.length = 0
    const result = await cli(['--post', source + '/echo'])
    assert.strictEqual(result.code, 0, result.stderr)
    assert.strictEqual(observations.length, 1)
    assert.strictEqual(observations[0].method, 'POST')
  })
  await test('disabled --post keeps the default GET method', async () => {
    for (const flag of ['--post=false', '--no-post']) {
      await request(source + '/echo', {}, [flag])
      assert.strictEqual(observations[0].method, 'GET')
      assert.strictEqual(observations[0].body, '')
    }
  })
  await test('explicit configured methods take precedence over --post', async () => {
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'POST']) {
      await request(source + '/echo', { method: method }, ['--post'])
      assert.strictEqual(observations.length, 1)
      assert.strictEqual(observations[0].method, method)
      checkHeaders(false)
    }
    await request(source + '/echo', { method: 'PUT', body: 'synthetic-body' }, ['--post'])
    assert.strictEqual(observations[0].method, 'PUT')
    assert.strictEqual(observations[0].body, 'synthetic-body')
  })
  await test('configured method wins regardless of argument order', async () => {
    observations.length = 0
    const result = await cli(['--post', source + '/echo', '--config={"method":"PATCH","retries":0}'])
    assert.strictEqual(result.code, 0, result.stderr)
    assert.strictEqual(observations.length, 1)
    assert.strictEqual(observations[0].method, 'PATCH')
  })
  await test('--post still reports invalid GET bodies and connection errors', async () => {
    const result = await request(source + '/echo', { method: 'GET', body: 'synthetic-body' }, ['--post'])
    assert(result.stdout.indexOf('Request with GET/HEAD method cannot have body') !== -1, result.stdout)
    assert.strictEqual(observations.length, 0)
    assert((await request(source + '/reset', {}, ['--post'])).stdout.indexOf('socket hang up') !== -1)
    assert.strictEqual(observations[0].method, 'POST')
  })
  await test('same hostname across ports and subdomain retain headers', async () => {
    for (const destination of [same, subdomain]) {
      await request(redirect(source, destination + '/echo'))
      checkHeaders(false)
    }
  })
  await test('lookalike hostname strips the four protected headers', async () => {
    await request(redirect(source, lookalike + '/echo'))
    checkHeaders(true)
  })
  for (const status of [301, 302, 303, 307, 308]) {
    await test(status + ' cross-host redirect strips protected headers', async () => {
      await request(redirect(source, target + '/echo', status))
      assert.strictEqual(observations.length, 2)
      checkHeaders(true)
    })
    await test(status + ' --post redirect follows Fetch method/body rules', async () => {
      await request(redirect(source, target + '/echo', status), { body: 'synthetic-body' }, ['--post'])
      assert.strictEqual(observations.length, 2)
      assert.strictEqual(observations[0].method, 'POST')
      assert.strictEqual(observations[0].body, 'synthetic-body')
      const last = observations[observations.length - 1]
      assert.strictEqual(last.method, status === 307 || status === 308 ? 'POST' : 'GET')
      assert.strictEqual(last.body, status === 307 || status === 308 ? 'synthetic-body' : '')
      checkHeaders(true)
    })
    await test(status + ' POST redirect follows Fetch method/body rules', async () => {
      await request(redirect(source, target + '/echo', status), { method: 'POST', body: 'synthetic-body' })
      const last = observations[observations.length - 1]
      assert.strictEqual(last.method, status === 307 || status === 308 ? 'POST' : 'GET')
      assert.strictEqual(last.body, status === 307 || status === 308 ? 'synthetic-body' : '')
      checkHeaders(true)
    })
  }
  await test('PUT survives a 307 redirect with its body', async () => {
    await request(redirect(source, target + '/echo', 307), { method: 'PUT', body: 'synthetic-body' })
    const last = observations[observations.length - 1]
    assert.strictEqual(last.method, 'PUT')
    assert.strictEqual(last.body, 'synthetic-body')
  })
  await test('protocol changes strip protected headers in both directions', async () => {
    for (const pair of [[source, tls], [tls, source]]) {
      await request(redirect(pair[0], pair[1] + '/echo'))
      checkHeaders(true)
    }
  })
  await test('redirect chains do not restore stripped headers', async () => {
    await request(redirect(source, redirect(target, same + '/echo')))
    assert.strictEqual(observations.length, 3)
    checkHeaders(true)
  })
  await test('size limit applies before and after a redirect', async () => {
    for (const url of [source + '/large', redirect(source, same + '/large')]) {
      const result = await request(url, { size: 20 })
      assert(result.stdout.indexOf('over limit: 20') !== -1, result.stdout)
      assert(result.stdout.indexOf('x'.repeat(1000)) === -1)
    }
  })
  await test('manual, error, and maximum redirect modes remain enforced', async () => {
    const url = redirect(source, target + '/echo')
    assert((await request(url, { redirect: 'manual' })).stdout.indexOf('302 Found') !== -1)
    assert.strictEqual(observations.length, 1)
    assert((await request(url, { redirect: 'error' })).stdout.indexOf('redirect mode is set to error') !== -1)
    assert.strictEqual(observations.length, 1)
    assert((await request(url, { follow: 0 })).stdout.indexOf('maximum redirect reached at') !== -1)
    assert.strictEqual(observations.length, 1)
  })
  await test('fixture guard blocks any non-fixture destination', async () => {
    const result = await request('http://outside.invalid:' + first + '/fixture')
    assert(result.stdout.indexOf('Blocked non-fixture') !== -1, result.stdout)
    assert.strictEqual(observations.length, 0)
  })
  await test('connection and unsupported-protocol errors are printed', async () => {
    assert((await request(source + '/reset')).stdout.indexOf('socket hang up') !== -1)
    observations.length = 0
    const result = await request('ftp://source.test/fixture')
    assert(result.stdout.indexOf('Only HTTP(S) protocols are supported') !== -1, result.stdout)
    assert.strictEqual(observations.length, 0)
  })
  console.log(passed + ' passed; ' + failed + ' failed; loopback fixtures only')
  if (failed) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).then(() => {
  servers.forEach(server => server.close())
})
