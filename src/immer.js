import * as legacyProxy from "./es5"
import * as modernProxy from "./proxy"
import {generatePatches} from "./patches"
import {
    assign,
    each,
    is,
    isDraft,
    isDraftable,
    shallowCopy,
    DRAFT_STATE
} from "./common"

function verifyMinified() {}

const configDefaults = {
    useProxies: typeof Proxy !== "undefined" && typeof Reflect !== "undefined",
    autoFreeze:
        typeof process !== "undefined"
            ? process.env.NODE_ENV !== "production"
            : verifyMinified.name === "verifyMinified",
    onAssign: null,
    onDelete: null,
    onCopy: null
}

export class Immer {
    constructor(config) {
        assign(this, configDefaults, config)
        this.setUseProxies(this.useProxies)
        this.produce = this.produce.bind(this)
    }
    produce(base, recipe, patchListener) {
        // curried invocation
        if (typeof base === "function" && typeof recipe !== "function") {
            const defaultBase = recipe
            recipe = base

            // prettier-ignore
            return (base = defaultBase, ...args) =>
                this.produce(base, draft => recipe.call(draft, draft, ...args))
        }

        // prettier-ignore
        {
            if (typeof recipe !== "function") throw new Error("if first argument is not a function, the second argument to produce should be a function")
            if (patchListener !== undefined && typeof patchListener !== "function") throw new Error("the third argument of a producer should not be set or a function")
        }

        let result
        // Only create proxies for plain objects/arrays.
        if (!isDraftable(base)) {
            result = recipe(base)
            if (result === undefined) return base
        }
        // See #100, don't nest producers
        else if (isDraft(base)) {
            result = recipe.call(base, base)
            if (result === undefined) return base
        }
        // The given value must be proxied.
        else {
            this.scopes.push([])
            const baseDraft = this.createDraft(base)
            try {
                result = recipe.call(baseDraft, baseDraft)
                this.willFinalize(result, baseDraft, !!patchListener)

                // Never generate patches when no listener exists.
                var patches = patchListener && [],
                    inversePatches = patchListener && []

                // Finalize the modified draft...
                if (result === baseDraft) {
                    result = this.finalize(
                        baseDraft,
                        [],
                        patches,
                        inversePatches
                    )
                }
                // ...or use a replacement value.
                else {
                    // Users must never modify the draft _and_ return something else.
                    if (baseDraft[DRAFT_STATE].modified)
                        throw new Error("An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.") // prettier-ignore

                    // Finalize the replacement in case it contains (or is) a subset of the draft.
                    if (isDraftable(result)) result = this.finalize(result)

                    if (patchListener) {
                        patches.push({
                            op: "replace",
                            path: [],
                            value: result
                        })
                        inversePatches.push({
                            op: "replace",
                            path: [],
                            value: base
                        })
                    }
                }
            } finally {
                this.currentScope().forEach(state => state.revoke())
                this.scopes.pop()
            }
            patchListener && patchListener(patches, inversePatches)
        }
        return result
    }
    setAutoFreeze(value) {
        this.autoFreeze = value
    }
    setUseProxies(value) {
        this.useProxies = value
        assign(this, value ? modernProxy : legacyProxy)
    }
    /**
     * @internal
     * Finalize a draft, returning either the unmodified base state or a modified
     * copy of the base state.
     */
    finalize(draft, path, patches, inversePatches) {
        const state = draft[DRAFT_STATE]
        if (!state) {
            if (Object.isFrozen(draft)) return draft
            return this.finalizeTree(draft)
        }
        if (!state.modified) return state.base
        if (!state.finalized) {
            state.finalized = true
            this.finalizeTree(state.draft, path, patches, inversePatches)
            if (this.onDelete) {
                const {assigned} = state
                for (const prop in assigned)
                    assigned[prop] || this.onDelete(state, prop)
            }
            if (this.onCopy) this.onCopy(state)
            if (this.autoFreeze) Object.freeze(state.copy)
            if (patches) generatePatches(state, path, patches, inversePatches)
        }
        return state.copy
    }
    /**
     * @internal
     * Finalize all drafts in the given state tree.
     */
    finalizeTree(root, path, patches, inversePatches) {
        const state = root[DRAFT_STATE]
        if (state) {
            root = this.useProxies
                ? state.copy
                : (state.copy = shallowCopy(state.draft))
        }
        const {onAssign} = this
        const finalizeProperty = (prop, value, parent) => {
            // Only `root` can be a draft in here.
            const inDraft = state && parent === root
            if (isDraftable(value)) {
                // Skip unchanged properties in draft objects.
                if (inDraft && is(value, state.base[prop])) return

                // Find proxies within new objects. Frozen objects are already finalized.
                if (!isDraft(value)) {
                    if (!Object.isFrozen(value)) each(value, finalizeProperty)
                    if (onAssign && inDraft) onAssign(state, prop, value)
                    return
                }

                // prettier-ignore
                parent[prop] =
                    // Patches are never generated for assigned properties.
                    patches && parent === root && !(state && state.assigned[prop])
                        ? this.finalize(value, path.concat(prop), patches, inversePatches)
                        : this.finalize(value)

                if (onAssign && inDraft) onAssign(state, prop, parent[prop])
                return
            }
            // Call `onAssign` for primitive values.
            if (onAssign && inDraft && !is(value, state.base[prop])) {
                onAssign(state, prop, value)
            }
        }
        each(root, finalizeProperty)
        return root
    }
}
