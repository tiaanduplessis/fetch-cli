
# @tiaanduplessis/fetch-cli
[![package version](https://img.shields.io/npm/v/@tiaanduplessis/fetch-cli.svg?style=flat-square)](https://npmjs.org/package/@tiaanduplessis/fetch-cli)
[![package downloads](https://img.shields.io/npm/dm/@tiaanduplessis/fetch-cli.svg?style=flat-square)](https://npmjs.org/package/@tiaanduplessis/fetch-cli)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![package license](https://img.shields.io/npm/l/@tiaanduplessis/fetch-cli.svg?style=flat-square)](https://npmjs.org/package/@tiaanduplessis/fetch-cli)
[![make a pull request](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com) [![Greenkeeper badge](https://badges.greenkeeper.io/tiaanduplessis/fetch-cli.svg)](https://greenkeeper.io/)

> Use fetch API from your terminal

## Table of Contents


- [About](#about)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#License)

## About

A little tool that allows [fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) like requests from the terminal. It uses [tenacious-fetch](https://github.com/tiaanduplessis/tenacious-fetch) under the hood, so retries and timeouts are also supported. You probably shouldn't use this. Just stick with [curl](https://curl.haxx.se/). 

## Install

This project uses [node](https://nodejs.org) and [npm](https://www.npmjs.com). 

```sh
$ npm install @tiaanduplessis/fetch-cli
$ # OR
$ yarn add @tiaanduplessis/fetch-cli
```

## Usage

```sh
$ fetch https://jsonplaceholder.typicode.com/todos/1 --config={method: "Post"}
```


## Contribute

1. Fork it and create your feature branch: `git checkout -b my-new-feature`
2. Commit your changes: `git commit -am "Add some feature"`
3. Push to the branch: `git push origin my-new-feature`
4. Submit a pull request

## License

MIT
    