'use strict'

const assert = require('assert')
const Module = require('module')
const load = Module._load

// Protect only this harmless marker in the isolated subprocess. A regressed
// parser cannot write it onto Object.prototype; owned fixture objects can still
// receive an ordinary property without affecting other requests or processes.
Object.defineProperty(Object.prototype, 'fetchCliMarker', {
  get () { return undefined },
  set (value) {
    assert.notStrictEqual(this, Object.prototype, 'Parser tried to change Object.prototype')
    Object.defineProperty(this, 'fetchCliMarker', {
      value: value,
      writable: true,
      enumerable: true,
      configurable: true
    })
  }
})
Module._load = function (name) {
  const value = load.apply(this, arguments)
  if (name === 'yargs') {
    value.check(argv => {
      assert.strictEqual(argv.fixture.___proto___.fetchCliMarker, 'fixture-only')
      assert.strictEqual(Object.prototype.fetchCliMarker, undefined)
      return true
    })
  }
  return value
}
