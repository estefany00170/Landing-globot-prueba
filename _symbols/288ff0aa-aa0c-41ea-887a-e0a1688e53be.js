// Pricing Table 2 - Updated July 11, 2024
function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
/**
 * List of attributes that should always be set through the attr method,
 * because updating them through the property setter doesn't work reliably.
 * In the example of `width`/`height`, the problem is that the setter only
 * accepts numeric values, but the attribute can also be set to a string like `50%`.
 * If this list becomes too big, rethink this approach.
 */
const always_set_through_set_attribute = ['width', 'height'];
function set_attributes(node, attributes) {
    // @ts-ignore
    const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
    for (const key in attributes) {
        if (attributes[key] == null) {
            node.removeAttribute(key);
        }
        else if (key === 'style') {
            node.style.cssText = attributes[key];
        }
        else if (key === '__value') {
            node.value = node[key] = attributes[key];
        }
        else if (descriptors[key] && descriptors[key].set && always_set_through_set_attribute.indexOf(key) === -1) {
            node[key] = attributes[key];
        }
        else {
            attr(node, key, attributes[key]);
        }
    }
}
function set_svg_attributes(node, attributes) {
    for (const key in attributes) {
        attr(node, key, attributes[key]);
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
/**
 * Schedules a callback to run immediately before the component is unmounted.
 *
 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
 * only one that runs inside a server-side component.
 *
 * https://svelte.dev/docs#run-time-svelte-ondestroy
 */
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
/**
 * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
 * Event dispatchers are functions that can take two arguments: `name` and `detail`.
 *
 * Component events created with `createEventDispatcher` create a
 * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
 * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
 * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
 * property and can contain any type of data.
 *
 * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
 */
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail, { cancelable = false } = {}) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail, { cancelable });
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
            return !event.defaultPrevented;
        }
        return true;
    };
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}
function create_component(block) {
    block && block.c();
}
function claim_component(block, parent_nodes) {
    block && block.l(parent_nodes);
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const matchIconName = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const stringToIcon = (value, validate, allowSimpleName, provider = "") => {
  const colonSeparated = value.split(":");
  if (value.slice(0, 1) === "@") {
    if (colonSeparated.length < 2 || colonSeparated.length > 3) {
      return null;
    }
    provider = colonSeparated.shift().slice(1);
  }
  if (colonSeparated.length > 3 || !colonSeparated.length) {
    return null;
  }
  if (colonSeparated.length > 1) {
    const name2 = colonSeparated.pop();
    const prefix = colonSeparated.pop();
    const result = {
      // Allow provider without '@': "provider:prefix:name"
      provider: colonSeparated.length > 0 ? colonSeparated[0] : provider,
      prefix,
      name: name2
    };
    return validate && !validateIconName(result) ? null : result;
  }
  const name = colonSeparated[0];
  const dashSeparated = name.split("-");
  if (dashSeparated.length > 1) {
    const result = {
      provider,
      prefix: dashSeparated.shift(),
      name: dashSeparated.join("-")
    };
    return validate && !validateIconName(result) ? null : result;
  }
  if (allowSimpleName && provider === "") {
    const result = {
      provider,
      prefix: "",
      name
    };
    return validate && !validateIconName(result, allowSimpleName) ? null : result;
  }
  return null;
};
const validateIconName = (icon, allowSimpleName) => {
  if (!icon) {
    return false;
  }
  return !!((icon.provider === "" || icon.provider.match(matchIconName)) && (allowSimpleName && icon.prefix === "" || icon.prefix.match(matchIconName)) && icon.name.match(matchIconName));
};

const defaultIconDimensions = Object.freeze(
  {
    left: 0,
    top: 0,
    width: 16,
    height: 16
  }
);
const defaultIconTransformations = Object.freeze({
  rotate: 0,
  vFlip: false,
  hFlip: false
});
const defaultIconProps = Object.freeze({
  ...defaultIconDimensions,
  ...defaultIconTransformations
});
const defaultExtendedIconProps = Object.freeze({
  ...defaultIconProps,
  body: "",
  hidden: false
});

function mergeIconTransformations(obj1, obj2) {
  const result = {};
  if (!obj1.hFlip !== !obj2.hFlip) {
    result.hFlip = true;
  }
  if (!obj1.vFlip !== !obj2.vFlip) {
    result.vFlip = true;
  }
  const rotate = ((obj1.rotate || 0) + (obj2.rotate || 0)) % 4;
  if (rotate) {
    result.rotate = rotate;
  }
  return result;
}

function mergeIconData(parent, child) {
  const result = mergeIconTransformations(parent, child);
  for (const key in defaultExtendedIconProps) {
    if (key in defaultIconTransformations) {
      if (key in parent && !(key in result)) {
        result[key] = defaultIconTransformations[key];
      }
    } else if (key in child) {
      result[key] = child[key];
    } else if (key in parent) {
      result[key] = parent[key];
    }
  }
  return result;
}

function getIconsTree(data, names) {
  const icons = data.icons;
  const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
  const resolved = /* @__PURE__ */ Object.create(null);
  function resolve(name) {
    if (icons[name]) {
      return resolved[name] = [];
    }
    if (!(name in resolved)) {
      resolved[name] = null;
      const parent = aliases[name] && aliases[name].parent;
      const value = parent && resolve(parent);
      if (value) {
        resolved[name] = [parent].concat(value);
      }
    }
    return resolved[name];
  }
  (names || Object.keys(icons).concat(Object.keys(aliases))).forEach(resolve);
  return resolved;
}

function internalGetIconData(data, name, tree) {
  const icons = data.icons;
  const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
  let currentProps = {};
  function parse(name2) {
    currentProps = mergeIconData(
      icons[name2] || aliases[name2],
      currentProps
    );
  }
  parse(name);
  tree.forEach(parse);
  return mergeIconData(data, currentProps);
}

function parseIconSet(data, callback) {
  const names = [];
  if (typeof data !== "object" || typeof data.icons !== "object") {
    return names;
  }
  if (data.not_found instanceof Array) {
    data.not_found.forEach((name) => {
      callback(name, null);
      names.push(name);
    });
  }
  const tree = getIconsTree(data);
  for (const name in tree) {
    const item = tree[name];
    if (item) {
      callback(name, internalGetIconData(data, name, item));
      names.push(name);
    }
  }
  return names;
}

const optionalPropertyDefaults = {
  provider: "",
  aliases: {},
  not_found: {},
  ...defaultIconDimensions
};
function checkOptionalProps(item, defaults) {
  for (const prop in defaults) {
    if (prop in item && typeof item[prop] !== typeof defaults[prop]) {
      return false;
    }
  }
  return true;
}
function quicklyValidateIconSet(obj) {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  const data = obj;
  if (typeof data.prefix !== "string" || !obj.icons || typeof obj.icons !== "object") {
    return null;
  }
  if (!checkOptionalProps(obj, optionalPropertyDefaults)) {
    return null;
  }
  const icons = data.icons;
  for (const name in icons) {
    const icon = icons[name];
    if (!name.match(matchIconName) || typeof icon.body !== "string" || !checkOptionalProps(
      icon,
      defaultExtendedIconProps
    )) {
      return null;
    }
  }
  const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
  for (const name in aliases) {
    const icon = aliases[name];
    const parent = icon.parent;
    if (!name.match(matchIconName) || typeof parent !== "string" || !icons[parent] && !aliases[parent] || !checkOptionalProps(
      icon,
      defaultExtendedIconProps
    )) {
      return null;
    }
  }
  return data;
}

const dataStorage = /* @__PURE__ */ Object.create(null);
function newStorage(provider, prefix) {
  return {
    provider,
    prefix,
    icons: /* @__PURE__ */ Object.create(null),
    missing: /* @__PURE__ */ new Set()
  };
}
function getStorage(provider, prefix) {
  const providerStorage = dataStorage[provider] || (dataStorage[provider] = /* @__PURE__ */ Object.create(null));
  return providerStorage[prefix] || (providerStorage[prefix] = newStorage(provider, prefix));
}
function addIconSet(storage, data) {
  if (!quicklyValidateIconSet(data)) {
    return [];
  }
  return parseIconSet(data, (name, icon) => {
    if (icon) {
      storage.icons[name] = icon;
    } else {
      storage.missing.add(name);
    }
  });
}
function addIconToStorage(storage, name, icon) {
  try {
    if (typeof icon.body === "string") {
      storage.icons[name] = { ...icon };
      return true;
    }
  } catch (err) {
  }
  return false;
}

let simpleNames = false;
function allowSimpleNames(allow) {
  if (typeof allow === "boolean") {
    simpleNames = allow;
  }
  return simpleNames;
}
function getIconData(name) {
  const icon = typeof name === "string" ? stringToIcon(name, true, simpleNames) : name;
  if (icon) {
    const storage = getStorage(icon.provider, icon.prefix);
    const iconName = icon.name;
    return storage.icons[iconName] || (storage.missing.has(iconName) ? null : void 0);
  }
}
function addIcon(name, data) {
  const icon = stringToIcon(name, true, simpleNames);
  if (!icon) {
    return false;
  }
  const storage = getStorage(icon.provider, icon.prefix);
  return addIconToStorage(storage, icon.name, data);
}
function addCollection(data, provider) {
  if (typeof data !== "object") {
    return false;
  }
  if (typeof provider !== "string") {
    provider = data.provider || "";
  }
  if (simpleNames && !provider && !data.prefix) {
    let added = false;
    if (quicklyValidateIconSet(data)) {
      data.prefix = "";
      parseIconSet(data, (name, icon) => {
        if (icon && addIcon(name, icon)) {
          added = true;
        }
      });
    }
    return added;
  }
  const prefix = data.prefix;
  if (!validateIconName({
    provider,
    prefix,
    name: "a"
  })) {
    return false;
  }
  const storage = getStorage(provider, prefix);
  return !!addIconSet(storage, data);
}

const defaultIconSizeCustomisations = Object.freeze({
  width: null,
  height: null
});
const defaultIconCustomisations = Object.freeze({
  // Dimensions
  ...defaultIconSizeCustomisations,
  // Transformations
  ...defaultIconTransformations
});

const unitsSplit = /(-?[0-9.]*[0-9]+[0-9.]*)/g;
const unitsTest = /^-?[0-9.]*[0-9]+[0-9.]*$/g;
function calculateSize(size, ratio, precision) {
  if (ratio === 1) {
    return size;
  }
  precision = precision || 100;
  if (typeof size === "number") {
    return Math.ceil(size * ratio * precision) / precision;
  }
  if (typeof size !== "string") {
    return size;
  }
  const oldParts = size.split(unitsSplit);
  if (oldParts === null || !oldParts.length) {
    return size;
  }
  const newParts = [];
  let code = oldParts.shift();
  let isNumber = unitsTest.test(code);
  while (true) {
    if (isNumber) {
      const num = parseFloat(code);
      if (isNaN(num)) {
        newParts.push(code);
      } else {
        newParts.push(Math.ceil(num * ratio * precision) / precision);
      }
    } else {
      newParts.push(code);
    }
    code = oldParts.shift();
    if (code === void 0) {
      return newParts.join("");
    }
    isNumber = !isNumber;
  }
}

function splitSVGDefs(content, tag = "defs") {
  let defs = "";
  const index = content.indexOf("<" + tag);
  while (index >= 0) {
    const start = content.indexOf(">", index);
    const end = content.indexOf("</" + tag);
    if (start === -1 || end === -1) {
      break;
    }
    const endEnd = content.indexOf(">", end);
    if (endEnd === -1) {
      break;
    }
    defs += content.slice(start + 1, end).trim();
    content = content.slice(0, index).trim() + content.slice(endEnd + 1);
  }
  return {
    defs,
    content
  };
}
function mergeDefsAndContent(defs, content) {
  return defs ? "<defs>" + defs + "</defs>" + content : content;
}
function wrapSVGContent(body, start, end) {
  const split = splitSVGDefs(body);
  return mergeDefsAndContent(split.defs, start + split.content + end);
}

const isUnsetKeyword = (value) => value === "unset" || value === "undefined" || value === "none";
function iconToSVG(icon, customisations) {
  const fullIcon = {
    ...defaultIconProps,
    ...icon
  };
  const fullCustomisations = {
    ...defaultIconCustomisations,
    ...customisations
  };
  const box = {
    left: fullIcon.left,
    top: fullIcon.top,
    width: fullIcon.width,
    height: fullIcon.height
  };
  let body = fullIcon.body;
  [fullIcon, fullCustomisations].forEach((props) => {
    const transformations = [];
    const hFlip = props.hFlip;
    const vFlip = props.vFlip;
    let rotation = props.rotate;
    if (hFlip) {
      if (vFlip) {
        rotation += 2;
      } else {
        transformations.push(
          "translate(" + (box.width + box.left).toString() + " " + (0 - box.top).toString() + ")"
        );
        transformations.push("scale(-1 1)");
        box.top = box.left = 0;
      }
    } else if (vFlip) {
      transformations.push(
        "translate(" + (0 - box.left).toString() + " " + (box.height + box.top).toString() + ")"
      );
      transformations.push("scale(1 -1)");
      box.top = box.left = 0;
    }
    let tempValue;
    if (rotation < 0) {
      rotation -= Math.floor(rotation / 4) * 4;
    }
    rotation = rotation % 4;
    switch (rotation) {
      case 1:
        tempValue = box.height / 2 + box.top;
        transformations.unshift(
          "rotate(90 " + tempValue.toString() + " " + tempValue.toString() + ")"
        );
        break;
      case 2:
        transformations.unshift(
          "rotate(180 " + (box.width / 2 + box.left).toString() + " " + (box.height / 2 + box.top).toString() + ")"
        );
        break;
      case 3:
        tempValue = box.width / 2 + box.left;
        transformations.unshift(
          "rotate(-90 " + tempValue.toString() + " " + tempValue.toString() + ")"
        );
        break;
    }
    if (rotation % 2 === 1) {
      if (box.left !== box.top) {
        tempValue = box.left;
        box.left = box.top;
        box.top = tempValue;
      }
      if (box.width !== box.height) {
        tempValue = box.width;
        box.width = box.height;
        box.height = tempValue;
      }
    }
    if (transformations.length) {
      body = wrapSVGContent(
        body,
        '<g transform="' + transformations.join(" ") + '">',
        "</g>"
      );
    }
  });
  const customisationsWidth = fullCustomisations.width;
  const customisationsHeight = fullCustomisations.height;
  const boxWidth = box.width;
  const boxHeight = box.height;
  let width;
  let height;
  if (customisationsWidth === null) {
    height = customisationsHeight === null ? "1em" : customisationsHeight === "auto" ? boxHeight : customisationsHeight;
    width = calculateSize(height, boxWidth / boxHeight);
  } else {
    width = customisationsWidth === "auto" ? boxWidth : customisationsWidth;
    height = customisationsHeight === null ? calculateSize(width, boxHeight / boxWidth) : customisationsHeight === "auto" ? boxHeight : customisationsHeight;
  }
  const attributes = {};
  const setAttr = (prop, value) => {
    if (!isUnsetKeyword(value)) {
      attributes[prop] = value.toString();
    }
  };
  setAttr("width", width);
  setAttr("height", height);
  const viewBox = [box.left, box.top, boxWidth, boxHeight];
  attributes.viewBox = viewBox.join(" ");
  return {
    attributes,
    viewBox,
    body
  };
}

const regex = /\sid="(\S+)"/g;
const randomPrefix = "IconifyId" + Date.now().toString(16) + (Math.random() * 16777216 | 0).toString(16);
let counter = 0;
function replaceIDs(body, prefix = randomPrefix) {
  const ids = [];
  let match;
  while (match = regex.exec(body)) {
    ids.push(match[1]);
  }
  if (!ids.length) {
    return body;
  }
  const suffix = "suffix" + (Math.random() * 16777216 | Date.now()).toString(16);
  ids.forEach((id) => {
    const newID = typeof prefix === "function" ? prefix(id) : prefix + (counter++).toString();
    const escapedID = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(
      // Allowed characters before id: [#;"]
      // Allowed characters after id: [)"], .[a-z]
      new RegExp('([#;"])(' + escapedID + ')([")]|\\.[a-z])', "g"),
      "$1" + newID + suffix + "$3"
    );
  });
  body = body.replace(new RegExp(suffix, "g"), "");
  return body;
}

const storage = /* @__PURE__ */ Object.create(null);
function setAPIModule(provider, item) {
  storage[provider] = item;
}
function getAPIModule(provider) {
  return storage[provider] || storage[""];
}

function createAPIConfig(source) {
  let resources;
  if (typeof source.resources === "string") {
    resources = [source.resources];
  } else {
    resources = source.resources;
    if (!(resources instanceof Array) || !resources.length) {
      return null;
    }
  }
  const result = {
    // API hosts
    resources,
    // Root path
    path: source.path || "/",
    // URL length limit
    maxURL: source.maxURL || 500,
    // Timeout before next host is used.
    rotate: source.rotate || 750,
    // Timeout before failing query.
    timeout: source.timeout || 5e3,
    // Randomise default API end point.
    random: source.random === true,
    // Start index
    index: source.index || 0,
    // Receive data after time out (used if time out kicks in first, then API module sends data anyway).
    dataAfterTimeout: source.dataAfterTimeout !== false
  };
  return result;
}
const configStorage = /* @__PURE__ */ Object.create(null);
const fallBackAPISources = [
  "https://api.simplesvg.com",
  "https://api.unisvg.com"
];
const fallBackAPI = [];
while (fallBackAPISources.length > 0) {
  if (fallBackAPISources.length === 1) {
    fallBackAPI.push(fallBackAPISources.shift());
  } else {
    if (Math.random() > 0.5) {
      fallBackAPI.push(fallBackAPISources.shift());
    } else {
      fallBackAPI.push(fallBackAPISources.pop());
    }
  }
}
configStorage[""] = createAPIConfig({
  resources: ["https://api.iconify.design"].concat(fallBackAPI)
});
function addAPIProvider(provider, customConfig) {
  const config = createAPIConfig(customConfig);
  if (config === null) {
    return false;
  }
  configStorage[provider] = config;
  return true;
}
function getAPIConfig(provider) {
  return configStorage[provider];
}

const detectFetch = () => {
  let callback;
  try {
    callback = fetch;
    if (typeof callback === "function") {
      return callback;
    }
  } catch (err) {
  }
};
let fetchModule = detectFetch();
function calculateMaxLength(provider, prefix) {
  const config = getAPIConfig(provider);
  if (!config) {
    return 0;
  }
  let result;
  if (!config.maxURL) {
    result = 0;
  } else {
    let maxHostLength = 0;
    config.resources.forEach((item) => {
      const host = item;
      maxHostLength = Math.max(maxHostLength, host.length);
    });
    const url = prefix + ".json?icons=";
    result = config.maxURL - maxHostLength - config.path.length - url.length;
  }
  return result;
}
function shouldAbort(status) {
  return status === 404;
}
const prepare = (provider, prefix, icons) => {
  const results = [];
  const maxLength = calculateMaxLength(provider, prefix);
  const type = "icons";
  let item = {
    type,
    provider,
    prefix,
    icons: []
  };
  let length = 0;
  icons.forEach((name, index) => {
    length += name.length + 1;
    if (length >= maxLength && index > 0) {
      results.push(item);
      item = {
        type,
        provider,
        prefix,
        icons: []
      };
      length = name.length;
    }
    item.icons.push(name);
  });
  results.push(item);
  return results;
};
function getPath(provider) {
  if (typeof provider === "string") {
    const config = getAPIConfig(provider);
    if (config) {
      return config.path;
    }
  }
  return "/";
}
const send = (host, params, callback) => {
  if (!fetchModule) {
    callback("abort", 424);
    return;
  }
  let path = getPath(params.provider);
  switch (params.type) {
    case "icons": {
      const prefix = params.prefix;
      const icons = params.icons;
      const iconsList = icons.join(",");
      const urlParams = new URLSearchParams({
        icons: iconsList
      });
      path += prefix + ".json?" + urlParams.toString();
      break;
    }
    case "custom": {
      const uri = params.uri;
      path += uri.slice(0, 1) === "/" ? uri.slice(1) : uri;
      break;
    }
    default:
      callback("abort", 400);
      return;
  }
  let defaultError = 503;
  fetchModule(host + path).then((response) => {
    const status = response.status;
    if (status !== 200) {
      setTimeout(() => {
        callback(shouldAbort(status) ? "abort" : "next", status);
      });
      return;
    }
    defaultError = 501;
    return response.json();
  }).then((data) => {
    if (typeof data !== "object" || data === null) {
      setTimeout(() => {
        if (data === 404) {
          callback("abort", data);
        } else {
          callback("next", defaultError);
        }
      });
      return;
    }
    setTimeout(() => {
      callback("success", data);
    });
  }).catch(() => {
    callback("next", defaultError);
  });
};
const fetchAPIModule = {
  prepare,
  send
};

function sortIcons(icons) {
  const result = {
    loaded: [],
    missing: [],
    pending: []
  };
  const storage = /* @__PURE__ */ Object.create(null);
  icons.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    if (a.prefix !== b.prefix) {
      return a.prefix.localeCompare(b.prefix);
    }
    return a.name.localeCompare(b.name);
  });
  let lastIcon = {
    provider: "",
    prefix: "",
    name: ""
  };
  icons.forEach((icon) => {
    if (lastIcon.name === icon.name && lastIcon.prefix === icon.prefix && lastIcon.provider === icon.provider) {
      return;
    }
    lastIcon = icon;
    const provider = icon.provider;
    const prefix = icon.prefix;
    const name = icon.name;
    const providerStorage = storage[provider] || (storage[provider] = /* @__PURE__ */ Object.create(null));
    const localStorage = providerStorage[prefix] || (providerStorage[prefix] = getStorage(provider, prefix));
    let list;
    if (name in localStorage.icons) {
      list = result.loaded;
    } else if (prefix === "" || localStorage.missing.has(name)) {
      list = result.missing;
    } else {
      list = result.pending;
    }
    const item = {
      provider,
      prefix,
      name
    };
    list.push(item);
  });
  return result;
}

