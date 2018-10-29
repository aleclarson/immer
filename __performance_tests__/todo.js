"use strict"

import {cycle, each, configure} from "persec"
import produce, {setAutoFreeze, setUseProxies} from "../dist/immer.umd.js"
import cloneDeep from "lodash.clonedeep"
import {List, Record} from "immutable"
import Seamless from "seamless-immutable"
import deepFreeze from "deep-freeze"

function freeze(x) {
    Object.freeze(x)
    return x
}

const NUM_TODOS = 50000
const NUM_MODIFIED = NUM_TODOS * 0.1
const baseState = []
let immutableJsBaseState
let seamlessBaseState

// produce the base state
for (let i = 0; i < NUM_TODOS; i++) {
    baseState.push({
        todo: "todo_" + i,
        done: false,
        someThingCompletelyIrrelevant: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
    })
}

// generate immutalbeJS base state
const todoRecord = Record({
    todo: "",
    done: false,
    someThingCompletelyIrrelevant: []
})
immutableJsBaseState = List(baseState.map(todo => todoRecord(todo)))

// generate seamless-immutable base state
seamlessBaseState = Seamless.from(baseState)

console.log("\n# todo - performance\n")

const cases = [
    // Proxy
    {useProxies: 1},
    {useProxies: 1, autoFreeze: 1},
    {useProxies: 1, usePatchListener: 1},
    {useProxies: 1, autoFreeze: 1, usePatchListener: 1},

    // ES5
    {useProxies: 0},
    {autoFreeze: 1},
    {usePatchListener: 1},
    {autoFreeze: 1, usePatchListener: 1},

    baseline
]

each(cases, opts => {
    configure({
        minTime: 0,
        minSamples: 9,
        onFinish: () => console.log("")
    })

    if (typeof opts == "function") {
        return opts()
    }

    setAutoFreeze(!!opts.autoFreeze)
    setUseProxies(!!opts.useProxies)

    const patchListener = opts.usePatchListener ? () => {} : undefined
    const label = `${opts.useProxies ? "proxy" : "es5"} ${
        opts.autoFreeze ? "(auto freeze)" : ""
    } ${opts.usePatchListener ? "(with patches)" : ""}`

    cycle(`produce - ${label}`, () => {
        produce(
            baseState,
            draft => {
                for (let i = 0; i < NUM_MODIFIED; i++) {
                    draft[i].done = true
                }
            },
            patchListener
        )
    })
})

// Testing non-immer things
function baseline() {
    let draft

    cycle("just mutate", () => {
        for (let i = 0; i < NUM_MODIFIED; i++) {
            draft[i].done = true
        }
        return draft
    }).beforeEach(() => {
        draft = cloneDeep(baseState)
    })

    cycle("just mutate, freeze", () => {
        for (let i = 0; i < NUM_MODIFIED; i++) {
            draft[i].done = true
        }
        return deepFreeze(draft)
    }).beforeEach(() => {
        draft = cloneDeep(baseState)
    })

    cycle("deepclone, then mutate", () => {
        const draft = cloneDeep(baseState)
        for (let i = 0; i < NUM_MODIFIED; i++) {
            draft[i].done = true
        }
        return draft
    })

    cycle("deepclone, then mutate, then freeze", () => {
        const draft = cloneDeep(baseState)
        for (let i = 0; i < NUM_MODIFIED; i++) {
            draft[i].done = true
        }
        return deepFreeze(draft)
    })

    cycle("handcrafted reducer (no freeze)", () => {
        return [
            ...baseState.slice(0, NUM_MODIFIED).map(todo => ({
                ...todo,
                done: true
            })),
            ...baseState.slice(NUM_MODIFIED)
        ]
    })

    cycle("handcrafted reducer (with freeze)", () => {
        return freeze([
            ...baseState.slice(0, NUM_MODIFIED).map(todo =>
                freeze({
                    ...todo,
                    done: true
                })
            ),
            ...baseState.slice(NUM_MODIFIED)
        ])
    })

    cycle("naive handcrafted reducer (without freeze)", () => {
        return baseState.map((todo, index) => {
            if (index < NUM_MODIFIED)
                return {
                    ...todo,
                    done: true
                }
            else return todo
        })
    })

    cycle("naive handcrafted reducer (with freeze)", () => {
        return deepFreeze(
            baseState.map((todo, index) => {
                if (index < NUM_MODIFIED)
                    return {
                        ...todo,
                        done: true
                    }
                else return todo
            })
        )
    })

    cycle("immutableJS", () => {
        return immutableJsBaseState.withMutations(state => {
            for (let i = 0; i < NUM_MODIFIED; i++) {
                state.setIn([i, "done"], true)
            }
        })
    })

    cycle("immutableJS + toJS", () => {
        return immutableJsBaseState
            .withMutations(state => {
                for (let i = 0; i < NUM_MODIFIED; i++) {
                    state.setIn([i, "done"], true)
                }
            })
            .toJS()
    })

    cycle("seamless-immutable", () => {
        return seamlessBaseState.map((todo, index) => {
            if (index < NUM_MODIFIED) return todo.set("done", true)
            else return todo
        })
    })

    cycle("seamless-immutable + asMutable", () => {
        return seamlessBaseState
            .map((todo, index) => {
                if (index < NUM_MODIFIED) return todo.set("done", true)
                else return todo
            })
            .asMutable({deep: true})
    })
}
