import {generatePatches} from "./patches"
import {
    isProxy,
    isProxyable,
    getUseProxies,
    shallowCopy,
    freeze,
    has,
    each
} from "./common"

/**
 * Internal state for draft proxies
 */
export class Draft {
    /**
     * Create a draft of the given object/array.
     * When a parent `Draft` exists, you pass it _instead_ of an object/array.
     */
    constructor(base, prop) {
        this.path = undefined
        this.copy = undefined
        if (base instanceof Draft) {
            this.path = base.path.concat(prop)
            this.base = base.base[prop]
            this.parent = base
        } else {
            this.path = []
            this.base = base
        }
        this.patches = undefined
        this.modified = false
        this.finalized = false
        if (Array.isArray(this.base)) {
            /** Array of inserted and deleted ranges */
            this.indices = createIndices(this.base)
            /** Proxies by original indice */
            this.proxies = []
        } else {
            this.assigned = {}
        }
    }
    /**
     * @param {("add"|"replace"|"remove")} op - The kind of modification
     * @param {(string|number)} prop - The property that was modified
     */
    modify(op, prop) {
        // - "add" overwrites "remove" patches on same prop
        // - "remove" cancels "add" patches on same prop
        // - avoid "replace" tails because of array insertions or deletions
        // - perform array insertions from left-to-right
        // - perform array deletions before insertions
        // - perform array deletions from right-to-left
        // - on "replace", check if new value equals base value

        if (op === "add") {
            // 1. throw if property exists
        } else if (op === "remove") {
            // 2. throw if property is missing
        } else {
            // 1. throw if property is missing
        }
        if (this.patches) {
            const path = this.path.concat(prop)
            const patch =
                op === "add"
                    ? {op, path, value: this.copy[prop]}
                    : op === "remove"
                        ? {op, path, origValue: this.base[prop]}
                        : {
                              op,
                              path,
                              value: this.copy[prop],
                              origValue: this.base[prop]
                          }
            this.patches.push({op, path})
        }
    }
    finalize(patches) {
        finalize(this.base, this.path, patches)
    }
}

function createIndices(arr) {
    let indices = []
    for (let i = 0; i < arr.length; i++) {
        indices.push(i)
    }
    return indices
}

// given a base object, returns it if unmodified, or return the changed cloned if modified
function finalize(base, path, patches) {
    if (isProxy(base)) {
        const state = base[PROXY_STATE]
        if (state.modified === true) {
            if (state.finalized === true) return state.copy
            state.finalized = true
            const result = finalizeObject(
                getUseProxies() ? state.copy : (state.copy = shallowCopy(base)),
                state,
                path,
                patches
            )
            generatePatches(state, path, patches, state.base, result)
            return result
        } else {
            return state.base
        }
    }
    finalizeNonProxiedObject(base)
    return base
}

function finalizeObject(copy, state, path, patches) {
    const base = state.base
    each(copy, (prop, value) => {
        if (value !== base[prop]) {
            // if there was an assignment on this property, we don't need to generate
            // patches for the subtree
            const generatePatches = patches && !has(state.assigned, prop)
            copy[prop] = finalize(
                value,
                generatePatches && path.concat(prop),
                generatePatches && patches
            )
        }
    })
    return freeze(copy)
}

function finalizeNonProxiedObject(parent) {
    // If finalize is called on an object that was not a proxy, it means that it is an object that was not there in the original
    // tree and it could contain proxies at arbitrarily places. Let's find and finalize them as well
    if (!isProxyable(parent)) return
    if (Object.isFrozen(parent)) return
    each(parent, (i, child) => {
        if (isProxy(child)) {
            parent[i] = finalize(child)
        } else finalizeNonProxiedObject(child)
    })
    // always freeze completely new data
    freeze(parent)
}