function removeCallback(storages, id) {
  storages.forEach((storage) => {
    const items = storage.loaderCallbacks;
    if (items) {
      storage.loaderCallbacks = items.filter((row) => row.id !== id);
    }
  });
}
function updateCallbacks(storage) {
  if (!storage.pendingCallbacksFlag) {
    storage.pendingCallbacksFlag = true;
    setTimeout(() => {
      storage.pendingCallbacksFlag = false;
      const items = storage.loaderCallbacks ? storage.loaderCallbacks.slice(0) : [];
      if (!items.length) {
        return;
      }
      let hasPending = false;
      const provider = storage.provider;
      const prefix = storage.prefix;
      items.forEach((item) => {
        const icons = item.icons;
        const oldLength = icons.pending.length;
        icons.pending = icons.pending.filter((icon) => {
          if (icon.prefix !== prefix) {
            return true;
          }
          const name = icon.name;
          if (storage.icons[name]) {
            icons.loaded.push({
              provider,
              prefix,
              name
            });
          } else if (storage.missing.has(name)) {
            icons.missing.push({
              provider,
              prefix,
              name
            });
          } else {
            hasPending = true;
            return true;
          }
          return false;
        });
        if (icons.pending.length !== oldLength) {
          if (!hasPending) {
            removeCallback([storage], item.id);
          }
          item.callback(
            icons.loaded.slice(0),
            icons.missing.slice(0),
            icons.pending.slice(0),
            item.abort
          );
        }
      });
    });
  }
}
let idCounter = 0;
function storeCallback(callback, icons, pendingSources) {
  const id = idCounter++;
  const abort = removeCallback.bind(null, pendingSources, id);
  if (!icons.pending.length) {
    return abort;
  }
  const item = {
    id,
    icons,
    callback,
    abort
  };
  pendingSources.forEach((storage) => {
    (storage.loaderCallbacks || (storage.loaderCallbacks = [])).push(item);
  });
  return abort;
}

function listToIcons(list, validate = true, simpleNames = false) {
  const result = [];
  list.forEach((item) => {
    const icon = typeof item === "string" ? stringToIcon(item, validate, simpleNames) : item;
    if (icon) {
      result.push(icon);
    }
  });
  return result;
}

// src/config.ts
var defaultConfig = {
  resources: [],
  index: 0,
  timeout: 2e3,
  rotate: 750,
  random: false,
  dataAfterTimeout: false
};

// src/query.ts
function sendQuery(config, payload, query, done) {
  const resourcesCount = config.resources.length;
  const startIndex = config.random ? Math.floor(Math.random() * resourcesCount) : config.index;
  let resources;
  if (config.random) {
    let list = config.resources.slice(0);
    resources = [];
    while (list.length > 1) {
      const nextIndex = Math.floor(Math.random() * list.length);
      resources.push(list[nextIndex]);
      list = list.slice(0, nextIndex).concat(list.slice(nextIndex + 1));
    }
    resources = resources.concat(list);
  } else {
    resources = config.resources.slice(startIndex).concat(config.resources.slice(0, startIndex));
  }
  const startTime = Date.now();
  let status = "pending";
  let queriesSent = 0;
  let lastError;
  let timer = null;
  let queue = [];
  let doneCallbacks = [];
  if (typeof done === "function") {
    doneCallbacks.push(done);
  }
  function resetTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function abort() {
    if (status === "pending") {
      status = "aborted";
    }
    resetTimer();
    queue.forEach((item) => {
      if (item.status === "pending") {
        item.status = "aborted";
      }
    });
    queue = [];
  }
  function subscribe(callback, overwrite) {
    if (overwrite) {
      doneCallbacks = [];
    }
    if (typeof callback === "function") {
      doneCallbacks.push(callback);
    }
  }
  function getQueryStatus() {
    return {
      startTime,
      payload,
      status,
      queriesSent,
      queriesPending: queue.length,
      subscribe,
      abort
    };
  }
  function failQuery() {
    status = "failed";
    doneCallbacks.forEach((callback) => {
      callback(void 0, lastError);
    });
  }
  function clearQueue() {
    queue.forEach((item) => {
      if (item.status === "pending") {
        item.status = "aborted";
      }
    });
    queue = [];
  }
  function moduleResponse(item, response, data) {
    const isError = response !== "success";
    queue = queue.filter((queued) => queued !== item);
    switch (status) {
      case "pending":
        break;
      case "failed":
        if (isError || !config.dataAfterTimeout) {
          return;
        }
        break;
      default:
        return;
    }
    if (response === "abort") {
      lastError = data;
      failQuery();
      return;
    }
    if (isError) {
      lastError = data;
      if (!queue.length) {
        if (!resources.length) {
          failQuery();
        } else {
          execNext();
        }
      }
      return;
    }
    resetTimer();
    clearQueue();
    if (!config.random) {
      const index = config.resources.indexOf(item.resource);
      if (index !== -1 && index !== config.index) {
        config.index = index;
      }
    }
    status = "completed";
    doneCallbacks.forEach((callback) => {
      callback(data);
    });
  }
  function execNext() {
    if (status !== "pending") {
      return;
    }
    resetTimer();
    const resource = resources.shift();
    if (resource === void 0) {
      if (queue.length) {
        timer = setTimeout(() => {
          resetTimer();
          if (status === "pending") {
            clearQueue();
            failQuery();
          }
        }, config.timeout);
        return;
      }
      failQuery();
      return;
    }
    const item = {
      status: "pending",
      resource,
      callback: (status2, data) => {
        moduleResponse(item, status2, data);
      }
    };
    queue.push(item);
    queriesSent++;
    timer = setTimeout(execNext, config.rotate);
    query(resource, payload, item.callback);
  }
  setTimeout(execNext);
  return getQueryStatus;
}

