// Opciones - Updated February 5, 2025
function noop() { }
const identity = x => x;
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

const is_client = typeof window !== 'undefined';
let now = is_client
    ? () => window.performance.now()
    : () => Date.now();
let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

const tasks = new Set();
function run_tasks(now) {
    tasks.forEach(task => {
        if (!task.c(now)) {
            tasks.delete(task);
            task.f();
        }
    });
    if (tasks.size !== 0)
        raf(run_tasks);
}
/**
 * Creates a new task that runs on each raf frame
 * until it returns a falsy value or is aborted
 */
function loop(callback) {
    let task;
    if (tasks.size === 0)
        raf(run_tasks);
    return {
        promise: new Promise(fulfill => {
            tasks.add(task = { c: callback, f: fulfill });
        }),
        abort() {
            tasks.delete(task);
        }
    };
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
function append(target, node) {
    target.appendChild(node);
}
function get_root_for_style(node) {
    if (!node)
        return document;
    const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root && root.host) {
        return root;
    }
    return node.ownerDocument;
}
function append_empty_stylesheet(node) {
    const style_element = element('style');
    append_stylesheet(get_root_for_style(node), style_element);
    return style_element.sheet;
}
function append_stylesheet(node, style) {
    append(node.head || node, style);
    return style.sheet;
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
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
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
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

// we need to store the information for multiple documents because a Svelte application could also contain iframes
// https://github.com/sveltejs/svelte/issues/3624
const managed_styles = new Map();
let active = 0;
// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
    let hash = 5381;
    let i = str.length;
    while (i--)
        hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
    return hash >>> 0;
}
function create_style_information(doc, node) {
    const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
    managed_styles.set(doc, info);
    return info;
}
function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
    const step = 16.666 / duration;
    let keyframes = '{\n';
    for (let p = 0; p <= 1; p += step) {
        const t = a + (b - a) * ease(p);
        keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
    }
    const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
    const name = `__svelte_${hash(rule)}_${uid}`;
    const doc = get_root_for_style(node);
    const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
    if (!rules[name]) {
        rules[name] = true;
        stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
    }
    const animation = node.style.animation || '';
    node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
    active += 1;
    return name;
}
function delete_rule(node, name) {
    const previous = (node.style.animation || '').split(', ');
    const next = previous.filter(name
        ? anim => anim.indexOf(name) < 0 // remove specific animation
        : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
    );
    const deleted = previous.length - next.length;
    if (deleted) {
        node.style.animation = next.join(', ');
        active -= deleted;
        if (!active)
            clear_rules();
    }
}
function clear_rules() {
    raf(() => {
        if (active)
            return;
        managed_styles.forEach(info => {
            const { ownerNode } = info.stylesheet;
            // there is no ownerNode if it runs on jsdom.
            if (ownerNode)
                detach(ownerNode);
        });
        managed_styles.clear();
    });
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

let promise;
function wait() {
    if (!promise) {
        promise = Promise.resolve();
        promise.then(() => {
            promise = null;
        });
    }
    return promise;
}
function dispatch(node, direction, kind) {
    node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
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
const null_transition = { duration: 0 };
function create_bidirectional_transition(node, fn, params, intro) {
    const options = { direction: 'both' };
    let config = fn(node, params, options);
    let t = intro ? 0 : 1;
    let running_program = null;
    let pending_program = null;
    let animation_name = null;
    function clear_animation() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function init(program, duration) {
        const d = (program.b - t);
        duration *= Math.abs(d);
        return {
            a: t,
            b: program.b,
            d,
            duration,
            start: program.start,
            end: program.start + duration,
            group: program.group
        };
    }
    function go(b) {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        const program = {
            start: now() + delay,
            b
        };
        if (!b) {
            // @ts-ignore todo: improve typings
            program.group = outros;
            outros.r += 1;
        }
        if (running_program || pending_program) {
            pending_program = program;
        }
        else {
            // if this is an intro, and there's a delay, we need to do
            // an initial tick and/or apply CSS animation immediately
            if (css) {
                clear_animation();
                animation_name = create_rule(node, t, b, duration, delay, easing, css);
            }
            if (b)
                tick(0, 1);
            running_program = init(program, duration);
            add_render_callback(() => dispatch(node, b, 'start'));
            loop(now => {
                if (pending_program && now > pending_program.start) {
                    running_program = init(pending_program, duration);
                    pending_program = null;
                    dispatch(node, running_program.b, 'start');
                    if (css) {
                        clear_animation();
                        animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                    }
                }
                if (running_program) {
                    if (now >= running_program.end) {
                        tick(t = running_program.b, 1 - t);
                        dispatch(node, running_program.b, 'end');
                        if (!pending_program) {
                            // we're done
                            if (running_program.b) {
                                // intro — we can tidy up immediately
                                clear_animation();
                            }
                            else {
                                // outro — needs to be coordinated
                                if (!--running_program.group.r)
                                    run_all(running_program.group.c);
                            }
                        }
                        running_program = null;
                    }
                    else if (now >= running_program.start) {
                        const p = now - running_program.start;
                        t = running_program.a + running_program.d * easing(p / running_program.duration);
                        tick(t, 1 - t);
                    }
                }
                return !!(running_program || pending_program);
            });
        }
    }
    return {
        run(b) {
            if (is_function(config)) {
                wait().then(() => {
                    // @ts-ignore
                    config = config(options);
                    go(b);
                });
            }
            else {
                go(b);
            }
        },
        end() {
            clear_animation();
            running_program = pending_program = null;
        }
    };
}
function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
    });
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    const updates = [];
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else if (dynamic) {
            // defer updates until all the DOM shuffling is done
            updates.push(() => block.p(child_ctx, dirty));
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    run_all(updates);
    return new_blocks;
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

function cubicOut(t) {
    const f = t - 1.0;
    return f * f * f + 1.0;
}

function slide(node, { delay = 0, duration = 400, easing = cubicOut, axis = 'y' } = {}) {
    const style = getComputedStyle(node);
    const opacity = +style.opacity;
    const primary_property = axis === 'y' ? 'height' : 'width';
    const primary_property_value = parseFloat(style[primary_property]);
    const secondary_properties = axis === 'y' ? ['top', 'bottom'] : ['left', 'right'];
    const capitalized_secondary_properties = secondary_properties.map((e) => `${e[0].toUpperCase()}${e.slice(1)}`);
    const padding_start_value = parseFloat(style[`padding${capitalized_secondary_properties[0]}`]);
    const padding_end_value = parseFloat(style[`padding${capitalized_secondary_properties[1]}`]);
    const margin_start_value = parseFloat(style[`margin${capitalized_secondary_properties[0]}`]);
    const margin_end_value = parseFloat(style[`margin${capitalized_secondary_properties[1]}`]);
    const border_width_start_value = parseFloat(style[`border${capitalized_secondary_properties[0]}Width`]);
    const border_width_end_value = parseFloat(style[`border${capitalized_secondary_properties[1]}Width`]);
    return {
        delay,
        duration,
        easing,
        css: t => 'overflow: hidden;' +
            `opacity: ${Math.min(t * 20, 1) * opacity};` +
            `${primary_property}: ${t * primary_property_value}px;` +
            `padding-${secondary_properties[0]}: ${t * padding_start_value}px;` +
            `padding-${secondary_properties[1]}: ${t * padding_end_value}px;` +
            `margin-${secondary_properties[0]}: ${t * margin_start_value}px;` +
            `margin-${secondary_properties[1]}: ${t * margin_end_value}px;` +
            `border-${secondary_properties[0]}-width: ${t * border_width_start_value}px;` +
            `border-${secondary_properties[1]}-width: ${t * border_width_end_value}px;`
    };
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
  return !!// Check prefix: cannot be empty, unless allowSimpleName is enabled
  // Check name: cannot be empty
  ((allowSimpleName && icon.prefix === "" || !!icon.prefix) && !!icon.name);
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
  (Object.keys(icons).concat(Object.keys(aliases))).forEach(resolve);
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
    if (
      // Name cannot be empty
      !name || // Must have body
      typeof icon.body !== "string" || // Check other props
      !checkOptionalProps(
        icon,
        defaultExtendedIconProps
      )
    ) {
      return null;
    }
  }
  const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
  for (const name in aliases) {
    const icon = aliases[name];
    const parent = icon.parent;
    if (
      // Name cannot be empty
      !name || // Parent must be set and point to existing icon
      typeof parent !== "string" || !icons[parent] && !aliases[parent] || // Check other props
      !checkOptionalProps(
        icon,
        defaultExtendedIconProps
      )
    ) {
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
  if (data) {
    return addIconToStorage(storage, icon.name, data);
  } else {
    storage.missing.add(icon.name);
    return true;
  }
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
        if (addIcon(name, icon)) {
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
function checkIconNamesForAPI(icons) {
  const valid = [];
  const invalid = [];
  icons.forEach((name) => {
    (name.match(matchIconName) ? valid : invalid).push(name);
  });
  return {
    valid,
    invalid
  };
}
function parseLoaderResponse(storage, icons, data) {
  function checkMissing() {
    const pending = storage.pendingIcons;
    icons.forEach((name) => {
      if (pending) {
        pending.delete(name);
      }
      if (!storage.icons[name]) {
        storage.missing.add(name);
      }
    });
  }
  if (data && typeof data === "object") {
    try {
      const parsed = addIconSet(storage, data);
      if (!parsed.length) {
        checkMissing();
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }
  checkMissing();
  loadedNewIcons(storage);
}
function parsePossiblyAsyncResponse(response, callback) {
  if (response instanceof Promise) {
    response.then((data) => {
      callback(data);
    }).catch(() => {
      callback(null);
    });
  } else {
    callback(response);
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
      if (!icons2 || !icons2.length) {
        return;
      }
      const customIconLoader = storage.loadIcon;
      if (storage.loadIcons && (icons2.length > 1 || !customIconLoader)) {
        parsePossiblyAsyncResponse(
          storage.loadIcons(icons2, prefix, provider),
          (data) => {
            parseLoaderResponse(storage, icons2, data);
          }
        );
        return;
      }
      if (customIconLoader) {
        icons2.forEach((name) => {
          const response = customIconLoader(name, prefix, provider);
          parsePossiblyAsyncResponse(response, (data) => {
            const iconSet = data ? {
              prefix,
              icons: {
                [name]: data
              }
            } : null;
            parseLoaderResponse(storage, [name], iconSet);
          });
        });
        return;
      }
      const { valid, invalid } = checkIconNamesForAPI(icons2);
      if (invalid.length) {
        parseLoaderResponse(storage, invalid, null);
      }
      if (!valid.length) {
        return;
      }
      const api = prefix.match(matchIconName) ? getAPIModule(provider) : null;
      if (!api) {
        parseLoaderResponse(storage, valid, null);
        return;
      }
      const params = api.prepare(provider, prefix, valid);
      params.forEach((item) => {
        sendAPIQuery(provider, item, (data) => {
          parseLoaderResponse(storage, item.icons, data);
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
    const list = newIcons[storage.provider][storage.prefix];
    if (list.length) {
      loadNewIcons(storage, list);
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
            case 'ssr':
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

// (120:1) {:else}
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

// (116:1) {#if data.svg}
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
			const isMounted = !!$$props.ssr || mounted;
			const iconData = checkIconState($$props.icon, state, isMounted, loaded, onLoad);
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
	child_ctx[40] = list[i];
	child_ctx[42] = i;
	return child_ctx;
}

// (267:10) {#if activeItem === i}
function create_if_block(ctx) {
	let div;
	let raw_value = /*item*/ ctx[40].description.html + "";
	let div_transition;
	let current;

	return {
		c() {
			div = element("div");
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "description svelte-1d5nt82");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			div.innerHTML = raw_value;
			current = true;
		},
		p(ctx, dirty) {
			if ((!current || dirty[0] & /*items*/ 2) && raw_value !== (raw_value = /*item*/ ctx[40].description.html + "")) div.innerHTML = raw_value;		},
		i(local) {
			if (current) return;

			add_render_callback(() => {
				if (!current) return;
				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
				div_transition.run(1);
			});

			current = true;
		},
		o(local) {
			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
			div_transition.run(0);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			if (detaching && div_transition) div_transition.end();
		}
	};
}

// (254:6) {#each items as item, i (i)}
function create_each_block(key_1, ctx) {
	let div3;
	let div1;
	let div0;
	let icon0;
	let t0;
	let button;
	let span0;
	let t1_value = /*item*/ ctx[40].title + "";
	let t1;
	let t2;
	let span1;
	let icon1;
	let t3;
	let t4;
	let t5;
	let current;
	let mounted;
	let dispose;
	icon0 = new Component$1({ props: { icon: /*item*/ ctx[40].icon } });
	icon1 = new Component$1({ props: { icon: "ph:caret-down-bold" } });

	function click_handler() {
		return /*click_handler*/ ctx[39](/*i*/ ctx[42]);
	}

	let if_block = /*activeItem*/ ctx[35] === /*i*/ ctx[42] && create_if_block(ctx);

	return {
		key: key_1,
		first: null,
		c() {
			div3 = element("div");
			div1 = element("div");
			div0 = element("div");
			create_component(icon0.$$.fragment);
			t0 = space();
			button = element("button");
			span0 = element("span");
			t1 = text(t1_value);
			t2 = space();
			span1 = element("span");
			create_component(icon1.$$.fragment);
			t3 = space();
			if (if_block) if_block.c();
			t4 = space();
			t5 = space();
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			claim_component(icon0.$$.fragment, div0_nodes);
			div0_nodes.forEach(detach);
			t0 = claim_space(div1_nodes);
			button = claim_element(div1_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span0 = claim_element(button_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t1 = claim_text(span0_nodes, t1_value);
			span0_nodes.forEach(detach);
			t2 = claim_space(button_nodes);
			span1 = claim_element(button_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			claim_component(icon1.$$.fragment, span1_nodes);
			span1_nodes.forEach(detach);
			button_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t3 = claim_space(div3_nodes);
			if (if_block) if_block.l(div3_nodes);
			t4 = claim_space(div3_nodes);
			t5 = claim_space(div3_nodes);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "menu-icon svelte-1d5nt82");
			attr(span0, "class", "title svelte-1d5nt82");
			attr(span1, "class", "icone svelte-1d5nt82");
			attr(button, "class", "svelte-1d5nt82");
			attr(div1, "class", "item-icon svelte-1d5nt82");
			attr(div3, "class", "item svelte-1d5nt82");
			toggle_class(div3, "active", /*activeItem*/ ctx[35] === /*i*/ ctx[42]);
			this.first = div3;
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, div1);
			append_hydration(div1, div0);
			mount_component(icon0, div0, null);
			append_hydration(div1, t0);
			append_hydration(div1, button);
			append_hydration(button, span0);
			append_hydration(span0, t1);
			append_hydration(button, t2);
			append_hydration(button, span1);
			mount_component(icon1, span1, null);
			append_hydration(div3, t3);
			if (if_block) if_block.m(div3, null);
			append_hydration(div3, t4);
			append_hydration(div3, t5);
			current = true;

			if (!mounted) {
				dispose = listen(button, "click", click_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			const icon0_changes = {};
			if (dirty[0] & /*items*/ 2) icon0_changes.icon = /*item*/ ctx[40].icon;
			icon0.$set(icon0_changes);
			if ((!current || dirty[0] & /*items*/ 2) && t1_value !== (t1_value = /*item*/ ctx[40].title + "")) set_data(t1, t1_value);

			if (/*activeItem*/ ctx[35] === /*i*/ ctx[42]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem*/ 16) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div3, t4);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}

			if (!current || dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem*/ 16) {
				toggle_class(div3, "active", /*activeItem*/ ctx[35] === /*i*/ ctx[42]);
			}
		},
		i(local) {
			if (current) return;
			transition_in(icon0.$$.fragment, local);
			transition_in(icon1.$$.fragment, local);
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(icon0.$$.fragment, local);
			transition_out(icon1.$$.fragment, local);
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div3);
			destroy_component(icon0);
			destroy_component(icon1);
			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};
}

function create_fragment(ctx) {
	let section;
	let style;
	let t0;
	let t1;
	let div21;
	let div5;
	let div3;
	let div2;
	let div1;
	let div0;
	let icon0;
	let t2;
	let a0;
	let t3;
	let t4;
	let div4;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let t5;
	let div20;
	let div6;
	let a1;
	let t6;
	let t7;
	let span0;
	let t8;
	let t9;
	let span1;
	let t10;
	let t11;
	let div8;
	let div7;
	let t12;
	let t13;
	let div19;
	let div10;
	let div9;
	let span2;
	let icon1;
	let t14;
	let span3;
	let raw_value = /*information*/ ctx[34].html + "";
	let t15;
	let a2;
	let t16;
	let t17;
	let div11;
	let p0;
	let t18;
	let t19;
	let p1;
	let t20;
	let strong0;
	let t21;
	let t22;
	let a3;
	let t23;
	let t24;
	let t25;
	let div12;
	let p2;
	let t26;
	let t27;
	let p3;
	let t28;
	let a4;
	let t29;
	let t30;
	let strong1;
	let t31;
	let t32;
	let img0;
	let img0_src_value;
	let t33;
	let p4;
	let t34;
	let strong2;
	let t35;
	let t36;
	let t37;
	let img1;
	let img1_src_value;
	let t38;
	let p5;
	let t39;
	let strong3;
	let t40;
	let t41;
	let strong4;
	let t42;
	let t43;
	let t44;
	let img2;
	let img2_src_value;
	let t45;
	let img3;
	let img3_src_value;
	let t46;
	let img4;
	let img4_src_value;
	let t47;
	let div13;
	let p6;
	let t48;
	let t49;
	let p7;
	let t50;
	let strong5;
	let t51;
	let t52;
	let strong6;
	let t53;
	let t54;
	let strong7;
	let t55;
	let t56;
	let t57;
	let img5;
	let img5_src_value;
	let t58;
	let p8;
	let t59;
	let t60;
	let img6;
	let img6_src_value;
	let t61;
	let p9;
	let t62;
	let strong8;
	let t63;
	let t64;
	let strong9;
	let t65;
	let t66;
	let a5;
	let t67;
	let t68;
	let t69;
	let img7;
	let img7_src_value;
	let t70;
	let p10;
	let t71;
	let strong10;
	let t72;
	let t73;
	let t74;
	let img8;
	let img8_src_value;
	let t75;
	let div14;
	let p11;
	let t76;
	let t77;
	let p12;
	let t78;
	let a6;
	let t79;
	let t80;
	let strong11;
	let t81;
	let t82;
	let t83;
	let img9;
	let img9_src_value;
	let t84;
	let p13;
	let t85;
	let strong12;
	let t86;
	let t87;
	let strong13;
	let t88;
	let t89;
	let t90;
	let img10;
	let img10_src_value;
	let t91;
	let p14;
	let t92;
	let strong14;
	let t93;
	let t94;
	let strong15;
	let t95;
	let t96;
	let t97;
	let img11;
	let img11_src_value;
	let t98;
	let p15;
	let t99;
	let strong16;
	let t100;
	let t101;
	let img12;
	let img12_src_value;
	let t102;
	let p16;
	let t103;
	let strong17;
	let t104;
	let t105;
	let strong18;
	let t106;
	let t107;
	let strong19;
	let t108;
	let t109;
	let t110;
	let img13;
	let img13_src_value;
	let t111;
	let p17;
	let t112;
	let strong20;
	let t113;
	let t114;
	let t115;
	let img14;
	let img14_src_value;
	let t116;
	let p18;
	let t117;
	let strong21;
	let t118;
	let t119;
	let strong22;
	let t120;
	let t121;
	let strong23;
	let t122;
	let t123;
	let strong24;
	let t124;
	let t125;
	let strong25;
	let t126;
	let t127;
	let t128;
	let img15;
	let img15_src_value;
	let t129;
	let p19;
	let t130;
	let strong26;
	let t131;
	let t132;
	let t133;
	let img16;
	let img16_src_value;
	let t134;
	let div15;
	let p20;
	let t135;
	let t136;
	let p21;
	let t137;
	let a7;
	let t138;
	let t139;
	let strong27;
	let t140;
	let t141;
	let t142;
	let img17;
	let img17_src_value;
	let t143;
	let p22;
	let t144;
	let strong28;
	let t145;
	let t146;
	let t147;
	let img18;
	let img18_src_value;
	let t148;
	let p23;
	let t149;
	let strong29;
	let t150;
	let t151;
	let t152;
	let img19;
	let img19_src_value;
	let t153;
	let p24;
	let t154;
	let a8;
	let t155;
	let t156;
	let t157;
	let img20;
	let img20_src_value;
	let t158;
	let p25;
	let t159;
	let strong30;
	let t160;
	let t161;
	let t162;
	let img21;
	let img21_src_value;
	let t163;
	let div16;
	let p26;
	let t164;
	let t165;
	let p27;
	let t166;
	let strong31;
	let t167;
	let t168;
	let t169;
	let p28;
	let t170;
	let strong32;
	let t171;
	let t172;
	let strong33;
	let t173;
	let t174;
	let strong34;
	let t175;
	let t176;
	let strong35;
	let t177;
	let t178;
	let strong36;
	let t179;
	let t180;
	let t181;
	let img22;
	let img22_src_value;
	let t182;
	let p29;
	let t183;
	let strong37;
	let t184;
	let t185;
	let a9;
	let t186;
	let t187;
	let strong38;
	let t188;
	let t189;
	let strong39;
	let t190;
	let t191;
	let strong40;
	let t192;
	let t193;
	let t194;
	let img23;
	let img23_src_value;
	let t195;
	let img24;
	let img24_src_value;
	let t196;
	let img25;
	let img25_src_value;
	let t197;
	let p30;
	let t198;
	let strong41;
	let t199;
	let t200;
	let strong42;
	let t201;
	let t202;
	let t203;
	let img26;
	let img26_src_value;
	let t204;
	let img27;
	let img27_src_value;
	let t205;
	let div17;
	let p31;
	let t206;
	let t207;
	let p32;
	let t208;
	let strong43;
	let t209;
	let t210;
	let t211;
	let img28;
	let img28_src_value;
	let t212;
	let p33;
	let t213;
	let strong44;
	let t214;
	let t215;
	let t216;
	let img29;
	let img29_src_value;
	let t217;
	let div18;
	let p34;
	let t218;
	let strong45;
	let t219;
	let t220;
	let t221;
	let p35;
	let t222;
	let strong46;
	let t223;
	let t224;
	let strong47;
	let t225;
	let t226;
	let t227;
	let img30;
	let img30_src_value;
	let current;
	icon0 = new Component$1({ props: { icon: "carbon:home" } });
	let each_value = /*items*/ ctx[1];
	const get_key = ctx => /*i*/ ctx[42];

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	icon1 = new Component$1({
			props: {
				icon: /*icono*/ ctx[0],
				style: "color:#7B5CF5; font-size:21px"
			}
		});

	return {
		c() {
			section = element("section");
			style = element("style");
			t0 = text("@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Roboto&display=swap');");
			t1 = space();
			div21 = element("div");
			div5 = element("div");
			div3 = element("div");
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");
			create_component(icon0.$$.fragment);
			t2 = space();
			a0 = element("a");
			t3 = text("Tutoriales");
			t4 = space();
			div4 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t5 = space();
			div20 = element("div");
			div6 = element("div");
			a1 = element("a");
			t6 = text("Tutoriales");
			t7 = text(" > ");
			span0 = element("span");
			t8 = text("Integración Meta");
			t9 = text(" > ");
			span1 = element("span");
			t10 = text("Whatsapp");
			t11 = space();
			div8 = element("div");
			div7 = element("div");
			t12 = text(/*heading*/ ctx[11]);
			t13 = space();
			div19 = element("div");
			div10 = element("div");
			div9 = element("div");
			span2 = element("span");
			create_component(icon1.$$.fragment);
			t14 = space();
			span3 = element("span");
			t15 = space();
			a2 = element("a");
			t16 = text("Saber más");
			t17 = space();
			div11 = element("div");
			p0 = element("p");
			t18 = text("Primero, crea tu chatbot en Globot cargándole la información que necesitará para responder.");
			t19 = space();
			p1 = element("p");
			t20 = text("💡 ");
			strong0 = element("strong");
			t21 = text("Importante");
			t22 = text(": Es necesario contar con un portafolio empresarial en ");
			a3 = element("a");
			t23 = text("Meta Business");
			t24 = text(". Si aún no lo has creado, hazlo ahora. Deberás ingresar la información de tu negocio, verificar tu correo electrónico y, si es necesario, completar la verificación con autenticación en dos pasos o subir un documento de identificación.");
			t25 = space();
			div12 = element("div");
			p2 = element("p");
			t26 = text("Paso 1: Crea una nueva aplicación en Meta (Facebook)");
			t27 = space();
			p3 = element("p");
			t28 = text("Ingresa a ");
			a4 = element("a");
			t29 = text("Meta Developers ");
			t30 = text("con tu cuenta de Facebook. Luego, dirígete a ");
			strong1 = element("strong");
			t31 = text("Mis aplicaciones.");
			t32 = space();
			img0 = element("img");
			t33 = space();
			p4 = element("p");
			t34 = text("Haz click en ");
			strong2 = element("strong");
			t35 = text("Crear aplicación");
			t36 = text(".");
			t37 = space();
			img1 = element("img");
			t38 = space();
			p5 = element("p");
			t39 = text("Ingresa el nombre y correo electrónico de la aplicación. En casos de uso selecciona ");
			strong3 = element("strong");
			t40 = text("Otro");
			t41 = text(" y en tipo de app selecciona ");
			strong4 = element("strong");
			t42 = text("Business");
			t43 = text(". Dale click a crear aplicación finalmente.");
			t44 = space();
			img2 = element("img");
			t45 = space();
			img3 = element("img");
			t46 = space();
			img4 = element("img");
			t47 = space();
			div13 = element("div");
			p6 = element("p");
			t48 = text("Paso 2: Configura la aplicación para la integración de Whatsapp");
			t49 = space();
			p7 = element("p");
			t50 = text("Una vez creada la aplicación, en el menú lateral izquierdo, selecciona ");
			strong5 = element("strong");
			t51 = text("Panel");
			t52 = text(".  Anda a ");
			strong6 = element("strong");
			t53 = text("Agrega productos a tu app > Whatsapp");
			t54 = text(" y haz click en ");
			strong7 = element("strong");
			t55 = text("Configurar");
			t56 = text(".");
			t57 = space();
			img5 = element("img");
			t58 = space();
			p8 = element("p");
			t59 = text("Selecciona tu portfolio empresarial asociado.");
			t60 = space();
			img6 = element("img");
			t61 = space();
			p9 = element("p");
			t62 = text("En el menú lateral izquierdo, selecciona ");
			strong8 = element("strong");
			t63 = text("Configuración de la app,  Básica");
			t64 = text(" y agrega en ");
			strong9 = element("strong");
			t65 = text("URL de la política de privacidad");
			t66 = text(" el siguiente link: ");
			a5 = element("a");
			t67 = text("https://globot.ai/politicasprivacidad/");
			t68 = text(". Dale clic en Guardar cambios.");
			t69 = space();
			img7 = element("img");
			t70 = space();
			p10 = element("p");
			t71 = text("Activa tu Modo de la app a ");
			strong10 = element("strong");
			t72 = text("Activo");
			t73 = text(".");
			t74 = space();
			img8 = element("img");
			t75 = space();
			div14 = element("div");
			p11 = element("p");
			t76 = text("Paso 3: Genera el token para Whatsapp");
			t77 = space();
			p12 = element("p");
			t78 = text("Ingresa a tu portfolio empresal en ");
			a6 = element("a");
			t79 = text("Meta Business");
			t80 = text(". En el menú lateral izquierdo de tu portfolio empresarial, selecciona ");
			strong11 = element("strong");
			t81 = text("Configuración");
			t82 = text(".");
			t83 = space();
			img9 = element("img");
			t84 = space();
			p13 = element("p");
			t85 = text("En el menú desplegable, anda a ");
			strong12 = element("strong");
			t86 = text("Usuarios > Usuarios del sistema");
			t87 = text(" y luego dale click a ");
			strong13 = element("strong");
			t88 = text("Agregar");
			t89 = text(".");
			t90 = space();
			img10 = element("img");
			t91 = space();
			p14 = element("p");
			t92 = text("Agrega un usuario con el rol de ");
			strong14 = element("strong");
			t93 = text("Administrador");
			t94 = text(" y dale click a ");
			strong15 = element("strong");
			t95 = text("Crear usuario del sistema");
			t96 = text(".");
			t97 = space();
			img11 = element("img");
			t98 = space();
			p15 = element("p");
			t99 = text("Una vez creado el usuario, haz click en ");
			strong16 = element("strong");
			t100 = text("Asignar activos.");
			t101 = space();
			img12 = element("img");
			t102 = space();
			p16 = element("p");
			t103 = text("En ");
			strong17 = element("strong");
			t104 = text("Apps");
			t105 = text(", selecciona tu aplicación y haz click en ");
			strong18 = element("strong");
			t106 = text("Control total");
			t107 = text(" seguido de ");
			strong19 = element("strong");
			t108 = text("Guardar cambios");
			t109 = text(".");
			t110 = space();
			img13 = element("img");
			t111 = space();
			p17 = element("p");
			t112 = text("En el mismo administrador, selecciona ");
			strong20 = element("strong");
			t113 = text("Generar nuevo token");
			t114 = text(".");
			t115 = space();
			img14 = element("img");
			t116 = space();
			p18 = element("p");
			t117 = text("En el recuadro de generar token, en ");
			strong21 = element("strong");
			t118 = text("Caducidad del token");
			t119 = text(" selecciona ");
			strong22 = element("strong");
			t120 = text("Nunca");
			t121 = text(" y en ");
			strong23 = element("strong");
			t122 = text("Permisos");
			t123 = text(" selecciona las opciones: ");
			strong24 = element("strong");
			t124 = text("whatsapp_business_management y whatsapp_business_messaging");
			t125 = text(". Luego haz clic en ");
			strong25 = element("strong");
			t126 = text("Generar token");
			t127 = text(".");
			t128 = space();
			img15 = element("img");
			t129 = space();
			p19 = element("p");
			t130 = text("Copia el token de acceso y guárdalo de manera segura, más tarde será requerido. Dale clic en ");
			strong26 = element("strong");
			t131 = text("Aceptar");
			t132 = text(".");
			t133 = space();
			img16 = element("img");
			t134 = space();
			div15 = element("div");
			p20 = element("p");
			t135 = text("Paso 4: Configura la API de Whatsapp");
			t136 = space();
			p21 = element("p");
			t137 = text("Regresa a ");
			a7 = element("a");
			t138 = text("Meta Developers");
			t139 = text(".En el menú izquierdo lateral selecciona ");
			strong27 = element("strong");
			t140 = text("Whatsapp > Configuración de la API");
			t141 = text(".");
			t142 = space();
			img17 = element("img");
			t143 = space();
			p22 = element("p");
			t144 = text("En el ");
			strong28 = element("strong");
			t145 = text("paso 5: agrega un número de teléfono");
			t146 = text(" y  completa el formulario con los datos requeridos.");
			t147 = space();
			img18 = element("img");
			t148 = space();
			p23 = element("p");
			t149 = text("Una vez agregado correctamente, selecciona tu número de teléfono en el ");
			strong29 = element("strong");
			t150 = text("Paso 1: Selecciona números de teléfono");
			t151 = text(".");
			t152 = space();
			img19 = element("img");
			t153 = space();
			p24 = element("p");
			t154 = text("Agrega un Método de pago (Para enviar mensajes a través de WhatsApp, necesitarás un método de pago válido). Para mayor información ingresa a  ");
			a8 = element("a");
			t155 = text("Meta info");
			t156 = text(".");
			t157 = space();
			img20 = element("img");
			t158 = space();
			p25 = element("p");
			t159 = text("Esto te redirigirá a Meta business. Allí, selecciona ");
			strong30 = element("strong");
			t160 = text("Agregar método de pago");
			t161 = text(" y sigue las instrucciones.");
			t162 = space();
			img21 = element("img");
			t163 = space();
			div16 = element("div");
			p26 = element("p");
			t164 = text("Paso 5: Conecta Globot con Whatsapp");
			t165 = space();
			p27 = element("p");
			t166 = text("Ingresa a tu chatbot y dirígete a ");
			strong31 = element("strong");
			t167 = text("Agregar a redes > Whatsapp");
			t168 = text(".");
			t169 = space();
			p28 = element("p");
			t170 = text("En el campo ");
			strong32 = element("strong");
			t171 = text("Token de acceso");
			t172 = text(" ingresa el texto que generaste anteriormente en el paso 3. En ");
			strong33 = element("strong");
			t173 = text("Número de teléfono");
			t174 = text(" ingresa el número que registraste. Finalmente, en ");
			strong34 = element("strong");
			t175 = text("URL de Graph");
			t176 = text(" ingresa la URL que se proporciona en ");
			strong35 = element("strong");
			t177 = text("Paso 2: Enviar mensajes con la API");
			t178 = text(" en Meta for developers, como se ve en la imagen debajo. Luego dale a clic a ");
			strong36 = element("strong");
			t179 = text("Guardar");
			t180 = text(" en Globot.");
			t181 = space();
			img22 = element("img");
			t182 = space();
			p29 = element("p");
			t183 = text("Esto generará automáticamente un texto en ");
			strong37 = element("strong");
			t184 = text("URL de devolución de llamada");
			t185 = text(" que deberás copiar y pegar en ");
			a9 = element("a");
			t186 = text("Meta for developers");
			t187 = space();
			strong38 = element("strong");
			t188 = text("Whatsapp > Configuración");
			t189 = text(" y haz clic en ");
			strong39 = element("strong");
			t190 = text("Editar");
			t191 = text(" como se ve en la imagen de abajo. Recuerda hacer click en ");
			strong40 = element("strong");
			t192 = text("Verificar y guardar");
			t193 = text(".");
			t194 = space();
			img23 = element("img");
			t195 = space();
			img24 = element("img");
			t196 = space();
			img25 = element("img");
			t197 = space();
			p30 = element("p");
			t198 = text("Finalmente, configura el campo de Webhook dándole click en ");
			strong41 = element("strong");
			t199 = text("Administrar > Messages");
			t200 = text(" y check en la casilla de suscribirte. Luego, haz click en  ");
			strong42 = element("strong");
			t201 = text("Listo");
			t202 = text(".");
			t203 = space();
			img26 = element("img");
			t204 = space();
			img27 = element("img");
			t205 = space();
			div17 = element("div");
			p31 = element("p");
			t206 = text("Paso 6: Configura tu perfil de Whatsapp");
			t207 = space();
			p32 = element("p");
			t208 = text("Para terminar de configurar tu chatbot en Whatsapp y que se vea profesional, ingresa a tu ");
			strong43 = element("strong");
			t209 = text("Portfolio empresarial > Más herramientas > Administrador de Whatsapp");
			t210 = text(" y luego haz click en tu número de teléfono recién agregado.");
			t211 = space();
			img28 = element("img");
			t212 = space();
			p33 = element("p");
			t213 = text("Luego, haz click en ");
			strong44 = element("strong");
			t214 = text("Perfil");
			t215 = text(", allí podrás agregar una foto de perfil, una descripción y otras características visibles a tus clientes.");
			t216 = space();
			img29 = element("img");
			t217 = space();
			div18 = element("div");
			p34 = element("p");
			t218 = text("¡Felicidades! Tu chatbot ya está listo para atender a tus clientes a través de Whatsapp. Asegúrate de que todo funcione correctamente verificando que el canal aparezca como ");
			strong45 = element("strong");
			t219 = text("\"Activo\"");
			t220 = text(". Para probar su funcionamiento, hazle preguntas desde otro chat y comprueba que responde según la información configurada.");
			t221 = space();
			p35 = element("p");
			t222 = text("💡 ");
			strong46 = element("strong");
			t223 = text("Importante");
			t224 = text(": Si prefieres que el chatbot no responda en este canal, simplemente haz clic en el interruptor ");
			strong47 = element("strong");
			t225 = text("Desactivar chatbot");
			t226 = text(".");
			t227 = space();
			img30 = element("img");
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
			div21 = claim_element(section_nodes, "DIV", { class: true });
			var div21_nodes = children(div21);
			div5 = claim_element(div21_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			claim_component(icon0.$$.fragment, div0_nodes);
			div0_nodes.forEach(detach);
			t2 = claim_space(div1_nodes);
			a0 = claim_element(div1_nodes, "A", { href: true });
			var a0_nodes = children(a0);
			t3 = claim_text(a0_nodes, "Tutoriales");
			a0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t4 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div4_nodes);
			}

			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t5 = claim_space(div21_nodes);
			div20 = claim_element(div21_nodes, "DIV", { class: true });
			var div20_nodes = children(div20);
			div6 = claim_element(div20_nodes, "DIV", { class: true, style: true });
			var div6_nodes = children(div6);
			a1 = claim_element(div6_nodes, "A", { href: true });
			var a1_nodes = children(a1);
			t6 = claim_text(a1_nodes, "Tutoriales");
			a1_nodes.forEach(detach);
			t7 = claim_text(div6_nodes, " > ");
			span0 = claim_element(div6_nodes, "SPAN", {});
			var span0_nodes = children(span0);
			t8 = claim_text(span0_nodes, "Integración Meta");
			span0_nodes.forEach(detach);
			t9 = claim_text(div6_nodes, " > ");
			span1 = claim_element(div6_nodes, "SPAN", { style: true });
			var span1_nodes = children(span1);
			t10 = claim_text(span1_nodes, "Whatsapp");
			span1_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t11 = claim_space(div20_nodes);
			div8 = claim_element(div20_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			t12 = claim_text(div7_nodes, /*heading*/ ctx[11]);
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t13 = claim_space(div20_nodes);
			div19 = claim_element(div20_nodes, "DIV", { class: true });
			var div19_nodes = children(div19);
			div10 = claim_element(div19_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			span2 = claim_element(div9_nodes, "SPAN", { style: true });
			var span2_nodes = children(span2);
			claim_component(icon1.$$.fragment, span2_nodes);
			span2_nodes.forEach(detach);
			t14 = claim_space(div9_nodes);
			span3 = claim_element(div9_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			span3_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t15 = claim_space(div10_nodes);
			a2 = claim_element(div10_nodes, "A", { href: true, target: true, style: true });
			var a2_nodes = children(a2);
			t16 = claim_text(a2_nodes, "Saber más");
			a2_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t17 = claim_space(div19_nodes);
			div11 = claim_element(div19_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			p0 = claim_element(div11_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t18 = claim_text(p0_nodes, "Primero, crea tu chatbot en Globot cargándole la información que necesitará para responder.");
			p0_nodes.forEach(detach);
			t19 = claim_space(div11_nodes);
			p1 = claim_element(div11_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t20 = claim_text(p1_nodes, "💡 ");
			strong0 = claim_element(p1_nodes, "STRONG", {});
			var strong0_nodes = children(strong0);
			t21 = claim_text(strong0_nodes, "Importante");
			strong0_nodes.forEach(detach);
			t22 = claim_text(p1_nodes, ": Es necesario contar con un portafolio empresarial en ");
			a3 = claim_element(p1_nodes, "A", { href: true, class: true, target: true });
			var a3_nodes = children(a3);
			t23 = claim_text(a3_nodes, "Meta Business");
			a3_nodes.forEach(detach);
			t24 = claim_text(p1_nodes, ". Si aún no lo has creado, hazlo ahora. Deberás ingresar la información de tu negocio, verificar tu correo electrónico y, si es necesario, completar la verificación con autenticación en dos pasos o subir un documento de identificación.");
			p1_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			t25 = claim_space(div19_nodes);
			div12 = claim_element(div19_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			p2 = claim_element(div12_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t26 = claim_text(p2_nodes, "Paso 1: Crea una nueva aplicación en Meta (Facebook)");
			p2_nodes.forEach(detach);
			t27 = claim_space(div12_nodes);
			p3 = claim_element(div12_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t28 = claim_text(p3_nodes, "Ingresa a ");
			a4 = claim_element(p3_nodes, "A", { href: true, class: true, target: true });
			var a4_nodes = children(a4);
			t29 = claim_text(a4_nodes, "Meta Developers ");
			a4_nodes.forEach(detach);
			t30 = claim_text(p3_nodes, "con tu cuenta de Facebook. Luego, dirígete a ");
			strong1 = claim_element(p3_nodes, "STRONG", {});
			var strong1_nodes = children(strong1);
			t31 = claim_text(strong1_nodes, "Mis aplicaciones.");
			strong1_nodes.forEach(detach);
			p3_nodes.forEach(detach);
			t32 = claim_space(div12_nodes);
			img0 = claim_element(div12_nodes, "IMG", { src: true });
			t33 = claim_space(div12_nodes);
			p4 = claim_element(div12_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t34 = claim_text(p4_nodes, "Haz click en ");
			strong2 = claim_element(p4_nodes, "STRONG", {});
			var strong2_nodes = children(strong2);
			t35 = claim_text(strong2_nodes, "Crear aplicación");
			strong2_nodes.forEach(detach);
			t36 = claim_text(p4_nodes, ".");
			p4_nodes.forEach(detach);
			t37 = claim_space(div12_nodes);
			img1 = claim_element(div12_nodes, "IMG", { src: true });
			t38 = claim_space(div12_nodes);
			p5 = claim_element(div12_nodes, "P", { class: true });
			var p5_nodes = children(p5);
			t39 = claim_text(p5_nodes, "Ingresa el nombre y correo electrónico de la aplicación. En casos de uso selecciona ");
			strong3 = claim_element(p5_nodes, "STRONG", {});
			var strong3_nodes = children(strong3);
			t40 = claim_text(strong3_nodes, "Otro");
			strong3_nodes.forEach(detach);
			t41 = claim_text(p5_nodes, " y en tipo de app selecciona ");
			strong4 = claim_element(p5_nodes, "STRONG", {});
			var strong4_nodes = children(strong4);
			t42 = claim_text(strong4_nodes, "Business");
			strong4_nodes.forEach(detach);
			t43 = claim_text(p5_nodes, ". Dale click a crear aplicación finalmente.");
			p5_nodes.forEach(detach);
			t44 = claim_space(div12_nodes);
			img2 = claim_element(div12_nodes, "IMG", { src: true });
			t45 = claim_space(div12_nodes);
			img3 = claim_element(div12_nodes, "IMG", { src: true });
			t46 = claim_space(div12_nodes);
			img4 = claim_element(div12_nodes, "IMG", { src: true });
			div12_nodes.forEach(detach);
			t47 = claim_space(div19_nodes);
			div13 = claim_element(div19_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			p6 = claim_element(div13_nodes, "P", { class: true });
			var p6_nodes = children(p6);
			t48 = claim_text(p6_nodes, "Paso 2: Configura la aplicación para la integración de Whatsapp");
			p6_nodes.forEach(detach);
			t49 = claim_space(div13_nodes);
			p7 = claim_element(div13_nodes, "P", { class: true });
			var p7_nodes = children(p7);
			t50 = claim_text(p7_nodes, "Una vez creada la aplicación, en el menú lateral izquierdo, selecciona ");
			strong5 = claim_element(p7_nodes, "STRONG", {});
			var strong5_nodes = children(strong5);
			t51 = claim_text(strong5_nodes, "Panel");
			strong5_nodes.forEach(detach);
			t52 = claim_text(p7_nodes, ".  Anda a ");
			strong6 = claim_element(p7_nodes, "STRONG", {});
			var strong6_nodes = children(strong6);
			t53 = claim_text(strong6_nodes, "Agrega productos a tu app > Whatsapp");
			strong6_nodes.forEach(detach);
			t54 = claim_text(p7_nodes, " y haz click en ");
			strong7 = claim_element(p7_nodes, "STRONG", {});
			var strong7_nodes = children(strong7);
			t55 = claim_text(strong7_nodes, "Configurar");
			strong7_nodes.forEach(detach);
			t56 = claim_text(p7_nodes, ".");
			p7_nodes.forEach(detach);
			t57 = claim_space(div13_nodes);
			img5 = claim_element(div13_nodes, "IMG", { src: true });
			t58 = claim_space(div13_nodes);
			p8 = claim_element(div13_nodes, "P", { class: true });
			var p8_nodes = children(p8);
			t59 = claim_text(p8_nodes, "Selecciona tu portfolio empresarial asociado.");
			p8_nodes.forEach(detach);
			t60 = claim_space(div13_nodes);
			img6 = claim_element(div13_nodes, "IMG", { src: true });
			t61 = claim_space(div13_nodes);
			p9 = claim_element(div13_nodes, "P", { class: true });
			var p9_nodes = children(p9);
			t62 = claim_text(p9_nodes, "En el menú lateral izquierdo, selecciona ");
			strong8 = claim_element(p9_nodes, "STRONG", {});
			var strong8_nodes = children(strong8);
			t63 = claim_text(strong8_nodes, "Configuración de la app,  Básica");
			strong8_nodes.forEach(detach);
			t64 = claim_text(p9_nodes, " y agrega en ");
			strong9 = claim_element(p9_nodes, "STRONG", {});
			var strong9_nodes = children(strong9);
			t65 = claim_text(strong9_nodes, "URL de la política de privacidad");
			strong9_nodes.forEach(detach);
			t66 = claim_text(p9_nodes, " el siguiente link: ");
			a5 = claim_element(p9_nodes, "A", { class: true, href: true, target: true });
			var a5_nodes = children(a5);
			t67 = claim_text(a5_nodes, "https://globot.ai/politicasprivacidad/");
			a5_nodes.forEach(detach);
			t68 = claim_text(p9_nodes, ". Dale clic en Guardar cambios.");
			p9_nodes.forEach(detach);
			t69 = claim_space(div13_nodes);
			img7 = claim_element(div13_nodes, "IMG", { src: true });
			t70 = claim_space(div13_nodes);
			p10 = claim_element(div13_nodes, "P", { class: true });
			var p10_nodes = children(p10);
			t71 = claim_text(p10_nodes, "Activa tu Modo de la app a ");
			strong10 = claim_element(p10_nodes, "STRONG", {});
			var strong10_nodes = children(strong10);
			t72 = claim_text(strong10_nodes, "Activo");
			strong10_nodes.forEach(detach);
			t73 = claim_text(p10_nodes, ".");
			p10_nodes.forEach(detach);
			t74 = claim_space(div13_nodes);
			img8 = claim_element(div13_nodes, "IMG", { src: true });
			div13_nodes.forEach(detach);
			t75 = claim_space(div19_nodes);
			div14 = claim_element(div19_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			p11 = claim_element(div14_nodes, "P", { class: true });
			var p11_nodes = children(p11);
			t76 = claim_text(p11_nodes, "Paso 3: Genera el token para Whatsapp");
			p11_nodes.forEach(detach);
			t77 = claim_space(div14_nodes);
			p12 = claim_element(div14_nodes, "P", { class: true });
			var p12_nodes = children(p12);
			t78 = claim_text(p12_nodes, "Ingresa a tu portfolio empresal en ");
			a6 = claim_element(p12_nodes, "A", { class: true, href: true, target: true });
			var a6_nodes = children(a6);
			t79 = claim_text(a6_nodes, "Meta Business");
			a6_nodes.forEach(detach);
			t80 = claim_text(p12_nodes, ". En el menú lateral izquierdo de tu portfolio empresarial, selecciona ");
			strong11 = claim_element(p12_nodes, "STRONG", {});
			var strong11_nodes = children(strong11);
			t81 = claim_text(strong11_nodes, "Configuración");
			strong11_nodes.forEach(detach);
			t82 = claim_text(p12_nodes, ".");
			p12_nodes.forEach(detach);
			t83 = claim_space(div14_nodes);
			img9 = claim_element(div14_nodes, "IMG", { src: true });
			t84 = claim_space(div14_nodes);
			p13 = claim_element(div14_nodes, "P", { class: true });
			var p13_nodes = children(p13);
			t85 = claim_text(p13_nodes, "En el menú desplegable, anda a ");
			strong12 = claim_element(p13_nodes, "STRONG", {});
			var strong12_nodes = children(strong12);
			t86 = claim_text(strong12_nodes, "Usuarios > Usuarios del sistema");
			strong12_nodes.forEach(detach);
			t87 = claim_text(p13_nodes, " y luego dale click a ");
			strong13 = claim_element(p13_nodes, "STRONG", {});
			var strong13_nodes = children(strong13);
			t88 = claim_text(strong13_nodes, "Agregar");
			strong13_nodes.forEach(detach);
			t89 = claim_text(p13_nodes, ".");
			p13_nodes.forEach(detach);
			t90 = claim_space(div14_nodes);
			img10 = claim_element(div14_nodes, "IMG", { src: true });
			t91 = claim_space(div14_nodes);
			p14 = claim_element(div14_nodes, "P", { class: true });
			var p14_nodes = children(p14);
			t92 = claim_text(p14_nodes, "Agrega un usuario con el rol de ");
			strong14 = claim_element(p14_nodes, "STRONG", {});
			var strong14_nodes = children(strong14);
			t93 = claim_text(strong14_nodes, "Administrador");
			strong14_nodes.forEach(detach);
			t94 = claim_text(p14_nodes, " y dale click a ");
			strong15 = claim_element(p14_nodes, "STRONG", {});
			var strong15_nodes = children(strong15);
			t95 = claim_text(strong15_nodes, "Crear usuario del sistema");
			strong15_nodes.forEach(detach);
			t96 = claim_text(p14_nodes, ".");
			p14_nodes.forEach(detach);
			t97 = claim_space(div14_nodes);
			img11 = claim_element(div14_nodes, "IMG", { src: true });
			t98 = claim_space(div14_nodes);
			p15 = claim_element(div14_nodes, "P", { class: true });
			var p15_nodes = children(p15);
			t99 = claim_text(p15_nodes, "Una vez creado el usuario, haz click en ");
			strong16 = claim_element(p15_nodes, "STRONG", {});
			var strong16_nodes = children(strong16);
			t100 = claim_text(strong16_nodes, "Asignar activos.");
			strong16_nodes.forEach(detach);
			p15_nodes.forEach(detach);
			t101 = claim_space(div14_nodes);
			img12 = claim_element(div14_nodes, "IMG", { src: true });
			t102 = claim_space(div14_nodes);
			p16 = claim_element(div14_nodes, "P", { class: true });
			var p16_nodes = children(p16);
			t103 = claim_text(p16_nodes, "En ");
			strong17 = claim_element(p16_nodes, "STRONG", {});
			var strong17_nodes = children(strong17);
			t104 = claim_text(strong17_nodes, "Apps");
			strong17_nodes.forEach(detach);
			t105 = claim_text(p16_nodes, ", selecciona tu aplicación y haz click en ");
			strong18 = claim_element(p16_nodes, "STRONG", {});
			var strong18_nodes = children(strong18);
			t106 = claim_text(strong18_nodes, "Control total");
			strong18_nodes.forEach(detach);
			t107 = claim_text(p16_nodes, " seguido de ");
			strong19 = claim_element(p16_nodes, "STRONG", {});
			var strong19_nodes = children(strong19);
			t108 = claim_text(strong19_nodes, "Guardar cambios");
			strong19_nodes.forEach(detach);
			t109 = claim_text(p16_nodes, ".");
			p16_nodes.forEach(detach);
			t110 = claim_space(div14_nodes);
			img13 = claim_element(div14_nodes, "IMG", { src: true });
			t111 = claim_space(div14_nodes);
			p17 = claim_element(div14_nodes, "P", { class: true });
			var p17_nodes = children(p17);
			t112 = claim_text(p17_nodes, "En el mismo administrador, selecciona ");
			strong20 = claim_element(p17_nodes, "STRONG", {});
			var strong20_nodes = children(strong20);
			t113 = claim_text(strong20_nodes, "Generar nuevo token");
			strong20_nodes.forEach(detach);
			t114 = claim_text(p17_nodes, ".");
			p17_nodes.forEach(detach);
			t115 = claim_space(div14_nodes);
			img14 = claim_element(div14_nodes, "IMG", { src: true });
			t116 = claim_space(div14_nodes);
			p18 = claim_element(div14_nodes, "P", { class: true });
			var p18_nodes = children(p18);
			t117 = claim_text(p18_nodes, "En el recuadro de generar token, en ");
			strong21 = claim_element(p18_nodes, "STRONG", {});
			var strong21_nodes = children(strong21);
			t118 = claim_text(strong21_nodes, "Caducidad del token");
			strong21_nodes.forEach(detach);
			t119 = claim_text(p18_nodes, " selecciona ");
			strong22 = claim_element(p18_nodes, "STRONG", {});
			var strong22_nodes = children(strong22);
			t120 = claim_text(strong22_nodes, "Nunca");
			strong22_nodes.forEach(detach);
			t121 = claim_text(p18_nodes, " y en ");
			strong23 = claim_element(p18_nodes, "STRONG", {});
			var strong23_nodes = children(strong23);
			t122 = claim_text(strong23_nodes, "Permisos");
			strong23_nodes.forEach(detach);
			t123 = claim_text(p18_nodes, " selecciona las opciones: ");
			strong24 = claim_element(p18_nodes, "STRONG", {});
			var strong24_nodes = children(strong24);
			t124 = claim_text(strong24_nodes, "whatsapp_business_management y whatsapp_business_messaging");
			strong24_nodes.forEach(detach);
			t125 = claim_text(p18_nodes, ". Luego haz clic en ");
			strong25 = claim_element(p18_nodes, "STRONG", {});
			var strong25_nodes = children(strong25);
			t126 = claim_text(strong25_nodes, "Generar token");
			strong25_nodes.forEach(detach);
			t127 = claim_text(p18_nodes, ".");
			p18_nodes.forEach(detach);
			t128 = claim_space(div14_nodes);
			img15 = claim_element(div14_nodes, "IMG", { src: true });
			t129 = claim_space(div14_nodes);
			p19 = claim_element(div14_nodes, "P", { class: true });
			var p19_nodes = children(p19);
			t130 = claim_text(p19_nodes, "Copia el token de acceso y guárdalo de manera segura, más tarde será requerido. Dale clic en ");
			strong26 = claim_element(p19_nodes, "STRONG", {});
			var strong26_nodes = children(strong26);
			t131 = claim_text(strong26_nodes, "Aceptar");
			strong26_nodes.forEach(detach);
			t132 = claim_text(p19_nodes, ".");
			p19_nodes.forEach(detach);
			t133 = claim_space(div14_nodes);
			img16 = claim_element(div14_nodes, "IMG", { src: true });
			div14_nodes.forEach(detach);
			t134 = claim_space(div19_nodes);
			div15 = claim_element(div19_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			p20 = claim_element(div15_nodes, "P", { class: true });
			var p20_nodes = children(p20);
			t135 = claim_text(p20_nodes, "Paso 4: Configura la API de Whatsapp");
			p20_nodes.forEach(detach);
			t136 = claim_space(div15_nodes);
			p21 = claim_element(div15_nodes, "P", { class: true });
			var p21_nodes = children(p21);
			t137 = claim_text(p21_nodes, "Regresa a ");
			a7 = claim_element(p21_nodes, "A", { class: true, href: true, target: true });
			var a7_nodes = children(a7);
			t138 = claim_text(a7_nodes, "Meta Developers");
			a7_nodes.forEach(detach);
			t139 = claim_text(p21_nodes, ".En el menú izquierdo lateral selecciona ");
			strong27 = claim_element(p21_nodes, "STRONG", {});
			var strong27_nodes = children(strong27);
			t140 = claim_text(strong27_nodes, "Whatsapp > Configuración de la API");
			strong27_nodes.forEach(detach);
			t141 = claim_text(p21_nodes, ".");
			p21_nodes.forEach(detach);
			t142 = claim_space(div15_nodes);
			img17 = claim_element(div15_nodes, "IMG", { src: true });
			t143 = claim_space(div15_nodes);
			p22 = claim_element(div15_nodes, "P", { class: true });
			var p22_nodes = children(p22);
			t144 = claim_text(p22_nodes, "En el ");
			strong28 = claim_element(p22_nodes, "STRONG", {});
			var strong28_nodes = children(strong28);
			t145 = claim_text(strong28_nodes, "paso 5: agrega un número de teléfono");
			strong28_nodes.forEach(detach);
			t146 = claim_text(p22_nodes, " y  completa el formulario con los datos requeridos.");
			p22_nodes.forEach(detach);
			t147 = claim_space(div15_nodes);
			img18 = claim_element(div15_nodes, "IMG", { src: true });
			t148 = claim_space(div15_nodes);
			p23 = claim_element(div15_nodes, "P", { class: true });
			var p23_nodes = children(p23);
			t149 = claim_text(p23_nodes, "Una vez agregado correctamente, selecciona tu número de teléfono en el ");
			strong29 = claim_element(p23_nodes, "STRONG", {});
			var strong29_nodes = children(strong29);
			t150 = claim_text(strong29_nodes, "Paso 1: Selecciona números de teléfono");
			strong29_nodes.forEach(detach);
			t151 = claim_text(p23_nodes, ".");
			p23_nodes.forEach(detach);
			t152 = claim_space(div15_nodes);
			img19 = claim_element(div15_nodes, "IMG", { src: true });
			t153 = claim_space(div15_nodes);
			p24 = claim_element(div15_nodes, "P", { class: true });
			var p24_nodes = children(p24);
			t154 = claim_text(p24_nodes, "Agrega un Método de pago (Para enviar mensajes a través de WhatsApp, necesitarás un método de pago válido). Para mayor información ingresa a  ");
			a8 = claim_element(p24_nodes, "A", { class: true, href: true, target: true });
			var a8_nodes = children(a8);
			t155 = claim_text(a8_nodes, "Meta info");
			a8_nodes.forEach(detach);
			t156 = claim_text(p24_nodes, ".");
			p24_nodes.forEach(detach);
			t157 = claim_space(div15_nodes);
			img20 = claim_element(div15_nodes, "IMG", { src: true });
			t158 = claim_space(div15_nodes);
			p25 = claim_element(div15_nodes, "P", { class: true });
			var p25_nodes = children(p25);
			t159 = claim_text(p25_nodes, "Esto te redirigirá a Meta business. Allí, selecciona ");
			strong30 = claim_element(p25_nodes, "STRONG", {});
			var strong30_nodes = children(strong30);
			t160 = claim_text(strong30_nodes, "Agregar método de pago");
			strong30_nodes.forEach(detach);
			t161 = claim_text(p25_nodes, " y sigue las instrucciones.");
			p25_nodes.forEach(detach);
			t162 = claim_space(div15_nodes);
			img21 = claim_element(div15_nodes, "IMG", { src: true });
			div15_nodes.forEach(detach);
			t163 = claim_space(div19_nodes);
			div16 = claim_element(div19_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			p26 = claim_element(div16_nodes, "P", { class: true });
			var p26_nodes = children(p26);
			t164 = claim_text(p26_nodes, "Paso 5: Conecta Globot con Whatsapp");
			p26_nodes.forEach(detach);
			t165 = claim_space(div16_nodes);
			p27 = claim_element(div16_nodes, "P", { class: true });
			var p27_nodes = children(p27);
			t166 = claim_text(p27_nodes, "Ingresa a tu chatbot y dirígete a ");
			strong31 = claim_element(p27_nodes, "STRONG", {});
			var strong31_nodes = children(strong31);
			t167 = claim_text(strong31_nodes, "Agregar a redes > Whatsapp");
			strong31_nodes.forEach(detach);
			t168 = claim_text(p27_nodes, ".");
			p27_nodes.forEach(detach);
			t169 = claim_space(div16_nodes);
			p28 = claim_element(div16_nodes, "P", { class: true });
			var p28_nodes = children(p28);
			t170 = claim_text(p28_nodes, "En el campo ");
			strong32 = claim_element(p28_nodes, "STRONG", {});
			var strong32_nodes = children(strong32);
			t171 = claim_text(strong32_nodes, "Token de acceso");
			strong32_nodes.forEach(detach);
			t172 = claim_text(p28_nodes, " ingresa el texto que generaste anteriormente en el paso 3. En ");
			strong33 = claim_element(p28_nodes, "STRONG", {});
			var strong33_nodes = children(strong33);
			t173 = claim_text(strong33_nodes, "Número de teléfono");
			strong33_nodes.forEach(detach);
			t174 = claim_text(p28_nodes, " ingresa el número que registraste. Finalmente, en ");
			strong34 = claim_element(p28_nodes, "STRONG", {});
			var strong34_nodes = children(strong34);
			t175 = claim_text(strong34_nodes, "URL de Graph");
			strong34_nodes.forEach(detach);
			t176 = claim_text(p28_nodes, " ingresa la URL que se proporciona en ");
			strong35 = claim_element(p28_nodes, "STRONG", {});
			var strong35_nodes = children(strong35);
			t177 = claim_text(strong35_nodes, "Paso 2: Enviar mensajes con la API");
			strong35_nodes.forEach(detach);
			t178 = claim_text(p28_nodes, " en Meta for developers, como se ve en la imagen debajo. Luego dale a clic a ");
			strong36 = claim_element(p28_nodes, "STRONG", {});
			var strong36_nodes = children(strong36);
			t179 = claim_text(strong36_nodes, "Guardar");
			strong36_nodes.forEach(detach);
			t180 = claim_text(p28_nodes, " en Globot.");
			p28_nodes.forEach(detach);
			t181 = claim_space(div16_nodes);
			img22 = claim_element(div16_nodes, "IMG", { src: true });
			t182 = claim_space(div16_nodes);
			p29 = claim_element(div16_nodes, "P", { class: true });
			var p29_nodes = children(p29);
			t183 = claim_text(p29_nodes, "Esto generará automáticamente un texto en ");
			strong37 = claim_element(p29_nodes, "STRONG", {});
			var strong37_nodes = children(strong37);
			t184 = claim_text(strong37_nodes, "URL de devolución de llamada");
			strong37_nodes.forEach(detach);
			t185 = claim_text(p29_nodes, " que deberás copiar y pegar en ");
			a9 = claim_element(p29_nodes, "A", { class: true, href: true, target: true });
			var a9_nodes = children(a9);
			t186 = claim_text(a9_nodes, "Meta for developers");
			a9_nodes.forEach(detach);
			t187 = claim_space(p29_nodes);
			strong38 = claim_element(p29_nodes, "STRONG", {});
			var strong38_nodes = children(strong38);
			t188 = claim_text(strong38_nodes, "Whatsapp > Configuración");
			strong38_nodes.forEach(detach);
			t189 = claim_text(p29_nodes, " y haz clic en ");
			strong39 = claim_element(p29_nodes, "STRONG", {});
			var strong39_nodes = children(strong39);
			t190 = claim_text(strong39_nodes, "Editar");
			strong39_nodes.forEach(detach);
			t191 = claim_text(p29_nodes, " como se ve en la imagen de abajo. Recuerda hacer click en ");
			strong40 = claim_element(p29_nodes, "STRONG", {});
			var strong40_nodes = children(strong40);
			t192 = claim_text(strong40_nodes, "Verificar y guardar");
			strong40_nodes.forEach(detach);
			t193 = claim_text(p29_nodes, ".");
			p29_nodes.forEach(detach);
			t194 = claim_space(div16_nodes);
			img23 = claim_element(div16_nodes, "IMG", { src: true });
			t195 = claim_space(div16_nodes);
			img24 = claim_element(div16_nodes, "IMG", { src: true });
			t196 = claim_space(div16_nodes);
			img25 = claim_element(div16_nodes, "IMG", { src: true });
			t197 = claim_space(div16_nodes);
			p30 = claim_element(div16_nodes, "P", { class: true });
			var p30_nodes = children(p30);
			t198 = claim_text(p30_nodes, "Finalmente, configura el campo de Webhook dándole click en ");
			strong41 = claim_element(p30_nodes, "STRONG", {});
			var strong41_nodes = children(strong41);
			t199 = claim_text(strong41_nodes, "Administrar > Messages");
			strong41_nodes.forEach(detach);
			t200 = claim_text(p30_nodes, " y check en la casilla de suscribirte. Luego, haz click en  ");
			strong42 = claim_element(p30_nodes, "STRONG", {});
			var strong42_nodes = children(strong42);
			t201 = claim_text(strong42_nodes, "Listo");
			strong42_nodes.forEach(detach);
			t202 = claim_text(p30_nodes, ".");
			p30_nodes.forEach(detach);
			t203 = claim_space(div16_nodes);
			img26 = claim_element(div16_nodes, "IMG", { src: true });
			t204 = claim_space(div16_nodes);
			img27 = claim_element(div16_nodes, "IMG", { src: true });
			div16_nodes.forEach(detach);
			t205 = claim_space(div19_nodes);
			div17 = claim_element(div19_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			p31 = claim_element(div17_nodes, "P", { class: true });
			var p31_nodes = children(p31);
			t206 = claim_text(p31_nodes, "Paso 6: Configura tu perfil de Whatsapp");
			p31_nodes.forEach(detach);
			t207 = claim_space(div17_nodes);
			p32 = claim_element(div17_nodes, "P", { class: true });
			var p32_nodes = children(p32);
			t208 = claim_text(p32_nodes, "Para terminar de configurar tu chatbot en Whatsapp y que se vea profesional, ingresa a tu ");
			strong43 = claim_element(p32_nodes, "STRONG", {});
			var strong43_nodes = children(strong43);
			t209 = claim_text(strong43_nodes, "Portfolio empresarial > Más herramientas > Administrador de Whatsapp");
			strong43_nodes.forEach(detach);
			t210 = claim_text(p32_nodes, " y luego haz click en tu número de teléfono recién agregado.");
			p32_nodes.forEach(detach);
			t211 = claim_space(div17_nodes);
			img28 = claim_element(div17_nodes, "IMG", { src: true });
			t212 = claim_space(div17_nodes);
			p33 = claim_element(div17_nodes, "P", { class: true });
			var p33_nodes = children(p33);
			t213 = claim_text(p33_nodes, "Luego, haz click en ");
			strong44 = claim_element(p33_nodes, "STRONG", {});
			var strong44_nodes = children(strong44);
			t214 = claim_text(strong44_nodes, "Perfil");
			strong44_nodes.forEach(detach);
			t215 = claim_text(p33_nodes, ", allí podrás agregar una foto de perfil, una descripción y otras características visibles a tus clientes.");
			p33_nodes.forEach(detach);
			t216 = claim_space(div17_nodes);
			img29 = claim_element(div17_nodes, "IMG", { src: true });
			div17_nodes.forEach(detach);
			t217 = claim_space(div19_nodes);
			div18 = claim_element(div19_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			p34 = claim_element(div18_nodes, "P", { class: true });
			var p34_nodes = children(p34);
			t218 = claim_text(p34_nodes, "¡Felicidades! Tu chatbot ya está listo para atender a tus clientes a través de Whatsapp. Asegúrate de que todo funcione correctamente verificando que el canal aparezca como ");
			strong45 = claim_element(p34_nodes, "STRONG", {});
			var strong45_nodes = children(strong45);
			t219 = claim_text(strong45_nodes, "\"Activo\"");
			strong45_nodes.forEach(detach);
			t220 = claim_text(p34_nodes, ". Para probar su funcionamiento, hazle preguntas desde otro chat y comprueba que responde según la información configurada.");
			p34_nodes.forEach(detach);
			t221 = claim_space(div18_nodes);
			p35 = claim_element(div18_nodes, "P", { class: true });
			var p35_nodes = children(p35);
			t222 = claim_text(p35_nodes, "💡 ");
			strong46 = claim_element(p35_nodes, "STRONG", {});
			var strong46_nodes = children(strong46);
			t223 = claim_text(strong46_nodes, "Importante");
			strong46_nodes.forEach(detach);
			t224 = claim_text(p35_nodes, ": Si prefieres que el chatbot no responda en este canal, simplemente haz clic en el interruptor ");
			strong47 = claim_element(p35_nodes, "STRONG", {});
			var strong47_nodes = children(strong47);
			t225 = claim_text(strong47_nodes, "Desactivar chatbot");
			strong47_nodes.forEach(detach);
			t226 = claim_text(p35_nodes, ".");
			p35_nodes.forEach(detach);
			t227 = claim_space(div18_nodes);
			img30 = claim_element(div18_nodes, "IMG", { src: true });
			div18_nodes.forEach(detach);
			div19_nodes.forEach(detach);
			div20_nodes.forEach(detach);
			div21_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "menu-icon svelte-1d5nt82");
			attr(a0, "href", "/tutoriales/");
			attr(div1, "class", "item-icon svelte-1d5nt82");
			attr(div2, "class", "item");
			attr(div3, "class", "tutoriales svelte-1d5nt82");
			attr(div4, "class", "accordion svelte-1d5nt82");
			attr(div5, "class", "box1 svelte-1d5nt82");
			attr(a1, "href", "/tutoriales/");
			set_style(span1, "color", "var(--Primary-2, #7B5CF5)");
			attr(div6, "class", "steps svelte-1d5nt82");
			set_style(div6, "display", "flex");
			set_style(div6, "gap", "15px");
			set_style(div6, "margin-bottom", "20px");
			set_style(div6, "text-align", "center");
			set_style(div6, "color", "#C1C2C4");
			attr(div7, "class", "heading svelte-1d5nt82");
			attr(div8, "class", "heading-group svelte-1d5nt82");
			set_style(span2, "padding-top", "5px");
			attr(span3, "class", "infoText svelte-1d5nt82");
			attr(div9, "class", "information svelte-1d5nt82");
			attr(a2, "href", "https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers");
			attr(a2, "target", "_blank");
			set_style(a2, "text-decoration-line", "underline");
			set_style(a2, "display", "flex");
			set_style(a2, "justify-content", "end");
			set_style(a2, "width", "100%");
			set_style(a2, "color", "#603FDF");
			set_style(a2, "font-size", "16px");
			attr(div10, "class", "info svelte-1d5nt82");
			attr(p0, "class", "svelte-1d5nt82");
			attr(a3, "href", "https://business.facebook.com/business/loginpage/?next=https%3A%2F%2Fbusiness.facebook.com%2F%3Fnav_ref%3Dbiz_unified_f3_login_page_to_mbs&login_options%5B0%5D=FB&login_options%5B1%5D=IG&login_options%5B2%5D=SSO&config_ref=biz_login_tool_flavor_mbs");
			attr(a3, "class", "link svelte-1d5nt82");
			attr(a3, "target", "_blank");
			attr(p1, "class", "svelte-1d5nt82");
			attr(div11, "class", "paso1 svelte-1d5nt82");
			attr(p2, "class", "subtitle svelte-1d5nt82");
			attr(a4, "href", "https://developers.facebook.com/");
			attr(a4, "class", "link svelte-1d5nt82");
			attr(a4, "target", "_blank");
			attr(p3, "class", "svelte-1d5nt82");
			if (!src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[2].url)) attr(img0, "src", img0_src_value);
			attr(p4, "class", "svelte-1d5nt82");
			if (!src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[3].url)) attr(img1, "src", img1_src_value);
			attr(p5, "class", "svelte-1d5nt82");
			if (!src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[4].url)) attr(img2, "src", img2_src_value);
			if (!src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[5].url)) attr(img3, "src", img3_src_value);
			if (!src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[6].url)) attr(img4, "src", img4_src_value);
			attr(div12, "class", "paso1 svelte-1d5nt82");
			attr(p6, "class", "subtitle svelte-1d5nt82");
			attr(p7, "class", "svelte-1d5nt82");
			if (!src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[7].url)) attr(img5, "src", img5_src_value);
			attr(p8, "class", "svelte-1d5nt82");
			if (!src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[8].url)) attr(img6, "src", img6_src_value);
			attr(a5, "class", "link svelte-1d5nt82");
			attr(a5, "href", "https://globot.ai/politicasprivacidad/");
			attr(a5, "target", "_blank");
			attr(p9, "class", "svelte-1d5nt82");
			if (!src_url_equal(img7.src, img7_src_value = /*image8*/ ctx[9].url)) attr(img7, "src", img7_src_value);
			attr(p10, "class", "svelte-1d5nt82");
			if (!src_url_equal(img8.src, img8_src_value = /*image9*/ ctx[10].url)) attr(img8, "src", img8_src_value);
			attr(div13, "class", "paso1 svelte-1d5nt82");
			attr(p11, "class", "subtitle svelte-1d5nt82");
			attr(a6, "class", "link svelte-1d5nt82");
			attr(a6, "href", "https://business.facebook.com/");
			attr(a6, "target", "_blank");
			attr(p12, "class", "svelte-1d5nt82");
			if (!src_url_equal(img9.src, img9_src_value = /*image10*/ ctx[12].url)) attr(img9, "src", img9_src_value);
			attr(p13, "class", "svelte-1d5nt82");
			if (!src_url_equal(img10.src, img10_src_value = /*image11*/ ctx[13].url)) attr(img10, "src", img10_src_value);
			attr(p14, "class", "svelte-1d5nt82");
			if (!src_url_equal(img11.src, img11_src_value = /*image12*/ ctx[14].url)) attr(img11, "src", img11_src_value);
			attr(p15, "class", "svelte-1d5nt82");
			if (!src_url_equal(img12.src, img12_src_value = /*image13*/ ctx[15].url)) attr(img12, "src", img12_src_value);
			attr(p16, "class", "svelte-1d5nt82");
			if (!src_url_equal(img13.src, img13_src_value = /*image14*/ ctx[16].url)) attr(img13, "src", img13_src_value);
			attr(p17, "class", "svelte-1d5nt82");
			if (!src_url_equal(img14.src, img14_src_value = /*image15*/ ctx[17].url)) attr(img14, "src", img14_src_value);
			attr(p18, "class", "svelte-1d5nt82");
			if (!src_url_equal(img15.src, img15_src_value = /*image16*/ ctx[18].url)) attr(img15, "src", img15_src_value);
			attr(p19, "class", "svelte-1d5nt82");
			if (!src_url_equal(img16.src, img16_src_value = /*image17*/ ctx[19].url)) attr(img16, "src", img16_src_value);
			attr(div14, "class", "paso1 svelte-1d5nt82");
			attr(p20, "class", "subtitle svelte-1d5nt82");
			attr(a7, "class", "link svelte-1d5nt82");
			attr(a7, "href", "https://developers.facebook.com/");
			attr(a7, "target", "_blank");
			attr(p21, "class", "svelte-1d5nt82");
			if (!src_url_equal(img17.src, img17_src_value = /*image18*/ ctx[20].url)) attr(img17, "src", img17_src_value);
			attr(p22, "class", "svelte-1d5nt82");
			if (!src_url_equal(img18.src, img18_src_value = /*image19*/ ctx[21].url)) attr(img18, "src", img18_src_value);
			attr(p23, "class", "svelte-1d5nt82");
			if (!src_url_equal(img19.src, img19_src_value = /*image20*/ ctx[22].url)) attr(img19, "src", img19_src_value);
			attr(a8, "class", "link svelte-1d5nt82");
			attr(a8, "href", "https://developers.facebook.com/docs/whatsapp/pricing/");
			attr(a8, "target", "_blank");
			attr(p24, "class", "svelte-1d5nt82");
			if (!src_url_equal(img20.src, img20_src_value = /*image21*/ ctx[23].url)) attr(img20, "src", img20_src_value);
			attr(p25, "class", "svelte-1d5nt82");
			if (!src_url_equal(img21.src, img21_src_value = /*image22*/ ctx[24].url)) attr(img21, "src", img21_src_value);
			attr(div15, "class", "paso1 svelte-1d5nt82");
			attr(p26, "class", "subtitle svelte-1d5nt82");
			attr(p27, "class", "svelte-1d5nt82");
			attr(p28, "class", "svelte-1d5nt82");
			if (!src_url_equal(img22.src, img22_src_value = /*image24*/ ctx[25].url)) attr(img22, "src", img22_src_value);
			attr(a9, "class", "link svelte-1d5nt82");
			attr(a9, "href", "https://developers.facebook.com/");
			attr(a9, "target", "_blank");
			attr(p29, "class", "svelte-1d5nt82");
			if (!src_url_equal(img23.src, img23_src_value = /*image25*/ ctx[26].url)) attr(img23, "src", img23_src_value);
			if (!src_url_equal(img24.src, img24_src_value = /*image26*/ ctx[27].url)) attr(img24, "src", img24_src_value);
			if (!src_url_equal(img25.src, img25_src_value = /*image27*/ ctx[28].url)) attr(img25, "src", img25_src_value);
			attr(p30, "class", "svelte-1d5nt82");
			if (!src_url_equal(img26.src, img26_src_value = /*image28*/ ctx[29].url)) attr(img26, "src", img26_src_value);
			if (!src_url_equal(img27.src, img27_src_value = /*image29*/ ctx[30].url)) attr(img27, "src", img27_src_value);
			attr(div16, "class", "paso1 svelte-1d5nt82");
			attr(p31, "class", "subtitle svelte-1d5nt82");
			attr(p32, "class", "svelte-1d5nt82");
			if (!src_url_equal(img28.src, img28_src_value = /*image30*/ ctx[31].url)) attr(img28, "src", img28_src_value);
			attr(p33, "class", "svelte-1d5nt82");
			if (!src_url_equal(img29.src, img29_src_value = /*image31*/ ctx[32].url)) attr(img29, "src", img29_src_value);
			attr(div17, "class", "paso1 svelte-1d5nt82");
			attr(p34, "class", "svelte-1d5nt82");
			attr(p35, "class", "svelte-1d5nt82");
			if (!src_url_equal(img30.src, img30_src_value = /*image32*/ ctx[33].url)) attr(img30, "src", img30_src_value);
			attr(div18, "class", "paso1 svelte-1d5nt82");
			attr(div19, "class", "content svelte-1d5nt82");
			attr(div20, "class", "box2 svelte-1d5nt82");
			attr(div21, "class", "section-container svelte-1d5nt82");
			attr(section, "class", "svelte-1d5nt82");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, style);
			append_hydration(style, t0);
			append_hydration(section, t1);
			append_hydration(section, div21);
			append_hydration(div21, div5);
			append_hydration(div5, div3);
			append_hydration(div3, div2);
			append_hydration(div2, div1);
			append_hydration(div1, div0);
			mount_component(icon0, div0, null);
			append_hydration(div1, t2);
			append_hydration(div1, a0);
			append_hydration(a0, t3);
			append_hydration(div5, t4);
			append_hydration(div5, div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div4, null);
				}
			}

			append_hydration(div21, t5);
			append_hydration(div21, div20);
			append_hydration(div20, div6);
			append_hydration(div6, a1);
			append_hydration(a1, t6);
			append_hydration(div6, t7);
			append_hydration(div6, span0);
			append_hydration(span0, t8);
			append_hydration(div6, t9);
			append_hydration(div6, span1);
			append_hydration(span1, t10);
			append_hydration(div20, t11);
			append_hydration(div20, div8);
			append_hydration(div8, div7);
			append_hydration(div7, t12);
			append_hydration(div20, t13);
			append_hydration(div20, div19);
			append_hydration(div19, div10);
			append_hydration(div10, div9);
			append_hydration(div9, span2);
			mount_component(icon1, span2, null);
			append_hydration(div9, t14);
			append_hydration(div9, span3);
			span3.innerHTML = raw_value;
			append_hydration(div10, t15);
			append_hydration(div10, a2);
			append_hydration(a2, t16);
			append_hydration(div19, t17);
			append_hydration(div19, div11);
			append_hydration(div11, p0);
			append_hydration(p0, t18);
			append_hydration(div11, t19);
			append_hydration(div11, p1);
			append_hydration(p1, t20);
			append_hydration(p1, strong0);
			append_hydration(strong0, t21);
			append_hydration(p1, t22);
			append_hydration(p1, a3);
			append_hydration(a3, t23);
			append_hydration(p1, t24);
			append_hydration(div19, t25);
			append_hydration(div19, div12);
			append_hydration(div12, p2);
			append_hydration(p2, t26);
			append_hydration(div12, t27);
			append_hydration(div12, p3);
			append_hydration(p3, t28);
			append_hydration(p3, a4);
			append_hydration(a4, t29);
			append_hydration(p3, t30);
			append_hydration(p3, strong1);
			append_hydration(strong1, t31);
			append_hydration(div12, t32);
			append_hydration(div12, img0);
			append_hydration(div12, t33);
			append_hydration(div12, p4);
			append_hydration(p4, t34);
			append_hydration(p4, strong2);
			append_hydration(strong2, t35);
			append_hydration(p4, t36);
			append_hydration(div12, t37);
			append_hydration(div12, img1);
			append_hydration(div12, t38);
			append_hydration(div12, p5);
			append_hydration(p5, t39);
			append_hydration(p5, strong3);
			append_hydration(strong3, t40);
			append_hydration(p5, t41);
			append_hydration(p5, strong4);
			append_hydration(strong4, t42);
			append_hydration(p5, t43);
			append_hydration(div12, t44);
			append_hydration(div12, img2);
			append_hydration(div12, t45);
			append_hydration(div12, img3);
			append_hydration(div12, t46);
			append_hydration(div12, img4);
			append_hydration(div19, t47);
			append_hydration(div19, div13);
			append_hydration(div13, p6);
			append_hydration(p6, t48);
			append_hydration(div13, t49);
			append_hydration(div13, p7);
			append_hydration(p7, t50);
			append_hydration(p7, strong5);
			append_hydration(strong5, t51);
			append_hydration(p7, t52);
			append_hydration(p7, strong6);
			append_hydration(strong6, t53);
			append_hydration(p7, t54);
			append_hydration(p7, strong7);
			append_hydration(strong7, t55);
			append_hydration(p7, t56);
			append_hydration(div13, t57);
			append_hydration(div13, img5);
			append_hydration(div13, t58);
			append_hydration(div13, p8);
			append_hydration(p8, t59);
			append_hydration(div13, t60);
			append_hydration(div13, img6);
			append_hydration(div13, t61);
			append_hydration(div13, p9);
			append_hydration(p9, t62);
			append_hydration(p9, strong8);
			append_hydration(strong8, t63);
			append_hydration(p9, t64);
			append_hydration(p9, strong9);
			append_hydration(strong9, t65);
			append_hydration(p9, t66);
			append_hydration(p9, a5);
			append_hydration(a5, t67);
			append_hydration(p9, t68);
			append_hydration(div13, t69);
			append_hydration(div13, img7);
			append_hydration(div13, t70);
			append_hydration(div13, p10);
			append_hydration(p10, t71);
			append_hydration(p10, strong10);
			append_hydration(strong10, t72);
			append_hydration(p10, t73);
			append_hydration(div13, t74);
			append_hydration(div13, img8);
			append_hydration(div19, t75);
			append_hydration(div19, div14);
			append_hydration(div14, p11);
			append_hydration(p11, t76);
			append_hydration(div14, t77);
			append_hydration(div14, p12);
			append_hydration(p12, t78);
			append_hydration(p12, a6);
			append_hydration(a6, t79);
			append_hydration(p12, t80);
			append_hydration(p12, strong11);
			append_hydration(strong11, t81);
			append_hydration(p12, t82);
			append_hydration(div14, t83);
			append_hydration(div14, img9);
			append_hydration(div14, t84);
			append_hydration(div14, p13);
			append_hydration(p13, t85);
			append_hydration(p13, strong12);
			append_hydration(strong12, t86);
			append_hydration(p13, t87);
			append_hydration(p13, strong13);
			append_hydration(strong13, t88);
			append_hydration(p13, t89);
			append_hydration(div14, t90);
			append_hydration(div14, img10);
			append_hydration(div14, t91);
			append_hydration(div14, p14);
			append_hydration(p14, t92);
			append_hydration(p14, strong14);
			append_hydration(strong14, t93);
			append_hydration(p14, t94);
			append_hydration(p14, strong15);
			append_hydration(strong15, t95);
			append_hydration(p14, t96);
			append_hydration(div14, t97);
			append_hydration(div14, img11);
			append_hydration(div14, t98);
			append_hydration(div14, p15);
			append_hydration(p15, t99);
			append_hydration(p15, strong16);
			append_hydration(strong16, t100);
			append_hydration(div14, t101);
			append_hydration(div14, img12);
			append_hydration(div14, t102);
			append_hydration(div14, p16);
			append_hydration(p16, t103);
			append_hydration(p16, strong17);
			append_hydration(strong17, t104);
			append_hydration(p16, t105);
			append_hydration(p16, strong18);
			append_hydration(strong18, t106);
			append_hydration(p16, t107);
			append_hydration(p16, strong19);
			append_hydration(strong19, t108);
			append_hydration(p16, t109);
			append_hydration(div14, t110);
			append_hydration(div14, img13);
			append_hydration(div14, t111);
			append_hydration(div14, p17);
			append_hydration(p17, t112);
			append_hydration(p17, strong20);
			append_hydration(strong20, t113);
			append_hydration(p17, t114);
			append_hydration(div14, t115);
			append_hydration(div14, img14);
			append_hydration(div14, t116);
			append_hydration(div14, p18);
			append_hydration(p18, t117);
			append_hydration(p18, strong21);
			append_hydration(strong21, t118);
			append_hydration(p18, t119);
			append_hydration(p18, strong22);
			append_hydration(strong22, t120);
			append_hydration(p18, t121);
			append_hydration(p18, strong23);
			append_hydration(strong23, t122);
			append_hydration(p18, t123);
			append_hydration(p18, strong24);
			append_hydration(strong24, t124);
			append_hydration(p18, t125);
			append_hydration(p18, strong25);
			append_hydration(strong25, t126);
			append_hydration(p18, t127);
			append_hydration(div14, t128);
			append_hydration(div14, img15);
			append_hydration(div14, t129);
			append_hydration(div14, p19);
			append_hydration(p19, t130);
			append_hydration(p19, strong26);
			append_hydration(strong26, t131);
			append_hydration(p19, t132);
			append_hydration(div14, t133);
			append_hydration(div14, img16);
			append_hydration(div19, t134);
			append_hydration(div19, div15);
			append_hydration(div15, p20);
			append_hydration(p20, t135);
			append_hydration(div15, t136);
			append_hydration(div15, p21);
			append_hydration(p21, t137);
			append_hydration(p21, a7);
			append_hydration(a7, t138);
			append_hydration(p21, t139);
			append_hydration(p21, strong27);
			append_hydration(strong27, t140);
			append_hydration(p21, t141);
			append_hydration(div15, t142);
			append_hydration(div15, img17);
			append_hydration(div15, t143);
			append_hydration(div15, p22);
			append_hydration(p22, t144);
			append_hydration(p22, strong28);
			append_hydration(strong28, t145);
			append_hydration(p22, t146);
			append_hydration(div15, t147);
			append_hydration(div15, img18);
			append_hydration(div15, t148);
			append_hydration(div15, p23);
			append_hydration(p23, t149);
			append_hydration(p23, strong29);
			append_hydration(strong29, t150);
			append_hydration(p23, t151);
			append_hydration(div15, t152);
			append_hydration(div15, img19);
			append_hydration(div15, t153);
			append_hydration(div15, p24);
			append_hydration(p24, t154);
			append_hydration(p24, a8);
			append_hydration(a8, t155);
			append_hydration(p24, t156);
			append_hydration(div15, t157);
			append_hydration(div15, img20);
			append_hydration(div15, t158);
			append_hydration(div15, p25);
			append_hydration(p25, t159);
			append_hydration(p25, strong30);
			append_hydration(strong30, t160);
			append_hydration(p25, t161);
			append_hydration(div15, t162);
			append_hydration(div15, img21);
			append_hydration(div19, t163);
			append_hydration(div19, div16);
			append_hydration(div16, p26);
			append_hydration(p26, t164);
			append_hydration(div16, t165);
			append_hydration(div16, p27);
			append_hydration(p27, t166);
			append_hydration(p27, strong31);
			append_hydration(strong31, t167);
			append_hydration(p27, t168);
			append_hydration(div16, t169);
			append_hydration(div16, p28);
			append_hydration(p28, t170);
			append_hydration(p28, strong32);
			append_hydration(strong32, t171);
			append_hydration(p28, t172);
			append_hydration(p28, strong33);
			append_hydration(strong33, t173);
			append_hydration(p28, t174);
			append_hydration(p28, strong34);
			append_hydration(strong34, t175);
			append_hydration(p28, t176);
			append_hydration(p28, strong35);
			append_hydration(strong35, t177);
			append_hydration(p28, t178);
			append_hydration(p28, strong36);
			append_hydration(strong36, t179);
			append_hydration(p28, t180);
			append_hydration(div16, t181);
			append_hydration(div16, img22);
			append_hydration(div16, t182);
			append_hydration(div16, p29);
			append_hydration(p29, t183);
			append_hydration(p29, strong37);
			append_hydration(strong37, t184);
			append_hydration(p29, t185);
			append_hydration(p29, a9);
			append_hydration(a9, t186);
			append_hydration(p29, t187);
			append_hydration(p29, strong38);
			append_hydration(strong38, t188);
			append_hydration(p29, t189);
			append_hydration(p29, strong39);
			append_hydration(strong39, t190);
			append_hydration(p29, t191);
			append_hydration(p29, strong40);
			append_hydration(strong40, t192);
			append_hydration(p29, t193);
			append_hydration(div16, t194);
			append_hydration(div16, img23);
			append_hydration(div16, t195);
			append_hydration(div16, img24);
			append_hydration(div16, t196);
			append_hydration(div16, img25);
			append_hydration(div16, t197);
			append_hydration(div16, p30);
			append_hydration(p30, t198);
			append_hydration(p30, strong41);
			append_hydration(strong41, t199);
			append_hydration(p30, t200);
			append_hydration(p30, strong42);
			append_hydration(strong42, t201);
			append_hydration(p30, t202);
			append_hydration(div16, t203);
			append_hydration(div16, img26);
			append_hydration(div16, t204);
			append_hydration(div16, img27);
			append_hydration(div19, t205);
			append_hydration(div19, div17);
			append_hydration(div17, p31);
			append_hydration(p31, t206);
			append_hydration(div17, t207);
			append_hydration(div17, p32);
			append_hydration(p32, t208);
			append_hydration(p32, strong43);
			append_hydration(strong43, t209);
			append_hydration(p32, t210);
			append_hydration(div17, t211);
			append_hydration(div17, img28);
			append_hydration(div17, t212);
			append_hydration(div17, p33);
			append_hydration(p33, t213);
			append_hydration(p33, strong44);
			append_hydration(strong44, t214);
			append_hydration(p33, t215);
			append_hydration(div17, t216);
			append_hydration(div17, img29);
			append_hydration(div19, t217);
			append_hydration(div19, div18);
			append_hydration(div18, p34);
			append_hydration(p34, t218);
			append_hydration(p34, strong45);
			append_hydration(strong45, t219);
			append_hydration(p34, t220);
			append_hydration(div18, t221);
			append_hydration(div18, p35);
			append_hydration(p35, t222);
			append_hydration(p35, strong46);
			append_hydration(strong46, t223);
			append_hydration(p35, t224);
			append_hydration(p35, strong47);
			append_hydration(strong47, t225);
			append_hydration(p35, t226);
			append_hydration(div18, t227);
			append_hydration(div18, img30);
			current = true;
		},
		p(ctx, dirty) {
			if (dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem, setActiveItem*/ 48) {
				each_value = /*items*/ ctx[1];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div4, outro_and_destroy_block, create_each_block, null, get_each_context);
				check_outros();
			}

			if (!current || dirty[0] & /*heading*/ 2048) set_data(t12, /*heading*/ ctx[11]);
			const icon1_changes = {};
			if (dirty[0] & /*icono*/ 1) icon1_changes.icon = /*icono*/ ctx[0];
			icon1.$set(icon1_changes);
			if ((!current || dirty[1] & /*information*/ 8) && raw_value !== (raw_value = /*information*/ ctx[34].html + "")) span3.innerHTML = raw_value;
			if (!current || dirty[0] & /*image1*/ 4 && !src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[2].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (!current || dirty[0] & /*image2*/ 8 && !src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[3].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (!current || dirty[0] & /*image3*/ 16 && !src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[4].url)) {
				attr(img2, "src", img2_src_value);
			}

			if (!current || dirty[0] & /*image4*/ 32 && !src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[5].url)) {
				attr(img3, "src", img3_src_value);
			}

			if (!current || dirty[0] & /*image5*/ 64 && !src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[6].url)) {
				attr(img4, "src", img4_src_value);
			}

			if (!current || dirty[0] & /*image6*/ 128 && !src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[7].url)) {
				attr(img5, "src", img5_src_value);
			}

			if (!current || dirty[0] & /*image7*/ 256 && !src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[8].url)) {
				attr(img6, "src", img6_src_value);
			}

			if (!current || dirty[0] & /*image8*/ 512 && !src_url_equal(img7.src, img7_src_value = /*image8*/ ctx[9].url)) {
				attr(img7, "src", img7_src_value);
			}

			if (!current || dirty[0] & /*image9*/ 1024 && !src_url_equal(img8.src, img8_src_value = /*image9*/ ctx[10].url)) {
				attr(img8, "src", img8_src_value);
			}

			if (!current || dirty[0] & /*image10*/ 4096 && !src_url_equal(img9.src, img9_src_value = /*image10*/ ctx[12].url)) {
				attr(img9, "src", img9_src_value);
			}

			if (!current || dirty[0] & /*image11*/ 8192 && !src_url_equal(img10.src, img10_src_value = /*image11*/ ctx[13].url)) {
				attr(img10, "src", img10_src_value);
			}

			if (!current || dirty[0] & /*image12*/ 16384 && !src_url_equal(img11.src, img11_src_value = /*image12*/ ctx[14].url)) {
				attr(img11, "src", img11_src_value);
			}

			if (!current || dirty[0] & /*image13*/ 32768 && !src_url_equal(img12.src, img12_src_value = /*image13*/ ctx[15].url)) {
				attr(img12, "src", img12_src_value);
			}

			if (!current || dirty[0] & /*image14*/ 65536 && !src_url_equal(img13.src, img13_src_value = /*image14*/ ctx[16].url)) {
				attr(img13, "src", img13_src_value);
			}

			if (!current || dirty[0] & /*image15*/ 131072 && !src_url_equal(img14.src, img14_src_value = /*image15*/ ctx[17].url)) {
				attr(img14, "src", img14_src_value);
			}

			if (!current || dirty[0] & /*image16*/ 262144 && !src_url_equal(img15.src, img15_src_value = /*image16*/ ctx[18].url)) {
				attr(img15, "src", img15_src_value);
			}

			if (!current || dirty[0] & /*image17*/ 524288 && !src_url_equal(img16.src, img16_src_value = /*image17*/ ctx[19].url)) {
				attr(img16, "src", img16_src_value);
			}

			if (!current || dirty[0] & /*image18*/ 1048576 && !src_url_equal(img17.src, img17_src_value = /*image18*/ ctx[20].url)) {
				attr(img17, "src", img17_src_value);
			}

			if (!current || dirty[0] & /*image19*/ 2097152 && !src_url_equal(img18.src, img18_src_value = /*image19*/ ctx[21].url)) {
				attr(img18, "src", img18_src_value);
			}

			if (!current || dirty[0] & /*image20*/ 4194304 && !src_url_equal(img19.src, img19_src_value = /*image20*/ ctx[22].url)) {
				attr(img19, "src", img19_src_value);
			}

			if (!current || dirty[0] & /*image21*/ 8388608 && !src_url_equal(img20.src, img20_src_value = /*image21*/ ctx[23].url)) {
				attr(img20, "src", img20_src_value);
			}

			if (!current || dirty[0] & /*image22*/ 16777216 && !src_url_equal(img21.src, img21_src_value = /*image22*/ ctx[24].url)) {
				attr(img21, "src", img21_src_value);
			}

			if (!current || dirty[0] & /*image24*/ 33554432 && !src_url_equal(img22.src, img22_src_value = /*image24*/ ctx[25].url)) {
				attr(img22, "src", img22_src_value);
			}

			if (!current || dirty[0] & /*image25*/ 67108864 && !src_url_equal(img23.src, img23_src_value = /*image25*/ ctx[26].url)) {
				attr(img23, "src", img23_src_value);
			}

			if (!current || dirty[0] & /*image26*/ 134217728 && !src_url_equal(img24.src, img24_src_value = /*image26*/ ctx[27].url)) {
				attr(img24, "src", img24_src_value);
			}

			if (!current || dirty[0] & /*image27*/ 268435456 && !src_url_equal(img25.src, img25_src_value = /*image27*/ ctx[28].url)) {
				attr(img25, "src", img25_src_value);
			}

			if (!current || dirty[0] & /*image28*/ 536870912 && !src_url_equal(img26.src, img26_src_value = /*image28*/ ctx[29].url)) {
				attr(img26, "src", img26_src_value);
			}

			if (!current || dirty[0] & /*image29*/ 1073741824 && !src_url_equal(img27.src, img27_src_value = /*image29*/ ctx[30].url)) {
				attr(img27, "src", img27_src_value);
			}

			if (!current || dirty[1] & /*image30*/ 1 && !src_url_equal(img28.src, img28_src_value = /*image30*/ ctx[31].url)) {
				attr(img28, "src", img28_src_value);
			}

			if (!current || dirty[1] & /*image31*/ 2 && !src_url_equal(img29.src, img29_src_value = /*image31*/ ctx[32].url)) {
				attr(img29, "src", img29_src_value);
			}

			if (!current || dirty[1] & /*image32*/ 4 && !src_url_equal(img30.src, img30_src_value = /*image32*/ ctx[33].url)) {
				attr(img30, "src", img30_src_value);
			}
		},
		i(local) {
			if (current) return;
			transition_in(icon0.$$.fragment, local);

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			transition_in(icon1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon0.$$.fragment, local);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			transition_out(icon1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(section);
			destroy_component(icon0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}

			destroy_component(icon1);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { icono } = $$props;
	let { items } = $$props;
	let { image1 } = $$props;
	let { image2 } = $$props;
	let { image3 } = $$props;
	let { image4 } = $$props;
	let { image5 } = $$props;
	let { image6 } = $$props;
	let { image7 } = $$props;
	let { image8 } = $$props;
	let { image9 } = $$props;
	let { heading } = $$props;
	let { image10 } = $$props;
	let { image11 } = $$props;
	let { image12 } = $$props;
	let { image13 } = $$props;
	let { image14 } = $$props;
	let { image15 } = $$props;
	let { image16 } = $$props;
	let { image17 } = $$props;
	let { image18 } = $$props;
	let { image19 } = $$props;
	let { image20 } = $$props;
	let { image21 } = $$props;
	let { image22 } = $$props;
	let { image23 } = $$props;
	let { image24 } = $$props;
	let { image25 } = $$props;
	let { image26 } = $$props;
	let { image27 } = $$props;
	let { image28 } = $$props;
	let { image29 } = $$props;
	let { image30 } = $$props;
	let { image31 } = $$props;
	let { image32 } = $$props;
	let { information } = $$props;
	let activeItem = 0;

	function setActiveItem(i) {
		$$invalidate(35, activeItem = activeItem === i ? null : i);
	}

	const click_handler = i => setActiveItem(i);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(37, props = $$props.props);
		if ('icono' in $$props) $$invalidate(0, icono = $$props.icono);
		if ('items' in $$props) $$invalidate(1, items = $$props.items);
		if ('image1' in $$props) $$invalidate(2, image1 = $$props.image1);
		if ('image2' in $$props) $$invalidate(3, image2 = $$props.image2);
		if ('image3' in $$props) $$invalidate(4, image3 = $$props.image3);
		if ('image4' in $$props) $$invalidate(5, image4 = $$props.image4);
		if ('image5' in $$props) $$invalidate(6, image5 = $$props.image5);
		if ('image6' in $$props) $$invalidate(7, image6 = $$props.image6);
		if ('image7' in $$props) $$invalidate(8, image7 = $$props.image7);
		if ('image8' in $$props) $$invalidate(9, image8 = $$props.image8);
		if ('image9' in $$props) $$invalidate(10, image9 = $$props.image9);
		if ('heading' in $$props) $$invalidate(11, heading = $$props.heading);
		if ('image10' in $$props) $$invalidate(12, image10 = $$props.image10);
		if ('image11' in $$props) $$invalidate(13, image11 = $$props.image11);
		if ('image12' in $$props) $$invalidate(14, image12 = $$props.image12);
		if ('image13' in $$props) $$invalidate(15, image13 = $$props.image13);
		if ('image14' in $$props) $$invalidate(16, image14 = $$props.image14);
		if ('image15' in $$props) $$invalidate(17, image15 = $$props.image15);
		if ('image16' in $$props) $$invalidate(18, image16 = $$props.image16);
		if ('image17' in $$props) $$invalidate(19, image17 = $$props.image17);
		if ('image18' in $$props) $$invalidate(20, image18 = $$props.image18);
		if ('image19' in $$props) $$invalidate(21, image19 = $$props.image19);
		if ('image20' in $$props) $$invalidate(22, image20 = $$props.image20);
		if ('image21' in $$props) $$invalidate(23, image21 = $$props.image21);
		if ('image22' in $$props) $$invalidate(24, image22 = $$props.image22);
		if ('image23' in $$props) $$invalidate(38, image23 = $$props.image23);
		if ('image24' in $$props) $$invalidate(25, image24 = $$props.image24);
		if ('image25' in $$props) $$invalidate(26, image25 = $$props.image25);
		if ('image26' in $$props) $$invalidate(27, image26 = $$props.image26);
		if ('image27' in $$props) $$invalidate(28, image27 = $$props.image27);
		if ('image28' in $$props) $$invalidate(29, image28 = $$props.image28);
		if ('image29' in $$props) $$invalidate(30, image29 = $$props.image29);
		if ('image30' in $$props) $$invalidate(31, image30 = $$props.image30);
		if ('image31' in $$props) $$invalidate(32, image31 = $$props.image31);
		if ('image32' in $$props) $$invalidate(33, image32 = $$props.image32);
		if ('information' in $$props) $$invalidate(34, information = $$props.information);
	};

	return [
		icono,
		items,
		image1,
		image2,
		image3,
		image4,
		image5,
		image6,
		image7,
		image8,
		image9,
		heading,
		image10,
		image11,
		image12,
		image13,
		image14,
		image15,
		image16,
		image17,
		image18,
		image19,
		image20,
		image21,
		image22,
		image24,
		image25,
		image26,
		image27,
		image28,
		image29,
		image30,
		image31,
		image32,
		information,
		activeItem,
		setActiveItem,
		props,
		image23,
		click_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance,
			create_fragment,
			safe_not_equal,
			{
				props: 37,
				icono: 0,
				items: 1,
				image1: 2,
				image2: 3,
				image3: 4,
				image4: 5,
				image5: 6,
				image6: 7,
				image7: 8,
				image8: 9,
				image9: 10,
				heading: 11,
				image10: 12,
				image11: 13,
				image12: 14,
				image13: 15,
				image14: 16,
				image15: 17,
				image16: 18,
				image17: 19,
				image18: 20,
				image19: 21,
				image20: 22,
				image21: 23,
				image22: 24,
				image23: 38,
				image24: 25,
				image25: 26,
				image26: 27,
				image27: 28,
				image28: 29,
				image29: 30,
				image30: 31,
				image31: 32,
				image32: 33,
				information: 34
			},
			null,
			[-1, -1]
		);
	}
}

export { Component as default };
