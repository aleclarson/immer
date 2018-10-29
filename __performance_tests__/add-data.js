"use strict"

import {each, cycle, configure, beforeEach} from "persec"
import produce, {setAutoFreeze, setUseProxies} from "../dist/immer.umd.js"
import cloneDeep from "lodash.clonedeep"
import {fromJS} from "immutable"
import Seamless from "seamless-immutable"
import deepFreeze from "deep-freeze"

console.log("\n# add-data - loading large set of data\n")

const dataSet = require("./data.json")
const baseState = {data: null}
const immutableJsBaseState = fromJS(baseState)
const seamlessBaseState = Seamless.from(baseState)

const cases = [
    baseline,
    {autoFreeze: false, useProxies: true},
    {autoFreeze: false, useProxies: false},
    {autoFreeze: true, useProxies: true},
    {autoFreeze: true, useProxies: false}
]

each(cases, opts => {
    configure({
        minSamples: 100,
        onFinish: () => console.log("")
    })

    if (typeof opts == "function") {
        return opts()
    }

    setAutoFreeze(opts.autoFreeze)
    setUseProxies(opts.useProxies)
    const label = `${opts.useProxies ? "proxy" : "es5"} ${
        opts.autoFreeze ? "(auto freeze)" : ""
    }`

    let state
    beforeEach(() => {
        state = cloneDeep(baseState)
    })

    cycle(`produce with frozen state - ${label}`, () => {
        const nextState = produce(deepFreeze(state), draft => {
            draft.data = dataSet
        })
        return nextState
    })

    cycle(`produce with mutable state - ${label}`, () => {
        const nextState = produce(state, draft => {
            draft.data = dataSet
        })
        return nextState
    })
})

// Testing non-immer things.
function baseline() {
    let draft

    cycle("just mutate", () => {
        draft.data = dataSet
    }).beforeEach(() => {
        draft = cloneDeep(baseState)
    })

    cycle("just mutate, freeze", () => {
        draft.data = dataSet
        deepFreeze(draft)
    }).beforeEach(() => {
        draft = cloneDeep(baseState)
    })

    cycle("handcrafted reducer (no freeze)", () => {
        return {
            ...baseState,
            data: dataSet
        }
    })

    cycle("handcrafted reducer (with freeze)", () => {
        return deepFreeze({
            ...baseState,
            data: dataSet
        })
    })

    cycle("immutableJS", () => {
        return immutableJsBaseState.withMutations(state => {
            state.setIn(["data"], fromJS(dataSet))
        })
    })

    cycle("immutableJS + toJS", () => {
        return immutableJsBaseState
            .withMutations(state => {
                state.setIn(["data"], fromJS(dataSet))
            })
            .toJS()
    })

    cycle("seamless-immutable", () => {
        seamlessBaseState.set("data", dataSet)
    })

    cycle("seamless-immutable + asMutable", () => {
        seamlessBaseState.set("data", dataSet).asMutable({deep: true})
    })
}