// src/index.ts
function initRedundancy(cfg) {
  const config = {
    ...defaultConfig,
    ...cfg
  };
  let queries = [];
  function cleanup() {
    queries = queries.filter((item) => item().status === "pending");
  }
  function query(payload, queryCallback, doneCallback) {
    const query2 = sendQuery(
      config,
      payload,
      queryCallback,
      (data, error) => {
        cleanup();
        if (doneCallback) {
          doneCallback(data, error);
        }
      }
    );
    queries.push(query2);
    return query2;
  }
  function find(callback) {
    return queries.find((value) => {
      return callback(value);
    }) || null;
  }
  const instance = {
    query,
    find,
    setIndex: (index) => {
      config.index = index;
    },
    getIndex: () => config.index,
    cleanup
  };
  return instance;
}

function emptyCallback$1() {
}
const redundancyCache = /* @__PURE__ */ Object.create(null);
function getRedundancyCache(provider) {
  if (!redundancyCache[provider]) {
    const config = getAPIConfig(provider);
    if (!config) {
      return;
    }
    const redundancy = initRedundancy(config);
    const cachedReundancy = {
      config,
      redundancy
    };
    redundancyCache[provider] = cachedReundancy;
  }
  return redundancyCache[provider];
}
function sendAPIQuery(target, query, callback) {
  let redundancy;
  let send;
  if (typeof target === "string") {
    const api = getAPIModule(target);
    if (!api) {
      callback(void 0, 424);
      return emptyCallback$1;
    }
    send = api.send;
    const cached = getRedundancyCache(target);
    if (cached) {
      redundancy = cached.redundancy;
    }
  } else {
    const config = createAPIConfig(target);
    if (config) {
      redundancy = initRedundancy(config);
      const moduleKey = target.resources ? target.resources[0] : "";
      const api = getAPIModule(moduleKey);
      if (api) {
        send = api.send;
      }
    }
  }
  if (!redundancy || !send) {
    callback(void 0, 424);
    return emptyCallback$1;
  }
  return redundancy.query(query, send, callback)().abort;
}

const browserCacheVersion = "iconify2";
const browserCachePrefix = "iconify";
const browserCacheCountKey = browserCachePrefix + "-count";
const browserCacheVersionKey = browserCachePrefix + "-version";
const browserStorageHour = 36e5;
const browserStorageCacheExpiration = 168;
const browserStorageLimit = 50;

function getStoredItem(func, key) {
  try {
    return func.getItem(key);
  } catch (err) {
  }
}
function setStoredItem(func, key, value) {
  try {
    func.setItem(key, value);
    return true;
  } catch (err) {
  }
}
function removeStoredItem(func, key) {
  try {
    func.removeItem(key);
  } catch (err) {
  }
}

function setBrowserStorageItemsCount(storage, value) {
  return setStoredItem(storage, browserCacheCountKey, value.toString());
}
function getBrowserStorageItemsCount(storage) {
  return parseInt(getStoredItem(storage, browserCacheCountKey)) || 0;
}

const browserStorageConfig = {
  local: true,
  session: true
};
const browserStorageEmptyItems = {
  local: /* @__PURE__ */ new Set(),
  session: /* @__PURE__ */ new Set()
};
let browserStorageStatus = false;
function setBrowserStorageStatus(status) {
  browserStorageStatus = status;
}

let _window = typeof window === "undefined" ? {} : window;
function getBrowserStorage(key) {
  const attr = key + "Storage";
  try {
    if (_window && _window[attr] && typeof _window[attr].length === "number") {
      return _window[attr];
    }
  } catch (err) {
  }
  browserStorageConfig[key] = false;
}

function iterateBrowserStorage(key, callback) {
  const func = getBrowserStorage(key);
  if (!func) {
    return;
  }
  const version = getStoredItem(func, browserCacheVersionKey);
  if (version !== browserCacheVersion) {
    if (version) {
      const total2 = getBrowserStorageItemsCount(func);
      for (let i = 0; i < total2; i++) {
        removeStoredItem(func, browserCachePrefix + i.toString());
      }
    }
    setStoredItem(func, browserCacheVersionKey, browserCacheVersion);
    setBrowserStorageItemsCount(func, 0);
    return;
  }
  const minTime = Math.floor(Date.now() / browserStorageHour) - browserStorageCacheExpiration;
  const parseItem = (index) => {
    const name = browserCachePrefix + index.toString();
    const item = getStoredItem(func, name);
    if (typeof item !== "string") {
      return;
    }
    try {
      const data = JSON.parse(item);
      if (typeof data === "object" && typeof data.cached === "number" && data.cached > minTime && typeof data.provider === "string" && typeof data.data === "object" && typeof data.data.prefix === "string" && // Valid item: run callback
      callback(data, index)) {
        return true;
      }
    } catch (err) {
    }
    removeStoredItem(func, name);
  };
  let total = getBrowserStorageItemsCount(func);
  for (let i = total - 1; i >= 0; i--) {
    if (!parseItem(i)) {
      if (i === total - 1) {
        total--;
        setBrowserStorageItemsCount(func, total);
      } else {
        browserStorageEmptyItems[key].add(i);
      }
    }
  }
}

function initBrowserStorage() {
  if (browserStorageStatus) {
    return;
  }
  setBrowserStorageStatus(true);
  for (const key in browserStorageConfig) {
    iterateBrowserStorage(key, (item) => {
      const iconSet = item.data;
      const provider = item.provider;
      const prefix = iconSet.prefix;
      const storage = getStorage(
        provider,
        prefix
      );
      if (!addIconSet(storage, iconSet).length) {
        return false;
      }
      const lastModified = iconSet.lastModified || -1;
      storage.lastModifiedCached = storage.lastModifiedCached ? Math.min(storage.lastModifiedCached, lastModified) : lastModified;
      return true;
    });
  }
}

function updateLastModified(storage, lastModified) {
  const lastValue = storage.lastModifiedCached;
  if (
    // Matches or newer
    lastValue && lastValue >= lastModified
  ) {
    return lastValue === lastModified;
  }
  storage.lastModifiedCached = lastModified;
  if (lastValue) {
    for (const key in browserStorageConfig) {
      iterateBrowserStorage(key, (item) => {
        const iconSet = item.data;
        return item.provider !== storage.provider || iconSet.prefix !== storage.prefix || iconSet.lastModified === lastModified;
      });
    }
  }
  return true;
}
function storeInBrowserStorage(storage, data) {
  if (!browserStorageStatus) {
    initBrowserStorage();
  }
  function store(key) {
    let func;
    if (!browserStorageConfig[key] || !(func = getBrowserStorage(key))) {
      return;
    }
    const set = browserStorageEmptyItems[key];
    let index;
    if (set.size) {
      set.delete(index = Array.from(set).shift());
    } else {
      index = getBrowserStorageItemsCount(func);
      if (index >= browserStorageLimit || !setBrowserStorageItemsCount(func, index + 1)) {
        return;
      }
    }
    const item = {
      cached: Math.floor(Date.now() / browserStorageHour),
      provider: storage.provider,
      data
    };
    return setStoredItem(
      func,
      browserCachePrefix + index.toString(),
      JSON.stringify(item)
    );
  }
  if (data.lastModified && !updateLastModified(storage, data.lastModified)) {
    return;
  }
  if (!Object.keys(data.icons).length) {
    return;
  }
  if (data.not_found) {
    data = Object.assign({}, data);
    delete data.not_found;
  }
  if (!store("local")) {
    store("session");
  }
}

function emptyCallback() {
}
function loadedNewIcons(storage) {
  if (!storage.iconsLoaderFlag) {
    storage.iconsLoaderFlag = true;
    setTimeout(() => {
      storage.iconsLoaderFlag = false;
      updateCallbacks(storage);
    });
  }
}
function loadNewIcons(storage, icons) {
  if (!storage.iconsToLoad) {
    storage.iconsToLoad = icons;
  } else {
    storage.iconsToLoad = storage.iconsToLoad.concat(icons).sort();
  }
  if (!storage.iconsQueueFlag) {
    storage.iconsQueueFlag = true;
    setTimeout(() => {
      storage.iconsQueueFlag = false;
      const { provider, prefix } = storage;
      const icons2 = storage.iconsToLoad;
      delete storage.iconsToLoad;
      let api;
      if (!icons2 || !(api = getAPIModule(provider))) {
        return;
      }
      const params = api.prepare(provider, prefix, icons2);
      params.forEach((item) => {
        sendAPIQuery(provider, item, (data) => {
          if (typeof data !== "object") {
            item.icons.forEach((name) => {
              storage.missing.add(name);
            });
          } else {
            try {
              const parsed = addIconSet(
                storage,
                data
              );
              if (!parsed.length) {
                return;
              }
              const pending = storage.pendingIcons;
              if (pending) {
                parsed.forEach((name) => {
                  pending.delete(name);
                });
              }
              storeInBrowserStorage(storage, data);
            } catch (err) {
              console.error(err);
            }
          }
          loadedNewIcons(storage);
        });
      });
    });
  }
}
const loadIcons = (icons, callback) => {
  const cleanedIcons = listToIcons(icons, true, allowSimpleNames());
  const sortedIcons = sortIcons(cleanedIcons);
  if (!sortedIcons.pending.length) {
    let callCallback = true;
    if (callback) {
      setTimeout(() => {
        if (callCallback) {
          callback(
            sortedIcons.loaded,
            sortedIcons.missing,
            sortedIcons.pending,
            emptyCallback
          );
        }
      });
    }
    return () => {
      callCallback = false;
    };
  }
  const newIcons = /* @__PURE__ */ Object.create(null);
  const sources = [];
  let lastProvider, lastPrefix;
  sortedIcons.pending.forEach((icon) => {
    const { provider, prefix } = icon;
    if (prefix === lastPrefix && provider === lastProvider) {
      return;
    }
    lastProvider = provider;
    lastPrefix = prefix;
    sources.push(getStorage(provider, prefix));
    const providerNewIcons = newIcons[provider] || (newIcons[provider] = /* @__PURE__ */ Object.create(null));
    if (!providerNewIcons[prefix]) {
      providerNewIcons[prefix] = [];
    }
  });
  sortedIcons.pending.forEach((icon) => {
    const { provider, prefix, name } = icon;
    const storage = getStorage(provider, prefix);
    const pendingQueue = storage.pendingIcons || (storage.pendingIcons = /* @__PURE__ */ new Set());
    if (!pendingQueue.has(name)) {
      pendingQueue.add(name);
      newIcons[provider][prefix].push(name);
    }
  });
  sources.forEach((storage) => {
    const { provider, prefix } = storage;
    if (newIcons[provider][prefix].length) {
      loadNewIcons(storage, newIcons[provider][prefix]);
    }
  });
  return callback ? storeCallback(callback, sortedIcons, sources) : emptyCallback;
};

function mergeCustomisations(defaults, item) {
  const result = {
    ...defaults
  };
  for (const key in item) {
    const value = item[key];
    const valueType = typeof value;
    if (key in defaultIconSizeCustomisations) {
      if (value === null || value && (valueType === "string" || valueType === "number")) {
        result[key] = value;
      }
    } else if (valueType === typeof result[key]) {
      result[key] = key === "rotate" ? value % 4 : value;
    }
  }
  return result;
}

const separator = /[\s,]+/;
function flipFromString(custom, flip) {
  flip.split(separator).forEach((str) => {
    const value = str.trim();
    switch (value) {
      case "horizontal":
        custom.hFlip = true;
        break;
      case "vertical":
        custom.vFlip = true;
        break;
    }
  });
}

function rotateFromString(value, defaultValue = 0) {
  const units = value.replace(/^-?[0-9.]*/, "");
  function cleanup(value2) {
    while (value2 < 0) {
      value2 += 4;
    }
    return value2 % 4;
  }
  if (units === "") {
    const num = parseInt(value);
    return isNaN(num) ? 0 : cleanup(num);
  } else if (units !== value) {
    let split = 0;
    switch (units) {
      case "%":
        split = 25;
        break;
      case "deg":
        split = 90;
    }
    if (split) {
      let num = parseFloat(value.slice(0, value.length - units.length));
      if (isNaN(num)) {
        return 0;
      }
      num = num / split;
      return num % 1 === 0 ? cleanup(num) : 0;
    }
  }
  return defaultValue;
}

