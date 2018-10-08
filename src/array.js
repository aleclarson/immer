import {PROXY_STATE} from './common'
import {Draft} from './draft'

// Proxy handlers
const traps = {
  get(base, prop) {
    return methods[prop] || base[prop]
  }
  set(base, prop, value) {

  }
}

export function createArrayDraft(base) {
  const proto = new Proxy(base, traps)

}

// swizzled Array methods
const methods = {
  copyWithin() {

  }
  fill() {

  }
  pop() {

  }
  push(...args) {
    this[PROXY_STATE]
  }
  reverse() {

  }
  shift() {}
  sort() {

  }
  splice() {

  }
  unshift() {}
}