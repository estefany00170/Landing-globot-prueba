// Opciones - Updated January 8, 2025
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
	child_ctx[38] = list[i];
	child_ctx[40] = i;
	return child_ctx;
}

// (263:10) {#if activeItem === i}
function create_if_block(ctx) {
	let div;
	let raw_value = /*item*/ ctx[38].description.html + "";
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
			attr(div, "class", "description svelte-1lun2mi");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			div.innerHTML = raw_value;
			current = true;
		},
		p(ctx, dirty) {
			if ((!current || dirty[0] & /*items*/ 2) && raw_value !== (raw_value = /*item*/ ctx[38].description.html + "")) div.innerHTML = raw_value;		},
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

// (250:6) {#each items as item, i (i)}
function create_each_block(key_1, ctx) {
	let div3;
	let div1;
	let div0;
	let icon0;
	let t0;
	let button;
	let span0;
	let t1_value = /*item*/ ctx[38].title + "";
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
	icon0 = new Component$1({ props: { icon: /*item*/ ctx[38].icon } });
	icon1 = new Component$1({ props: { icon: "ph:caret-down-bold" } });

	function click_handler() {
		return /*click_handler*/ ctx[37](/*i*/ ctx[40]);
	}

	let if_block = /*activeItem*/ ctx[34] === /*i*/ ctx[40] && create_if_block(ctx);

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
			attr(div0, "class", "menu-icon svelte-1lun2mi");
			attr(span0, "class", "svelte-1lun2mi");
			attr(span1, "class", "icone svelte-1lun2mi");
			attr(button, "class", "svelte-1lun2mi");
			attr(div1, "class", "item-icon svelte-1lun2mi");
			attr(div3, "class", "item svelte-1lun2mi");
			toggle_class(div3, "active", /*activeItem*/ ctx[34] === /*i*/ ctx[40]);
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
			if (dirty[0] & /*items*/ 2) icon0_changes.icon = /*item*/ ctx[38].icon;
			icon0.$set(icon0_changes);
			if ((!current || dirty[0] & /*items*/ 2) && t1_value !== (t1_value = /*item*/ ctx[38].title + "")) set_data(t1, t1_value);

			if (/*activeItem*/ ctx[34] === /*i*/ ctx[40]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem*/ 8) {
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

			if (!current || dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem*/ 8) {
				toggle_class(div3, "active", /*activeItem*/ ctx[34] === /*i*/ ctx[40]);
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
	let t15;
	let t16;
	let a2;
	let t17;
	let t18;
	let div11;
	let p0;
	let t19;
	let t20;
	let ul0;
	let li0;
	let t21;
	let t22;
	let li1;
	let t23;
	let strong0;
	let t24;
	let t25;
	let strong1;
	let t26;
	let t27;
	let t28;
	let div12;
	let p1;
	let t29;
	let t30;
	let ul1;
	let li2;
	let t31;
	let a3;
	let t32;
	let t33;
	let t34;
	let li3;
	let t35;
	let strong2;
	let t36;
	let t37;
	let t38;
	let li4;
	let t39;
	let t40;
	let li5;
	let t41;
	let t42;
	let img0;
	let img0_src_value;
	let t43;
	let div13;
	let p2;
	let t44;
	let t45;
	let ul2;
	let li6;
	let t46;
	let a4;
	let t47;
	let t48;
	let t49;
	let li7;
	let t50;
	let strong3;
	let t51;
	let t52;
	let t53;
	let img1;
	let img1_src_value;
	let t54;
	let ul3;
	let li8;
	let t55;
	let strong4;
	let t56;
	let t57;
	let t58;
	let img2;
	let img2_src_value;
	let t59;
	let ul4;
	let li9;
	let t60;
	let strong5;
	let t61;
	let t62;
	let t63;
	let img3;
	let img3_src_value;
	let t64;
	let ul5;
	let li10;
	let t65;
	let strong6;
	let t66;
	let t67;
	let t68;
	let img4;
	let img4_src_value;
	let t69;
	let ul6;
	let li11;
	let t70;
	let t71;
	let img5;
	let img5_src_value;
	let t72;
	let div14;
	let p3;
	let t73;
	let t74;
	let ul7;
	let li12;
	let t75;
	let strong7;
	let t76;
	let t77;
	let t78;
	let li13;
	let t79;
	let strong8;
	let t80;
	let t81;
	let strong9;
	let t82;
	let t83;
	let t84;
	let img6;
	let img6_src_value;
	let t85;
	let ul8;
	let li14;
	let t86;
	let t87;
	let img7;
	let img7_src_value;
	let t88;
	let ul9;
	let li15;
	let t89;
	let strong10;
	let t90;
	let t91;
	let strong11;
	let t92;
	let t93;
	let a5;
	let t94;
	let t95;
	let t96;
	let img8;
	let img8_src_value;
	let t97;
	let ul10;
	let li16;
	let t98;
	let strong12;
	let t99;
	let t100;
	let t101;
	let img9;
	let img9_src_value;
	let t102;
	let div15;
	let p4;
	let t103;
	let t104;
	let ul11;
	let li17;
	let t105;
	let a6;
	let t106;
	let t107;
	let t108;
	let li18;
	let t109;
	let strong13;
	let t110;
	let t111;
	let t112;
	let img10;
	let img10_src_value;
	let t113;
	let ul12;
	let li19;
	let t114;
	let strong14;
	let t115;
	let t116;
	let strong15;
	let t117;
	let t118;
	let strong16;
	let t119;
	let t120;
	let t121;
	let img11;
	let img11_src_value;
	let t122;
	let ul13;
	let li20;
	let t123;
	let strong17;
	let t124;
	let t125;
	let strong18;
	let t126;
	let t127;
	let t128;
	let img12;
	let img12_src_value;
	let t129;
	let ul14;
	let li21;
	let t130;
	let strong19;
	let t131;
	let t132;
	let t133;
	let img13;
	let img13_src_value;
	let t134;
	let ul15;
	let li22;
	let t135;
	let strong20;
	let t136;
	let t137;
	let strong21;
	let t138;
	let t139;
	let strong22;
	let t140;
	let t141;
	let t142;
	let img14;
	let img14_src_value;
	let t143;
	let ul16;
	let li23;
	let t144;
	let strong23;
	let t145;
	let t146;
	let t147;
	let img15;
	let img15_src_value;
	let t148;
	let ul17;
	let li24;
	let t149;
	let strong24;
	let t150;
	let t151;
	let strong25;
	let t152;
	let t153;
	let strong26;
	let t154;
	let t155;
	let strong27;
	let t156;
	let t157;
	let strong28;
	let t158;
	let t159;
	let t160;
	let img16;
	let img16_src_value;
	let t161;
	let ul18;
	let li25;
	let t162;
	let strong29;
	let t163;
	let t164;
	let t165;
	let img17;
	let img17_src_value;
	let t166;
	let div16;
	let p5;
	let t167;
	let t168;
	let ul19;
	let li26;
	let t169;
	let a7;
	let t170;
	let t171;
	let t172;
	let li27;
	let t173;
	let strong30;
	let t174;
	let t175;
	let t176;
	let img18;
	let img18_src_value;
	let t177;
	let ul20;
	let li28;
	let t178;
	let strong31;
	let t179;
	let t180;
	let t181;
	let img19;
	let img19_src_value;
	let t182;
	let ul21;
	let li29;
	let t183;
	let t184;
	let img20;
	let img20_src_value;
	let t185;
	let ul22;
	let li30;
	let t186;
	let t187;
	let li31;
	let t188;
	let strong32;
	let t189;
	let t190;
	let t191;
	let img21;
	let img21_src_value;
	let t192;
	let ul23;
	let li32;
	let t193;
	let a8;
	let t194;
	let t195;
	let t196;
	let img22;
	let img22_src_value;
	let t197;
	let ul24;
	let li33;
	let t198;
	let strong33;
	let t199;
	let t200;
	let t201;
	let img23;
	let img23_src_value;
	let t202;
	let ul25;
	let li34;
	let t203;
	let strong34;
	let t204;
	let t205;
	let li35;
	let t206;
	let strong35;
	let t207;
	let t208;
	let strong36;
	let t209;
	let t210;
	let t211;
	let div17;
	let p6;
	let t212;
	let t213;
	let ul26;
	let li36;
	let t214;
	let a9;
	let t215;
	let t216;
	let strong37;
	let t217;
	let t218;
	let t219;
	let img24;
	let img24_src_value;
	let t220;
	let ul27;
	let li37;
	let t221;
	let strong38;
	let t222;
	let t223;
	let strong39;
	let t224;
	let t225;
	let strong40;
	let t226;
	let t227;
	let t228;
	let img25;
	let img25_src_value;
	let t229;
	let ul28;
	let li38;
	let t230;
	let strong41;
	let t231;
	let t232;
	let strong42;
	let t233;
	let t234;
	let t235;
	let li39;
	let t236;
	let a10;
	let t237;
	let t238;
	let strong43;
	let t239;
	let t240;
	let strong44;
	let t241;
	let t242;
	let t243;
	let img26;
	let img26_src_value;
	let t244;
	let ul29;
	let li40;
	let t245;
	let strong45;
	let t246;
	let t247;
	let t248;
	let img27;
	let img27_src_value;
	let t249;
	let ul30;
	let li41;
	let t250;
	let strong46;
	let t251;
	let t252;
	let t253;
	let img28;
	let img28_src_value;
	let t254;
	let ul31;
	let li42;
	let t255;
	let strong47;
	let t256;
	let t257;
	let t258;
	let img29;
	let img29_src_value;
	let t259;
	let div18;
	let p7;
	let t260;
	let t261;
	let p8;
	let t262;
	let current;
	icon0 = new Component$1({ props: { icon: "carbon:home" } });
	let each_value = /*items*/ ctx[1];
	const get_key = ctx => /*i*/ ctx[40];

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
			t8 = text("Integración canales");
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
			t15 = text(/*information*/ ctx[33]);
			t16 = space();
			a2 = element("a");
			t17 = text("Saber más");
			t18 = space();
			div11 = element("div");
			p0 = element("p");
			t19 = text("Paso 1: Crea tu chatbot");
			t20 = space();
			ul0 = element("ul");
			li0 = element("li");
			t21 = text("Ingresa a tu cuenta de Globot y crea un chatbot cargándole la fuente de información que desees que tenga.");
			t22 = space();
			li1 = element("li");
			t23 = text("Una vez creado y configurado, dirígete a ");
			strong0 = element("strong");
			t24 = text("“Canales”");
			t25 = text(" y luego ");
			strong1 = element("strong");
			t26 = text("“Whatsapp”");
			t27 = text(", allí estarán los campos que tendrás que completar luego de seguir los pasos de esta sección, para configurar tu chatbot en Whatsapp.");
			t28 = space();
			div12 = element("div");
			p1 = element("p");
			t29 = text("Paso 2: Crea tu cuenta comercial en Meta (Facebook)");
			t30 = space();
			ul1 = element("ul");
			li2 = element("li");
			t31 = text("Ingresa a ");
			a3 = element("a");
			t32 = text("Meta Business");
			t33 = text(" y entra con tu cuenta de Facebook.");
			t34 = space();
			li3 = element("li");
			t35 = text("Haz click en ");
			strong2 = element("strong");
			t36 = text("“Crear una cuenta”");
			t37 = text(" y luego completa el nombre del negocio, tu nombre y el correo electrónico de tu negocio. Dale clic a “Enviar”.");
			t38 = space();
			li4 = element("li");
			t39 = text("Proporciona los datos de tu empresa y haz clic en \"Enviar\".");
			t40 = space();
			li5 = element("li");
			t41 = text("Ingresa los detalles de tu empresa y haz clic en “Enviar”.");
			t42 = space();
			img0 = element("img");
			t43 = space();
			div13 = element("div");
			p2 = element("p");
			t44 = text("Paso 3: Crea una nueva aplicación en Meta (Facebook)");
			t45 = space();
			ul2 = element("ul");
			li6 = element("li");
			t46 = text("Ingresa a ");
			a4 = element("a");
			t47 = text("Meta Developers");
			t48 = text(" y entra con tu cuenta de Facebook.");
			t49 = space();
			li7 = element("li");
			t50 = text("Luego, selecciona ");
			strong3 = element("strong");
			t51 = text("“Mis apps”");
			t52 = text(".");
			t53 = space();
			img1 = element("img");
			t54 = space();
			ul3 = element("ul");
			li8 = element("li");
			t55 = text("Haz clic en ");
			strong4 = element("strong");
			t56 = text("“Crear app”");
			t57 = text(".");
			t58 = space();
			img2 = element("img");
			t59 = space();
			ul4 = element("ul");
			li9 = element("li");
			t60 = text("Selecciona Caso de uso: ");
			strong5 = element("strong");
			t61 = text("“Otro”");
			t62 = text(" y dale clic a “Siguiente”.");
			t63 = space();
			img3 = element("img");
			t64 = space();
			ul5 = element("ul");
			li10 = element("li");
			t65 = text("En Tipo de App: selecciona ");
			strong6 = element("strong");
			t66 = text("“Negocios”");
			t67 = text(" y dale clic a “Siguiente”.");
			t68 = space();
			img4 = element("img");
			t69 = space();
			ul6 = element("ul");
			li11 = element("li");
			t70 = text("Proporciona los detalles de tu app: Su nombre, el correo electrónico asociado y opcionalmente el portafolio comercial. Finalmente, dale clic en “Crear app”");
			t71 = space();
			img5 = element("img");
			t72 = space();
			div14 = element("div");
			p3 = element("p");
			t73 = text("Paso 4: Configura la aplicación Meta (Facebook) para la integración de Whatsapp");
			t74 = space();
			ul7 = element("ul");
			li12 = element("li");
			t75 = text("En el menú lateral izquierdo, selecciona ");
			strong7 = element("strong");
			t76 = text("“Panel”");
			t77 = text(".");
			t78 = space();
			li13 = element("li");
			t79 = text("Anda a ");
			strong8 = element("strong");
			t80 = text("“Agrega productos a tu app”, “Whatsapp”");
			t81 = text(" y haz clic en ");
			strong9 = element("strong");
			t82 = text("“Configurar”");
			t83 = text(".");
			t84 = space();
			img6 = element("img");
			t85 = space();
			ul8 = element("ul");
			li14 = element("li");
			t86 = text("Selecciona tu cuenta comercial de Meta.");
			t87 = space();
			img7 = element("img");
			t88 = space();
			ul9 = element("ul");
			li15 = element("li");
			t89 = text("En el menú lateral izquierdo, selecciona ");
			strong10 = element("strong");
			t90 = text("“Configuración de la app”,  “Básica”");
			t91 = text(" y agrega en ");
			strong11 = element("strong");
			t92 = text("“URL de la política de privacidad”");
			t93 = text(" el siguiente link: ");
			a5 = element("a");
			t94 = text("https://globot.ai/politicasprivacidad/");
			t95 = text(". Dale clic en “Guardar cambios”.");
			t96 = space();
			img8 = element("img");
			t97 = space();
			ul10 = element("ul");
			li16 = element("li");
			t98 = text("Activa tu Modo de la app a ");
			strong12 = element("strong");
			t99 = text("“Activo”");
			t100 = text(".");
			t101 = space();
			img9 = element("img");
			t102 = space();
			div15 = element("div");
			p4 = element("p");
			t103 = text("Paso 5: Genera el token para Whatsapp");
			t104 = space();
			ul11 = element("ul");
			li17 = element("li");
			t105 = text("Regresa a tu cuenta comercial de ");
			a6 = element("a");
			t106 = text("Meta Business");
			t107 = text(".");
			t108 = space();
			li18 = element("li");
			t109 = text("En el menú lateral izquierdo de tu portafolio comercial, selecciona  ");
			strong13 = element("strong");
			t110 = text("“Configurar”");
			t111 = text(".");
			t112 = space();
			img10 = element("img");
			t113 = space();
			ul12 = element("ul");
			li19 = element("li");
			t114 = text("En el menú que se despliega, en la parte  ");
			strong14 = element("strong");
			t115 = text("“Usuarios” ");
			t116 = text(", selecciona  ");
			strong15 = element("strong");
			t117 = text("“Usuarios del sistema”");
			t118 = text(" y luego dale clic a  ");
			strong16 = element("strong");
			t119 = text("“Agregar” ");
			t120 = text(".");
			t121 = space();
			img11 = element("img");
			t122 = space();
			ul13 = element("ul");
			li20 = element("li");
			t123 = text("Agrega un usuario con el rol de ");
			strong17 = element("strong");
			t124 = text("“Administrador”");
			t125 = text(" y dale clic a ");
			strong18 = element("strong");
			t126 = text("“Crear usuario del sistema”");
			t127 = text(".");
			t128 = space();
			img12 = element("img");
			t129 = space();
			ul14 = element("ul");
			li21 = element("li");
			t130 = text("Una vez creado el usuario, haz clic en ");
			strong19 = element("strong");
			t131 = text("“Asignar activos”");
			t132 = text(".");
			t133 = space();
			img13 = element("img");
			t134 = space();
			ul15 = element("ul");
			li22 = element("li");
			t135 = text("Luego selecciona ");
			strong20 = element("strong");
			t136 = text("“App”");
			t137 = text(", selecciona tu aplicación y haz click en ");
			strong21 = element("strong");
			t138 = text("“Control total”");
			t139 = text(" seguido de ");
			strong22 = element("strong");
			t140 = text("“Guardar cambios”");
			t141 = text(".");
			t142 = space();
			img14 = element("img");
			t143 = space();
			ul16 = element("ul");
			li23 = element("li");
			t144 = text("En el mismo administrador, selecciona ");
			strong23 = element("strong");
			t145 = text("“Generar nuevo token”");
			t146 = text(".");
			t147 = space();
			img15 = element("img");
			t148 = space();
			ul17 = element("ul");
			li24 = element("li");
			t149 = text("En el recuadro de generar token, en ");
			strong24 = element("strong");
			t150 = text("“Caducidad del token”");
			t151 = text(" selecciona ");
			strong25 = element("strong");
			t152 = text("“Nunca”");
			t153 = text(" y en ");
			strong26 = element("strong");
			t154 = text("“Permisos”");
			t155 = text(" selecciona las opciones: ");
			strong27 = element("strong");
			t156 = text("whatsapp_business_management y whatsapp_business_messaging");
			t157 = text(". Luego haz clic en ");
			strong28 = element("strong");
			t158 = text("“Generar token”");
			t159 = text(".");
			t160 = space();
			img16 = element("img");
			t161 = space();
			ul18 = element("ul");
			li25 = element("li");
			t162 = text("Copia el token de acceso y guárdalo de manera segura, más tarde será requerido. Dale clic en ");
			strong29 = element("strong");
			t163 = text("“Aceptar”");
			t164 = text(".");
			t165 = space();
			img17 = element("img");
			t166 = space();
			div16 = element("div");
			p5 = element("p");
			t167 = text("Paso 6: Configura el API de Whatsapp");
			t168 = space();
			ul19 = element("ul");
			li26 = element("li");
			t169 = text("Regresa a ");
			a7 = element("a");
			t170 = text("Meta Developers");
			t171 = text(".");
			t172 = space();
			li27 = element("li");
			t173 = text("En el menú izquierdo lateral selecciona ");
			strong30 = element("strong");
			t174 = text("“Whatsapp” > “Configuración de la API”");
			t175 = text(".");
			t176 = space();
			img18 = element("img");
			t177 = space();
			ul20 = element("ul");
			li28 = element("li");
			t178 = text("En el ");
			strong31 = element("strong");
			t179 = text("paso 5: Agrega un número de teléfono");
			t180 = text(".");
			t181 = space();
			img19 = element("img");
			t182 = space();
			ul21 = element("ul");
			li29 = element("li");
			t183 = text("Completa el formulario con los datos requeridos.");
			t184 = space();
			img20 = element("img");
			t185 = space();
			ul22 = element("ul");
			li30 = element("li");
			t186 = text("Verifica tu número usando el código recibido.");
			t187 = space();
			li31 = element("li");
			t188 = text("Una vez agregado correctamente, selecciona tu número de teléfono en el ");
			strong32 = element("strong");
			t189 = text("Paso 1 de Configuración de la API");
			t190 = text(".");
			t191 = space();
			img21 = element("img");
			t192 = space();
			ul23 = element("ul");
			li32 = element("li");
			t193 = text("Agrega un Método de pago (Para enviar mensajes a través de WhatsApp, necesitarás un método de pago válido). Para mayor información ingresa a  ");
			a8 = element("a");
			t194 = text("Meta info");
			t195 = text(".");
			t196 = space();
			img22 = element("img");
			t197 = space();
			ul24 = element("ul");
			li33 = element("li");
			t198 = text("Esto te redirigirá a Meta business. Allí, selecciona ");
			strong33 = element("strong");
			t199 = text("“Agregar método de pago”");
			t200 = text(" y sigue las instrucciones.");
			t201 = space();
			img23 = element("img");
			t202 = space();
			ul25 = element("ul");
			li34 = element("li");
			t203 = text("Regresa a Meta developers en ");
			strong34 = element("strong");
			t204 = text("“Whatsapp” > “Configuración de la API” > Paso 1.");
			t205 = space();
			li35 = element("li");
			t206 = text("En ");
			strong35 = element("strong");
			t207 = text("“Para”");
			t208 = text(" selecciona un número de prueba y haz clic en ");
			strong36 = element("strong");
			t209 = text("Enviar mensaje");
			t210 = text(". Con este paso podrás verificar si el envío de mensajes se configuró correctamente.");
			t211 = space();
			div17 = element("div");
			p6 = element("p");
			t212 = text("Paso 7: Configura la API de Globot con la API de Whatsapp");
			t213 = space();
			ul26 = element("ul");
			li36 = element("li");
			t214 = text("Ingresa al chatbot que creaste al principio en ");
			a9 = element("a");
			t215 = text("Globot");
			t216 = text(" y dirígete a ");
			strong37 = element("strong");
			t217 = text("Canales > Whatsapp");
			t218 = text(".");
			t219 = space();
			img24 = element("img");
			t220 = space();
			ul27 = element("ul");
			li37 = element("li");
			t221 = text("En ");
			strong38 = element("strong");
			t222 = text("“Token de acceso”");
			t223 = text(" ingresa el token que generaste anteriormente en Meta Business > Usuarios de sistema. En ");
			strong39 = element("strong");
			t224 = text("“Número de teléfono”");
			t225 = text(" ingresa el número que registraste en configuraciones de la API de Whatsapp. Finalmente, en ");
			strong40 = element("strong");
			t226 = text("“URL de Graph”");
			t227 = text(" ingresa la URL que se proporciona en el “Paso 2: Enviar mensajes con la API” como se ve en la imagen debajo. Luego dale a clic en “Guardar”.");
			t228 = space();
			img25 = element("img");
			t229 = space();
			ul28 = element("ul");
			li38 = element("li");
			t230 = text("Esto generará una ");
			strong41 = element("strong");
			t231 = text("URL");
			t232 = text(" y un ");
			strong42 = element("strong");
			t233 = text("Token de verificación");
			t234 = text(" que deberás copiar.");
			t235 = space();
			li39 = element("li");
			t236 = text("Vuelve a ");
			a10 = element("a");
			t237 = text("Meta Developers");
			t238 = text(" en ");
			strong43 = element("strong");
			t239 = text("Whatsapp > Configuración");
			t240 = text(" y haz clic en ");
			strong44 = element("strong");
			t241 = text("“Editar”");
			t242 = text(".");
			t243 = space();
			img26 = element("img");
			t244 = space();
			ul29 = element("ul");
			li40 = element("li");
			t245 = text("Pega los datos anteriores copiados en los respectivos campos y haz clic en ");
			strong45 = element("strong");
			t246 = text("“Verificar y guardar”");
			t247 = text(".");
			t248 = space();
			img27 = element("img");
			t249 = space();
			ul30 = element("ul");
			li41 = element("li");
			t250 = text("Configura el campo de Webhook dándole clic en ");
			strong46 = element("strong");
			t251 = text("“Administrar”");
			t252 = text(".");
			t253 = space();
			img28 = element("img");
			t254 = space();
			ul31 = element("ul");
			li42 = element("li");
			t255 = text("Busca el campo ");
			strong47 = element("strong");
			t256 = text("\"messages\"");
			t257 = text(" y suscríbete marcando la casilla. Luego, haz clic en “Listo”.");
			t258 = space();
			img29 = element("img");
			t259 = space();
			div18 = element("div");
			p7 = element("p");
			t260 = text("Paso 8: Verifica el funcionamiento de tu chatbot en Whatsapp");
			t261 = space();
			p8 = element("p");
			t262 = text("¡Felicidades! Tu chatbot ya está listo para asistir a clientes a través de tu número de WhatsApp. Verifica que está respondiendo correctamente según la base de datos que le cargaste. Puedes habilitar, deshabilitar, editar o eliminar los ajustes de integración de WhatsApp según lo necesites.");
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
			t8 = claim_text(span0_nodes, "Integración canales");
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
			t15 = claim_text(span3_nodes, /*information*/ ctx[33]);
			span3_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t16 = claim_space(div10_nodes);
			a2 = claim_element(div10_nodes, "A", { href: true, target: true, style: true });
			var a2_nodes = children(a2);
			t17 = claim_text(a2_nodes, "Saber más");
			a2_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t18 = claim_space(div19_nodes);
			div11 = claim_element(div19_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			p0 = claim_element(div11_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t19 = claim_text(p0_nodes, "Paso 1: Crea tu chatbot");
			p0_nodes.forEach(detach);
			t20 = claim_space(div11_nodes);
			ul0 = claim_element(div11_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);
			li0 = claim_element(ul0_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			t21 = claim_text(li0_nodes, "Ingresa a tu cuenta de Globot y crea un chatbot cargándole la fuente de información que desees que tenga.");
			li0_nodes.forEach(detach);
			t22 = claim_space(ul0_nodes);
			li1 = claim_element(ul0_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			t23 = claim_text(li1_nodes, "Una vez creado y configurado, dirígete a ");
			strong0 = claim_element(li1_nodes, "STRONG", {});
			var strong0_nodes = children(strong0);
			t24 = claim_text(strong0_nodes, "“Canales”");
			strong0_nodes.forEach(detach);
			t25 = claim_text(li1_nodes, " y luego ");
			strong1 = claim_element(li1_nodes, "STRONG", {});
			var strong1_nodes = children(strong1);
			t26 = claim_text(strong1_nodes, "“Whatsapp”");
			strong1_nodes.forEach(detach);
			t27 = claim_text(li1_nodes, ", allí estarán los campos que tendrás que completar luego de seguir los pasos de esta sección, para configurar tu chatbot en Whatsapp.");
			li1_nodes.forEach(detach);
			ul0_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			t28 = claim_space(div19_nodes);
			div12 = claim_element(div19_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			p1 = claim_element(div12_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t29 = claim_text(p1_nodes, "Paso 2: Crea tu cuenta comercial en Meta (Facebook)");
			p1_nodes.forEach(detach);
			t30 = claim_space(div12_nodes);
			ul1 = claim_element(div12_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);
			li2 = claim_element(ul1_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			t31 = claim_text(li2_nodes, "Ingresa a ");
			a3 = claim_element(li2_nodes, "A", { class: true, href: true, target: true });
			var a3_nodes = children(a3);
			t32 = claim_text(a3_nodes, "Meta Business");
			a3_nodes.forEach(detach);
			t33 = claim_text(li2_nodes, " y entra con tu cuenta de Facebook.");
			li2_nodes.forEach(detach);
			t34 = claim_space(ul1_nodes);
			li3 = claim_element(ul1_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			t35 = claim_text(li3_nodes, "Haz click en ");
			strong2 = claim_element(li3_nodes, "STRONG", {});
			var strong2_nodes = children(strong2);
			t36 = claim_text(strong2_nodes, "“Crear una cuenta”");
			strong2_nodes.forEach(detach);
			t37 = claim_text(li3_nodes, " y luego completa el nombre del negocio, tu nombre y el correo electrónico de tu negocio. Dale clic a “Enviar”.");
			li3_nodes.forEach(detach);
			t38 = claim_space(ul1_nodes);
			li4 = claim_element(ul1_nodes, "LI", { class: true });
			var li4_nodes = children(li4);
			t39 = claim_text(li4_nodes, "Proporciona los datos de tu empresa y haz clic en \"Enviar\".");
			li4_nodes.forEach(detach);
			t40 = claim_space(ul1_nodes);
			li5 = claim_element(ul1_nodes, "LI", { class: true });
			var li5_nodes = children(li5);
			t41 = claim_text(li5_nodes, "Ingresa los detalles de tu empresa y haz clic en “Enviar”.");
			li5_nodes.forEach(detach);
			ul1_nodes.forEach(detach);
			t42 = claim_space(div12_nodes);
			img0 = claim_element(div12_nodes, "IMG", { src: true });
			div12_nodes.forEach(detach);
			t43 = claim_space(div19_nodes);
			div13 = claim_element(div19_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			p2 = claim_element(div13_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t44 = claim_text(p2_nodes, "Paso 3: Crea una nueva aplicación en Meta (Facebook)");
			p2_nodes.forEach(detach);
			t45 = claim_space(div13_nodes);
			ul2 = claim_element(div13_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);
			li6 = claim_element(ul2_nodes, "LI", { class: true });
			var li6_nodes = children(li6);
			t46 = claim_text(li6_nodes, "Ingresa a ");
			a4 = claim_element(li6_nodes, "A", { class: true, href: true, target: true });
			var a4_nodes = children(a4);
			t47 = claim_text(a4_nodes, "Meta Developers");
			a4_nodes.forEach(detach);
			t48 = claim_text(li6_nodes, " y entra con tu cuenta de Facebook.");
			li6_nodes.forEach(detach);
			t49 = claim_space(ul2_nodes);
			li7 = claim_element(ul2_nodes, "LI", { class: true });
			var li7_nodes = children(li7);
			t50 = claim_text(li7_nodes, "Luego, selecciona ");
			strong3 = claim_element(li7_nodes, "STRONG", {});
			var strong3_nodes = children(strong3);
			t51 = claim_text(strong3_nodes, "“Mis apps”");
			strong3_nodes.forEach(detach);
			t52 = claim_text(li7_nodes, ".");
			li7_nodes.forEach(detach);
			ul2_nodes.forEach(detach);
			t53 = claim_space(div13_nodes);
			img1 = claim_element(div13_nodes, "IMG", { src: true });
			t54 = claim_space(div13_nodes);
			ul3 = claim_element(div13_nodes, "UL", { class: true });
			var ul3_nodes = children(ul3);
			li8 = claim_element(ul3_nodes, "LI", { class: true });
			var li8_nodes = children(li8);
			t55 = claim_text(li8_nodes, "Haz clic en ");
			strong4 = claim_element(li8_nodes, "STRONG", {});
			var strong4_nodes = children(strong4);
			t56 = claim_text(strong4_nodes, "“Crear app”");
			strong4_nodes.forEach(detach);
			t57 = claim_text(li8_nodes, ".");
			li8_nodes.forEach(detach);
			ul3_nodes.forEach(detach);
			t58 = claim_space(div13_nodes);
			img2 = claim_element(div13_nodes, "IMG", { src: true });
			t59 = claim_space(div13_nodes);
			ul4 = claim_element(div13_nodes, "UL", { class: true });
			var ul4_nodes = children(ul4);
			li9 = claim_element(ul4_nodes, "LI", { class: true });
			var li9_nodes = children(li9);
			t60 = claim_text(li9_nodes, "Selecciona Caso de uso: ");
			strong5 = claim_element(li9_nodes, "STRONG", {});
			var strong5_nodes = children(strong5);
			t61 = claim_text(strong5_nodes, "“Otro”");
			strong5_nodes.forEach(detach);
			t62 = claim_text(li9_nodes, " y dale clic a “Siguiente”.");
			li9_nodes.forEach(detach);
			ul4_nodes.forEach(detach);
			t63 = claim_space(div13_nodes);
			img3 = claim_element(div13_nodes, "IMG", { src: true });
			t64 = claim_space(div13_nodes);
			ul5 = claim_element(div13_nodes, "UL", { class: true });
			var ul5_nodes = children(ul5);
			li10 = claim_element(ul5_nodes, "LI", { class: true });
			var li10_nodes = children(li10);
			t65 = claim_text(li10_nodes, "En Tipo de App: selecciona ");
			strong6 = claim_element(li10_nodes, "STRONG", {});
			var strong6_nodes = children(strong6);
			t66 = claim_text(strong6_nodes, "“Negocios”");
			strong6_nodes.forEach(detach);
			t67 = claim_text(li10_nodes, " y dale clic a “Siguiente”.");
			li10_nodes.forEach(detach);
			ul5_nodes.forEach(detach);
			t68 = claim_space(div13_nodes);
			img4 = claim_element(div13_nodes, "IMG", { src: true });
			t69 = claim_space(div13_nodes);
			ul6 = claim_element(div13_nodes, "UL", { class: true });
			var ul6_nodes = children(ul6);
			li11 = claim_element(ul6_nodes, "LI", { class: true });
			var li11_nodes = children(li11);
			t70 = claim_text(li11_nodes, "Proporciona los detalles de tu app: Su nombre, el correo electrónico asociado y opcionalmente el portafolio comercial. Finalmente, dale clic en “Crear app”");
			li11_nodes.forEach(detach);
			ul6_nodes.forEach(detach);
			t71 = claim_space(div13_nodes);
			img5 = claim_element(div13_nodes, "IMG", { src: true });
			div13_nodes.forEach(detach);
			t72 = claim_space(div19_nodes);
			div14 = claim_element(div19_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			p3 = claim_element(div14_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t73 = claim_text(p3_nodes, "Paso 4: Configura la aplicación Meta (Facebook) para la integración de Whatsapp");
			p3_nodes.forEach(detach);
			t74 = claim_space(div14_nodes);
			ul7 = claim_element(div14_nodes, "UL", { class: true });
			var ul7_nodes = children(ul7);
			li12 = claim_element(ul7_nodes, "LI", { class: true });
			var li12_nodes = children(li12);
			t75 = claim_text(li12_nodes, "En el menú lateral izquierdo, selecciona ");
			strong7 = claim_element(li12_nodes, "STRONG", {});
			var strong7_nodes = children(strong7);
			t76 = claim_text(strong7_nodes, "“Panel”");
			strong7_nodes.forEach(detach);
			t77 = claim_text(li12_nodes, ".");
			li12_nodes.forEach(detach);
			t78 = claim_space(ul7_nodes);
			li13 = claim_element(ul7_nodes, "LI", { class: true });
			var li13_nodes = children(li13);
			t79 = claim_text(li13_nodes, "Anda a ");
			strong8 = claim_element(li13_nodes, "STRONG", {});
			var strong8_nodes = children(strong8);
			t80 = claim_text(strong8_nodes, "“Agrega productos a tu app”, “Whatsapp”");
			strong8_nodes.forEach(detach);
			t81 = claim_text(li13_nodes, " y haz clic en ");
			strong9 = claim_element(li13_nodes, "STRONG", {});
			var strong9_nodes = children(strong9);
			t82 = claim_text(strong9_nodes, "“Configurar”");
			strong9_nodes.forEach(detach);
			t83 = claim_text(li13_nodes, ".");
			li13_nodes.forEach(detach);
			ul7_nodes.forEach(detach);
			t84 = claim_space(div14_nodes);
			img6 = claim_element(div14_nodes, "IMG", { src: true });
			t85 = claim_space(div14_nodes);
			ul8 = claim_element(div14_nodes, "UL", { class: true });
			var ul8_nodes = children(ul8);
			li14 = claim_element(ul8_nodes, "LI", { class: true });
			var li14_nodes = children(li14);
			t86 = claim_text(li14_nodes, "Selecciona tu cuenta comercial de Meta.");
			li14_nodes.forEach(detach);
			ul8_nodes.forEach(detach);
			t87 = claim_space(div14_nodes);
			img7 = claim_element(div14_nodes, "IMG", { src: true });
			t88 = claim_space(div14_nodes);
			ul9 = claim_element(div14_nodes, "UL", { class: true });
			var ul9_nodes = children(ul9);
			li15 = claim_element(ul9_nodes, "LI", { class: true });
			var li15_nodes = children(li15);
			t89 = claim_text(li15_nodes, "En el menú lateral izquierdo, selecciona ");
			strong10 = claim_element(li15_nodes, "STRONG", {});
			var strong10_nodes = children(strong10);
			t90 = claim_text(strong10_nodes, "“Configuración de la app”,  “Básica”");
			strong10_nodes.forEach(detach);
			t91 = claim_text(li15_nodes, " y agrega en ");
			strong11 = claim_element(li15_nodes, "STRONG", {});
			var strong11_nodes = children(strong11);
			t92 = claim_text(strong11_nodes, "“URL de la política de privacidad”");
			strong11_nodes.forEach(detach);
			t93 = claim_text(li15_nodes, " el siguiente link: ");
			a5 = claim_element(li15_nodes, "A", { class: true, href: true, target: true });
			var a5_nodes = children(a5);
			t94 = claim_text(a5_nodes, "https://globot.ai/politicasprivacidad/");
			a5_nodes.forEach(detach);
			t95 = claim_text(li15_nodes, ". Dale clic en “Guardar cambios”.");
			li15_nodes.forEach(detach);
			ul9_nodes.forEach(detach);
			t96 = claim_space(div14_nodes);
			img8 = claim_element(div14_nodes, "IMG", { src: true });
			t97 = claim_space(div14_nodes);
			ul10 = claim_element(div14_nodes, "UL", { class: true });
			var ul10_nodes = children(ul10);
			li16 = claim_element(ul10_nodes, "LI", { class: true });
			var li16_nodes = children(li16);
			t98 = claim_text(li16_nodes, "Activa tu Modo de la app a ");
			strong12 = claim_element(li16_nodes, "STRONG", {});
			var strong12_nodes = children(strong12);
			t99 = claim_text(strong12_nodes, "“Activo”");
			strong12_nodes.forEach(detach);
			t100 = claim_text(li16_nodes, ".");
			li16_nodes.forEach(detach);
			ul10_nodes.forEach(detach);
			t101 = claim_space(div14_nodes);
			img9 = claim_element(div14_nodes, "IMG", { src: true });
			div14_nodes.forEach(detach);
			t102 = claim_space(div19_nodes);
			div15 = claim_element(div19_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			p4 = claim_element(div15_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t103 = claim_text(p4_nodes, "Paso 5: Genera el token para Whatsapp");
			p4_nodes.forEach(detach);
			t104 = claim_space(div15_nodes);
			ul11 = claim_element(div15_nodes, "UL", { class: true });
			var ul11_nodes = children(ul11);
			li17 = claim_element(ul11_nodes, "LI", { class: true });
			var li17_nodes = children(li17);
			t105 = claim_text(li17_nodes, "Regresa a tu cuenta comercial de ");
			a6 = claim_element(li17_nodes, "A", { class: true, href: true, target: true });
			var a6_nodes = children(a6);
			t106 = claim_text(a6_nodes, "Meta Business");
			a6_nodes.forEach(detach);
			t107 = claim_text(li17_nodes, ".");
			li17_nodes.forEach(detach);
			t108 = claim_space(ul11_nodes);
			li18 = claim_element(ul11_nodes, "LI", { class: true });
			var li18_nodes = children(li18);
			t109 = claim_text(li18_nodes, "En el menú lateral izquierdo de tu portafolio comercial, selecciona  ");
			strong13 = claim_element(li18_nodes, "STRONG", {});
			var strong13_nodes = children(strong13);
			t110 = claim_text(strong13_nodes, "“Configurar”");
			strong13_nodes.forEach(detach);
			t111 = claim_text(li18_nodes, ".");
			li18_nodes.forEach(detach);
			ul11_nodes.forEach(detach);
			t112 = claim_space(div15_nodes);
			img10 = claim_element(div15_nodes, "IMG", { src: true });
			t113 = claim_space(div15_nodes);
			ul12 = claim_element(div15_nodes, "UL", { class: true });
			var ul12_nodes = children(ul12);
			li19 = claim_element(ul12_nodes, "LI", { class: true });
			var li19_nodes = children(li19);
			t114 = claim_text(li19_nodes, "En el menú que se despliega, en la parte  ");
			strong14 = claim_element(li19_nodes, "STRONG", {});
			var strong14_nodes = children(strong14);
			t115 = claim_text(strong14_nodes, "“Usuarios” ");
			strong14_nodes.forEach(detach);
			t116 = claim_text(li19_nodes, ", selecciona  ");
			strong15 = claim_element(li19_nodes, "STRONG", {});
			var strong15_nodes = children(strong15);
			t117 = claim_text(strong15_nodes, "“Usuarios del sistema”");
			strong15_nodes.forEach(detach);
			t118 = claim_text(li19_nodes, " y luego dale clic a  ");
			strong16 = claim_element(li19_nodes, "STRONG", {});
			var strong16_nodes = children(strong16);
			t119 = claim_text(strong16_nodes, "“Agregar” ");
			strong16_nodes.forEach(detach);
			t120 = claim_text(li19_nodes, ".");
			li19_nodes.forEach(detach);
			ul12_nodes.forEach(detach);
			t121 = claim_space(div15_nodes);
			img11 = claim_element(div15_nodes, "IMG", { src: true });
			t122 = claim_space(div15_nodes);
			ul13 = claim_element(div15_nodes, "UL", { class: true });
			var ul13_nodes = children(ul13);
			li20 = claim_element(ul13_nodes, "LI", { class: true });
			var li20_nodes = children(li20);
			t123 = claim_text(li20_nodes, "Agrega un usuario con el rol de ");
			strong17 = claim_element(li20_nodes, "STRONG", {});
			var strong17_nodes = children(strong17);
			t124 = claim_text(strong17_nodes, "“Administrador”");
			strong17_nodes.forEach(detach);
			t125 = claim_text(li20_nodes, " y dale clic a ");
			strong18 = claim_element(li20_nodes, "STRONG", {});
			var strong18_nodes = children(strong18);
			t126 = claim_text(strong18_nodes, "“Crear usuario del sistema”");
			strong18_nodes.forEach(detach);
			t127 = claim_text(li20_nodes, ".");
			li20_nodes.forEach(detach);
			ul13_nodes.forEach(detach);
			t128 = claim_space(div15_nodes);
			img12 = claim_element(div15_nodes, "IMG", { src: true });
			t129 = claim_space(div15_nodes);
			ul14 = claim_element(div15_nodes, "UL", { class: true });
			var ul14_nodes = children(ul14);
			li21 = claim_element(ul14_nodes, "LI", { class: true });
			var li21_nodes = children(li21);
			t130 = claim_text(li21_nodes, "Una vez creado el usuario, haz clic en ");
			strong19 = claim_element(li21_nodes, "STRONG", {});
			var strong19_nodes = children(strong19);
			t131 = claim_text(strong19_nodes, "“Asignar activos”");
			strong19_nodes.forEach(detach);
			t132 = claim_text(li21_nodes, ".");
			li21_nodes.forEach(detach);
			ul14_nodes.forEach(detach);
			t133 = claim_space(div15_nodes);
			img13 = claim_element(div15_nodes, "IMG", { src: true });
			t134 = claim_space(div15_nodes);
			ul15 = claim_element(div15_nodes, "UL", { class: true });
			var ul15_nodes = children(ul15);
			li22 = claim_element(ul15_nodes, "LI", { class: true });
			var li22_nodes = children(li22);
			t135 = claim_text(li22_nodes, "Luego selecciona ");
			strong20 = claim_element(li22_nodes, "STRONG", {});
			var strong20_nodes = children(strong20);
			t136 = claim_text(strong20_nodes, "“App”");
			strong20_nodes.forEach(detach);
			t137 = claim_text(li22_nodes, ", selecciona tu aplicación y haz click en ");
			strong21 = claim_element(li22_nodes, "STRONG", {});
			var strong21_nodes = children(strong21);
			t138 = claim_text(strong21_nodes, "“Control total”");
			strong21_nodes.forEach(detach);
			t139 = claim_text(li22_nodes, " seguido de ");
			strong22 = claim_element(li22_nodes, "STRONG", {});
			var strong22_nodes = children(strong22);
			t140 = claim_text(strong22_nodes, "“Guardar cambios”");
			strong22_nodes.forEach(detach);
			t141 = claim_text(li22_nodes, ".");
			li22_nodes.forEach(detach);
			ul15_nodes.forEach(detach);
			t142 = claim_space(div15_nodes);
			img14 = claim_element(div15_nodes, "IMG", { src: true });
			t143 = claim_space(div15_nodes);
			ul16 = claim_element(div15_nodes, "UL", { class: true });
			var ul16_nodes = children(ul16);
			li23 = claim_element(ul16_nodes, "LI", { class: true });
			var li23_nodes = children(li23);
			t144 = claim_text(li23_nodes, "En el mismo administrador, selecciona ");
			strong23 = claim_element(li23_nodes, "STRONG", {});
			var strong23_nodes = children(strong23);
			t145 = claim_text(strong23_nodes, "“Generar nuevo token”");
			strong23_nodes.forEach(detach);
			t146 = claim_text(li23_nodes, ".");
			li23_nodes.forEach(detach);
			ul16_nodes.forEach(detach);
			t147 = claim_space(div15_nodes);
			img15 = claim_element(div15_nodes, "IMG", { src: true });
			t148 = claim_space(div15_nodes);
			ul17 = claim_element(div15_nodes, "UL", { class: true });
			var ul17_nodes = children(ul17);
			li24 = claim_element(ul17_nodes, "LI", { class: true });
			var li24_nodes = children(li24);
			t149 = claim_text(li24_nodes, "En el recuadro de generar token, en ");
			strong24 = claim_element(li24_nodes, "STRONG", {});
			var strong24_nodes = children(strong24);
			t150 = claim_text(strong24_nodes, "“Caducidad del token”");
			strong24_nodes.forEach(detach);
			t151 = claim_text(li24_nodes, " selecciona ");
			strong25 = claim_element(li24_nodes, "STRONG", {});
			var strong25_nodes = children(strong25);
			t152 = claim_text(strong25_nodes, "“Nunca”");
			strong25_nodes.forEach(detach);
			t153 = claim_text(li24_nodes, " y en ");
			strong26 = claim_element(li24_nodes, "STRONG", {});
			var strong26_nodes = children(strong26);
			t154 = claim_text(strong26_nodes, "“Permisos”");
			strong26_nodes.forEach(detach);
			t155 = claim_text(li24_nodes, " selecciona las opciones: ");
			strong27 = claim_element(li24_nodes, "STRONG", {});
			var strong27_nodes = children(strong27);
			t156 = claim_text(strong27_nodes, "whatsapp_business_management y whatsapp_business_messaging");
			strong27_nodes.forEach(detach);
			t157 = claim_text(li24_nodes, ". Luego haz clic en ");
			strong28 = claim_element(li24_nodes, "STRONG", {});
			var strong28_nodes = children(strong28);
			t158 = claim_text(strong28_nodes, "“Generar token”");
			strong28_nodes.forEach(detach);
			t159 = claim_text(li24_nodes, ".");
			li24_nodes.forEach(detach);
			ul17_nodes.forEach(detach);
			t160 = claim_space(div15_nodes);
			img16 = claim_element(div15_nodes, "IMG", { src: true });
			t161 = claim_space(div15_nodes);
			ul18 = claim_element(div15_nodes, "UL", { class: true });
			var ul18_nodes = children(ul18);
			li25 = claim_element(ul18_nodes, "LI", { class: true });
			var li25_nodes = children(li25);
			t162 = claim_text(li25_nodes, "Copia el token de acceso y guárdalo de manera segura, más tarde será requerido. Dale clic en ");
			strong29 = claim_element(li25_nodes, "STRONG", {});
			var strong29_nodes = children(strong29);
			t163 = claim_text(strong29_nodes, "“Aceptar”");
			strong29_nodes.forEach(detach);
			t164 = claim_text(li25_nodes, ".");
			li25_nodes.forEach(detach);
			ul18_nodes.forEach(detach);
			t165 = claim_space(div15_nodes);
			img17 = claim_element(div15_nodes, "IMG", { src: true });
			div15_nodes.forEach(detach);
			t166 = claim_space(div19_nodes);
			div16 = claim_element(div19_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			p5 = claim_element(div16_nodes, "P", { class: true });
			var p5_nodes = children(p5);
			t167 = claim_text(p5_nodes, "Paso 6: Configura el API de Whatsapp");
			p5_nodes.forEach(detach);
			t168 = claim_space(div16_nodes);
			ul19 = claim_element(div16_nodes, "UL", { class: true });
			var ul19_nodes = children(ul19);
			li26 = claim_element(ul19_nodes, "LI", { class: true });
			var li26_nodes = children(li26);
			t169 = claim_text(li26_nodes, "Regresa a ");
			a7 = claim_element(li26_nodes, "A", { class: true, href: true, target: true });
			var a7_nodes = children(a7);
			t170 = claim_text(a7_nodes, "Meta Developers");
			a7_nodes.forEach(detach);
			t171 = claim_text(li26_nodes, ".");
			li26_nodes.forEach(detach);
			t172 = claim_space(ul19_nodes);
			li27 = claim_element(ul19_nodes, "LI", { class: true });
			var li27_nodes = children(li27);
			t173 = claim_text(li27_nodes, "En el menú izquierdo lateral selecciona ");
			strong30 = claim_element(li27_nodes, "STRONG", {});
			var strong30_nodes = children(strong30);
			t174 = claim_text(strong30_nodes, "“Whatsapp” > “Configuración de la API”");
			strong30_nodes.forEach(detach);
			t175 = claim_text(li27_nodes, ".");
			li27_nodes.forEach(detach);
			ul19_nodes.forEach(detach);
			t176 = claim_space(div16_nodes);
			img18 = claim_element(div16_nodes, "IMG", { src: true });
			t177 = claim_space(div16_nodes);
			ul20 = claim_element(div16_nodes, "UL", { class: true });
			var ul20_nodes = children(ul20);
			li28 = claim_element(ul20_nodes, "LI", { class: true });
			var li28_nodes = children(li28);
			t178 = claim_text(li28_nodes, "En el ");
			strong31 = claim_element(li28_nodes, "STRONG", {});
			var strong31_nodes = children(strong31);
			t179 = claim_text(strong31_nodes, "paso 5: Agrega un número de teléfono");
			strong31_nodes.forEach(detach);
			t180 = claim_text(li28_nodes, ".");
			li28_nodes.forEach(detach);
			ul20_nodes.forEach(detach);
			t181 = claim_space(div16_nodes);
			img19 = claim_element(div16_nodes, "IMG", { src: true });
			t182 = claim_space(div16_nodes);
			ul21 = claim_element(div16_nodes, "UL", { class: true });
			var ul21_nodes = children(ul21);
			li29 = claim_element(ul21_nodes, "LI", { class: true });
			var li29_nodes = children(li29);
			t183 = claim_text(li29_nodes, "Completa el formulario con los datos requeridos.");
			li29_nodes.forEach(detach);
			ul21_nodes.forEach(detach);
			t184 = claim_space(div16_nodes);
			img20 = claim_element(div16_nodes, "IMG", { src: true });
			t185 = claim_space(div16_nodes);
			ul22 = claim_element(div16_nodes, "UL", { class: true });
			var ul22_nodes = children(ul22);
			li30 = claim_element(ul22_nodes, "LI", { class: true });
			var li30_nodes = children(li30);
			t186 = claim_text(li30_nodes, "Verifica tu número usando el código recibido.");
			li30_nodes.forEach(detach);
			t187 = claim_space(ul22_nodes);
			li31 = claim_element(ul22_nodes, "LI", { class: true });
			var li31_nodes = children(li31);
			t188 = claim_text(li31_nodes, "Una vez agregado correctamente, selecciona tu número de teléfono en el ");
			strong32 = claim_element(li31_nodes, "STRONG", {});
			var strong32_nodes = children(strong32);
			t189 = claim_text(strong32_nodes, "Paso 1 de Configuración de la API");
			strong32_nodes.forEach(detach);
			t190 = claim_text(li31_nodes, ".");
			li31_nodes.forEach(detach);
			ul22_nodes.forEach(detach);
			t191 = claim_space(div16_nodes);
			img21 = claim_element(div16_nodes, "IMG", { src: true });
			t192 = claim_space(div16_nodes);
			ul23 = claim_element(div16_nodes, "UL", { class: true });
			var ul23_nodes = children(ul23);
			li32 = claim_element(ul23_nodes, "LI", { class: true });
			var li32_nodes = children(li32);
			t193 = claim_text(li32_nodes, "Agrega un Método de pago (Para enviar mensajes a través de WhatsApp, necesitarás un método de pago válido). Para mayor información ingresa a  ");
			a8 = claim_element(li32_nodes, "A", { class: true, href: true, target: true });
			var a8_nodes = children(a8);
			t194 = claim_text(a8_nodes, "Meta info");
			a8_nodes.forEach(detach);
			t195 = claim_text(li32_nodes, ".");
			li32_nodes.forEach(detach);
			ul23_nodes.forEach(detach);
			t196 = claim_space(div16_nodes);
			img22 = claim_element(div16_nodes, "IMG", { src: true });
			t197 = claim_space(div16_nodes);
			ul24 = claim_element(div16_nodes, "UL", { class: true });
			var ul24_nodes = children(ul24);
			li33 = claim_element(ul24_nodes, "LI", { class: true });
			var li33_nodes = children(li33);
			t198 = claim_text(li33_nodes, "Esto te redirigirá a Meta business. Allí, selecciona ");
			strong33 = claim_element(li33_nodes, "STRONG", {});
			var strong33_nodes = children(strong33);
			t199 = claim_text(strong33_nodes, "“Agregar método de pago”");
			strong33_nodes.forEach(detach);
			t200 = claim_text(li33_nodes, " y sigue las instrucciones.");
			li33_nodes.forEach(detach);
			ul24_nodes.forEach(detach);
			t201 = claim_space(div16_nodes);
			img23 = claim_element(div16_nodes, "IMG", { src: true });
			t202 = claim_space(div16_nodes);
			ul25 = claim_element(div16_nodes, "UL", { class: true });
			var ul25_nodes = children(ul25);
			li34 = claim_element(ul25_nodes, "LI", { class: true });
			var li34_nodes = children(li34);
			t203 = claim_text(li34_nodes, "Regresa a Meta developers en ");
			strong34 = claim_element(li34_nodes, "STRONG", {});
			var strong34_nodes = children(strong34);
			t204 = claim_text(strong34_nodes, "“Whatsapp” > “Configuración de la API” > Paso 1.");
			strong34_nodes.forEach(detach);
			li34_nodes.forEach(detach);
			t205 = claim_space(ul25_nodes);
			li35 = claim_element(ul25_nodes, "LI", { class: true });
			var li35_nodes = children(li35);
			t206 = claim_text(li35_nodes, "En ");
			strong35 = claim_element(li35_nodes, "STRONG", {});
			var strong35_nodes = children(strong35);
			t207 = claim_text(strong35_nodes, "“Para”");
			strong35_nodes.forEach(detach);
			t208 = claim_text(li35_nodes, " selecciona un número de prueba y haz clic en ");
			strong36 = claim_element(li35_nodes, "STRONG", {});
			var strong36_nodes = children(strong36);
			t209 = claim_text(strong36_nodes, "Enviar mensaje");
			strong36_nodes.forEach(detach);
			t210 = claim_text(li35_nodes, ". Con este paso podrás verificar si el envío de mensajes se configuró correctamente.");
			li35_nodes.forEach(detach);
			ul25_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			t211 = claim_space(div19_nodes);
			div17 = claim_element(div19_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			p6 = claim_element(div17_nodes, "P", { class: true });
			var p6_nodes = children(p6);
			t212 = claim_text(p6_nodes, "Paso 7: Configura la API de Globot con la API de Whatsapp");
			p6_nodes.forEach(detach);
			t213 = claim_space(div17_nodes);
			ul26 = claim_element(div17_nodes, "UL", { class: true });
			var ul26_nodes = children(ul26);
			li36 = claim_element(ul26_nodes, "LI", { class: true });
			var li36_nodes = children(li36);
			t214 = claim_text(li36_nodes, "Ingresa al chatbot que creaste al principio en ");
			a9 = claim_element(li36_nodes, "A", { class: true, href: true, target: true });
			var a9_nodes = children(a9);
			t215 = claim_text(a9_nodes, "Globot");
			a9_nodes.forEach(detach);
			t216 = claim_text(li36_nodes, " y dirígete a ");
			strong37 = claim_element(li36_nodes, "STRONG", {});
			var strong37_nodes = children(strong37);
			t217 = claim_text(strong37_nodes, "Canales > Whatsapp");
			strong37_nodes.forEach(detach);
			t218 = claim_text(li36_nodes, ".");
			li36_nodes.forEach(detach);
			ul26_nodes.forEach(detach);
			t219 = claim_space(div17_nodes);
			img24 = claim_element(div17_nodes, "IMG", { src: true });
			t220 = claim_space(div17_nodes);
			ul27 = claim_element(div17_nodes, "UL", { class: true });
			var ul27_nodes = children(ul27);
			li37 = claim_element(ul27_nodes, "LI", { class: true });
			var li37_nodes = children(li37);
			t221 = claim_text(li37_nodes, "En ");
			strong38 = claim_element(li37_nodes, "STRONG", {});
			var strong38_nodes = children(strong38);
			t222 = claim_text(strong38_nodes, "“Token de acceso”");
			strong38_nodes.forEach(detach);
			t223 = claim_text(li37_nodes, " ingresa el token que generaste anteriormente en Meta Business > Usuarios de sistema. En ");
			strong39 = claim_element(li37_nodes, "STRONG", {});
			var strong39_nodes = children(strong39);
			t224 = claim_text(strong39_nodes, "“Número de teléfono”");
			strong39_nodes.forEach(detach);
			t225 = claim_text(li37_nodes, " ingresa el número que registraste en configuraciones de la API de Whatsapp. Finalmente, en ");
			strong40 = claim_element(li37_nodes, "STRONG", {});
			var strong40_nodes = children(strong40);
			t226 = claim_text(strong40_nodes, "“URL de Graph”");
			strong40_nodes.forEach(detach);
			t227 = claim_text(li37_nodes, " ingresa la URL que se proporciona en el “Paso 2: Enviar mensajes con la API” como se ve en la imagen debajo. Luego dale a clic en “Guardar”.");
			li37_nodes.forEach(detach);
			ul27_nodes.forEach(detach);
			t228 = claim_space(div17_nodes);
			img25 = claim_element(div17_nodes, "IMG", { src: true });
			t229 = claim_space(div17_nodes);
			ul28 = claim_element(div17_nodes, "UL", { class: true });
			var ul28_nodes = children(ul28);
			li38 = claim_element(ul28_nodes, "LI", { class: true });
			var li38_nodes = children(li38);
			t230 = claim_text(li38_nodes, "Esto generará una ");
			strong41 = claim_element(li38_nodes, "STRONG", {});
			var strong41_nodes = children(strong41);
			t231 = claim_text(strong41_nodes, "URL");
			strong41_nodes.forEach(detach);
			t232 = claim_text(li38_nodes, " y un ");
			strong42 = claim_element(li38_nodes, "STRONG", {});
			var strong42_nodes = children(strong42);
			t233 = claim_text(strong42_nodes, "Token de verificación");
			strong42_nodes.forEach(detach);
			t234 = claim_text(li38_nodes, " que deberás copiar.");
			li38_nodes.forEach(detach);
			t235 = claim_space(ul28_nodes);
			li39 = claim_element(ul28_nodes, "LI", { class: true });
			var li39_nodes = children(li39);
			t236 = claim_text(li39_nodes, "Vuelve a ");
			a10 = claim_element(li39_nodes, "A", { class: true, href: true, target: true });
			var a10_nodes = children(a10);
			t237 = claim_text(a10_nodes, "Meta Developers");
			a10_nodes.forEach(detach);
			t238 = claim_text(li39_nodes, " en ");
			strong43 = claim_element(li39_nodes, "STRONG", {});
			var strong43_nodes = children(strong43);
			t239 = claim_text(strong43_nodes, "Whatsapp > Configuración");
			strong43_nodes.forEach(detach);
			t240 = claim_text(li39_nodes, " y haz clic en ");
			strong44 = claim_element(li39_nodes, "STRONG", {});
			var strong44_nodes = children(strong44);
			t241 = claim_text(strong44_nodes, "“Editar”");
			strong44_nodes.forEach(detach);
			t242 = claim_text(li39_nodes, ".");
			li39_nodes.forEach(detach);
			ul28_nodes.forEach(detach);
			t243 = claim_space(div17_nodes);
			img26 = claim_element(div17_nodes, "IMG", { src: true });
			t244 = claim_space(div17_nodes);
			ul29 = claim_element(div17_nodes, "UL", { class: true });
			var ul29_nodes = children(ul29);
			li40 = claim_element(ul29_nodes, "LI", { class: true });
			var li40_nodes = children(li40);
			t245 = claim_text(li40_nodes, "Pega los datos anteriores copiados en los respectivos campos y haz clic en ");
			strong45 = claim_element(li40_nodes, "STRONG", {});
			var strong45_nodes = children(strong45);
			t246 = claim_text(strong45_nodes, "“Verificar y guardar”");
			strong45_nodes.forEach(detach);
			t247 = claim_text(li40_nodes, ".");
			li40_nodes.forEach(detach);
			ul29_nodes.forEach(detach);
			t248 = claim_space(div17_nodes);
			img27 = claim_element(div17_nodes, "IMG", { src: true });
			t249 = claim_space(div17_nodes);
			ul30 = claim_element(div17_nodes, "UL", { class: true });
			var ul30_nodes = children(ul30);
			li41 = claim_element(ul30_nodes, "LI", { class: true });
			var li41_nodes = children(li41);
			t250 = claim_text(li41_nodes, "Configura el campo de Webhook dándole clic en ");
			strong46 = claim_element(li41_nodes, "STRONG", {});
			var strong46_nodes = children(strong46);
			t251 = claim_text(strong46_nodes, "“Administrar”");
			strong46_nodes.forEach(detach);
			t252 = claim_text(li41_nodes, ".");
			li41_nodes.forEach(detach);
			ul30_nodes.forEach(detach);
			t253 = claim_space(div17_nodes);
			img28 = claim_element(div17_nodes, "IMG", { src: true });
			t254 = claim_space(div17_nodes);
			ul31 = claim_element(div17_nodes, "UL", { class: true });
			var ul31_nodes = children(ul31);
			li42 = claim_element(ul31_nodes, "LI", { class: true });
			var li42_nodes = children(li42);
			t255 = claim_text(li42_nodes, "Busca el campo ");
			strong47 = claim_element(li42_nodes, "STRONG", {});
			var strong47_nodes = children(strong47);
			t256 = claim_text(strong47_nodes, "\"messages\"");
			strong47_nodes.forEach(detach);
			t257 = claim_text(li42_nodes, " y suscríbete marcando la casilla. Luego, haz clic en “Listo”.");
			li42_nodes.forEach(detach);
			ul31_nodes.forEach(detach);
			t258 = claim_space(div17_nodes);
			img29 = claim_element(div17_nodes, "IMG", { src: true });
			div17_nodes.forEach(detach);
			t259 = claim_space(div19_nodes);
			div18 = claim_element(div19_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			p7 = claim_element(div18_nodes, "P", { class: true });
			var p7_nodes = children(p7);
			t260 = claim_text(p7_nodes, "Paso 8: Verifica el funcionamiento de tu chatbot en Whatsapp");
			p7_nodes.forEach(detach);
			t261 = claim_space(div18_nodes);
			p8 = claim_element(div18_nodes, "P", {});
			var p8_nodes = children(p8);
			t262 = claim_text(p8_nodes, "¡Felicidades! Tu chatbot ya está listo para asistir a clientes a través de tu número de WhatsApp. Verifica que está respondiendo correctamente según la base de datos que le cargaste. Puedes habilitar, deshabilitar, editar o eliminar los ajustes de integración de WhatsApp según lo necesites.");
			p8_nodes.forEach(detach);
			div18_nodes.forEach(detach);
			div19_nodes.forEach(detach);
			div20_nodes.forEach(detach);
			div21_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "menu-icon svelte-1lun2mi");
			attr(a0, "href", "/tutoriales/");
			attr(div1, "class", "item-icon svelte-1lun2mi");
			attr(div2, "class", "item");
			attr(div3, "class", "tutoriales svelte-1lun2mi");
			attr(div4, "class", "accordion svelte-1lun2mi");
			attr(div5, "class", "box1 svelte-1lun2mi");
			attr(a1, "href", "/tutoriales/");
			set_style(span1, "color", "var(--Primary-2, #7B5CF5)");
			attr(div6, "class", "steps svelte-1lun2mi");
			set_style(div6, "display", "flex");
			set_style(div6, "gap", "15px");
			set_style(div6, "margin-bottom", "20px");
			set_style(div6, "text-align", "center");
			set_style(div6, "color", "#C1C2C4");
			attr(div7, "class", "heading svelte-1lun2mi");
			attr(div8, "class", "heading-group svelte-1lun2mi");
			set_style(span2, "padding-top", "5px");
			attr(span3, "class", "infoText svelte-1lun2mi");
			attr(div9, "class", "information svelte-1lun2mi");
			attr(a2, "href", "https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers");
			attr(a2, "target", "_blank");
			set_style(a2, "text-decoration-line", "underline");
			set_style(a2, "display", "flex");
			set_style(a2, "justify-content", "end");
			set_style(a2, "width", "100%");
			set_style(a2, "color", "#603FDF");
			set_style(a2, "font-size", "16px");
			attr(div10, "class", "info svelte-1lun2mi");
			attr(p0, "class", "subtitle svelte-1lun2mi");
			attr(li0, "class", "svelte-1lun2mi");
			attr(li1, "class", "svelte-1lun2mi");
			attr(ul0, "class", "svelte-1lun2mi");
			attr(div11, "class", "paso1 svelte-1lun2mi");
			attr(p1, "class", "subtitle svelte-1lun2mi");
			attr(a3, "class", "link svelte-1lun2mi");
			attr(a3, "href", "https://business.facebook.com/");
			attr(a3, "target", "_blank");
			attr(li2, "class", "svelte-1lun2mi");
			attr(li3, "class", "svelte-1lun2mi");
			attr(li4, "class", "svelte-1lun2mi");
			attr(li5, "class", "svelte-1lun2mi");
			attr(ul1, "class", "svelte-1lun2mi");
			if (!src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[2].url)) attr(img0, "src", img0_src_value);
			attr(div12, "class", "paso1 svelte-1lun2mi");
			attr(p2, "class", "subtitle svelte-1lun2mi");
			attr(a4, "class", "link svelte-1lun2mi");
			attr(a4, "href", "https://developers.facebook.com/");
			attr(a4, "target", "_blank");
			attr(li6, "class", "svelte-1lun2mi");
			attr(li7, "class", "svelte-1lun2mi");
			attr(ul2, "class", "svelte-1lun2mi");
			if (!src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[3].url)) attr(img1, "src", img1_src_value);
			attr(li8, "class", "svelte-1lun2mi");
			attr(ul3, "class", "svelte-1lun2mi");
			if (!src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[4].url)) attr(img2, "src", img2_src_value);
			attr(li9, "class", "svelte-1lun2mi");
			attr(ul4, "class", "svelte-1lun2mi");
			if (!src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[5].url)) attr(img3, "src", img3_src_value);
			attr(li10, "class", "svelte-1lun2mi");
			attr(ul5, "class", "svelte-1lun2mi");
			if (!src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[6].url)) attr(img4, "src", img4_src_value);
			attr(li11, "class", "svelte-1lun2mi");
			attr(ul6, "class", "svelte-1lun2mi");
			if (!src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[7].url)) attr(img5, "src", img5_src_value);
			attr(div13, "class", "paso1 svelte-1lun2mi");
			attr(p3, "class", "subtitle svelte-1lun2mi");
			attr(li12, "class", "svelte-1lun2mi");
			attr(li13, "class", "svelte-1lun2mi");
			attr(ul7, "class", "svelte-1lun2mi");
			if (!src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[8].url)) attr(img6, "src", img6_src_value);
			attr(li14, "class", "svelte-1lun2mi");
			attr(ul8, "class", "svelte-1lun2mi");
			if (!src_url_equal(img7.src, img7_src_value = /*image8*/ ctx[9].url)) attr(img7, "src", img7_src_value);
			attr(a5, "class", "link svelte-1lun2mi");
			attr(a5, "href", "https://globot.ai/politicasprivacidad/");
			attr(a5, "target", "_blank");
			attr(li15, "class", "svelte-1lun2mi");
			attr(ul9, "class", "svelte-1lun2mi");
			if (!src_url_equal(img8.src, img8_src_value = /*image9*/ ctx[10].url)) attr(img8, "src", img8_src_value);
			attr(li16, "class", "svelte-1lun2mi");
			attr(ul10, "class", "svelte-1lun2mi");
			if (!src_url_equal(img9.src, img9_src_value = /*image10*/ ctx[12].url)) attr(img9, "src", img9_src_value);
			attr(div14, "class", "paso1 svelte-1lun2mi");
			attr(p4, "class", "subtitle svelte-1lun2mi");
			attr(a6, "class", "link svelte-1lun2mi");
			attr(a6, "href", "https://business.facebook.com/");
			attr(a6, "target", "_blank");
			attr(li17, "class", "svelte-1lun2mi");
			attr(li18, "class", "svelte-1lun2mi");
			attr(ul11, "class", "svelte-1lun2mi");
			if (!src_url_equal(img10.src, img10_src_value = /*image11*/ ctx[13].url)) attr(img10, "src", img10_src_value);
			attr(li19, "class", "svelte-1lun2mi");
			attr(ul12, "class", "svelte-1lun2mi");
			if (!src_url_equal(img11.src, img11_src_value = /*image12*/ ctx[14].url)) attr(img11, "src", img11_src_value);
			attr(li20, "class", "svelte-1lun2mi");
			attr(ul13, "class", "svelte-1lun2mi");
			if (!src_url_equal(img12.src, img12_src_value = /*image13*/ ctx[15].url)) attr(img12, "src", img12_src_value);
			attr(li21, "class", "svelte-1lun2mi");
			attr(ul14, "class", "svelte-1lun2mi");
			if (!src_url_equal(img13.src, img13_src_value = /*image14*/ ctx[16].url)) attr(img13, "src", img13_src_value);
			attr(li22, "class", "svelte-1lun2mi");
			attr(ul15, "class", "svelte-1lun2mi");
			if (!src_url_equal(img14.src, img14_src_value = /*image15*/ ctx[17].url)) attr(img14, "src", img14_src_value);
			attr(li23, "class", "svelte-1lun2mi");
			attr(ul16, "class", "svelte-1lun2mi");
			if (!src_url_equal(img15.src, img15_src_value = /*image16*/ ctx[18].url)) attr(img15, "src", img15_src_value);
			attr(li24, "class", "svelte-1lun2mi");
			attr(ul17, "class", "svelte-1lun2mi");
			if (!src_url_equal(img16.src, img16_src_value = /*image17*/ ctx[19].url)) attr(img16, "src", img16_src_value);
			attr(li25, "class", "svelte-1lun2mi");
			attr(ul18, "class", "svelte-1lun2mi");
			if (!src_url_equal(img17.src, img17_src_value = /*image18*/ ctx[20].url)) attr(img17, "src", img17_src_value);
			attr(div15, "class", "paso1 svelte-1lun2mi");
			attr(p5, "class", "subtitle svelte-1lun2mi");
			attr(a7, "class", "link svelte-1lun2mi");
			attr(a7, "href", "https://developers.facebook.com/");
			attr(a7, "target", "_blank");
			attr(li26, "class", "svelte-1lun2mi");
			attr(li27, "class", "svelte-1lun2mi");
			attr(ul19, "class", "svelte-1lun2mi");
			if (!src_url_equal(img18.src, img18_src_value = /*image19*/ ctx[21].url)) attr(img18, "src", img18_src_value);
			attr(li28, "class", "svelte-1lun2mi");
			attr(ul20, "class", "svelte-1lun2mi");
			if (!src_url_equal(img19.src, img19_src_value = /*image20*/ ctx[22].url)) attr(img19, "src", img19_src_value);
			attr(li29, "class", "svelte-1lun2mi");
			attr(ul21, "class", "svelte-1lun2mi");
			if (!src_url_equal(img20.src, img20_src_value = /*image21*/ ctx[23].url)) attr(img20, "src", img20_src_value);
			attr(li30, "class", "svelte-1lun2mi");
			attr(li31, "class", "svelte-1lun2mi");
			attr(ul22, "class", "svelte-1lun2mi");
			if (!src_url_equal(img21.src, img21_src_value = /*image22*/ ctx[24].url)) attr(img21, "src", img21_src_value);
			attr(a8, "class", "link svelte-1lun2mi");
			attr(a8, "href", "https://developers.facebook.com/docs/whatsapp/pricing/");
			attr(a8, "target", "_blank");
			attr(li32, "class", "svelte-1lun2mi");
			attr(ul23, "class", "svelte-1lun2mi");
			if (!src_url_equal(img22.src, img22_src_value = /*image23*/ ctx[25].url)) attr(img22, "src", img22_src_value);
			attr(li33, "class", "svelte-1lun2mi");
			attr(ul24, "class", "svelte-1lun2mi");
			if (!src_url_equal(img23.src, img23_src_value = /*image24*/ ctx[26].url)) attr(img23, "src", img23_src_value);
			attr(li34, "class", "svelte-1lun2mi");
			attr(li35, "class", "svelte-1lun2mi");
			attr(ul25, "class", "svelte-1lun2mi");
			attr(div16, "class", "paso1 svelte-1lun2mi");
			attr(p6, "class", "subtitle svelte-1lun2mi");
			attr(a9, "class", "link svelte-1lun2mi");
			attr(a9, "href", "https://backoffice.globot.ai/");
			attr(a9, "target", "_blank");
			attr(li36, "class", "svelte-1lun2mi");
			attr(ul26, "class", "svelte-1lun2mi");
			if (!src_url_equal(img24.src, img24_src_value = /*image25*/ ctx[27].url)) attr(img24, "src", img24_src_value);
			attr(li37, "class", "svelte-1lun2mi");
			attr(ul27, "class", "svelte-1lun2mi");
			if (!src_url_equal(img25.src, img25_src_value = /*image26*/ ctx[28].url)) attr(img25, "src", img25_src_value);
			attr(li38, "class", "svelte-1lun2mi");
			attr(a10, "class", "link svelte-1lun2mi");
			attr(a10, "href", "https://developers.facebook.com/");
			attr(a10, "target", "_blank");
			attr(li39, "class", "svelte-1lun2mi");
			attr(ul28, "class", "svelte-1lun2mi");
			if (!src_url_equal(img26.src, img26_src_value = /*image27*/ ctx[29].url)) attr(img26, "src", img26_src_value);
			attr(li40, "class", "svelte-1lun2mi");
			attr(ul29, "class", "svelte-1lun2mi");
			if (!src_url_equal(img27.src, img27_src_value = /*image28*/ ctx[30].url)) attr(img27, "src", img27_src_value);
			attr(li41, "class", "svelte-1lun2mi");
			attr(ul30, "class", "svelte-1lun2mi");
			if (!src_url_equal(img28.src, img28_src_value = /*image29*/ ctx[31].url)) attr(img28, "src", img28_src_value);
			attr(li42, "class", "svelte-1lun2mi");
			attr(ul31, "class", "svelte-1lun2mi");
			if (!src_url_equal(img29.src, img29_src_value = /*image30*/ ctx[32].url)) attr(img29, "src", img29_src_value);
			attr(div17, "class", "paso1 svelte-1lun2mi");
			attr(p7, "class", "subtitle svelte-1lun2mi");
			attr(div18, "class", "paso1 svelte-1lun2mi");
			attr(div19, "class", "content svelte-1lun2mi");
			attr(div20, "class", "box2 svelte-1lun2mi");
			attr(div21, "class", "section-container svelte-1lun2mi");
			attr(section, "class", "svelte-1lun2mi");
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
			append_hydration(span3, t15);
			append_hydration(div10, t16);
			append_hydration(div10, a2);
			append_hydration(a2, t17);
			append_hydration(div19, t18);
			append_hydration(div19, div11);
			append_hydration(div11, p0);
			append_hydration(p0, t19);
			append_hydration(div11, t20);
			append_hydration(div11, ul0);
			append_hydration(ul0, li0);
			append_hydration(li0, t21);
			append_hydration(ul0, t22);
			append_hydration(ul0, li1);
			append_hydration(li1, t23);
			append_hydration(li1, strong0);
			append_hydration(strong0, t24);
			append_hydration(li1, t25);
			append_hydration(li1, strong1);
			append_hydration(strong1, t26);
			append_hydration(li1, t27);
			append_hydration(div19, t28);
			append_hydration(div19, div12);
			append_hydration(div12, p1);
			append_hydration(p1, t29);
			append_hydration(div12, t30);
			append_hydration(div12, ul1);
			append_hydration(ul1, li2);
			append_hydration(li2, t31);
			append_hydration(li2, a3);
			append_hydration(a3, t32);
			append_hydration(li2, t33);
			append_hydration(ul1, t34);
			append_hydration(ul1, li3);
			append_hydration(li3, t35);
			append_hydration(li3, strong2);
			append_hydration(strong2, t36);
			append_hydration(li3, t37);
			append_hydration(ul1, t38);
			append_hydration(ul1, li4);
			append_hydration(li4, t39);
			append_hydration(ul1, t40);
			append_hydration(ul1, li5);
			append_hydration(li5, t41);
			append_hydration(div12, t42);
			append_hydration(div12, img0);
			append_hydration(div19, t43);
			append_hydration(div19, div13);
			append_hydration(div13, p2);
			append_hydration(p2, t44);
			append_hydration(div13, t45);
			append_hydration(div13, ul2);
			append_hydration(ul2, li6);
			append_hydration(li6, t46);
			append_hydration(li6, a4);
			append_hydration(a4, t47);
			append_hydration(li6, t48);
			append_hydration(ul2, t49);
			append_hydration(ul2, li7);
			append_hydration(li7, t50);
			append_hydration(li7, strong3);
			append_hydration(strong3, t51);
			append_hydration(li7, t52);
			append_hydration(div13, t53);
			append_hydration(div13, img1);
			append_hydration(div13, t54);
			append_hydration(div13, ul3);
			append_hydration(ul3, li8);
			append_hydration(li8, t55);
			append_hydration(li8, strong4);
			append_hydration(strong4, t56);
			append_hydration(li8, t57);
			append_hydration(div13, t58);
			append_hydration(div13, img2);
			append_hydration(div13, t59);
			append_hydration(div13, ul4);
			append_hydration(ul4, li9);
			append_hydration(li9, t60);
			append_hydration(li9, strong5);
			append_hydration(strong5, t61);
			append_hydration(li9, t62);
			append_hydration(div13, t63);
			append_hydration(div13, img3);
			append_hydration(div13, t64);
			append_hydration(div13, ul5);
			append_hydration(ul5, li10);
			append_hydration(li10, t65);
			append_hydration(li10, strong6);
			append_hydration(strong6, t66);
			append_hydration(li10, t67);
			append_hydration(div13, t68);
			append_hydration(div13, img4);
			append_hydration(div13, t69);
			append_hydration(div13, ul6);
			append_hydration(ul6, li11);
			append_hydration(li11, t70);
			append_hydration(div13, t71);
			append_hydration(div13, img5);
			append_hydration(div19, t72);
			append_hydration(div19, div14);
			append_hydration(div14, p3);
			append_hydration(p3, t73);
			append_hydration(div14, t74);
			append_hydration(div14, ul7);
			append_hydration(ul7, li12);
			append_hydration(li12, t75);
			append_hydration(li12, strong7);
			append_hydration(strong7, t76);
			append_hydration(li12, t77);
			append_hydration(ul7, t78);
			append_hydration(ul7, li13);
			append_hydration(li13, t79);
			append_hydration(li13, strong8);
			append_hydration(strong8, t80);
			append_hydration(li13, t81);
			append_hydration(li13, strong9);
			append_hydration(strong9, t82);
			append_hydration(li13, t83);
			append_hydration(div14, t84);
			append_hydration(div14, img6);
			append_hydration(div14, t85);
			append_hydration(div14, ul8);
			append_hydration(ul8, li14);
			append_hydration(li14, t86);
			append_hydration(div14, t87);
			append_hydration(div14, img7);
			append_hydration(div14, t88);
			append_hydration(div14, ul9);
			append_hydration(ul9, li15);
			append_hydration(li15, t89);
			append_hydration(li15, strong10);
			append_hydration(strong10, t90);
			append_hydration(li15, t91);
			append_hydration(li15, strong11);
			append_hydration(strong11, t92);
			append_hydration(li15, t93);
			append_hydration(li15, a5);
			append_hydration(a5, t94);
			append_hydration(li15, t95);
			append_hydration(div14, t96);
			append_hydration(div14, img8);
			append_hydration(div14, t97);
			append_hydration(div14, ul10);
			append_hydration(ul10, li16);
			append_hydration(li16, t98);
			append_hydration(li16, strong12);
			append_hydration(strong12, t99);
			append_hydration(li16, t100);
			append_hydration(div14, t101);
			append_hydration(div14, img9);
			append_hydration(div19, t102);
			append_hydration(div19, div15);
			append_hydration(div15, p4);
			append_hydration(p4, t103);
			append_hydration(div15, t104);
			append_hydration(div15, ul11);
			append_hydration(ul11, li17);
			append_hydration(li17, t105);
			append_hydration(li17, a6);
			append_hydration(a6, t106);
			append_hydration(li17, t107);
			append_hydration(ul11, t108);
			append_hydration(ul11, li18);
			append_hydration(li18, t109);
			append_hydration(li18, strong13);
			append_hydration(strong13, t110);
			append_hydration(li18, t111);
			append_hydration(div15, t112);
			append_hydration(div15, img10);
			append_hydration(div15, t113);
			append_hydration(div15, ul12);
			append_hydration(ul12, li19);
			append_hydration(li19, t114);
			append_hydration(li19, strong14);
			append_hydration(strong14, t115);
			append_hydration(li19, t116);
			append_hydration(li19, strong15);
			append_hydration(strong15, t117);
			append_hydration(li19, t118);
			append_hydration(li19, strong16);
			append_hydration(strong16, t119);
			append_hydration(li19, t120);
			append_hydration(div15, t121);
			append_hydration(div15, img11);
			append_hydration(div15, t122);
			append_hydration(div15, ul13);
			append_hydration(ul13, li20);
			append_hydration(li20, t123);
			append_hydration(li20, strong17);
			append_hydration(strong17, t124);
			append_hydration(li20, t125);
			append_hydration(li20, strong18);
			append_hydration(strong18, t126);
			append_hydration(li20, t127);
			append_hydration(div15, t128);
			append_hydration(div15, img12);
			append_hydration(div15, t129);
			append_hydration(div15, ul14);
			append_hydration(ul14, li21);
			append_hydration(li21, t130);
			append_hydration(li21, strong19);
			append_hydration(strong19, t131);
			append_hydration(li21, t132);
			append_hydration(div15, t133);
			append_hydration(div15, img13);
			append_hydration(div15, t134);
			append_hydration(div15, ul15);
			append_hydration(ul15, li22);
			append_hydration(li22, t135);
			append_hydration(li22, strong20);
			append_hydration(strong20, t136);
			append_hydration(li22, t137);
			append_hydration(li22, strong21);
			append_hydration(strong21, t138);
			append_hydration(li22, t139);
			append_hydration(li22, strong22);
			append_hydration(strong22, t140);
			append_hydration(li22, t141);
			append_hydration(div15, t142);
			append_hydration(div15, img14);
			append_hydration(div15, t143);
			append_hydration(div15, ul16);
			append_hydration(ul16, li23);
			append_hydration(li23, t144);
			append_hydration(li23, strong23);
			append_hydration(strong23, t145);
			append_hydration(li23, t146);
			append_hydration(div15, t147);
			append_hydration(div15, img15);
			append_hydration(div15, t148);
			append_hydration(div15, ul17);
			append_hydration(ul17, li24);
			append_hydration(li24, t149);
			append_hydration(li24, strong24);
			append_hydration(strong24, t150);
			append_hydration(li24, t151);
			append_hydration(li24, strong25);
			append_hydration(strong25, t152);
			append_hydration(li24, t153);
			append_hydration(li24, strong26);
			append_hydration(strong26, t154);
			append_hydration(li24, t155);
			append_hydration(li24, strong27);
			append_hydration(strong27, t156);
			append_hydration(li24, t157);
			append_hydration(li24, strong28);
			append_hydration(strong28, t158);
			append_hydration(li24, t159);
			append_hydration(div15, t160);
			append_hydration(div15, img16);
			append_hydration(div15, t161);
			append_hydration(div15, ul18);
			append_hydration(ul18, li25);
			append_hydration(li25, t162);
			append_hydration(li25, strong29);
			append_hydration(strong29, t163);
			append_hydration(li25, t164);
			append_hydration(div15, t165);
			append_hydration(div15, img17);
			append_hydration(div19, t166);
			append_hydration(div19, div16);
			append_hydration(div16, p5);
			append_hydration(p5, t167);
			append_hydration(div16, t168);
			append_hydration(div16, ul19);
			append_hydration(ul19, li26);
			append_hydration(li26, t169);
			append_hydration(li26, a7);
			append_hydration(a7, t170);
			append_hydration(li26, t171);
			append_hydration(ul19, t172);
			append_hydration(ul19, li27);
			append_hydration(li27, t173);
			append_hydration(li27, strong30);
			append_hydration(strong30, t174);
			append_hydration(li27, t175);
			append_hydration(div16, t176);
			append_hydration(div16, img18);
			append_hydration(div16, t177);
			append_hydration(div16, ul20);
			append_hydration(ul20, li28);
			append_hydration(li28, t178);
			append_hydration(li28, strong31);
			append_hydration(strong31, t179);
			append_hydration(li28, t180);
			append_hydration(div16, t181);
			append_hydration(div16, img19);
			append_hydration(div16, t182);
			append_hydration(div16, ul21);
			append_hydration(ul21, li29);
			append_hydration(li29, t183);
			append_hydration(div16, t184);
			append_hydration(div16, img20);
			append_hydration(div16, t185);
			append_hydration(div16, ul22);
			append_hydration(ul22, li30);
			append_hydration(li30, t186);
			append_hydration(ul22, t187);
			append_hydration(ul22, li31);
			append_hydration(li31, t188);
			append_hydration(li31, strong32);
			append_hydration(strong32, t189);
			append_hydration(li31, t190);
			append_hydration(div16, t191);
			append_hydration(div16, img21);
			append_hydration(div16, t192);
			append_hydration(div16, ul23);
			append_hydration(ul23, li32);
			append_hydration(li32, t193);
			append_hydration(li32, a8);
			append_hydration(a8, t194);
			append_hydration(li32, t195);
			append_hydration(div16, t196);
			append_hydration(div16, img22);
			append_hydration(div16, t197);
			append_hydration(div16, ul24);
			append_hydration(ul24, li33);
			append_hydration(li33, t198);
			append_hydration(li33, strong33);
			append_hydration(strong33, t199);
			append_hydration(li33, t200);
			append_hydration(div16, t201);
			append_hydration(div16, img23);
			append_hydration(div16, t202);
			append_hydration(div16, ul25);
			append_hydration(ul25, li34);
			append_hydration(li34, t203);
			append_hydration(li34, strong34);
			append_hydration(strong34, t204);
			append_hydration(ul25, t205);
			append_hydration(ul25, li35);
			append_hydration(li35, t206);
			append_hydration(li35, strong35);
			append_hydration(strong35, t207);
			append_hydration(li35, t208);
			append_hydration(li35, strong36);
			append_hydration(strong36, t209);
			append_hydration(li35, t210);
			append_hydration(div19, t211);
			append_hydration(div19, div17);
			append_hydration(div17, p6);
			append_hydration(p6, t212);
			append_hydration(div17, t213);
			append_hydration(div17, ul26);
			append_hydration(ul26, li36);
			append_hydration(li36, t214);
			append_hydration(li36, a9);
			append_hydration(a9, t215);
			append_hydration(li36, t216);
			append_hydration(li36, strong37);
			append_hydration(strong37, t217);
			append_hydration(li36, t218);
			append_hydration(div17, t219);
			append_hydration(div17, img24);
			append_hydration(div17, t220);
			append_hydration(div17, ul27);
			append_hydration(ul27, li37);
			append_hydration(li37, t221);
			append_hydration(li37, strong38);
			append_hydration(strong38, t222);
			append_hydration(li37, t223);
			append_hydration(li37, strong39);
			append_hydration(strong39, t224);
			append_hydration(li37, t225);
			append_hydration(li37, strong40);
			append_hydration(strong40, t226);
			append_hydration(li37, t227);
			append_hydration(div17, t228);
			append_hydration(div17, img25);
			append_hydration(div17, t229);
			append_hydration(div17, ul28);
			append_hydration(ul28, li38);
			append_hydration(li38, t230);
			append_hydration(li38, strong41);
			append_hydration(strong41, t231);
			append_hydration(li38, t232);
			append_hydration(li38, strong42);
			append_hydration(strong42, t233);
			append_hydration(li38, t234);
			append_hydration(ul28, t235);
			append_hydration(ul28, li39);
			append_hydration(li39, t236);
			append_hydration(li39, a10);
			append_hydration(a10, t237);
			append_hydration(li39, t238);
			append_hydration(li39, strong43);
			append_hydration(strong43, t239);
			append_hydration(li39, t240);
			append_hydration(li39, strong44);
			append_hydration(strong44, t241);
			append_hydration(li39, t242);
			append_hydration(div17, t243);
			append_hydration(div17, img26);
			append_hydration(div17, t244);
			append_hydration(div17, ul29);
			append_hydration(ul29, li40);
			append_hydration(li40, t245);
			append_hydration(li40, strong45);
			append_hydration(strong45, t246);
			append_hydration(li40, t247);
			append_hydration(div17, t248);
			append_hydration(div17, img27);
			append_hydration(div17, t249);
			append_hydration(div17, ul30);
			append_hydration(ul30, li41);
			append_hydration(li41, t250);
			append_hydration(li41, strong46);
			append_hydration(strong46, t251);
			append_hydration(li41, t252);
			append_hydration(div17, t253);
			append_hydration(div17, img28);
			append_hydration(div17, t254);
			append_hydration(div17, ul31);
			append_hydration(ul31, li42);
			append_hydration(li42, t255);
			append_hydration(li42, strong47);
			append_hydration(strong47, t256);
			append_hydration(li42, t257);
			append_hydration(div17, t258);
			append_hydration(div17, img29);
			append_hydration(div19, t259);
			append_hydration(div19, div18);
			append_hydration(div18, p7);
			append_hydration(p7, t260);
			append_hydration(div18, t261);
			append_hydration(div18, p8);
			append_hydration(p8, t262);
			current = true;
		},
		p(ctx, dirty) {
			if (dirty[0] & /*items*/ 2 | dirty[1] & /*activeItem, setActiveItem*/ 24) {
				each_value = /*items*/ ctx[1];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div4, outro_and_destroy_block, create_each_block, null, get_each_context);
				check_outros();
			}

			if (!current || dirty[0] & /*heading*/ 2048) set_data(t12, /*heading*/ ctx[11]);
			const icon1_changes = {};
			if (dirty[0] & /*icono*/ 1) icon1_changes.icon = /*icono*/ ctx[0];
			icon1.$set(icon1_changes);
			if (!current || dirty[1] & /*information*/ 4) set_data(t15, /*information*/ ctx[33]);

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

			if (!current || dirty[0] & /*image23*/ 33554432 && !src_url_equal(img22.src, img22_src_value = /*image23*/ ctx[25].url)) {
				attr(img22, "src", img22_src_value);
			}

			if (!current || dirty[0] & /*image24*/ 67108864 && !src_url_equal(img23.src, img23_src_value = /*image24*/ ctx[26].url)) {
				attr(img23, "src", img23_src_value);
			}

			if (!current || dirty[0] & /*image25*/ 134217728 && !src_url_equal(img24.src, img24_src_value = /*image25*/ ctx[27].url)) {
				attr(img24, "src", img24_src_value);
			}

			if (!current || dirty[0] & /*image26*/ 268435456 && !src_url_equal(img25.src, img25_src_value = /*image26*/ ctx[28].url)) {
				attr(img25, "src", img25_src_value);
			}

			if (!current || dirty[0] & /*image27*/ 536870912 && !src_url_equal(img26.src, img26_src_value = /*image27*/ ctx[29].url)) {
				attr(img26, "src", img26_src_value);
			}

			if (!current || dirty[0] & /*image28*/ 1073741824 && !src_url_equal(img27.src, img27_src_value = /*image28*/ ctx[30].url)) {
				attr(img27, "src", img27_src_value);
			}

			if (!current || dirty[1] & /*image29*/ 1 && !src_url_equal(img28.src, img28_src_value = /*image29*/ ctx[31].url)) {
				attr(img28, "src", img28_src_value);
			}

			if (!current || dirty[1] & /*image30*/ 2 && !src_url_equal(img29.src, img29_src_value = /*image30*/ ctx[32].url)) {
				attr(img29, "src", img29_src_value);
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
	let { information } = $$props;
	let activeItem = 0;

	function setActiveItem(i) {
		$$invalidate(34, activeItem = activeItem === i ? null : i);
	}

	const click_handler = i => setActiveItem(i);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(36, props = $$props.props);
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
		if ('image23' in $$props) $$invalidate(25, image23 = $$props.image23);
		if ('image24' in $$props) $$invalidate(26, image24 = $$props.image24);
		if ('image25' in $$props) $$invalidate(27, image25 = $$props.image25);
		if ('image26' in $$props) $$invalidate(28, image26 = $$props.image26);
		if ('image27' in $$props) $$invalidate(29, image27 = $$props.image27);
		if ('image28' in $$props) $$invalidate(30, image28 = $$props.image28);
		if ('image29' in $$props) $$invalidate(31, image29 = $$props.image29);
		if ('image30' in $$props) $$invalidate(32, image30 = $$props.image30);
		if ('information' in $$props) $$invalidate(33, information = $$props.information);
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
		image23,
		image24,
		image25,
		image26,
		image27,
		image28,
		image29,
		image30,
		information,
		activeItem,
		setActiveItem,
		props,
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
				props: 36,
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
				image23: 25,
				image24: 26,
				image25: 27,
				image26: 28,
				image27: 29,
				image28: 30,
				image29: 31,
				image30: 32,
				information: 33
			},
			null,
			[-1, -1]
		);
	}
}

export { Component as default };