function iconToHTML(body, attributes) {
  let renderAttribsHTML = body.indexOf("xlink:") === -1 ? "" : ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  for (const attr in attributes) {
    renderAttribsHTML += " " + attr + '="' + attributes[attr] + '"';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg"' + renderAttribsHTML + ">" + body + "</svg>";
}

function encodeSVGforURL(svg) {
  return svg.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s+/g, " ");
}
function svgToData(svg) {
  return "data:image/svg+xml," + encodeSVGforURL(svg);
}
function svgToURL(svg) {
  return 'url("' + svgToData(svg) + '")';
}

const defaultExtendedIconCustomisations = {
    ...defaultIconCustomisations,
    inline: false,
};

/**
 * Default SVG attributes
 */
const svgDefaults = {
    'xmlns': 'http://www.w3.org/2000/svg',
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    'aria-hidden': true,
    'role': 'img',
};
/**
 * Style modes
 */
const commonProps = {
    display: 'inline-block',
};
const monotoneProps = {
    'background-color': 'currentColor',
};
const coloredProps = {
    'background-color': 'transparent',
};
// Dynamically add common props to variables above
const propsToAdd = {
    image: 'var(--svg)',
    repeat: 'no-repeat',
    size: '100% 100%',
};
const propsToAddTo = {
    '-webkit-mask': monotoneProps,
    'mask': monotoneProps,
    'background': coloredProps,
};
for (const prefix in propsToAddTo) {
    const list = propsToAddTo[prefix];
    for (const prop in propsToAdd) {
        list[prefix + '-' + prop] = propsToAdd[prop];
    }
}
/**
 * Fix size: add 'px' to numbers
 */
function fixSize(value) {
    return value + (value.match(/^[-0-9.]+$/) ? 'px' : '');
}
/**
 * Generate icon from properties
 */
function render(
// Icon must be validated before calling this function
icon, 
// Properties
props) {
    const customisations = mergeCustomisations(defaultExtendedIconCustomisations, props);
    // Check mode
    const mode = props.mode || 'svg';
    const componentProps = (mode === 'svg' ? { ...svgDefaults } : {});
    if (icon.body.indexOf('xlink:') === -1) {
        delete componentProps['xmlns:xlink'];
    }
    // Create style if missing
    let style = typeof props.style === 'string' ? props.style : '';
    // Get element properties
    for (let key in props) {
        const value = props[key];
        if (value === void 0) {
            continue;
        }
        switch (key) {
            // Properties to ignore
            case 'icon':
            case 'style':
            case 'onLoad':
            case 'mode':
                break;
            // Boolean attributes
            case 'inline':
            case 'hFlip':
            case 'vFlip':
                customisations[key] =
                    value === true || value === 'true' || value === 1;
                break;
            // Flip as string: 'horizontal,vertical'
            case 'flip':
                if (typeof value === 'string') {
                    flipFromString(customisations, value);
                }
                break;
            // Color: copy to style, add extra ';' in case style is missing it
            case 'color':
                style =
                    style +
                        (style.length > 0 && style.trim().slice(-1) !== ';'
                            ? ';'
                            : '') +
                        'color: ' +
                        value +
                        '; ';
                break;
            // Rotation as string
            case 'rotate':
                if (typeof value === 'string') {
                    customisations[key] = rotateFromString(value);
                }
                else if (typeof value === 'number') {
                    customisations[key] = value;
                }
                break;
            // Remove aria-hidden
            case 'ariaHidden':
            case 'aria-hidden':
                if (value !== true && value !== 'true') {
                    delete componentProps['aria-hidden'];
                }
                break;
            default:
                if (key.slice(0, 3) === 'on:') {
                    // Svelte event
                    break;
                }
                // Copy missing property if it does not exist in customisations
                if (defaultExtendedIconCustomisations[key] === void 0) {
                    componentProps[key] = value;
                }
        }
    }
    // Generate icon
    const item = iconToSVG(icon, customisations);
    const renderAttribs = item.attributes;
    // Inline display
    if (customisations.inline) {
        // Style overrides it
        style = 'vertical-align: -0.125em; ' + style;
    }
    if (mode === 'svg') {
        // Add icon stuff
        Object.assign(componentProps, renderAttribs);
        // Style
        if (style !== '') {
            componentProps.style = style;
        }
        // Counter for ids based on "id" property to render icons consistently on server and client
        let localCounter = 0;
        let id = props.id;
        if (typeof id === 'string') {
            // Convert '-' to '_' to avoid errors in animations
            id = id.replace(/-/g, '_');
        }
        // Generate HTML
        return {
            svg: true,
            attributes: componentProps,
            body: replaceIDs(item.body, id ? () => id + 'ID' + localCounter++ : 'iconifySvelte'),
        };
    }
    // Render <span> with style
    const { body, width, height } = icon;
    const useMask = mode === 'mask' ||
        (mode === 'bg' ? false : body.indexOf('currentColor') !== -1);
    // Generate SVG
    const html = iconToHTML(body, {
        ...renderAttribs,
        width: width + '',
        height: height + '',
    });
    // Generate style
    const url = svgToURL(html);
    const styles = {
        '--svg': url,
    };
    const size = (prop) => {
        const value = renderAttribs[prop];
        if (value) {
            styles[prop] = fixSize(value);
        }
    };
    size('width');
    size('height');
    Object.assign(styles, commonProps, useMask ? monotoneProps : coloredProps);
    let customStyle = '';
    for (const key in styles) {
        customStyle += key + ': ' + styles[key] + ';';
    }
    componentProps.style = customStyle + style;
    return {
        svg: false,
        attributes: componentProps,
    };
}
/**
 * Initialise stuff
 */
// Enable short names
allowSimpleNames(true);
// Set API module
setAPIModule('', fetchAPIModule);
/**
 * Browser stuff
 */
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    // Set cache and load existing cache
    initBrowserStorage();
    const _window = window;
    // Load icons from global "IconifyPreload"
    if (_window.IconifyPreload !== void 0) {
        const preload = _window.IconifyPreload;
        const err = 'Invalid IconifyPreload syntax.';
        if (typeof preload === 'object' && preload !== null) {
            (preload instanceof Array ? preload : [preload]).forEach((item) => {
                try {
                    if (
                    // Check if item is an object and not null/array
                    typeof item !== 'object' ||
                        item === null ||
                        item instanceof Array ||
                        // Check for 'icons' and 'prefix'
                        typeof item.icons !== 'object' ||
                        typeof item.prefix !== 'string' ||
                        // Add icon set
                        !addCollection(item)) {
                        console.error(err);
                    }
                }
                catch (e) {
                    console.error(err);
                }
            });
        }
    }
    // Set API from global "IconifyProviders"
    if (_window.IconifyProviders !== void 0) {
        const providers = _window.IconifyProviders;
        if (typeof providers === 'object' && providers !== null) {
            for (let key in providers) {
                const err = 'IconifyProviders[' + key + '] is invalid.';
                try {
                    const value = providers[key];
                    if (typeof value !== 'object' ||
                        !value ||
                        value.resources === void 0) {
                        continue;
                    }
                    if (!addAPIProvider(key, value)) {
                        console.error(err);
                    }
                }
                catch (e) {
                    console.error(err);
                }
            }
        }
    }
}
/**
 * Check if component needs to be updated
 */
function checkIconState(icon, state, mounted, callback, onload) {
    // Abort loading icon
    function abortLoading() {
        if (state.loading) {
            state.loading.abort();
            state.loading = null;
        }
    }
    // Icon is an object
    if (typeof icon === 'object' &&
        icon !== null &&
        typeof icon.body === 'string') {
        // Stop loading
        state.name = '';
        abortLoading();
        return { data: { ...defaultIconProps, ...icon } };
    }
    // Invalid icon?
    let iconName;
    if (typeof icon !== 'string' ||
        (iconName = stringToIcon(icon, false, true)) === null) {
        abortLoading();
        return null;
    }
    // Load icon
    const data = getIconData(iconName);
    if (!data) {
        // Icon data is not available
        // Do not load icon until component is mounted
        if (mounted && (!state.loading || state.loading.name !== icon)) {
            // New icon to load
            abortLoading();
            state.name = '';
            state.loading = {
                name: icon,
                abort: loadIcons([iconName], callback),
            };
        }
        return null;
    }
    // Icon data is available
    abortLoading();
    if (state.name !== icon) {
        state.name = icon;
        if (onload && !state.destroyed) {
            onload(icon);
        }
    }
    // Add classes
    const classes = ['iconify'];
    if (iconName.prefix !== '') {
        classes.push('iconify--' + iconName.prefix);
    }
    if (iconName.provider !== '') {
        classes.push('iconify--' + iconName.provider);
    }
    return { data, classes };
}
/**
 * Generate icon
 */
function generateIcon(icon, props) {
    return icon
        ? render({
            ...defaultIconProps,
            ...icon,
        }, props)
        : null;
}

/* generated by Svelte v3.59.1 */

