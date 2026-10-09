'use strict'

const assert = require('assert')
assert.strictEqual(typeof global.window, 'undefined', 'CLI fixtures must not provide browser globals')

// Test-only DNS and socket guard. No request can leave the local fixtures.
const dns = require('dns')
const net = require('net')
const names = ['source.test', 'target.test', 'sub.source.test', 'evilsource.test']
const ports = JSON.parse(process.env.FETCH_CLI_TEST_PORTS)
const connect = net.Socket.prototype.connect

dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (names.indexOf(hostname) === -1) {
    throw new Error('Blocked non-fixture DNS lookup: ' + hostname)
  }
  if (options && options.all) {
    callback(null, [{ address: '127.0.0.1', family: 4 }])
  } else {
    callback(null, '127.0.0.1', 4)
  }
}

net.Socket.prototype.connect = function () {
  let options = arguments[0]
  if (Array.isArray(options)) options = options[0]
  if (!options || typeof options !== 'object' || options.path ||
      ports.indexOf(Number(options.port)) === -1 ||
      names.concat(['127.0.0.1']).indexOf(options.host || options.hostname) === -1) {
    throw new Error('Blocked non-fixture socket connection')
  }
  return connect.apply(this, arguments)
}
