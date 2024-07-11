// New Block - Updated July 11, 2024
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
	child_ctx[22] = list[i];
	child_ctx[24] = i;
	return child_ctx;
}

// (205:10) {#if activeItem === i}
function create_if_block(ctx) {
	let div;
	let raw_value = /*item*/ ctx[22].description.html + "";
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
			attr(div, "class", "description svelte-cscos2");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			div.innerHTML = raw_value;
			current = true;
		},
		p(ctx, dirty) {
			if ((!current || dirty & /*items*/ 1) && raw_value !== (raw_value = /*item*/ ctx[22].description.html + "")) div.innerHTML = raw_value;		},
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

// (192:6) {#each items as item, i (i)}
function create_each_block(key_1, ctx) {
	let div3;
	let div1;
	let div0;
	let icon0;
	let t0;
	let button;
	let span0;
	let t1_value = /*item*/ ctx[22].title + "";
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
	icon0 = new Component$1({ props: { icon: "prime:comments" } });
	icon1 = new Component$1({ props: { icon: "ph:caret-down-bold" } });

	function click_handler() {
		return /*click_handler*/ ctx[21](/*i*/ ctx[24]);
	}

	let if_block = /*activeItem*/ ctx[18] === /*i*/ ctx[24] && create_if_block(ctx);

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
			attr(div0, "class", "menu-icon svelte-cscos2");
			attr(span0, "class", "svelte-cscos2");
			attr(span1, "class", "icone svelte-cscos2");
			attr(button, "class", "svelte-cscos2");
			attr(div1, "class", "item-icon svelte-cscos2");
			attr(div3, "class", "item svelte-cscos2");
			toggle_class(div3, "active", /*activeItem*/ ctx[18] === /*i*/ ctx[24]);
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
			if ((!current || dirty & /*items*/ 1) && t1_value !== (t1_value = /*item*/ ctx[22].title + "")) set_data(t1, t1_value);

			if (/*activeItem*/ ctx[18] === /*i*/ ctx[24]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*activeItem, items*/ 262145) {
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

			if (!current || dirty & /*activeItem, items*/ 262145) {
				toggle_class(div3, "active", /*activeItem*/ ctx[18] === /*i*/ ctx[24]);
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
	let div11;
	let div1;
	let div0;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let t2;
	let div10;
	let div2;
	let span0;
	let t3;
	let t4;
	let span1;
	let t5;
	let t6;
	let span2;
	let t7;
	let t8;
	let div4;
	let div3;
	let t9;
	let t10;
	let div9;
	let div5;
	let p0;
	let t11;
	let t12;
	let ul0;
	let li0;
	let t13;
	let strong0;
	let t14;
	let t15;
	let strong1;
	let t16;
	let t17;
	let strong2;
	let t18;
	let t19;
	let t20;
	let img0;
	let img0_src_value;
	let t21;
	let ul1;
	let li1;
	let t22;
	let t23;
	let div6;
	let p1;
	let t24;
	let t25;
	let ul2;
	let li2;
	let t26;
	let a0;
	let t27;
	let t28;
	let t29;
	let img1;
	let img1_src_value;
	let t30;
	let img2;
	let img2_src_value;
	let t31;
	let ul3;
	let li3;
	let t32;
	let t33;
	let img3;
	let img3_src_value;
	let t34;
	let ul4;
	let li4;
	let t35;
	let strong3;
	let t36;
	let t37;
	let strong4;
	let t38;
	let t39;
	let strong5;
	let t40;
	let t41;
	let t42;
	let img4;
	let img4_src_value;
	let t43;
	let img5;
	let img5_src_value;
	let t44;
	let ul5;
	let li5;
	let t45;
	let strong6;
	let t46;
	let t47;
	let t48;
	let img6;
	let img6_src_value;
	let t49;
	let ul6;
	let li6;
	let t50;
	let t51;
	let div7;
	let p2;
	let t52;
	let t53;
	let ul7;
	let li7;
	let t54;
	let a1;
	let t55;
	let t56;
	let strong7;
	let t57;
	let t58;
	let strong8;
	let t59;
	let t60;
	let strong9;
	let t61;
	let t62;
	let t63;
	let img7;
	let img7_src_value;
	let t64;
	let ul8;
	let li8;
	let t65;
	let strong10;
	let t66;
	let t67;
	let strong11;
	let t68;
	let t69;
	let t70;
	let img8;
	let img8_src_value;
	let t71;
	let ul9;
	let li9;
	let t72;
	let strong12;
	let t73;
	let t74;
	let t75;
	let img9;
	let img9_src_value;
	let t76;
	let ul10;
	let li10;
	let t77;
	let strong13;
	let t78;
	let t79;
	let t80;
	let img10;
	let img10_src_value;
	let t81;
	let ul11;
	let li11;
	let t82;
	let t83;
	let img11;
	let img11_src_value;
	let t84;
	let ul12;
	let li12;
	let t85;
	let strong14;
	let t86;
	let t87;
	let t88;
	let div8;
	let p3;
	let t89;
	let t90;
	let ul13;
	let li13;
	let t91;
	let strong15;
	let t92;
	let t93;
	let t94;
	let img12;
	let img12_src_value;
	let t95;
	let ul14;
	let li14;
	let t96;
	let strong16;
	let t97;
	let t98;
	let t99;
	let img13;
	let img13_src_value;
	let t100;
	let img14;
	let img14_src_value;
	let t101;
	let ul15;
	let li15;
	let t102;
	let strong17;
	let t103;
	let t104;
	let strong18;
	let t105;
	let t106;
	let strong19;
	let t107;
	let t108;
	let t109;
	let img15;
	let img15_src_value;
	let t110;
	let ul16;
	let li16;
	let t111;
	let current;
	let each_value = /*items*/ ctx[0];
	const get_key = ctx => /*i*/ ctx[24];

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c() {
			section = element("section");
			style = element("style");
			t0 = text("@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Roboto&display=swap');");
			t1 = space();
			div11 = element("div");
			div1 = element("div");
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t2 = space();
			div10 = element("div");
			div2 = element("div");
			span0 = element("span");
			t3 = text("Tutoriales");
			t4 = text(" > ");
			span1 = element("span");
			t5 = text("Integración canales");
			t6 = text(" > ");
			span2 = element("span");
			t7 = text("Instagram");
			t8 = space();
			div4 = element("div");
			div3 = element("div");
			t9 = text(/*heading*/ ctx[10]);
			t10 = space();
			div9 = element("div");
			div5 = element("div");
			p0 = element("p");
			t11 = text("Paso 1: Configura tu cuenta personal a cuenta profesional");
			t12 = space();
			ul0 = element("ul");
			li0 = element("li");
			t13 = text("Para conectar tu chatbot en tu cuenta de instagram, tu cuenta debe ser profesional. Para cambiarla debes acceder a ");
			strong0 = element("strong");
			t14 = text("“Configuraciones”");
			t15 = text(" en tu cuenta de instagram, luego ");
			strong1 = element("strong");
			t16 = text("“Tipo de cuentas y herramientas”");
			t17 = text(" y luego ");
			strong2 = element("strong");
			t18 = text("“Cambiar a cuenta profesional”");
			t19 = text(".");
			t20 = space();
			img0 = element("img");
			t21 = space();
			ul1 = element("ul");
			li1 = element("li");
			t22 = text("Sigue los pasos de Instagram y llena tu información de contacto.");
			t23 = space();
			div6 = element("div");
			p1 = element("p");
			t24 = text("Paso 2: Crea un portfolio comercial de Facebook");
			t25 = space();
			ul2 = element("ul");
			li2 = element("li");
			t26 = text("Ingresa a ");
			a0 = element("a");
			t27 = text("Meta Business");
			t28 = text(" y haz click en “Crear cuenta” para crear tu portfolio comercial. Una vez allí ingresa la información de tu negocio y verifica tu correo electrónico (Si ya tienes creado un portfolio comercial y verificado, ignora este paso)");
			t29 = space();
			img1 = element("img");
			t30 = space();
			img2 = element("img");
			t31 = space();
			ul3 = element("ul");
			li3 = element("li");
			t32 = text("Una vez confirmes tu correo electrónico e ingreses al link de Meta, llegarás a Configuraciones de tu portfolio comercial. Allí será necesario que verifiques tu portfolio, para poder realizar acciones de administración de cuentas.");
			t33 = space();
			img3 = element("img");
			t34 = space();
			ul4 = element("ul");
			li4 = element("li");
			t35 = text("Ingresa a ");
			strong3 = element("strong");
			t36 = text("“Información del negocio”");
			t37 = text("  y rellena los campos de contacto. Luego dirígete a ");
			strong4 = element("strong");
			t38 = text("“Centro de seguridad”");
			t39 = text("  y configura la autenticación de dos pasos con sus permisos. Ingresa a ");
			strong5 = element("strong");
			t40 = text("“Servicio de ayuda”");
			t41 = text("  para obtener más detalle sobre la verificación de tu cuenta.");
			t42 = space();
			img4 = element("img");
			t43 = space();
			img5 = element("img");
			t44 = space();
			ul5 = element("ul");
			li5 = element("li");
			t45 = text("Una vez en el centro de ayuda haz click en ");
			strong6 = element("strong");
			t46 = text("“Solicitar revisión”");
			t47 = text("  y sigue los pasos de Facebook para verificar tu portfolio comercial (Si tu cuenta ya ha sido verificada, ignora este paso)");
			t48 = space();
			img6 = element("img");
			t49 = space();
			ul6 = element("ul");
			li6 = element("li");
			t50 = text("La revisión puede durar un tiempo, luego de ser aceptada ya podrás tener funciones como conectar tu página de Facebook con tu cuenta de Instagram.");
			t51 = space();
			div7 = element("div");
			p2 = element("p");
			t52 = text("Paso 3: Vincula tu página de Facebook con tu perfil de Instagram en Meta Business Suite");
			t53 = space();
			ul7 = element("ul");
			li7 = element("li");
			t54 = text("Ingresa a ");
			a1 = element("a");
			t55 = text("Meta Business");
			t56 = text(" a ");
			strong7 = element("strong");
			t57 = text("Configuración");
			t58 = text(" de tu portfolio comercial recién creado (o al que tengas creado donde quieras administrar tus cuentas Meta). Dirígete a ");
			strong8 = element("strong");
			t59 = text("“Activos comerciales”");
			t60 = text(" y una vez allí selecciona ");
			strong9 = element("strong");
			t61 = text("Agregar activos");
			t62 = text(" en página de Facebook.");
			t63 = space();
			img7 = element("img");
			t64 = space();
			ul8 = element("ul");
			li8 = element("li");
			t65 = text("Puedes seleccionar una página ya creada seleccionando ");
			strong10 = element("strong");
			t66 = text("“Reclamar una página de Facebook existente”");
			t67 = text(" o ");
			strong11 = element("strong");
			t68 = text("“Crear una nueva página de Facebook”");
			t69 = text(" para tu cuenta de instagram.");
			t70 = space();
			img8 = element("img");
			t71 = space();
			ul9 = element("ul");
			li9 = element("li");
			t72 = text("Sigue los pasos para conectar tu página de Facebook, una vez agregada se visualizará como ");
			strong12 = element("strong");
			t73 = text("“Activo comercial”");
			t74 = text(".");
			t75 = space();
			img9 = element("img");
			t76 = space();
			ul10 = element("ul");
			li10 = element("li");
			t77 = text("Haz click en tu página recién agregar y luego click a ");
			strong13 = element("strong");
			t78 = text("“Conectar activos”");
			t79 = text(".");
			t80 = space();
			img10 = element("img");
			t81 = space();
			ul11 = element("ul");
			li11 = element("li");
			t82 = text("Sigue los pasos para conectar tu página de Facebook con tu cuenta de Instagram.");
			t83 = space();
			img11 = element("img");
			t84 = space();
			ul12 = element("ul");
			li12 = element("li");
			t85 = text("Una vez realizada la conexión, tu cuenta de instagram aparecerá en ");
			strong14 = element("strong");
			t86 = text("“Activos conectados”");
			t87 = text(" y ya podrás avanzar al siguiente paso.");
			t88 = space();
			div8 = element("div");
			p3 = element("p");
			t89 = text("Paso 4: Conecta tu chatbot con tu cuenta de Instagram en Globot");
			t90 = space();
			ul13 = element("ul");
			li13 = element("li");
			t91 = text("Inicia sesión en Globot, crea tu chatbot con la información que tendrá para responder y configúralo como desees. Ahora dirígete a ");
			strong15 = element("strong");
			t92 = text("“Canales”");
			t93 = text(".");
			t94 = space();
			img12 = element("img");
			t95 = space();
			ul14 = element("ul");
			li14 = element("li");
			t96 = text("Tienes 2 maneras de agregar tu chatbot en Instagram: La primera, conectando tu página de Facebook en el canal “Messenger” donde una vez seleccionada la página donde funcionará el chatbot se habilitará el botón en canal ");
			strong16 = element("strong");
			t97 = text("“Instagram”, “Detectar cuenta vinculada”");
			t98 = text(".");
			t99 = space();
			img13 = element("img");
			t100 = space();
			img14 = element("img");
			t101 = space();
			ul15 = element("ul");
			li15 = element("li");
			t102 = text("La segunda manera es desde el canal ");
			strong17 = element("strong");
			t103 = text("“Instagram”");
			t104 = text(" haciendo click en ");
			strong18 = element("strong");
			t105 = text("“Conectar con Facebook”");
			t106 = text(" dónde de igual manera deberás seleccionar tu página de Facebook antes parar detectar tu cuenta de instagram vinculada. De esta manera en canal ");
			strong19 = element("strong");
			t107 = text("“Messenger”");
			t108 = text(" quedará inhabilitado el chatbot a menos que tú lo habilites.");
			t109 = space();
			img15 = element("img");
			t110 = space();
			ul16 = element("ul");
			li16 = element("li");
			t111 = text("¡Listo! Ya completaste los pasos necesarios para integrar tu chatbot en tu cuenta de Instagram, verifica que esté funcionando correctamente.");
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
			div11 = claim_element(section_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			div1 = claim_element(div11_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div0_nodes);
			}

			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t2 = claim_space(div11_nodes);
			div10 = claim_element(div11_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div2 = claim_element(div10_nodes, "DIV", { class: true, style: true });
			var div2_nodes = children(div2);
			span0 = claim_element(div2_nodes, "SPAN", {});
			var span0_nodes = children(span0);
			t3 = claim_text(span0_nodes, "Tutoriales");
			span0_nodes.forEach(detach);
			t4 = claim_text(div2_nodes, " > ");
			span1 = claim_element(div2_nodes, "SPAN", {});
			var span1_nodes = children(span1);
			t5 = claim_text(span1_nodes, "Integración canales");
			span1_nodes.forEach(detach);
			t6 = claim_text(div2_nodes, " > ");
			span2 = claim_element(div2_nodes, "SPAN", { style: true });
			var span2_nodes = children(span2);
			t7 = claim_text(span2_nodes, "Instagram");
			span2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t8 = claim_space(div10_nodes);
			div4 = claim_element(div10_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			t9 = claim_text(div3_nodes, /*heading*/ ctx[10]);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t10 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div5 = claim_element(div9_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			p0 = claim_element(div5_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t11 = claim_text(p0_nodes, "Paso 1: Configura tu cuenta personal a cuenta profesional");
			p0_nodes.forEach(detach);
			t12 = claim_space(div5_nodes);
			ul0 = claim_element(div5_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);
			li0 = claim_element(ul0_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			t13 = claim_text(li0_nodes, "Para conectar tu chatbot en tu cuenta de instagram, tu cuenta debe ser profesional. Para cambiarla debes acceder a ");
			strong0 = claim_element(li0_nodes, "STRONG", {});
			var strong0_nodes = children(strong0);
			t14 = claim_text(strong0_nodes, "“Configuraciones”");
			strong0_nodes.forEach(detach);
			t15 = claim_text(li0_nodes, " en tu cuenta de instagram, luego ");
			strong1 = claim_element(li0_nodes, "STRONG", {});
			var strong1_nodes = children(strong1);
			t16 = claim_text(strong1_nodes, "“Tipo de cuentas y herramientas”");
			strong1_nodes.forEach(detach);
			t17 = claim_text(li0_nodes, " y luego ");
			strong2 = claim_element(li0_nodes, "STRONG", {});
			var strong2_nodes = children(strong2);
			t18 = claim_text(strong2_nodes, "“Cambiar a cuenta profesional”");
			strong2_nodes.forEach(detach);
			t19 = claim_text(li0_nodes, ".");
			li0_nodes.forEach(detach);
			ul0_nodes.forEach(detach);
			t20 = claim_space(div5_nodes);
			img0 = claim_element(div5_nodes, "IMG", { src: true });
			t21 = claim_space(div5_nodes);
			ul1 = claim_element(div5_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);
			li1 = claim_element(ul1_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			t22 = claim_text(li1_nodes, "Sigue los pasos de Instagram y llena tu información de contacto.");
			li1_nodes.forEach(detach);
			ul1_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t23 = claim_space(div9_nodes);
			div6 = claim_element(div9_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			p1 = claim_element(div6_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t24 = claim_text(p1_nodes, "Paso 2: Crea un portfolio comercial de Facebook");
			p1_nodes.forEach(detach);
			t25 = claim_space(div6_nodes);
			ul2 = claim_element(div6_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);
			li2 = claim_element(ul2_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			t26 = claim_text(li2_nodes, "Ingresa a ");
			a0 = claim_element(li2_nodes, "A", { class: true, href: true });
			var a0_nodes = children(a0);
			t27 = claim_text(a0_nodes, "Meta Business");
			a0_nodes.forEach(detach);
			t28 = claim_text(li2_nodes, " y haz click en “Crear cuenta” para crear tu portfolio comercial. Una vez allí ingresa la información de tu negocio y verifica tu correo electrónico (Si ya tienes creado un portfolio comercial y verificado, ignora este paso)");
			li2_nodes.forEach(detach);
			ul2_nodes.forEach(detach);
			t29 = claim_space(div6_nodes);
			img1 = claim_element(div6_nodes, "IMG", { src: true });
			t30 = claim_space(div6_nodes);
			img2 = claim_element(div6_nodes, "IMG", { src: true });
			t31 = claim_space(div6_nodes);
			ul3 = claim_element(div6_nodes, "UL", { class: true });
			var ul3_nodes = children(ul3);
			li3 = claim_element(ul3_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			t32 = claim_text(li3_nodes, "Una vez confirmes tu correo electrónico e ingreses al link de Meta, llegarás a Configuraciones de tu portfolio comercial. Allí será necesario que verifiques tu portfolio, para poder realizar acciones de administración de cuentas.");
			li3_nodes.forEach(detach);
			ul3_nodes.forEach(detach);
			t33 = claim_space(div6_nodes);
			img3 = claim_element(div6_nodes, "IMG", { src: true });
			t34 = claim_space(div6_nodes);
			ul4 = claim_element(div6_nodes, "UL", { class: true });
			var ul4_nodes = children(ul4);
			li4 = claim_element(ul4_nodes, "LI", { class: true });
			var li4_nodes = children(li4);
			t35 = claim_text(li4_nodes, "Ingresa a ");
			strong3 = claim_element(li4_nodes, "STRONG", {});
			var strong3_nodes = children(strong3);
			t36 = claim_text(strong3_nodes, "“Información del negocio”");
			strong3_nodes.forEach(detach);
			t37 = claim_text(li4_nodes, "  y rellena los campos de contacto. Luego dirígete a ");
			strong4 = claim_element(li4_nodes, "STRONG", {});
			var strong4_nodes = children(strong4);
			t38 = claim_text(strong4_nodes, "“Centro de seguridad”");
			strong4_nodes.forEach(detach);
			t39 = claim_text(li4_nodes, "  y configura la autenticación de dos pasos con sus permisos. Ingresa a ");
			strong5 = claim_element(li4_nodes, "STRONG", {});
			var strong5_nodes = children(strong5);
			t40 = claim_text(strong5_nodes, "“Servicio de ayuda”");
			strong5_nodes.forEach(detach);
			t41 = claim_text(li4_nodes, "  para obtener más detalle sobre la verificación de tu cuenta.");
			li4_nodes.forEach(detach);
			ul4_nodes.forEach(detach);
			t42 = claim_space(div6_nodes);
			img4 = claim_element(div6_nodes, "IMG", { src: true });
			t43 = claim_space(div6_nodes);
			img5 = claim_element(div6_nodes, "IMG", { src: true });
			t44 = claim_space(div6_nodes);
			ul5 = claim_element(div6_nodes, "UL", { class: true });
			var ul5_nodes = children(ul5);
			li5 = claim_element(ul5_nodes, "LI", { class: true });
			var li5_nodes = children(li5);
			t45 = claim_text(li5_nodes, "Una vez en el centro de ayuda haz click en ");
			strong6 = claim_element(li5_nodes, "STRONG", {});
			var strong6_nodes = children(strong6);
			t46 = claim_text(strong6_nodes, "“Solicitar revisión”");
			strong6_nodes.forEach(detach);
			t47 = claim_text(li5_nodes, "  y sigue los pasos de Facebook para verificar tu portfolio comercial (Si tu cuenta ya ha sido verificada, ignora este paso)");
			li5_nodes.forEach(detach);
			ul5_nodes.forEach(detach);
			t48 = claim_space(div6_nodes);
			img6 = claim_element(div6_nodes, "IMG", { src: true });
			t49 = claim_space(div6_nodes);
			ul6 = claim_element(div6_nodes, "UL", { class: true });
			var ul6_nodes = children(ul6);
			li6 = claim_element(ul6_nodes, "LI", { class: true });
			var li6_nodes = children(li6);
			t50 = claim_text(li6_nodes, "La revisión puede durar un tiempo, luego de ser aceptada ya podrás tener funciones como conectar tu página de Facebook con tu cuenta de Instagram.");
			li6_nodes.forEach(detach);
			ul6_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t51 = claim_space(div9_nodes);
			div7 = claim_element(div9_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			p2 = claim_element(div7_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t52 = claim_text(p2_nodes, "Paso 3: Vincula tu página de Facebook con tu perfil de Instagram en Meta Business Suite");
			p2_nodes.forEach(detach);
			t53 = claim_space(div7_nodes);
			ul7 = claim_element(div7_nodes, "UL", { class: true });
			var ul7_nodes = children(ul7);
			li7 = claim_element(ul7_nodes, "LI", { class: true });
			var li7_nodes = children(li7);
			t54 = claim_text(li7_nodes, "Ingresa a ");
			a1 = claim_element(li7_nodes, "A", { class: true, href: true });
			var a1_nodes = children(a1);
			t55 = claim_text(a1_nodes, "Meta Business");
			a1_nodes.forEach(detach);
			t56 = claim_text(li7_nodes, " a ");
			strong7 = claim_element(li7_nodes, "STRONG", {});
			var strong7_nodes = children(strong7);
			t57 = claim_text(strong7_nodes, "Configuración");
			strong7_nodes.forEach(detach);
			t58 = claim_text(li7_nodes, " de tu portfolio comercial recién creado (o al que tengas creado donde quieras administrar tus cuentas Meta). Dirígete a ");
			strong8 = claim_element(li7_nodes, "STRONG", {});
			var strong8_nodes = children(strong8);
			t59 = claim_text(strong8_nodes, "“Activos comerciales”");
			strong8_nodes.forEach(detach);
			t60 = claim_text(li7_nodes, " y una vez allí selecciona ");
			strong9 = claim_element(li7_nodes, "STRONG", {});
			var strong9_nodes = children(strong9);
			t61 = claim_text(strong9_nodes, "Agregar activos");
			strong9_nodes.forEach(detach);
			t62 = claim_text(li7_nodes, " en página de Facebook.");
			li7_nodes.forEach(detach);
			ul7_nodes.forEach(detach);
			t63 = claim_space(div7_nodes);
			img7 = claim_element(div7_nodes, "IMG", { src: true });
			t64 = claim_space(div7_nodes);
			ul8 = claim_element(div7_nodes, "UL", { class: true });
			var ul8_nodes = children(ul8);
			li8 = claim_element(ul8_nodes, "LI", { class: true });
			var li8_nodes = children(li8);
			t65 = claim_text(li8_nodes, "Puedes seleccionar una página ya creada seleccionando ");
			strong10 = claim_element(li8_nodes, "STRONG", {});
			var strong10_nodes = children(strong10);
			t66 = claim_text(strong10_nodes, "“Reclamar una página de Facebook existente”");
			strong10_nodes.forEach(detach);
			t67 = claim_text(li8_nodes, " o ");
			strong11 = claim_element(li8_nodes, "STRONG", {});
			var strong11_nodes = children(strong11);
			t68 = claim_text(strong11_nodes, "“Crear una nueva página de Facebook”");
			strong11_nodes.forEach(detach);
			t69 = claim_text(li8_nodes, " para tu cuenta de instagram.");
			li8_nodes.forEach(detach);
			ul8_nodes.forEach(detach);
			t70 = claim_space(div7_nodes);
			img8 = claim_element(div7_nodes, "IMG", { src: true });
			t71 = claim_space(div7_nodes);
			ul9 = claim_element(div7_nodes, "UL", { class: true });
			var ul9_nodes = children(ul9);
			li9 = claim_element(ul9_nodes, "LI", { class: true });
			var li9_nodes = children(li9);
			t72 = claim_text(li9_nodes, "Sigue los pasos para conectar tu página de Facebook, una vez agregada se visualizará como ");
			strong12 = claim_element(li9_nodes, "STRONG", {});
			var strong12_nodes = children(strong12);
			t73 = claim_text(strong12_nodes, "“Activo comercial”");
			strong12_nodes.forEach(detach);
			t74 = claim_text(li9_nodes, ".");
			li9_nodes.forEach(detach);
			ul9_nodes.forEach(detach);
			t75 = claim_space(div7_nodes);
			img9 = claim_element(div7_nodes, "IMG", { src: true });
			t76 = claim_space(div7_nodes);
			ul10 = claim_element(div7_nodes, "UL", { class: true });
			var ul10_nodes = children(ul10);
			li10 = claim_element(ul10_nodes, "LI", { class: true });
			var li10_nodes = children(li10);
			t77 = claim_text(li10_nodes, "Haz click en tu página recién agregar y luego click a ");
			strong13 = claim_element(li10_nodes, "STRONG", {});
			var strong13_nodes = children(strong13);
			t78 = claim_text(strong13_nodes, "“Conectar activos”");
			strong13_nodes.forEach(detach);
			t79 = claim_text(li10_nodes, ".");
			li10_nodes.forEach(detach);
			ul10_nodes.forEach(detach);
			t80 = claim_space(div7_nodes);
			img10 = claim_element(div7_nodes, "IMG", { src: true });
			t81 = claim_space(div7_nodes);
			ul11 = claim_element(div7_nodes, "UL", { class: true });
			var ul11_nodes = children(ul11);
			li11 = claim_element(ul11_nodes, "LI", { class: true });
			var li11_nodes = children(li11);
			t82 = claim_text(li11_nodes, "Sigue los pasos para conectar tu página de Facebook con tu cuenta de Instagram.");
			li11_nodes.forEach(detach);
			ul11_nodes.forEach(detach);
			t83 = claim_space(div7_nodes);
			img11 = claim_element(div7_nodes, "IMG", { src: true });
			t84 = claim_space(div7_nodes);
			ul12 = claim_element(div7_nodes, "UL", { class: true });
			var ul12_nodes = children(ul12);
			li12 = claim_element(ul12_nodes, "LI", { class: true });
			var li12_nodes = children(li12);
			t85 = claim_text(li12_nodes, "Una vez realizada la conexión, tu cuenta de instagram aparecerá en ");
			strong14 = claim_element(li12_nodes, "STRONG", {});
			var strong14_nodes = children(strong14);
			t86 = claim_text(strong14_nodes, "“Activos conectados”");
			strong14_nodes.forEach(detach);
			t87 = claim_text(li12_nodes, " y ya podrás avanzar al siguiente paso.");
			li12_nodes.forEach(detach);
			ul12_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t88 = claim_space(div9_nodes);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			p3 = claim_element(div8_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t89 = claim_text(p3_nodes, "Paso 4: Conecta tu chatbot con tu cuenta de Instagram en Globot");
			p3_nodes.forEach(detach);
			t90 = claim_space(div8_nodes);
			ul13 = claim_element(div8_nodes, "UL", { class: true });
			var ul13_nodes = children(ul13);
			li13 = claim_element(ul13_nodes, "LI", { class: true });
			var li13_nodes = children(li13);
			t91 = claim_text(li13_nodes, "Inicia sesión en Globot, crea tu chatbot con la información que tendrá para responder y configúralo como desees. Ahora dirígete a ");
			strong15 = claim_element(li13_nodes, "STRONG", {});
			var strong15_nodes = children(strong15);
			t92 = claim_text(strong15_nodes, "“Canales”");
			strong15_nodes.forEach(detach);
			t93 = claim_text(li13_nodes, ".");
			li13_nodes.forEach(detach);
			ul13_nodes.forEach(detach);
			t94 = claim_space(div8_nodes);
			img12 = claim_element(div8_nodes, "IMG", { src: true });
			t95 = claim_space(div8_nodes);
			ul14 = claim_element(div8_nodes, "UL", { class: true });
			var ul14_nodes = children(ul14);
			li14 = claim_element(ul14_nodes, "LI", { class: true });
			var li14_nodes = children(li14);
			t96 = claim_text(li14_nodes, "Tienes 2 maneras de agregar tu chatbot en Instagram: La primera, conectando tu página de Facebook en el canal “Messenger” donde una vez seleccionada la página donde funcionará el chatbot se habilitará el botón en canal ");
			strong16 = claim_element(li14_nodes, "STRONG", {});
			var strong16_nodes = children(strong16);
			t97 = claim_text(strong16_nodes, "“Instagram”, “Detectar cuenta vinculada”");
			strong16_nodes.forEach(detach);
			t98 = claim_text(li14_nodes, ".");
			li14_nodes.forEach(detach);
			ul14_nodes.forEach(detach);
			t99 = claim_space(div8_nodes);
			img13 = claim_element(div8_nodes, "IMG", { src: true });
			t100 = claim_space(div8_nodes);
			img14 = claim_element(div8_nodes, "IMG", { src: true });
			t101 = claim_space(div8_nodes);
			ul15 = claim_element(div8_nodes, "UL", { class: true });
			var ul15_nodes = children(ul15);
			li15 = claim_element(ul15_nodes, "LI", { class: true });
			var li15_nodes = children(li15);
			t102 = claim_text(li15_nodes, "La segunda manera es desde el canal ");
			strong17 = claim_element(li15_nodes, "STRONG", {});
			var strong17_nodes = children(strong17);
			t103 = claim_text(strong17_nodes, "“Instagram”");
			strong17_nodes.forEach(detach);
			t104 = claim_text(li15_nodes, " haciendo click en ");
			strong18 = claim_element(li15_nodes, "STRONG", {});
			var strong18_nodes = children(strong18);
			t105 = claim_text(strong18_nodes, "“Conectar con Facebook”");
			strong18_nodes.forEach(detach);
			t106 = claim_text(li15_nodes, " dónde de igual manera deberás seleccionar tu página de Facebook antes parar detectar tu cuenta de instagram vinculada. De esta manera en canal ");
			strong19 = claim_element(li15_nodes, "STRONG", {});
			var strong19_nodes = children(strong19);
			t107 = claim_text(strong19_nodes, "“Messenger”");
			strong19_nodes.forEach(detach);
			t108 = claim_text(li15_nodes, " quedará inhabilitado el chatbot a menos que tú lo habilites.");
			li15_nodes.forEach(detach);
			ul15_nodes.forEach(detach);
			t109 = claim_space(div8_nodes);
			img15 = claim_element(div8_nodes, "IMG", { src: true });
			t110 = claim_space(div8_nodes);
			ul16 = claim_element(div8_nodes, "UL", { class: true });
			var ul16_nodes = children(ul16);
			li16 = claim_element(ul16_nodes, "LI", { class: true });
			var li16_nodes = children(li16);
			t111 = claim_text(li16_nodes, "¡Listo! Ya completaste los pasos necesarios para integrar tu chatbot en tu cuenta de Instagram, verifica que esté funcionando correctamente.");
			li16_nodes.forEach(detach);
			ul16_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "accordion svelte-cscos2");
			attr(div1, "class", "box1 svelte-cscos2");
			set_style(span2, "color", "var(--Primary-2, #7B5CF5)");
			attr(div2, "class", "steps svelte-cscos2");
			set_style(div2, "display", "flex");
			set_style(div2, "gap", "15px");
			set_style(div2, "margin-bottom", "20px");
			set_style(div2, "text-align", "center");
			set_style(div2, "color", "#C1C2C4");
			attr(div3, "class", "heading svelte-cscos2");
			attr(div4, "class", "heading-group svelte-cscos2");
			attr(p0, "class", "subtitle svelte-cscos2");
			attr(li0, "class", "svelte-cscos2");
			attr(ul0, "class", "svelte-cscos2");
			if (!src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[1].url)) attr(img0, "src", img0_src_value);
			attr(li1, "class", "svelte-cscos2");
			attr(ul1, "class", "svelte-cscos2");
			attr(div5, "class", "paso1 svelte-cscos2");
			attr(p1, "class", "subtitle svelte-cscos2");
			attr(a0, "class", "link svelte-cscos2");
			attr(a0, "href", "https://business.facebook.com/");
			attr(li2, "class", "svelte-cscos2");
			attr(ul2, "class", "svelte-cscos2");
			if (!src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[2].url)) attr(img1, "src", img1_src_value);
			if (!src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[3].url)) attr(img2, "src", img2_src_value);
			attr(li3, "class", "svelte-cscos2");
			attr(ul3, "class", "svelte-cscos2");
			if (!src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[4].url)) attr(img3, "src", img3_src_value);
			attr(li4, "class", "svelte-cscos2");
			attr(ul4, "class", "svelte-cscos2");
			if (!src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[5].url)) attr(img4, "src", img4_src_value);
			if (!src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[6].url)) attr(img5, "src", img5_src_value);
			attr(li5, "class", "svelte-cscos2");
			attr(ul5, "class", "svelte-cscos2");
			if (!src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[7].url)) attr(img6, "src", img6_src_value);
			attr(li6, "class", "svelte-cscos2");
			attr(ul6, "class", "svelte-cscos2");
			attr(div6, "class", "paso1 svelte-cscos2");
			attr(p2, "class", "subtitle svelte-cscos2");
			attr(a1, "class", "link svelte-cscos2");
			attr(a1, "href", "https://business.facebook.com/");
			attr(li7, "class", "svelte-cscos2");
			attr(ul7, "class", "svelte-cscos2");
			if (!src_url_equal(img7.src, img7_src_value = /*image8*/ ctx[8].url)) attr(img7, "src", img7_src_value);
			attr(li8, "class", "svelte-cscos2");
			attr(ul8, "class", "svelte-cscos2");
			if (!src_url_equal(img8.src, img8_src_value = /*image9*/ ctx[9].url)) attr(img8, "src", img8_src_value);
			attr(li9, "class", "svelte-cscos2");
			attr(ul9, "class", "svelte-cscos2");
			if (!src_url_equal(img9.src, img9_src_value = /*image10*/ ctx[11].url)) attr(img9, "src", img9_src_value);
			attr(li10, "class", "svelte-cscos2");
			attr(ul10, "class", "svelte-cscos2");
			if (!src_url_equal(img10.src, img10_src_value = /*image11*/ ctx[12].url)) attr(img10, "src", img10_src_value);
			attr(li11, "class", "svelte-cscos2");
			attr(ul11, "class", "svelte-cscos2");
			if (!src_url_equal(img11.src, img11_src_value = /*image12*/ ctx[13].url)) attr(img11, "src", img11_src_value);
			attr(li12, "class", "svelte-cscos2");
			attr(ul12, "class", "svelte-cscos2");
			attr(div7, "class", "paso1 svelte-cscos2");
			attr(p3, "class", "subtitle svelte-cscos2");
			attr(li13, "class", "svelte-cscos2");
			attr(ul13, "class", "svelte-cscos2");
			if (!src_url_equal(img12.src, img12_src_value = /*image13*/ ctx[14].url)) attr(img12, "src", img12_src_value);
			attr(li14, "class", "svelte-cscos2");
			attr(ul14, "class", "svelte-cscos2");
			if (!src_url_equal(img13.src, img13_src_value = /*image14*/ ctx[15].url)) attr(img13, "src", img13_src_value);
			if (!src_url_equal(img14.src, img14_src_value = /*image15*/ ctx[16].url)) attr(img14, "src", img14_src_value);
			attr(li15, "class", "svelte-cscos2");
			attr(ul15, "class", "svelte-cscos2");
			if (!src_url_equal(img15.src, img15_src_value = /*image16*/ ctx[17].url)) attr(img15, "src", img15_src_value);
			attr(li16, "class", "svelte-cscos2");
			attr(ul16, "class", "svelte-cscos2");
			attr(div8, "class", "paso1 svelte-cscos2");
			attr(div9, "class", "content svelte-cscos2");
			attr(div10, "class", "box2 svelte-cscos2");
			attr(div11, "class", "section-container svelte-cscos2");
			attr(section, "class", "svelte-cscos2");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, style);
			append_hydration(style, t0);
			append_hydration(section, t1);
			append_hydration(section, div11);
			append_hydration(div11, div1);
			append_hydration(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}

			append_hydration(div11, t2);
			append_hydration(div11, div10);
			append_hydration(div10, div2);
			append_hydration(div2, span0);
			append_hydration(span0, t3);
			append_hydration(div2, t4);
			append_hydration(div2, span1);
			append_hydration(span1, t5);
			append_hydration(div2, t6);
			append_hydration(div2, span2);
			append_hydration(span2, t7);
			append_hydration(div10, t8);
			append_hydration(div10, div4);
			append_hydration(div4, div3);
			append_hydration(div3, t9);
			append_hydration(div10, t10);
			append_hydration(div10, div9);
			append_hydration(div9, div5);
			append_hydration(div5, p0);
			append_hydration(p0, t11);
			append_hydration(div5, t12);
			append_hydration(div5, ul0);
			append_hydration(ul0, li0);
			append_hydration(li0, t13);
			append_hydration(li0, strong0);
			append_hydration(strong0, t14);
			append_hydration(li0, t15);
			append_hydration(li0, strong1);
			append_hydration(strong1, t16);
			append_hydration(li0, t17);
			append_hydration(li0, strong2);
			append_hydration(strong2, t18);
			append_hydration(li0, t19);
			append_hydration(div5, t20);
			append_hydration(div5, img0);
			append_hydration(div5, t21);
			append_hydration(div5, ul1);
			append_hydration(ul1, li1);
			append_hydration(li1, t22);
			append_hydration(div9, t23);
			append_hydration(div9, div6);
			append_hydration(div6, p1);
			append_hydration(p1, t24);
			append_hydration(div6, t25);
			append_hydration(div6, ul2);
			append_hydration(ul2, li2);
			append_hydration(li2, t26);
			append_hydration(li2, a0);
			append_hydration(a0, t27);
			append_hydration(li2, t28);
			append_hydration(div6, t29);
			append_hydration(div6, img1);
			append_hydration(div6, t30);
			append_hydration(div6, img2);
			append_hydration(div6, t31);
			append_hydration(div6, ul3);
			append_hydration(ul3, li3);
			append_hydration(li3, t32);
			append_hydration(div6, t33);
			append_hydration(div6, img3);
			append_hydration(div6, t34);
			append_hydration(div6, ul4);
			append_hydration(ul4, li4);
			append_hydration(li4, t35);
			append_hydration(li4, strong3);
			append_hydration(strong3, t36);
			append_hydration(li4, t37);
			append_hydration(li4, strong4);
			append_hydration(strong4, t38);
			append_hydration(li4, t39);
			append_hydration(li4, strong5);
			append_hydration(strong5, t40);
			append_hydration(li4, t41);
			append_hydration(div6, t42);
			append_hydration(div6, img4);
			append_hydration(div6, t43);
			append_hydration(div6, img5);
			append_hydration(div6, t44);
			append_hydration(div6, ul5);
			append_hydration(ul5, li5);
			append_hydration(li5, t45);
			append_hydration(li5, strong6);
			append_hydration(strong6, t46);
			append_hydration(li5, t47);
			append_hydration(div6, t48);
			append_hydration(div6, img6);
			append_hydration(div6, t49);
			append_hydration(div6, ul6);
			append_hydration(ul6, li6);
			append_hydration(li6, t50);
			append_hydration(div9, t51);
			append_hydration(div9, div7);
			append_hydration(div7, p2);
			append_hydration(p2, t52);
			append_hydration(div7, t53);
			append_hydration(div7, ul7);
			append_hydration(ul7, li7);
			append_hydration(li7, t54);
			append_hydration(li7, a1);
			append_hydration(a1, t55);
			append_hydration(li7, t56);
			append_hydration(li7, strong7);
			append_hydration(strong7, t57);
			append_hydration(li7, t58);
			append_hydration(li7, strong8);
			append_hydration(strong8, t59);
			append_hydration(li7, t60);
			append_hydration(li7, strong9);
			append_hydration(strong9, t61);
			append_hydration(li7, t62);
			append_hydration(div7, t63);
			append_hydration(div7, img7);
			append_hydration(div7, t64);
			append_hydration(div7, ul8);
			append_hydration(ul8, li8);
			append_hydration(li8, t65);
			append_hydration(li8, strong10);
			append_hydration(strong10, t66);
			append_hydration(li8, t67);
			append_hydration(li8, strong11);
			append_hydration(strong11, t68);
			append_hydration(li8, t69);
			append_hydration(div7, t70);
			append_hydration(div7, img8);
			append_hydration(div7, t71);
			append_hydration(div7, ul9);
			append_hydration(ul9, li9);
			append_hydration(li9, t72);
			append_hydration(li9, strong12);
			append_hydration(strong12, t73);
			append_hydration(li9, t74);
			append_hydration(div7, t75);
			append_hydration(div7, img9);
			append_hydration(div7, t76);
			append_hydration(div7, ul10);
			append_hydration(ul10, li10);
			append_hydration(li10, t77);
			append_hydration(li10, strong13);
			append_hydration(strong13, t78);
			append_hydration(li10, t79);
			append_hydration(div7, t80);
			append_hydration(div7, img10);
			append_hydration(div7, t81);
			append_hydration(div7, ul11);
			append_hydration(ul11, li11);
			append_hydration(li11, t82);
			append_hydration(div7, t83);
			append_hydration(div7, img11);
			append_hydration(div7, t84);
			append_hydration(div7, ul12);
			append_hydration(ul12, li12);
			append_hydration(li12, t85);
			append_hydration(li12, strong14);
			append_hydration(strong14, t86);
			append_hydration(li12, t87);
			append_hydration(div9, t88);
			append_hydration(div9, div8);
			append_hydration(div8, p3);
			append_hydration(p3, t89);
			append_hydration(div8, t90);
			append_hydration(div8, ul13);
			append_hydration(ul13, li13);
			append_hydration(li13, t91);
			append_hydration(li13, strong15);
			append_hydration(strong15, t92);
			append_hydration(li13, t93);
			append_hydration(div8, t94);
			append_hydration(div8, img12);
			append_hydration(div8, t95);
			append_hydration(div8, ul14);
			append_hydration(ul14, li14);
			append_hydration(li14, t96);
			append_hydration(li14, strong16);
			append_hydration(strong16, t97);
			append_hydration(li14, t98);
			append_hydration(div8, t99);
			append_hydration(div8, img13);
			append_hydration(div8, t100);
			append_hydration(div8, img14);
			append_hydration(div8, t101);
			append_hydration(div8, ul15);
			append_hydration(ul15, li15);
			append_hydration(li15, t102);
			append_hydration(li15, strong17);
			append_hydration(strong17, t103);
			append_hydration(li15, t104);
			append_hydration(li15, strong18);
			append_hydration(strong18, t105);
			append_hydration(li15, t106);
			append_hydration(li15, strong19);
			append_hydration(strong19, t107);
			append_hydration(li15, t108);
			append_hydration(div8, t109);
			append_hydration(div8, img15);
			append_hydration(div8, t110);
			append_hydration(div8, ul16);
			append_hydration(ul16, li16);
			append_hydration(li16, t111);
			current = true;
		},
		p(ctx, [dirty]) {
			if (dirty & /*activeItem, items, setActiveItem*/ 786433) {
				each_value = /*items*/ ctx[0];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div0, outro_and_destroy_block, create_each_block, null, get_each_context);
				check_outros();
			}

			if (!current || dirty & /*heading*/ 1024) set_data(t9, /*heading*/ ctx[10]);

			if (!current || dirty & /*image1*/ 2 && !src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[1].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (!current || dirty & /*image2*/ 4 && !src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[2].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (!current || dirty & /*image3*/ 8 && !src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[3].url)) {
				attr(img2, "src", img2_src_value);
			}

			if (!current || dirty & /*image4*/ 16 && !src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[4].url)) {
				attr(img3, "src", img3_src_value);
			}

			if (!current || dirty & /*image5*/ 32 && !src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[5].url)) {
				attr(img4, "src", img4_src_value);
			}

			if (!current || dirty & /*image6*/ 64 && !src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[6].url)) {
				attr(img5, "src", img5_src_value);
			}

			if (!current || dirty & /*image7*/ 128 && !src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[7].url)) {
				attr(img6, "src", img6_src_value);
			}

			if (!current || dirty & /*image8*/ 256 && !src_url_equal(img7.src, img7_src_value = /*image8*/ ctx[8].url)) {
				attr(img7, "src", img7_src_value);
			}

			if (!current || dirty & /*image9*/ 512 && !src_url_equal(img8.src, img8_src_value = /*image9*/ ctx[9].url)) {
				attr(img8, "src", img8_src_value);
			}

			if (!current || dirty & /*image10*/ 2048 && !src_url_equal(img9.src, img9_src_value = /*image10*/ ctx[11].url)) {
				attr(img9, "src", img9_src_value);
			}

			if (!current || dirty & /*image11*/ 4096 && !src_url_equal(img10.src, img10_src_value = /*image11*/ ctx[12].url)) {
				attr(img10, "src", img10_src_value);
			}

			if (!current || dirty & /*image12*/ 8192 && !src_url_equal(img11.src, img11_src_value = /*image12*/ ctx[13].url)) {
				attr(img11, "src", img11_src_value);
			}

			if (!current || dirty & /*image13*/ 16384 && !src_url_equal(img12.src, img12_src_value = /*image13*/ ctx[14].url)) {
				attr(img12, "src", img12_src_value);
			}

			if (!current || dirty & /*image14*/ 32768 && !src_url_equal(img13.src, img13_src_value = /*image14*/ ctx[15].url)) {
				attr(img13, "src", img13_src_value);
			}

			if (!current || dirty & /*image15*/ 65536 && !src_url_equal(img14.src, img14_src_value = /*image15*/ ctx[16].url)) {
				attr(img14, "src", img14_src_value);
			}

			if (!current || dirty & /*image16*/ 131072 && !src_url_equal(img15.src, img15_src_value = /*image16*/ ctx[17].url)) {
				attr(img15, "src", img15_src_value);
			}
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(section);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
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
	let activeItem = 0;

	function setActiveItem(i) {
		$$invalidate(18, activeItem = activeItem === i ? null : i);
	}

	const click_handler = i => setActiveItem(i);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(20, props = $$props.props);
		if ('items' in $$props) $$invalidate(0, items = $$props.items);
		if ('image1' in $$props) $$invalidate(1, image1 = $$props.image1);
		if ('image2' in $$props) $$invalidate(2, image2 = $$props.image2);
		if ('image3' in $$props) $$invalidate(3, image3 = $$props.image3);
		if ('image4' in $$props) $$invalidate(4, image4 = $$props.image4);
		if ('image5' in $$props) $$invalidate(5, image5 = $$props.image5);
		if ('image6' in $$props) $$invalidate(6, image6 = $$props.image6);
		if ('image7' in $$props) $$invalidate(7, image7 = $$props.image7);
		if ('image8' in $$props) $$invalidate(8, image8 = $$props.image8);
		if ('image9' in $$props) $$invalidate(9, image9 = $$props.image9);
		if ('heading' in $$props) $$invalidate(10, heading = $$props.heading);
		if ('image10' in $$props) $$invalidate(11, image10 = $$props.image10);
		if ('image11' in $$props) $$invalidate(12, image11 = $$props.image11);
		if ('image12' in $$props) $$invalidate(13, image12 = $$props.image12);
		if ('image13' in $$props) $$invalidate(14, image13 = $$props.image13);
		if ('image14' in $$props) $$invalidate(15, image14 = $$props.image14);
		if ('image15' in $$props) $$invalidate(16, image15 = $$props.image15);
		if ('image16' in $$props) $$invalidate(17, image16 = $$props.image16);
	};

	return [
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
		activeItem,
		setActiveItem,
		props,
		click_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 20,
			items: 0,
			image1: 1,
			image2: 2,
			image3: 3,
			image4: 4,
			image5: 5,
			image6: 6,
			image7: 7,
			image8: 8,
			image9: 9,
			heading: 10,
			image10: 11,
			image11: 12,
			image12: 13,
			image13: 14,
			image14: 15,
			image15: 16,
			image16: 17
		});
	}
}

export { Component as default };