function create_if_block$1(ctx) {
	let if_block_anchor;

	function select_block_type(ctx, dirty) {
		if (/*data*/ ctx[0].svg) return create_if_block_1;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		l(nodes) {
			if_block.l(nodes);
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
		},
		p(ctx, dirty) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},
		d(detaching) {
			if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

// (115:1) {:else}
function create_else_block(ctx) {
	let span;
	let span_levels = [/*data*/ ctx[0].attributes];
	let span_data = {};

	for (let i = 0; i < span_levels.length; i += 1) {
		span_data = assign(span_data, span_levels[i]);
	}

	return {
		c() {
			span = element("span");
			this.h();
		},
		l(nodes) {
			span = claim_element(nodes, "SPAN", {});
			children(span).forEach(detach);
			this.h();
		},
		h() {
			set_attributes(span, span_data);
		},
		m(target, anchor) {
			insert_hydration(target, span, anchor);
		},
		p(ctx, dirty) {
			set_attributes(span, span_data = get_spread_update(span_levels, [dirty & /*data*/ 1 && /*data*/ ctx[0].attributes]));
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

// (111:1) {#if data.svg}
function create_if_block_1(ctx) {
	let svg;
	let raw_value = /*data*/ ctx[0].body + "";
	let svg_levels = [/*data*/ ctx[0].attributes];
	let svg_data = {};

	for (let i = 0; i < svg_levels.length; i += 1) {
		svg_data = assign(svg_data, svg_levels[i]);
	}

	return {
		c() {
			svg = svg_element("svg");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {});
			var svg_nodes = children(svg);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			set_svg_attributes(svg, svg_data);
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			svg.innerHTML = raw_value;
		},
		p(ctx, dirty) {
			if (dirty & /*data*/ 1 && raw_value !== (raw_value = /*data*/ ctx[0].body + "")) svg.innerHTML = raw_value;			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [dirty & /*data*/ 1 && /*data*/ ctx[0].attributes]));
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

function create_fragment$1(ctx) {
	let if_block_anchor;
	let if_block = /*data*/ ctx[0] && create_if_block$1(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l(nodes) {
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (/*data*/ ctx[0]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	const state = {
		// Last icon name
		name: '',
		// Loading status
		loading: null,
		// Destroyed status
		destroyed: false
	};

	// Mounted status
	let mounted = false;

	// Callback counter
	let counter = 0;

	// Generated data
	let data;

	const onLoad = icon => {
		// Legacy onLoad property
		if (typeof $$props.onLoad === 'function') {
			$$props.onLoad(icon);
		}

		// on:load event
		const dispatch = createEventDispatcher();

		dispatch('load', { icon });
	};

	// Increase counter when loaded to force re-calculation of data
	function loaded() {
		$$invalidate(3, counter++, counter);
	}

	// Force re-render
	onMount(() => {
		$$invalidate(2, mounted = true);
	});

	// Abort loading when component is destroyed
	onDestroy(() => {
		$$invalidate(1, state.destroyed = true, state);

		if (state.loading) {
			state.loading.abort();
			$$invalidate(1, state.loading = null, state);
		}
	});

	$$self.$$set = $$new_props => {
		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
	};

	$$self.$$.update = () => {
		{
			const iconData = checkIconState($$props.icon, state, mounted, loaded, onLoad);
			$$invalidate(0, data = iconData ? generateIcon(iconData.data, $$props) : null);

			if (data && iconData.classes) {
				// Add classes
				$$invalidate(
					0,
					data.attributes['class'] = (typeof $$props['class'] === 'string'
					? $$props['class'] + ' '
					: '') + iconData.classes.join(' '),
					data
				);
			}
		}
	};

	$$props = exclude_internal_props($$props);
	return [data, state, mounted, counter];
}

let Component$1 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[8] = list[i];
	return child_ctx;
}

// (444:8) {#if payment.image.url}
function create_if_block(ctx) {
	let img;
	let img_src_value;
	let img_alt_value;

	return {
		c() {
			img = element("img");
			this.h();
		},
		l(nodes) {
			img = claim_element(nodes, "IMG", { src: true, alt: true });
			this.h();
		},
		h() {
			if (!src_url_equal(img.src, img_src_value = /*payment*/ ctx[8].image.url)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*payment*/ ctx[8].image.alt);
		},
		m(target, anchor) {
			insert_hydration(target, img, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*payments*/ 8 && !src_url_equal(img.src, img_src_value = /*payment*/ ctx[8].image.url)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*payments*/ 8 && img_alt_value !== (img_alt_value = /*payment*/ ctx[8].image.alt)) {
				attr(img, "alt", img_alt_value);
			}
		},
		d(detaching) {
			if (detaching) detach(img);
		}
	};
}

// (442:13) {#each payments as payment}
function create_each_block(ctx) {
	let div;
	let t;
	let if_block = /*payment*/ ctx[8].image.url && create_if_block(ctx);

	return {
		c() {
			div = element("div");
			if (if_block) if_block.c();
			t = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			if (if_block) if_block.l(div_nodes);
			t = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "payment");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			if (if_block) if_block.m(div, null);
			append_hydration(div, t);
		},
		p(ctx, dirty) {
			if (/*payment*/ ctx[8].image.url) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(div, t);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
		}
	};
}

function create_fragment(ctx) {
	let section;
	let style;
	let t0;
	let t1;
	let div15;
	let div0;
	let span0;
	let t2;
	let t3;
	let h2;
	let t4;
	let t5;
	let h30;
	let t6;
	let t7;
	let div13;
	let div2;
	let header0;
	let div1;
	let span1;
	let t8;
	let t9;
	let span2;
	let t10;
	let t11;
	let h31;
	let t12;
	let t13;
	let span3;
	let t14;
	let t15;
	let hr0;
	let t16;
	let ul0;
	let li0;
	let span4;
	let icon0;
	let t17;
	let span5;
	let t18;
	let t19;
	let li1;
	let span6;
	let icon1;
	let t20;
	let span7;
	let t21;
	let t22;
	let li2;
	let span8;
	let icon2;
	let t23;
	let span9;
	let t24;
	let t25;
	let li3;
	let span10;
	let icon3;
	let t26;
	let span11;
	let t27;
	let t28;
	let a0;
	let t29;
	let t30;
	let div6;
	let header1;
	let div5;
	let div3;
	let span12;
	let t31;
	let t32;
	let span13;
	let t33;
	let t34;
	let div4;
	let t35;
	let t36;
	let h32;
	let t37;
	let t38;
	let span14;
	let t39;
	let t40;
	let hr1;
	let t41;
	let ul1;
	let li4;
	let span15;
	let icon4;
	let t42;
	let span16;
	let t43;
	let t44;
	let li5;
	let span17;
	let icon5;
	let t45;
	let span18;
	let t46;
	let t47;
	let li6;
	let span19;
	let icon6;
	let t48;
	let span20;
	let t49;
	let t50;
	let li7;
	let span21;
	let icon7;
	let t51;
	let span22;
	let t52;
	let t53;
	let li8;
	let span23;
	let icon8;
	let t54;
	let span24;
	let t55;
	let t56;
	let li9;
	let span25;
	let icon9;
	let t57;
	let span26;
	let t58;
	let t59;
	let a1;
	let t60;
	let t61;
	let div10;
	let header2;
	let div9;
	let div7;
	let span27;
	let t62;
	let t63;
	let span28;
	let t64;
	let t65;
	let div8;
	let t66;
	let t67;
	let h33;
	let t68;
	let t69;
	let span29;
	let t70;
	let t71;
	let hr2;
	let t72;
	let ul2;
	let li10;
	let span30;
	let icon10;
	let t73;
	let span31;
	let t74;
	let t75;
	let li11;
	let span32;
	let icon11;
	let t76;
	let span33;
	let t77;
	let t78;
	let li12;
	let span34;
	let icon12;
	let t79;
	let span35;
	let t80;
	let t81;
	let li13;
	let span36;
	let icon13;
	let t82;
	let span37;
	let t83;
	let t84;
	let li14;
	let span38;
	let icon14;
	let t85;
	let span39;
	let t86;
	let t87;
	let li15;
	let span40;
	let icon15;
	let t88;
	let span41;
	let t89;
	let t90;
	let span43;
	let icon16;
	let t91;
	let span42;
	let t92;
	let br0;
	let t93;
	let br1;
	let t94;
	let t95;
	let a2;
	let t96;
	let t97;
	let div12;
	let header3;
	let div11;
	let span44;
	let t98;
	let t99;
	let h34;
	let t100;
	let t101;
	let span45;
	let t102;
	let t103;
	let hr3;
	let t104;
	let span46;
	let t105;
	let t106;
	let ul3;
	let li16;
	let span47;
	let icon17;
	let t107;
	let span48;
	let t108;
	let t109;
	let li17;
	let span49;
	let icon18;
	let t110;
	let span50;
	let t111;
	let t112;
	let li18;
	let span51;
	let icon19;
	let t113;
	let span52;
	let t114;
	let t115;
	let li19;
	let span53;
	let icon20;
	let t116;
	let span54;
	let t117;
	let t118;
	let a3;
	let t119;
	let t120;
	let div14;
	let current;

	icon0 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon1 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon2 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon3 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon4 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon5 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon6 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon7 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon8 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon9 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon10 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon11 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon12 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon13 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon14 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon15 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon16 = new Component$1({
			props: { icon: "heroicons:exclamation-circle" }
		});

	icon17 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon18 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon19 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	icon20 = new Component$1({
			props: { icon: "material-symbols:check" }
		});

	let each_value = /*payments*/ ctx[3];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			section = element("section");
			style = element("style");
			t0 = text("@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Roboto&display=swap');");
			t1 = space();
			div15 = element("div");
			div0 = element("div");
			span0 = element("span");
			t2 = text(/*superhead*/ ctx[1]);
			t3 = space();
			h2 = element("h2");
			t4 = text(/*heading*/ ctx[0]);
			t5 = space();
			h30 = element("h3");
			t6 = text(/*subheading*/ ctx[2]);
			t7 = space();
			div13 = element("div");
			div2 = element("div");
			header0 = element("header");
			div1 = element("div");
			span1 = element("span");
			t8 = text("$0");
			t9 = space();
			span2 = element("span");
			t10 = text("/Mes");
			t11 = space();
			h31 = element("h3");
			t12 = text("Gratuito");
			t13 = space();
			span3 = element("span");
			t14 = text("Ideal para quienes desean explorar el funcionamiento de un chatbot sin coste alguno.");
			t15 = space();
			hr0 = element("hr");
			t16 = space();
			ul0 = element("ul");
			li0 = element("li");
			span4 = element("span");
			create_component(icon0.$$.fragment);
			t17 = space();
			span5 = element("span");
			t18 = text("1 chatbot");
			t19 = space();
			li1 = element("li");
			span6 = element("span");
			create_component(icon1.$$.fragment);
			t20 = space();
			span7 = element("span");
			t21 = text("20 mensajes al mes");
			t22 = space();
			li2 = element("li");
			span8 = element("span");
			create_component(icon2.$$.fragment);
			t23 = space();
			span9 = element("span");
			t24 = text("Integración Web y Wordpress");
			t25 = space();
			li3 = element("li");
			span10 = element("span");
			create_component(icon3.$$.fragment);
			t26 = space();
			span11 = element("span");
			t27 = text("Fuentes de información limitadas");
			t28 = space();
			a0 = element("a");
			t29 = text("Empezar gratis");
			t30 = space();
			div6 = element("div");
			header1 = element("header");
			div5 = element("div");
			div3 = element("div");
			span12 = element("span");
			t31 = text("$10.000");
			t32 = space();
			span13 = element("span");
			t33 = text("/Mes");
			t34 = space();
			div4 = element("div");
			t35 = text("IVA incluido");
			t36 = space();
			h32 = element("h3");
			t37 = text("Standard");
			t38 = space();
			span14 = element("span");
			t39 = text("Perfecto para tiendas online que buscan mejorar la experiencia en su sitio web.");
			t40 = space();
			hr1 = element("hr");
			t41 = space();
			ul1 = element("ul");
			li4 = element("li");
			span15 = element("span");
			create_component(icon4.$$.fragment);
			t42 = space();
			span16 = element("span");
			t43 = text("2 chatbots");
			t44 = space();
			li5 = element("li");
			span17 = element("span");
			create_component(icon5.$$.fragment);
			t45 = space();
			span18 = element("span");
			t46 = text("2.000 mensajes al mes");
			t47 = space();
			li6 = element("li");
			span19 = element("span");
			create_component(icon6.$$.fragment);
			t48 = space();
			span20 = element("span");
			t49 = text("Fuentes de información limitadas");
			t50 = space();
			li7 = element("li");
			span21 = element("span");
			create_component(icon7.$$.fragment);
			t51 = space();
			span22 = element("span");
			t52 = text("Integración Web y Wordpress");
			t53 = space();
			li8 = element("li");
			span23 = element("span");
			create_component(icon8.$$.fragment);
			t54 = space();
			span24 = element("span");
			t55 = text("Todas las fuentes de información");
			t56 = space();
			li9 = element("li");
			span25 = element("span");
			create_component(icon9.$$.fragment);
			t57 = space();
			span26 = element("span");
			t58 = text("Historial de conversaciones");
			t59 = space();
			a1 = element("a");
			t60 = text("Suscribirse");
			t61 = space();
			div10 = element("div");
			header2 = element("header");
			div9 = element("div");
			div7 = element("div");
			span27 = element("span");
			t62 = text("$20.000");
			t63 = space();
			span28 = element("span");
			t64 = text("/Mes");
			t65 = space();
			div8 = element("div");
			t66 = text("IVA incluido");
			t67 = space();
			h33 = element("h3");
			t68 = text("Premium");
			t69 = space();
			span29 = element("span");
			t70 = text("Perfecto para tiendas online que buscan mejorar la experiencia en su sitio web.");
			t71 = space();
			hr2 = element("hr");
			t72 = space();
			ul2 = element("ul");
			li10 = element("li");
			span30 = element("span");
			create_component(icon10.$$.fragment);
			t73 = space();
			span31 = element("span");
			t74 = text("5 chatbots");
			t75 = space();
			li11 = element("li");
			span32 = element("span");
			create_component(icon11.$$.fragment);
			t76 = space();
			span33 = element("span");
			t77 = text("10.000 mensajes al mes");
			t78 = space();
			li12 = element("li");
			span34 = element("span");
			create_component(icon12.$$.fragment);
			t79 = space();
			span35 = element("span");
			t80 = text("Integración Web y Wordpress");
			t81 = space();
			li13 = element("li");
			span36 = element("span");
			create_component(icon13.$$.fragment);
			t82 = space();
			span37 = element("span");
			t83 = text("Todas las fuentes de información");
			t84 = space();
			li14 = element("li");
			span38 = element("span");
			create_component(icon14.$$.fragment);
			t85 = space();
			span39 = element("span");
			t86 = text("Historial de conversaciones");
			t87 = space();
			li15 = element("li");
			span40 = element("span");
			create_component(icon15.$$.fragment);
			t88 = space();
			span41 = element("span");
			t89 = text("Integraciones Meta");
			t90 = space();
			span43 = element("span");
			create_component(icon16.$$.fragment);
			t91 = space();
			span42 = element("span");
			t92 = text("Whatsapp");
			br0 = element("br");
			t93 = text("\n      Facebook");
			br1 = element("br");
			t94 = text("\n      Instagram");
			t95 = space();
			a2 = element("a");
			t96 = text("Suscribirse");
			t97 = space();
			div12 = element("div");
			header3 = element("header");
			div11 = element("div");
			span44 = element("span");
			t98 = text("A convenir");
			t99 = space();
			h34 = element("h3");
			t100 = text("Personalizado");
			t101 = space();
			span45 = element("span");
			t102 = text("Pensado para organizaciones que requieran soluciones avanzadas.");
			t103 = space();
			hr3 = element("hr");
			t104 = space();
			span46 = element("span");
			t105 = text("Todo lo del plan empresarial más...");
			t106 = space();
			ul3 = element("ul");
			li16 = element("li");
			span47 = element("span");
			create_component(icon17.$$.fragment);
			t107 = space();
			span48 = element("span");
			t108 = text("Chatbots ilimitados");
			t109 = space();
			li17 = element("li");
			span49 = element("span");
			create_component(icon18.$$.fragment);
			t110 = space();
			span50 = element("span");
			t111 = text("50.000 mensajes al mes");
			t112 = space();
			li18 = element("li");
			span51 = element("span");
			create_component(icon19.$$.fragment);
			t113 = space();
			span52 = element("span");
			t114 = text("Integración con Slack y Discord");
			t115 = space();
			li19 = element("li");
			span53 = element("span");
			create_component(icon20.$$.fragment);
			t116 = space();
			span54 = element("span");
			t117 = text("Integración a opción.");
			t118 = space();
			a3 = element("a");
			t119 = text("Contáctanos");
			t120 = space();
			div14 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			style = claim_element(section_nodes, "STYLE", {});
			var style_nodes = children(style);
			t0 = claim_text(style_nodes, "@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Roboto&display=swap');");
			style_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			div15 = claim_element(section_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div0 = claim_element(div15_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t2 = claim_text(span0_nodes, /*superhead*/ ctx[1]);
			span0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t4 = claim_text(h2_nodes, /*heading*/ ctx[0]);
			h2_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			h30 = claim_element(div0_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t6 = claim_text(h30_nodes, /*subheading*/ ctx[2]);
			h30_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t7 = claim_space(div15_nodes);
			div13 = claim_element(div15_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			div2 = claim_element(div13_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			header0 = claim_element(div2_nodes, "HEADER", { class: true });
			var header0_nodes = children(header0);
			div1 = claim_element(header0_nodes, "DIV", { class: true, style: true });
			var div1_nodes = children(div1);
			span1 = claim_element(div1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t8 = claim_text(span1_nodes, "$0");
			span1_nodes.forEach(detach);
			t9 = claim_space(div1_nodes);
			span2 = claim_element(div1_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t10 = claim_text(span2_nodes, "/Mes");
			span2_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t11 = claim_space(header0_nodes);
			h31 = claim_element(header0_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t12 = claim_text(h31_nodes, "Gratuito");
			h31_nodes.forEach(detach);
			t13 = claim_space(header0_nodes);
			span3 = claim_element(header0_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t14 = claim_text(span3_nodes, "Ideal para quienes desean explorar el funcionamiento de un chatbot sin coste alguno.");
			span3_nodes.forEach(detach);
			header0_nodes.forEach(detach);
			t15 = claim_space(div2_nodes);
			hr0 = claim_element(div2_nodes, "HR", { class: true });
			t16 = claim_space(div2_nodes);
			ul0 = claim_element(div2_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);
			li0 = claim_element(ul0_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			span4 = claim_element(li0_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			claim_component(icon0.$$.fragment, span4_nodes);
			span4_nodes.forEach(detach);
			t17 = claim_space(li0_nodes);
			span5 = claim_element(li0_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			t18 = claim_text(span5_nodes, "1 chatbot");
			span5_nodes.forEach(detach);
			li0_nodes.forEach(detach);
			t19 = claim_space(ul0_nodes);
			li1 = claim_element(ul0_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			span6 = claim_element(li1_nodes, "SPAN", { class: true });
			var span6_nodes = children(span6);
			claim_component(icon1.$$.fragment, span6_nodes);
			span6_nodes.forEach(detach);
			t20 = claim_space(li1_nodes);
			span7 = claim_element(li1_nodes, "SPAN", { class: true });
			var span7_nodes = children(span7);
			t21 = claim_text(span7_nodes, "20 mensajes al mes");
			span7_nodes.forEach(detach);
			li1_nodes.forEach(detach);
			t22 = claim_space(ul0_nodes);
			li2 = claim_element(ul0_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			span8 = claim_element(li2_nodes, "SPAN", { class: true });
			var span8_nodes = children(span8);
			claim_component(icon2.$$.fragment, span8_nodes);
			span8_nodes.forEach(detach);
			t23 = claim_space(li2_nodes);
			span9 = claim_element(li2_nodes, "SPAN", { class: true });
			var span9_nodes = children(span9);
			t24 = claim_text(span9_nodes, "Integración Web y Wordpress");
			span9_nodes.forEach(detach);
			li2_nodes.forEach(detach);
			t25 = claim_space(ul0_nodes);
			li3 = claim_element(ul0_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			span10 = claim_element(li3_nodes, "SPAN", { class: true });
			var span10_nodes = children(span10);
			claim_component(icon3.$$.fragment, span10_nodes);
			span10_nodes.forEach(detach);
			t26 = claim_space(li3_nodes);
			span11 = claim_element(li3_nodes, "SPAN", { class: true });
			var span11_nodes = children(span11);
			t27 = claim_text(span11_nodes, "Fuentes de información limitadas");
			span11_nodes.forEach(detach);
			li3_nodes.forEach(detach);
			ul0_nodes.forEach(detach);
			t28 = claim_space(div2_nodes);
			a0 = claim_element(div2_nodes, "A", { href: true, class: true });
			var a0_nodes = children(a0);
			t29 = claim_text(a0_nodes, "Empezar gratis");
			a0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t30 = claim_space(div13_nodes);
			div6 = claim_element(div13_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			header1 = claim_element(div6_nodes, "HEADER", { class: true });
			var header1_nodes = children(header1);
			div5 = claim_element(header1_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			span12 = claim_element(div3_nodes, "SPAN", { class: true });
			var span12_nodes = children(span12);
			t31 = claim_text(span12_nodes, "$10.000");
			span12_nodes.forEach(detach);
			t32 = claim_space(div3_nodes);
			span13 = claim_element(div3_nodes, "SPAN", { class: true });
			var span13_nodes = children(span13);
			t33 = claim_text(span13_nodes, "/Mes");
			span13_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t34 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			t35 = claim_text(div4_nodes, "IVA incluido");
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t36 = claim_space(header1_nodes);
			h32 = claim_element(header1_nodes, "H3", { class: true });
			var h32_nodes = children(h32);
			t37 = claim_text(h32_nodes, "Standard");
			h32_nodes.forEach(detach);
			t38 = claim_space(header1_nodes);
			span14 = claim_element(header1_nodes, "SPAN", { class: true });
			var span14_nodes = children(span14);
			t39 = claim_text(span14_nodes, "Perfecto para tiendas online que buscan mejorar la experiencia en su sitio web.");
			span14_nodes.forEach(detach);
			header1_nodes.forEach(detach);
			t40 = claim_space(div6_nodes);
			hr1 = claim_element(div6_nodes, "HR", { class: true });
			t41 = claim_space(div6_nodes);
			ul1 = claim_element(div6_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);
			li4 = claim_element(ul1_nodes, "LI", { class: true });
			var li4_nodes = children(li4);
			span15 = claim_element(li4_nodes, "SPAN", { class: true });
			var span15_nodes = children(span15);
			claim_component(icon4.$$.fragment, span15_nodes);
			span15_nodes.forEach(detach);
			t42 = claim_space(li4_nodes);
			span16 = claim_element(li4_nodes, "SPAN", { class: true });
			var span16_nodes = children(span16);
			t43 = claim_text(span16_nodes, "2 chatbots");
			span16_nodes.forEach(detach);
			li4_nodes.forEach(detach);
			t44 = claim_space(ul1_nodes);
			li5 = claim_element(ul1_nodes, "LI", { class: true });
			var li5_nodes = children(li5);
			span17 = claim_element(li5_nodes, "SPAN", { class: true });
			var span17_nodes = children(span17);
			claim_component(icon5.$$.fragment, span17_nodes);
			span17_nodes.forEach(detach);
			t45 = claim_space(li5_nodes);
			span18 = claim_element(li5_nodes, "SPAN", { class: true });
			var span18_nodes = children(span18);
			t46 = claim_text(span18_nodes, "2.000 mensajes al mes");
			span18_nodes.forEach(detach);
			li5_nodes.forEach(detach);
			t47 = claim_space(ul1_nodes);
			li6 = claim_element(ul1_nodes, "LI", { class: true });
			var li6_nodes = children(li6);
			span19 = claim_element(li6_nodes, "SPAN", { class: true });
			var span19_nodes = children(span19);
			claim_component(icon6.$$.fragment, span19_nodes);
			span19_nodes.forEach(detach);
			t48 = claim_space(li6_nodes);
			span20 = claim_element(li6_nodes, "SPAN", { class: true });
			var span20_nodes = children(span20);
			t49 = claim_text(span20_nodes, "Fuentes de información limitadas");
			span20_nodes.forEach(detach);
			li6_nodes.forEach(detach);
			t50 = claim_space(ul1_nodes);
			li7 = claim_element(ul1_nodes, "LI", { class: true });
			var li7_nodes = children(li7);
			span21 = claim_element(li7_nodes, "SPAN", { class: true });
			var span21_nodes = children(span21);
			claim_component(icon7.$$.fragment, span21_nodes);
			span21_nodes.forEach(detach);
			t51 = claim_space(li7_nodes);
			span22 = claim_element(li7_nodes, "SPAN", { class: true });
			var span22_nodes = children(span22);
			t52 = claim_text(span22_nodes, "Integración Web y Wordpress");
			span22_nodes.forEach(detach);
			li7_nodes.forEach(detach);
			t53 = claim_space(ul1_nodes);
			li8 = claim_element(ul1_nodes, "LI", { class: true });
			var li8_nodes = children(li8);
			span23 = claim_element(li8_nodes, "SPAN", { class: true });
			var span23_nodes = children(span23);
			claim_component(icon8.$$.fragment, span23_nodes);
			span23_nodes.forEach(detach);
			t54 = claim_space(li8_nodes);
			span24 = claim_element(li8_nodes, "SPAN", { class: true });
			var span24_nodes = children(span24);
			t55 = claim_text(span24_nodes, "Todas las fuentes de información");
			span24_nodes.forEach(detach);
			li8_nodes.forEach(detach);
			t56 = claim_space(ul1_nodes);
			li9 = claim_element(ul1_nodes, "LI", { class: true });
			var li9_nodes = children(li9);
			span25 = claim_element(li9_nodes, "SPAN", { class: true });
			var span25_nodes = children(span25);
			claim_component(icon9.$$.fragment, span25_nodes);
			span25_nodes.forEach(detach);
			t57 = claim_space(li9_nodes);
			span26 = claim_element(li9_nodes, "SPAN", { class: true });
			var span26_nodes = children(span26);
			t58 = claim_text(span26_nodes, "Historial de conversaciones");
			span26_nodes.forEach(detach);
			li9_nodes.forEach(detach);
			ul1_nodes.forEach(detach);
			t59 = claim_space(div6_nodes);
			a1 = claim_element(div6_nodes, "A", { href: true, class: true });
			var a1_nodes = children(a1);
			t60 = claim_text(a1_nodes, "Suscribirse");
			a1_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t61 = claim_space(div13_nodes);
			div10 = claim_element(div13_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			header2 = claim_element(div10_nodes, "HEADER", { class: true });
			var header2_nodes = children(header2);
			div9 = claim_element(header2_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div7 = claim_element(div9_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			span27 = claim_element(div7_nodes, "SPAN", { class: true });
			var span27_nodes = children(span27);
			t62 = claim_text(span27_nodes, "$20.000");
			span27_nodes.forEach(detach);
			t63 = claim_space(div7_nodes);
			span28 = claim_element(div7_nodes, "SPAN", { class: true });
			var span28_nodes = children(span28);
			t64 = claim_text(span28_nodes, "/Mes");
			span28_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t65 = claim_space(div9_nodes);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			t66 = claim_text(div8_nodes, "IVA incluido");
			div8_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t67 = claim_space(header2_nodes);
			h33 = claim_element(header2_nodes, "H3", { class: true });
			var h33_nodes = children(h33);
			t68 = claim_text(h33_nodes, "Premium");
			h33_nodes.forEach(detach);
			t69 = claim_space(header2_nodes);
			span29 = claim_element(header2_nodes, "SPAN", { class: true });
			var span29_nodes = children(span29);
			t70 = claim_text(span29_nodes, "Perfecto para tiendas online que buscan mejorar la experiencia en su sitio web.");
			span29_nodes.forEach(detach);
			header2_nodes.forEach(detach);
			t71 = claim_space(div10_nodes);
			hr2 = claim_element(div10_nodes, "HR", { class: true });
			t72 = claim_space(div10_nodes);
			ul2 = claim_element(div10_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);
			li10 = claim_element(ul2_nodes, "LI", { class: true });
			var li10_nodes = children(li10);
			span30 = claim_element(li10_nodes, "SPAN", { class: true });
			var span30_nodes = children(span30);
			claim_component(icon10.$$.fragment, span30_nodes);
			span30_nodes.forEach(detach);
			t73 = claim_space(li10_nodes);
			span31 = claim_element(li10_nodes, "SPAN", { class: true });
			var span31_nodes = children(span31);
			t74 = claim_text(span31_nodes, "5 chatbots");
			span31_nodes.forEach(detach);
			li10_nodes.forEach(detach);
			t75 = claim_space(ul2_nodes);
			li11 = claim_element(ul2_nodes, "LI", { class: true });
			var li11_nodes = children(li11);
			span32 = claim_element(li11_nodes, "SPAN", { class: true });
			var span32_nodes = children(span32);
			claim_component(icon11.$$.fragment, span32_nodes);
			span32_nodes.forEach(detach);
			t76 = claim_space(li11_nodes);
			span33 = claim_element(li11_nodes, "SPAN", { class: true });
			var span33_nodes = children(span33);
			t77 = claim_text(span33_nodes, "10.000 mensajes al mes");
			span33_nodes.forEach(detach);
			li11_nodes.forEach(detach);
			t78 = claim_space(ul2_nodes);
			li12 = claim_element(ul2_nodes, "LI", { class: true });
			var li12_nodes = children(li12);
			span34 = claim_element(li12_nodes, "SPAN", { class: true });
			var span34_nodes = children(span34);
			claim_component(icon12.$$.fragment, span34_nodes);
			span34_nodes.forEach(detach);
			t79 = claim_space(li12_nodes);
			span35 = claim_element(li12_nodes, "SPAN", { class: true });
			var span35_nodes = children(span35);
			t80 = claim_text(span35_nodes, "Integración Web y Wordpress");
			span35_nodes.forEach(detach);
			li12_nodes.forEach(detach);
			t81 = claim_space(ul2_nodes);
			li13 = claim_element(ul2_nodes, "LI", { class: true });
			var li13_nodes = children(li13);
			span36 = claim_element(li13_nodes, "SPAN", { class: true });
			var span36_nodes = children(span36);
			claim_component(icon13.$$.fragment, span36_nodes);
			span36_nodes.forEach(detach);
			t82 = claim_space(li13_nodes);
			span37 = claim_element(li13_nodes, "SPAN", { class: true });
			var span37_nodes = children(span37);
			t83 = claim_text(span37_nodes, "Todas las fuentes de información");
			span37_nodes.forEach(detach);
			li13_nodes.forEach(detach);
			t84 = claim_space(ul2_nodes);
			li14 = claim_element(ul2_nodes, "LI", { class: true });
			var li14_nodes = children(li14);
			span38 = claim_element(li14_nodes, "SPAN", { class: true });
			var span38_nodes = children(span38);
			claim_component(icon14.$$.fragment, span38_nodes);
			span38_nodes.forEach(detach);
			t85 = claim_space(li14_nodes);
			span39 = claim_element(li14_nodes, "SPAN", { class: true });
			var span39_nodes = children(span39);
			t86 = claim_text(span39_nodes, "Historial de conversaciones");
			span39_nodes.forEach(detach);
			li14_nodes.forEach(detach);
			t87 = claim_space(ul2_nodes);
			li15 = claim_element(ul2_nodes, "LI", { class: true });
			var li15_nodes = children(li15);
			span40 = claim_element(li15_nodes, "SPAN", { class: true });
			var span40_nodes = children(span40);
			claim_component(icon15.$$.fragment, span40_nodes);
			span40_nodes.forEach(detach);
			t88 = claim_space(li15_nodes);
			span41 = claim_element(li15_nodes, "SPAN", { class: true });
			var span41_nodes = children(span41);
			t89 = claim_text(span41_nodes, "Integraciones Meta");
			span41_nodes.forEach(detach);
			t90 = claim_space(li15_nodes);
			span43 = claim_element(li15_nodes, "SPAN", { class: true });
			var span43_nodes = children(span43);
			claim_component(icon16.$$.fragment, span43_nodes);
			t91 = claim_space(span43_nodes);
			span42 = claim_element(span43_nodes, "SPAN", { class: true });
			var span42_nodes = children(span42);
			t92 = claim_text(span42_nodes, "Whatsapp");
			br0 = claim_element(span42_nodes, "BR", {});
			t93 = claim_text(span42_nodes, "\n      Facebook");
			br1 = claim_element(span42_nodes, "BR", {});
			t94 = claim_text(span42_nodes, "\n      Instagram");
			span42_nodes.forEach(detach);
			span43_nodes.forEach(detach);
			li15_nodes.forEach(detach);
			ul2_nodes.forEach(detach);
			t95 = claim_space(div10_nodes);
			a2 = claim_element(div10_nodes, "A", { href: true, class: true });
			var a2_nodes = children(a2);
			t96 = claim_text(a2_nodes, "Suscribirse");
			a2_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t97 = claim_space(div13_nodes);
			div12 = claim_element(div13_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			header3 = claim_element(div12_nodes, "HEADER", { class: true });
			var header3_nodes = children(header3);
			div11 = claim_element(header3_nodes, "DIV", { class: true, style: true });
			var div11_nodes = children(div11);
			span44 = claim_element(div11_nodes, "SPAN", { class: true });
			var span44_nodes = children(span44);
			t98 = claim_text(span44_nodes, "A convenir");
			span44_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			t99 = claim_space(header3_nodes);
			h34 = claim_element(header3_nodes, "H3", { class: true });
			var h34_nodes = children(h34);
			t100 = claim_text(h34_nodes, "Personalizado");
			h34_nodes.forEach(detach);
			t101 = claim_space(header3_nodes);
			span45 = claim_element(header3_nodes, "SPAN", { class: true });
			var span45_nodes = children(span45);
			t102 = claim_text(span45_nodes, "Pensado para organizaciones que requieran soluciones avanzadas.");
			span45_nodes.forEach(detach);
			header3_nodes.forEach(detach);
			t103 = claim_space(div12_nodes);
			hr3 = claim_element(div12_nodes, "HR", { class: true });
			t104 = claim_space(div12_nodes);
			span46 = claim_element(div12_nodes, "SPAN", { class: true });
			var span46_nodes = children(span46);
			t105 = claim_text(span46_nodes, "Todo lo del plan empresarial más...");
			span46_nodes.forEach(detach);
			t106 = claim_space(div12_nodes);
			ul3 = claim_element(div12_nodes, "UL", { class: true });
			var ul3_nodes = children(ul3);
			li16 = claim_element(ul3_nodes, "LI", { class: true });
			var li16_nodes = children(li16);
			span47 = claim_element(li16_nodes, "SPAN", { class: true });
			var span47_nodes = children(span47);
			claim_component(icon17.$$.fragment, span47_nodes);
			span47_nodes.forEach(detach);
			t107 = claim_space(li16_nodes);
			span48 = claim_element(li16_nodes, "SPAN", { class: true });
			var span48_nodes = children(span48);
			t108 = claim_text(span48_nodes, "Chatbots ilimitados");
			span48_nodes.forEach(detach);
			li16_nodes.forEach(detach);
			t109 = claim_space(ul3_nodes);
			li17 = claim_element(ul3_nodes, "LI", { class: true });
			var li17_nodes = children(li17);
			span49 = claim_element(li17_nodes, "SPAN", { class: true });
			var span49_nodes = children(span49);
			claim_component(icon18.$$.fragment, span49_nodes);
			span49_nodes.forEach(detach);
			t110 = claim_space(li17_nodes);
			span50 = claim_element(li17_nodes, "SPAN", { class: true });
			var span50_nodes = children(span50);
			t111 = claim_text(span50_nodes, "50.000 mensajes al mes");
			span50_nodes.forEach(detach);
			li17_nodes.forEach(detach);
			t112 = claim_space(ul3_nodes);
			li18 = claim_element(ul3_nodes, "LI", { class: true });
			var li18_nodes = children(li18);
			span51 = claim_element(li18_nodes, "SPAN", { class: true });
			var span51_nodes = children(span51);
			claim_component(icon19.$$.fragment, span51_nodes);
			span51_nodes.forEach(detach);
			t113 = claim_space(li18_nodes);
			span52 = claim_element(li18_nodes, "SPAN", { class: true });
			var span52_nodes = children(span52);
			t114 = claim_text(span52_nodes, "Integración con Slack y Discord");
			span52_nodes.forEach(detach);
			li18_nodes.forEach(detach);
			t115 = claim_space(ul3_nodes);
			li19 = claim_element(ul3_nodes, "LI", { class: true });
			var li19_nodes = children(li19);
			span53 = claim_element(li19_nodes, "SPAN", { class: true });
			var span53_nodes = children(span53);
			claim_component(icon20.$$.fragment, span53_nodes);
			span53_nodes.forEach(detach);
			t116 = claim_space(li19_nodes);
			span54 = claim_element(li19_nodes, "SPAN", { class: true });
			var span54_nodes = children(span54);
			t117 = claim_text(span54_nodes, "Integración a opción.");
			span54_nodes.forEach(detach);
			li19_nodes.forEach(detach);
			ul3_nodes.forEach(detach);
			t118 = claim_space(div12_nodes);
			a3 = claim_element(div12_nodes, "A", { href: true, class: true });
			var a3_nodes = children(a3);
			t119 = claim_text(a3_nodes, "Contáctanos");
			a3_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t120 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div14_nodes);
			}

			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "superhead svelte-l7tsid");
			attr(h2, "class", "heading svelte-l7tsid");
			attr(h30, "class", "subheading svelte-l7tsid");
			attr(div0, "class", "heading-group svelte-l7tsid");
			attr(span1, "class", "numerator svelte-l7tsid");
			attr(span2, "class", "denominator svelte-l7tsid");
			attr(div1, "class", "price svelte-l7tsid");
			set_style(div1, "margin-bottom", "1rem");
			attr(h31, "class", "title svelte-l7tsid");
			attr(span3, "class", "description svelte-l7tsid");
			attr(header0, "class", "svelte-l7tsid");
			attr(hr0, "class", "svelte-l7tsid");
			attr(span4, "class", "icon svelte-l7tsid");
			attr(span5, "class", "item svelte-l7tsid");
			attr(li0, "class", "svelte-l7tsid");
			attr(span6, "class", "icon svelte-l7tsid");
			attr(span7, "class", "item svelte-l7tsid");
			attr(li1, "class", "svelte-l7tsid");
			attr(span8, "class", "icon svelte-l7tsid");
			attr(span9, "class", "item svelte-l7tsid");
			attr(li2, "class", "svelte-l7tsid");
			attr(span10, "class", "icon svelte-l7tsid");
			attr(span11, "class", "item svelte-l7tsid");
			attr(li3, "class", "svelte-l7tsid");
			attr(ul0, "class", "features svelte-l7tsid");
			attr(a0, "href", "https://backoffice.globot.ai/dashboard/login");
			attr(a0, "class", "button svelte-l7tsid");
			attr(div2, "class", "tier tier1 svelte-l7tsid");
			attr(span12, "class", "numerator svelte-l7tsid");
			attr(span13, "class", "denominator svelte-l7tsid");
			attr(div3, "class", "price svelte-l7tsid");
			attr(div4, "class", "iva");
			attr(div5, "class", "plan svelte-l7tsid");
			attr(h32, "class", "title svelte-l7tsid");
			attr(span14, "class", "description svelte-l7tsid");
			attr(header1, "class", "svelte-l7tsid");
			attr(hr1, "class", "svelte-l7tsid");
			attr(span15, "class", "icon svelte-l7tsid");
			attr(span16, "class", "item svelte-l7tsid");
			attr(li4, "class", "svelte-l7tsid");
			attr(span17, "class", "icon svelte-l7tsid");
			attr(span18, "class", "item svelte-l7tsid");
			attr(li5, "class", "svelte-l7tsid");
			attr(span19, "class", "icon svelte-l7tsid");
			attr(span20, "class", "item svelte-l7tsid");
			attr(li6, "class", "svelte-l7tsid");
			attr(span21, "class", "icon svelte-l7tsid");
			attr(span22, "class", "item svelte-l7tsid");
			attr(li7, "class", "svelte-l7tsid");
			attr(span23, "class", "icon svelte-l7tsid");
			attr(span24, "class", "item svelte-l7tsid");
			attr(li8, "class", "svelte-l7tsid");
			attr(span25, "class", "icon svelte-l7tsid");
			attr(span26, "class", "item svelte-l7tsid");
			attr(li9, "class", "svelte-l7tsid");
			attr(ul1, "class", "features svelte-l7tsid");
			attr(a1, "href", `https://backoffice-dev.globot.ai/subscription/login?subscriptionPlan=${/*BASE*/ ctx[4]}`);
			attr(a1, "class", "button svelte-l7tsid");
			attr(div6, "class", "tier tier2 svelte-l7tsid");
			attr(span27, "class", "numerator svelte-l7tsid");
			attr(span28, "class", "denominator svelte-l7tsid");
			attr(div7, "class", "price svelte-l7tsid");
			attr(div8, "class", "iva");
			attr(div9, "class", "plan svelte-l7tsid");
			attr(h33, "class", "title svelte-l7tsid");
			attr(span29, "class", "description svelte-l7tsid");
			attr(header2, "class", "svelte-l7tsid");
			attr(hr2, "class", "svelte-l7tsid");
			attr(span30, "class", "icon svelte-l7tsid");
			attr(span31, "class", "item svelte-l7tsid");
			attr(li10, "class", "svelte-l7tsid");
			attr(span32, "class", "icon svelte-l7tsid");
			attr(span33, "class", "item svelte-l7tsid");
			attr(li11, "class", "svelte-l7tsid");
			attr(span34, "class", "icon svelte-l7tsid");
			attr(span35, "class", "item svelte-l7tsid");
			attr(li12, "class", "svelte-l7tsid");
			attr(span36, "class", "icon svelte-l7tsid");
			attr(span37, "class", "item svelte-l7tsid");
			attr(li13, "class", "svelte-l7tsid");
			attr(span38, "class", "icon svelte-l7tsid");
			attr(span39, "class", "item svelte-l7tsid");
			attr(li14, "class", "svelte-l7tsid");
			attr(span40, "class", "icon svelte-l7tsid");
			attr(span41, "class", "item svelte-l7tsid");
			attr(span42, "class", "tooltiptext svelte-l7tsid");
			attr(span43, "class", "tooltip svelte-l7tsid");
			attr(li15, "class", "svelte-l7tsid");
			attr(ul2, "class", "features svelte-l7tsid");
			attr(a2, "href", `https://backoffice-dev.globot.ai/subscription/login?subscriptionPlan=${/*PREMIUM*/ ctx[5]}`);
			attr(a2, "class", "button svelte-l7tsid");
			attr(div10, "class", "tier tier3 svelte-l7tsid");
			attr(span44, "class", "numerator svelte-l7tsid");
			attr(div11, "class", "price svelte-l7tsid");
			set_style(div11, "margin-bottom", "1rem");
			attr(h34, "class", "title svelte-l7tsid");
			attr(span45, "class", "description svelte-l7tsid");
			attr(header3, "class", "svelte-l7tsid");
			attr(hr3, "class", "svelte-l7tsid");
			attr(span46, "class", "text svelte-l7tsid");
			attr(span47, "class", "icon svelte-l7tsid");
			attr(span48, "class", "item svelte-l7tsid");
			attr(li16, "class", "svelte-l7tsid");
			attr(span49, "class", "icon svelte-l7tsid");
			attr(span50, "class", "item svelte-l7tsid");
			attr(li17, "class", "svelte-l7tsid");
			attr(span51, "class", "icon svelte-l7tsid");
			attr(span52, "class", "item svelte-l7tsid");
			attr(li18, "class", "svelte-l7tsid");
			attr(span53, "class", "icon svelte-l7tsid");
			attr(span54, "class", "item svelte-l7tsid");
			attr(li19, "class", "svelte-l7tsid");
			attr(ul3, "class", "features svelte-l7tsid");
			attr(a3, "href", "https://globot.ai/#contacto");
			attr(a3, "class", "button svelte-l7tsid");
			attr(div12, "class", "tier tier4 svelte-l7tsid");
			attr(div13, "class", "tiers svelte-l7tsid");
			attr(div14, "class", "payments svelte-l7tsid");
			attr(div15, "class", "section-container svelte-l7tsid");
			attr(section, "class", "svelte-l7tsid");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, style);
			append_hydration(style, t0);
			append_hydration(section, t1);
			append_hydration(section, div15);
			append_hydration(div15, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, h2);
			append_hydration(h2, t4);
			append_hydration(div0, t5);
			append_hydration(div0, h30);
			append_hydration(h30, t6);
			append_hydration(div15, t7);
			append_hydration(div15, div13);
			append_hydration(div13, div2);
			append_hydration(div2, header0);
			append_hydration(header0, div1);
			append_hydration(div1, span1);
			append_hydration(span1, t8);
			append_hydration(div1, t9);
			append_hydration(div1, span2);
			append_hydration(span2, t10);
			append_hydration(header0, t11);
			append_hydration(header0, h31);
			append_hydration(h31, t12);
			append_hydration(header0, t13);
			append_hydration(header0, span3);
			append_hydration(span3, t14);
			append_hydration(div2, t15);
			append_hydration(div2, hr0);
			append_hydration(div2, t16);
			append_hydration(div2, ul0);
			append_hydration(ul0, li0);
			append_hydration(li0, span4);
			mount_component(icon0, span4, null);
			append_hydration(li0, t17);
			append_hydration(li0, span5);
			append_hydration(span5, t18);
			append_hydration(ul0, t19);
			append_hydration(ul0, li1);
			append_hydration(li1, span6);
			mount_component(icon1, span6, null);
			append_hydration(li1, t20);
			append_hydration(li1, span7);
			append_hydration(span7, t21);
			append_hydration(ul0, t22);
			append_hydration(ul0, li2);
			append_hydration(li2, span8);
			mount_component(icon2, span8, null);
			append_hydration(li2, t23);
			append_hydration(li2, span9);
			append_hydration(span9, t24);
			append_hydration(ul0, t25);
			append_hydration(ul0, li3);
			append_hydration(li3, span10);
			mount_component(icon3, span10, null);
			append_hydration(li3, t26);
			append_hydration(li3, span11);
			append_hydration(span11, t27);
			append_hydration(div2, t28);
			append_hydration(div2, a0);
			append_hydration(a0, t29);
			append_hydration(div13, t30);
			append_hydration(div13, div6);
			append_hydration(div6, header1);
			append_hydration(header1, div5);
			append_hydration(div5, div3);
			append_hydration(div3, span12);
			append_hydration(span12, t31);
			append_hydration(div3, t32);
			append_hydration(div3, span13);
			append_hydration(span13, t33);
			append_hydration(div5, t34);
			append_hydration(div5, div4);
			append_hydration(div4, t35);
			append_hydration(header1, t36);
			append_hydration(header1, h32);
			append_hydration(h32, t37);
			append_hydration(header1, t38);
			append_hydration(header1, span14);
			append_hydration(span14, t39);
			append_hydration(div6, t40);
			append_hydration(div6, hr1);
			append_hydration(div6, t41);
			append_hydration(div6, ul1);
			append_hydration(ul1, li4);
			append_hydration(li4, span15);
			mount_component(icon4, span15, null);
			append_hydration(li4, t42);
			append_hydration(li4, span16);
			append_hydration(span16, t43);
			append_hydration(ul1, t44);
			append_hydration(ul1, li5);
			append_hydration(li5, span17);
			mount_component(icon5, span17, null);
			append_hydration(li5, t45);
			append_hydration(li5, span18);
			append_hydration(span18, t46);
			append_hydration(ul1, t47);
			append_hydration(ul1, li6);
			append_hydration(li6, span19);
			mount_component(icon6, span19, null);
			append_hydration(li6, t48);
			append_hydration(li6, span20);
			append_hydration(span20, t49);
			append_hydration(ul1, t50);
			append_hydration(ul1, li7);
			append_hydration(li7, span21);
			mount_component(icon7, span21, null);
			append_hydration(li7, t51);
			append_hydration(li7, span22);
			append_hydration(span22, t52);
			append_hydration(ul1, t53);
			append_hydration(ul1, li8);
			append_hydration(li8, span23);
			mount_component(icon8, span23, null);
			append_hydration(li8, t54);
			append_hydration(li8, span24);
			append_hydration(span24, t55);
			append_hydration(ul1, t56);
			append_hydration(ul1, li9);
			append_hydration(li9, span25);
			mount_component(icon9, span25, null);
			append_hydration(li9, t57);
			append_hydration(li9, span26);
			append_hydration(span26, t58);
			append_hydration(div6, t59);
			append_hydration(div6, a1);
			append_hydration(a1, t60);
			append_hydration(div13, t61);
			append_hydration(div13, div10);
			append_hydration(div10, header2);
			append_hydration(header2, div9);
			append_hydration(div9, div7);
			append_hydration(div7, span27);
			append_hydration(span27, t62);
			append_hydration(div7, t63);
			append_hydration(div7, span28);
			append_hydration(span28, t64);
			append_hydration(div9, t65);
			append_hydration(div9, div8);
			append_hydration(div8, t66);
			append_hydration(header2, t67);
			append_hydration(header2, h33);
			append_hydration(h33, t68);
			append_hydration(header2, t69);
			append_hydration(header2, span29);
			append_hydration(span29, t70);
			append_hydration(div10, t71);
			append_hydration(div10, hr2);
			append_hydration(div10, t72);
			append_hydration(div10, ul2);
			append_hydration(ul2, li10);
			append_hydration(li10, span30);
			mount_component(icon10, span30, null);
			append_hydration(li10, t73);
			append_hydration(li10, span31);
			append_hydration(span31, t74);
			append_hydration(ul2, t75);
			append_hydration(ul2, li11);
			append_hydration(li11, span32);
			mount_component(icon11, span32, null);
			append_hydration(li11, t76);
			append_hydration(li11, span33);
			append_hydration(span33, t77);
			append_hydration(ul2, t78);
			append_hydration(ul2, li12);
			append_hydration(li12, span34);
			mount_component(icon12, span34, null);
			append_hydration(li12, t79);
			append_hydration(li12, span35);
			append_hydration(span35, t80);
			append_hydration(ul2, t81);
			append_hydration(ul2, li13);
			append_hydration(li13, span36);
			mount_component(icon13, span36, null);
			append_hydration(li13, t82);
			append_hydration(li13, span37);
			append_hydration(span37, t83);
			append_hydration(ul2, t84);
			append_hydration(ul2, li14);
			append_hydration(li14, span38);
			mount_component(icon14, span38, null);
			append_hydration(li14, t85);
			append_hydration(li14, span39);
			append_hydration(span39, t86);
			append_hydration(ul2, t87);
			append_hydration(ul2, li15);
			append_hydration(li15, span40);
			mount_component(icon15, span40, null);
			append_hydration(li15, t88);
			append_hydration(li15, span41);
			append_hydration(span41, t89);
			append_hydration(li15, t90);
			append_hydration(li15, span43);
			mount_component(icon16, span43, null);
			append_hydration(span43, t91);
			append_hydration(span43, span42);
			append_hydration(span42, t92);
			append_hydration(span42, br0);
			append_hydration(span42, t93);
			append_hydration(span42, br1);
			append_hydration(span42, t94);
			append_hydration(div10, t95);
			append_hydration(div10, a2);
			append_hydration(a2, t96);
			append_hydration(div13, t97);
			append_hydration(div13, div12);
			append_hydration(div12, header3);
			append_hydration(header3, div11);
			append_hydration(div11, span44);
			append_hydration(span44, t98);
			append_hydration(header3, t99);
			append_hydration(header3, h34);
			append_hydration(h34, t100);
			append_hydration(header3, t101);
			append_hydration(header3, span45);
			append_hydration(span45, t102);
			append_hydration(div12, t103);
			append_hydration(div12, hr3);
			append_hydration(div12, t104);
			append_hydration(div12, span46);
			append_hydration(span46, t105);
			append_hydration(div12, t106);
			append_hydration(div12, ul3);
			append_hydration(ul3, li16);
			append_hydration(li16, span47);
			mount_component(icon17, span47, null);
			append_hydration(li16, t107);
			append_hydration(li16, span48);
			append_hydration(span48, t108);
			append_hydration(ul3, t109);
			append_hydration(ul3, li17);
			append_hydration(li17, span49);
			mount_component(icon18, span49, null);
			append_hydration(li17, t110);
			append_hydration(li17, span50);
			append_hydration(span50, t111);
			append_hydration(ul3, t112);
			append_hydration(ul3, li18);
			append_hydration(li18, span51);
			mount_component(icon19, span51, null);
			append_hydration(li18, t113);
			append_hydration(li18, span52);
			append_hydration(span52, t114);
			append_hydration(ul3, t115);
			append_hydration(ul3, li19);
			append_hydration(li19, span53);
			mount_component(icon20, span53, null);
			append_hydration(li19, t116);
			append_hydration(li19, span54);
			append_hydration(span54, t117);
			append_hydration(div12, t118);
			append_hydration(div12, a3);
			append_hydration(a3, t119);
			append_hydration(div15, t120);
			append_hydration(div15, div14);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div14, null);
				}
			}

			current = true;
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*superhead*/ 2) set_data(t2, /*superhead*/ ctx[1]);
			if (!current || dirty & /*heading*/ 1) set_data(t4, /*heading*/ ctx[0]);
			if (!current || dirty & /*subheading*/ 4) set_data(t6, /*subheading*/ ctx[2]);

			if (dirty & /*payments*/ 8) {
				each_value = /*payments*/ ctx[3];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div14, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		i(local) {
			if (current) return;
			transition_in(icon0.$$.fragment, local);
			transition_in(icon1.$$.fragment, local);
			transition_in(icon2.$$.fragment, local);
			transition_in(icon3.$$.fragment, local);
			transition_in(icon4.$$.fragment, local);
			transition_in(icon5.$$.fragment, local);
			transition_in(icon6.$$.fragment, local);
			transition_in(icon7.$$.fragment, local);
			transition_in(icon8.$$.fragment, local);
			transition_in(icon9.$$.fragment, local);
			transition_in(icon10.$$.fragment, local);
			transition_in(icon11.$$.fragment, local);
			transition_in(icon12.$$.fragment, local);
			transition_in(icon13.$$.fragment, local);
			transition_in(icon14.$$.fragment, local);
			transition_in(icon15.$$.fragment, local);
			transition_in(icon16.$$.fragment, local);
			transition_in(icon17.$$.fragment, local);
			transition_in(icon18.$$.fragment, local);
			transition_in(icon19.$$.fragment, local);
			transition_in(icon20.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon0.$$.fragment, local);
			transition_out(icon1.$$.fragment, local);
			transition_out(icon2.$$.fragment, local);
			transition_out(icon3.$$.fragment, local);
			transition_out(icon4.$$.fragment, local);
			transition_out(icon5.$$.fragment, local);
			transition_out(icon6.$$.fragment, local);
			transition_out(icon7.$$.fragment, local);
			transition_out(icon8.$$.fragment, local);
			transition_out(icon9.$$.fragment, local);
			transition_out(icon10.$$.fragment, local);
			transition_out(icon11.$$.fragment, local);
			transition_out(icon12.$$.fragment, local);
			transition_out(icon13.$$.fragment, local);
			transition_out(icon14.$$.fragment, local);
			transition_out(icon15.$$.fragment, local);
			transition_out(icon16.$$.fragment, local);
			transition_out(icon17.$$.fragment, local);
			transition_out(icon18.$$.fragment, local);
			transition_out(icon19.$$.fragment, local);
			transition_out(icon20.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(section);
			destroy_component(icon0);
			destroy_component(icon1);
			destroy_component(icon2);
			destroy_component(icon3);
			destroy_component(icon4);
			destroy_component(icon5);
			destroy_component(icon6);
			destroy_component(icon7);
			destroy_component(icon8);
			destroy_component(icon9);
			destroy_component(icon10);
			destroy_component(icon11);
			destroy_component(icon12);
			destroy_component(icon13);
			destroy_component(icon14);
			destroy_component(icon15);
			destroy_component(icon16);
			destroy_component(icon17);
			destroy_component(icon18);
			destroy_component(icon19);
			destroy_component(icon20);
			destroy_each(each_blocks, detaching);
		}
	};
}

function toBase64(str) {
	return btoa(str);
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { tiers } = $$props;
	let { heading } = $$props;
	let { superhead } = $$props;
	let { subheading } = $$props;
	let { payments } = $$props;
	let BASE = toBase64('BASE');
	let PREMIUM = toBase64('PREMIUM');

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(6, props = $$props.props);
		if ('tiers' in $$props) $$invalidate(7, tiers = $$props.tiers);
		if ('heading' in $$props) $$invalidate(0, heading = $$props.heading);
		if ('superhead' in $$props) $$invalidate(1, superhead = $$props.superhead);
		if ('subheading' in $$props) $$invalidate(2, subheading = $$props.subheading);
		if ('payments' in $$props) $$invalidate(3, payments = $$props.payments);
	};

	return [heading, superhead, subheading, payments, BASE, PREMIUM, props, tiers];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 6,
			tiers: 7,
			heading: 0,
			superhead: 1,
			subheading: 2,
			payments: 3
		});
	}
}

export { Component as default };
