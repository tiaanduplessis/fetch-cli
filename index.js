#!/usr/bin/env node
'use strict'

const prettyjson = require('prettyjson')
const parse = require('get-them-args')
const tenaciousFetch = require('tenacious-fetch')
const fetch = require('node-fetch')

const { config = {}, unknown = [] } = parse()
const url = unknown.length > 0 && unknown[0]

if (!url) {
  console.error('URL not provided')
} else {
  const opts = Object.assign({
    fetcher: fetch
  }, config)

  const prettyjsonOpts = {
    dashColor: 'magenta'
  }

  tenaciousFetch(url, opts)
    .then((response) => {
      const status = { status: `${response.status} ${response.statusText}` }
      const headers = { headers: {} }

      response.headers.forEach((val, key) => {
        headers.headers[key] = val
      })

      console.log('\n')

      console.log(prettyjson.render(status, prettyjsonOpts), '\n')
      console.log(prettyjson.render(headers, prettyjsonOpts), '\n')

      return response.text()
    })
    .then((text) => {
      try {
        const json = JSON.parse(text)
        console.log(prettyjson.render({ body: json }, prettyjsonOpts), '\n')
      } catch (e) {
        console.log(prettyjson.render({ body: text }, prettyjsonOpts), '\n')
      }
    })
    .catch((error) => {
      console.log(prettyjson.render(error), '\n')
    })
}

module.exports = tenaciousFetch
