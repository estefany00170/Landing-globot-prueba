// carrusel prensa - Updated September 24, 2024
function noop() { }
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
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
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

/* generated by Svelte v3.59.1 */

function create_fragment(ctx) {
	let section;
	let div1;
	let h2;
	let t0;
	let t1;
	let div0;
	let button0;
	let img0;
	let img0_src_value;
	let t2;
	let button1;
	let img1;
	let img1_src_value;
	let t3;
	let div45;
	let div44;
	let div7;
	let img2;
	let img2_src_value;
	let t4;
	let div6;
	let div5;
	let div3;
	let div2;
	let span0;
	let t5;
	let t6;
	let span1;
	let t7;
	let t8;
	let p0;
	let t9;
	let t10;
	let div4;
	let a0;
	let span2;
	let t11;
	let t12;
	let svg0;
	let path0;
	let t13;
	let div13;
	let img3;
	let img3_src_value;
	let t14;
	let div12;
	let div11;
	let div9;
	let div8;
	let span3;
	let t15;
	let t16;
	let span4;
	let t17;
	let t18;
	let p1;
	let t19;
	let t20;
	let div10;
	let a1;
	let span5;
	let t21;
	let t22;
	let svg1;
	let path1;
	let t23;
	let div19;
	let img4;
	let img4_src_value;
	let t24;
	let div18;
	let div17;
	let div15;
	let div14;
	let span6;
	let t25;
	let t26;
	let span7;
	let t27;
	let t28;
	let p2;
	let t29;
	let t30;
	let div16;
	let a2;
	let span8;
	let t31;
	let t32;
	let svg2;
	let path2;
	let t33;
	let div25;
	let img5;
	let img5_src_value;
	let t34;
	let div24;
	let div23;
	let div21;
	let div20;
	let span9;
	let t35;
	let t36;
	let span10;
	let t37;
	let t38;
	let p3;
	let t39;
	let t40;
	let div22;
	let a3;
	let span11;
	let t41;
	let t42;
	let svg3;
	let path3;
	let t43;
	let div31;
	let img6;
	let img6_src_value;
	let t44;
	let div30;
	let div29;
	let div27;
	let div26;
	let span12;
	let t45;
	let t46;
	let span13;
	let t47;
	let t48;
	let p4;
	let t49;
	let t50;
	let div28;
	let a4;
	let span14;
	let t51;
	let t52;
	let svg4;
	let path4;
	let t53;
	let div37;
	let img7;
	let img7_src_value;
	let t54;
	let div36;
	let div35;
	let div33;
	let div32;
	let span15;
	let t55;
	let t56;
	let span16;
	let t57;
	let t58;
	let p5;
	let t59;
	let t60;
	let div34;
	let a5;
	let span17;
	let t61;
	let t62;
	let svg5;
	let path5;
	let t63;
	let div43;
	let img8;
	let img8_src_value;
	let t64;
	let div42;
	let div41;
	let div39;
	let div38;
	let span18;
	let t65;
	let t66;
	let span19;
	let t67;
	let t68;
	let p6;
	let t69;
	let t70;
	let div40;
	let a6;
	let span20;
	let t71;
	let t72;
	let svg6;
	let path6;
	let mounted;
	let dispose;

	return {
		c() {
			section = element("section");
			div1 = element("div");
			h2 = element("h2");
			t0 = text(/*heading*/ ctx[2]);
			t1 = space();
			div0 = element("div");
			button0 = element("button");
			img0 = element("img");
			t2 = space();
			button1 = element("button");
			img1 = element("img");
			t3 = space();
			div45 = element("div");
			div44 = element("div");
			div7 = element("div");
			img2 = element("img");
			t4 = space();
			div6 = element("div");
			div5 = element("div");
			div3 = element("div");
			div2 = element("div");
			span0 = element("span");
			t5 = text("Tour Innovación");
			t6 = space();
			span1 = element("span");
			t7 = text("21/08/24");
			t8 = space();
			p0 = element("p");
			t9 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t10 = space();
			div4 = element("div");
			a0 = element("a");
			span2 = element("span");
			t11 = text("Leer la noticia");
			t12 = space();
			svg0 = svg_element("svg");
			path0 = svg_element("path");
			t13 = space();
			div13 = element("div");
			img3 = element("img");
			t14 = space();
			div12 = element("div");
			div11 = element("div");
			div9 = element("div");
			div8 = element("div");
			span3 = element("span");
			t15 = text("Tour Innovación");
			t16 = space();
			span4 = element("span");
			t17 = text("21/08/24");
			t18 = space();
			p1 = element("p");
			t19 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t20 = space();
			div10 = element("div");
			a1 = element("a");
			span5 = element("span");
			t21 = text("Leer la noticia");
			t22 = space();
			svg1 = svg_element("svg");
			path1 = svg_element("path");
			t23 = space();
			div19 = element("div");
			img4 = element("img");
			t24 = space();
			div18 = element("div");
			div17 = element("div");
			div15 = element("div");
			div14 = element("div");
			span6 = element("span");
			t25 = text("Tour Innovación");
			t26 = space();
			span7 = element("span");
			t27 = text("21/08/24");
			t28 = space();
			p2 = element("p");
			t29 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t30 = space();
			div16 = element("div");
			a2 = element("a");
			span8 = element("span");
			t31 = text("Leer la noticia");
			t32 = space();
			svg2 = svg_element("svg");
			path2 = svg_element("path");
			t33 = space();
			div25 = element("div");
			img5 = element("img");
			t34 = space();
			div24 = element("div");
			div23 = element("div");
			div21 = element("div");
			div20 = element("div");
			span9 = element("span");
			t35 = text("Tour Innovación");
			t36 = space();
			span10 = element("span");
			t37 = text("21/08/24");
			t38 = space();
			p3 = element("p");
			t39 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t40 = space();
			div22 = element("div");
			a3 = element("a");
			span11 = element("span");
			t41 = text("Leer la noticia");
			t42 = space();
			svg3 = svg_element("svg");
			path3 = svg_element("path");
			t43 = space();
			div31 = element("div");
			img6 = element("img");
			t44 = space();
			div30 = element("div");
			div29 = element("div");
			div27 = element("div");
			div26 = element("div");
			span12 = element("span");
			t45 = text("Tour Innovación");
			t46 = space();
			span13 = element("span");
			t47 = text("21/08/24");
			t48 = space();
			p4 = element("p");
			t49 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t50 = space();
			div28 = element("div");
			a4 = element("a");
			span14 = element("span");
			t51 = text("Leer la noticia");
			t52 = space();
			svg4 = svg_element("svg");
			path4 = svg_element("path");
			t53 = space();
			div37 = element("div");
			img7 = element("img");
			t54 = space();
			div36 = element("div");
			div35 = element("div");
			div33 = element("div");
			div32 = element("div");
			span15 = element("span");
			t55 = text("Tour Innovación");
			t56 = space();
			span16 = element("span");
			t57 = text("21/08/24");
			t58 = space();
			p5 = element("p");
			t59 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t60 = space();
			div34 = element("div");
			a5 = element("a");
			span17 = element("span");
			t61 = text("Leer la noticia");
			t62 = space();
			svg5 = svg_element("svg");
			path5 = svg_element("path");
			t63 = space();
			div43 = element("div");
			img8 = element("img");
			t64 = space();
			div42 = element("div");
			div41 = element("div");
			div39 = element("div");
			div38 = element("div");
			span18 = element("span");
			t65 = text("Tour Innovación");
			t66 = space();
			span19 = element("span");
			t67 = text("21/08/24");
			t68 = space();
			p6 = element("p");
			t69 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t70 = space();
			div40 = element("div");
			a6 = element("a");
			span20 = element("span");
			t71 = text("Leer la noticia");
			t72 = space();
			svg6 = svg_element("svg");
			path6 = svg_element("path");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div1 = claim_element(section_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, /*heading*/ ctx[2]);
			h2_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", {});
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			img0 = claim_element(button0_nodes, "IMG", { src: true, alt: true });
			button0_nodes.forEach(detach);
			t2 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			img1 = claim_element(button1_nodes, "IMG", { src: true, alt: true });
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t3 = claim_space(section_nodes);
			div45 = claim_element(section_nodes, "DIV", { class: true });
			var div45_nodes = children(div45);
			div44 = claim_element(div45_nodes, "DIV", { class: true });
			var div44_nodes = children(div44);
			div7 = claim_element(div44_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			img2 = claim_element(div7_nodes, "IMG", { src: true, alt: true, class: true });
			t4 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { style: true });
			var div2_nodes = children(div2);
			span0 = claim_element(div2_nodes, "SPAN", {});
			var span0_nodes = children(span0);
			t5 = claim_text(span0_nodes, "Tour Innovación");
			span0_nodes.forEach(detach);
			t6 = claim_space(div2_nodes);
			span1 = claim_element(div2_nodes, "SPAN", {});
			var span1_nodes = children(span1);
			t7 = claim_text(span1_nodes, "21/08/24");
			span1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t8 = claim_space(div3_nodes);
			p0 = claim_element(div3_nodes, "P", {});
			var p0_nodes = children(p0);
			t9 = claim_text(p0_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p0_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t10 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", {});
			var div4_nodes = children(div4);
			a0 = claim_element(div4_nodes, "A", { class: true, href: true, target: true });
			var a0_nodes = children(a0);
			span2 = claim_element(a0_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t11 = claim_text(span2_nodes, "Leer la noticia");
			span2_nodes.forEach(detach);
			t12 = claim_space(a0_nodes);

			svg0 = claim_svg_element(a0_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg0_nodes = children(svg0);

			path0 = claim_svg_element(svg0_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path0).forEach(detach);
			svg0_nodes.forEach(detach);
			a0_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t13 = claim_space(div44_nodes);
			div13 = claim_element(div44_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			img3 = claim_element(div13_nodes, "IMG", { src: true, alt: true, class: true });
			t14 = claim_space(div13_nodes);
			div12 = claim_element(div13_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			div9 = claim_element(div11_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div8 = claim_element(div9_nodes, "DIV", { style: true });
			var div8_nodes = children(div8);
			span3 = claim_element(div8_nodes, "SPAN", {});
			var span3_nodes = children(span3);
			t15 = claim_text(span3_nodes, "Tour Innovación");
			span3_nodes.forEach(detach);
			t16 = claim_space(div8_nodes);
			span4 = claim_element(div8_nodes, "SPAN", {});
			var span4_nodes = children(span4);
			t17 = claim_text(span4_nodes, "21/08/24");
			span4_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t18 = claim_space(div9_nodes);
			p1 = claim_element(div9_nodes, "P", {});
			var p1_nodes = children(p1);
			t19 = claim_text(p1_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p1_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t20 = claim_space(div11_nodes);
			div10 = claim_element(div11_nodes, "DIV", {});
			var div10_nodes = children(div10);
			a1 = claim_element(div10_nodes, "A", { class: true, href: true, target: true });
			var a1_nodes = children(a1);
			span5 = claim_element(a1_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			t21 = claim_text(span5_nodes, "Leer la noticia");
			span5_nodes.forEach(detach);
			t22 = claim_space(a1_nodes);

			svg1 = claim_svg_element(a1_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg1_nodes = children(svg1);

			path1 = claim_svg_element(svg1_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path1).forEach(detach);
			svg1_nodes.forEach(detach);
			a1_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t23 = claim_space(div44_nodes);
			div19 = claim_element(div44_nodes, "DIV", { class: true });
			var div19_nodes = children(div19);
			img4 = claim_element(div19_nodes, "IMG", { src: true, alt: true, class: true });
			t24 = claim_space(div19_nodes);
			div18 = claim_element(div19_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			div17 = claim_element(div18_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			div15 = claim_element(div17_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div14 = claim_element(div15_nodes, "DIV", { style: true });
			var div14_nodes = children(div14);
			span6 = claim_element(div14_nodes, "SPAN", {});
			var span6_nodes = children(span6);
			t25 = claim_text(span6_nodes, "Tour Innovación");
			span6_nodes.forEach(detach);
			t26 = claim_space(div14_nodes);
			span7 = claim_element(div14_nodes, "SPAN", {});
			var span7_nodes = children(span7);
			t27 = claim_text(span7_nodes, "21/08/24");
			span7_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			t28 = claim_space(div15_nodes);
			p2 = claim_element(div15_nodes, "P", {});
			var p2_nodes = children(p2);
			t29 = claim_text(p2_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p2_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			t30 = claim_space(div17_nodes);
			div16 = claim_element(div17_nodes, "DIV", {});
			var div16_nodes = children(div16);
			a2 = claim_element(div16_nodes, "A", { class: true, href: true, target: true });
			var a2_nodes = children(a2);
			span8 = claim_element(a2_nodes, "SPAN", { class: true });
			var span8_nodes = children(span8);
			t31 = claim_text(span8_nodes, "Leer la noticia");
			span8_nodes.forEach(detach);
			t32 = claim_space(a2_nodes);

			svg2 = claim_svg_element(a2_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg2_nodes = children(svg2);

			path2 = claim_svg_element(svg2_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path2).forEach(detach);
			svg2_nodes.forEach(detach);
			a2_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			div17_nodes.forEach(detach);
			div18_nodes.forEach(detach);
			div19_nodes.forEach(detach);
			t33 = claim_space(div44_nodes);
			div25 = claim_element(div44_nodes, "DIV", { class: true });
			var div25_nodes = children(div25);
			img5 = claim_element(div25_nodes, "IMG", { src: true, alt: true, class: true });
			t34 = claim_space(div25_nodes);
			div24 = claim_element(div25_nodes, "DIV", { class: true });
			var div24_nodes = children(div24);
			div23 = claim_element(div24_nodes, "DIV", { class: true });
			var div23_nodes = children(div23);
			div21 = claim_element(div23_nodes, "DIV", { class: true });
			var div21_nodes = children(div21);
			div20 = claim_element(div21_nodes, "DIV", { style: true });
			var div20_nodes = children(div20);
			span9 = claim_element(div20_nodes, "SPAN", {});
			var span9_nodes = children(span9);
			t35 = claim_text(span9_nodes, "Tour Innovación");
			span9_nodes.forEach(detach);
			t36 = claim_space(div20_nodes);
			span10 = claim_element(div20_nodes, "SPAN", {});
			var span10_nodes = children(span10);
			t37 = claim_text(span10_nodes, "21/08/24");
			span10_nodes.forEach(detach);
			div20_nodes.forEach(detach);
			t38 = claim_space(div21_nodes);
			p3 = claim_element(div21_nodes, "P", {});
			var p3_nodes = children(p3);
			t39 = claim_text(p3_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p3_nodes.forEach(detach);
			div21_nodes.forEach(detach);
			t40 = claim_space(div23_nodes);
			div22 = claim_element(div23_nodes, "DIV", {});
			var div22_nodes = children(div22);
			a3 = claim_element(div22_nodes, "A", { class: true, href: true, target: true });
			var a3_nodes = children(a3);
			span11 = claim_element(a3_nodes, "SPAN", { class: true });
			var span11_nodes = children(span11);
			t41 = claim_text(span11_nodes, "Leer la noticia");
			span11_nodes.forEach(detach);
			t42 = claim_space(a3_nodes);

			svg3 = claim_svg_element(a3_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg3_nodes = children(svg3);

			path3 = claim_svg_element(svg3_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path3).forEach(detach);
			svg3_nodes.forEach(detach);
			a3_nodes.forEach(detach);
			div22_nodes.forEach(detach);
			div23_nodes.forEach(detach);
			div24_nodes.forEach(detach);
			div25_nodes.forEach(detach);
			t43 = claim_space(div44_nodes);
			div31 = claim_element(div44_nodes, "DIV", { class: true });
			var div31_nodes = children(div31);
			img6 = claim_element(div31_nodes, "IMG", { src: true, alt: true, class: true });
			t44 = claim_space(div31_nodes);
			div30 = claim_element(div31_nodes, "DIV", { class: true });
			var div30_nodes = children(div30);
			div29 = claim_element(div30_nodes, "DIV", { class: true });
			var div29_nodes = children(div29);
			div27 = claim_element(div29_nodes, "DIV", { class: true });
			var div27_nodes = children(div27);
			div26 = claim_element(div27_nodes, "DIV", { style: true });
			var div26_nodes = children(div26);
			span12 = claim_element(div26_nodes, "SPAN", {});
			var span12_nodes = children(span12);
			t45 = claim_text(span12_nodes, "Tour Innovación");
			span12_nodes.forEach(detach);
			t46 = claim_space(div26_nodes);
			span13 = claim_element(div26_nodes, "SPAN", {});
			var span13_nodes = children(span13);
			t47 = claim_text(span13_nodes, "21/08/24");
			span13_nodes.forEach(detach);
			div26_nodes.forEach(detach);
			t48 = claim_space(div27_nodes);
			p4 = claim_element(div27_nodes, "P", {});
			var p4_nodes = children(p4);
			t49 = claim_text(p4_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p4_nodes.forEach(detach);
			div27_nodes.forEach(detach);
			t50 = claim_space(div29_nodes);
			div28 = claim_element(div29_nodes, "DIV", {});
			var div28_nodes = children(div28);
			a4 = claim_element(div28_nodes, "A", { class: true, href: true, target: true });
			var a4_nodes = children(a4);
			span14 = claim_element(a4_nodes, "SPAN", { class: true });
			var span14_nodes = children(span14);
			t51 = claim_text(span14_nodes, "Leer la noticia");
			span14_nodes.forEach(detach);
			t52 = claim_space(a4_nodes);

			svg4 = claim_svg_element(a4_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg4_nodes = children(svg4);

			path4 = claim_svg_element(svg4_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path4).forEach(detach);
			svg4_nodes.forEach(detach);
			a4_nodes.forEach(detach);
			div28_nodes.forEach(detach);
			div29_nodes.forEach(detach);
			div30_nodes.forEach(detach);
			div31_nodes.forEach(detach);
			t53 = claim_space(div44_nodes);
			div37 = claim_element(div44_nodes, "DIV", { class: true });
			var div37_nodes = children(div37);
			img7 = claim_element(div37_nodes, "IMG", { src: true, alt: true, class: true });
			t54 = claim_space(div37_nodes);
			div36 = claim_element(div37_nodes, "DIV", { class: true });
			var div36_nodes = children(div36);
			div35 = claim_element(div36_nodes, "DIV", { class: true });
			var div35_nodes = children(div35);
			div33 = claim_element(div35_nodes, "DIV", { class: true });
			var div33_nodes = children(div33);
			div32 = claim_element(div33_nodes, "DIV", { style: true });
			var div32_nodes = children(div32);
			span15 = claim_element(div32_nodes, "SPAN", {});
			var span15_nodes = children(span15);
			t55 = claim_text(span15_nodes, "Tour Innovación");
			span15_nodes.forEach(detach);
			t56 = claim_space(div32_nodes);
			span16 = claim_element(div32_nodes, "SPAN", {});
			var span16_nodes = children(span16);
			t57 = claim_text(span16_nodes, "21/08/24");
			span16_nodes.forEach(detach);
			div32_nodes.forEach(detach);
			t58 = claim_space(div33_nodes);
			p5 = claim_element(div33_nodes, "P", {});
			var p5_nodes = children(p5);
			t59 = claim_text(p5_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p5_nodes.forEach(detach);
			div33_nodes.forEach(detach);
			t60 = claim_space(div35_nodes);
			div34 = claim_element(div35_nodes, "DIV", {});
			var div34_nodes = children(div34);
			a5 = claim_element(div34_nodes, "A", { class: true, href: true, target: true });
			var a5_nodes = children(a5);
			span17 = claim_element(a5_nodes, "SPAN", { class: true });
			var span17_nodes = children(span17);
			t61 = claim_text(span17_nodes, "Leer la noticia");
			span17_nodes.forEach(detach);
			t62 = claim_space(a5_nodes);

			svg5 = claim_svg_element(a5_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg5_nodes = children(svg5);

			path5 = claim_svg_element(svg5_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path5).forEach(detach);
			svg5_nodes.forEach(detach);
			a5_nodes.forEach(detach);
			div34_nodes.forEach(detach);
			div35_nodes.forEach(detach);
			div36_nodes.forEach(detach);
			div37_nodes.forEach(detach);
			t63 = claim_space(div44_nodes);
			div43 = claim_element(div44_nodes, "DIV", { class: true });
			var div43_nodes = children(div43);
			img8 = claim_element(div43_nodes, "IMG", { src: true, alt: true, class: true });
			t64 = claim_space(div43_nodes);
			div42 = claim_element(div43_nodes, "DIV", { class: true });
			var div42_nodes = children(div42);
			div41 = claim_element(div42_nodes, "DIV", { class: true });
			var div41_nodes = children(div41);
			div39 = claim_element(div41_nodes, "DIV", { class: true });
			var div39_nodes = children(div39);
			div38 = claim_element(div39_nodes, "DIV", { style: true });
			var div38_nodes = children(div38);
			span18 = claim_element(div38_nodes, "SPAN", {});
			var span18_nodes = children(span18);
			t65 = claim_text(span18_nodes, "Tour Innovación");
			span18_nodes.forEach(detach);
			t66 = claim_space(div38_nodes);
			span19 = claim_element(div38_nodes, "SPAN", {});
			var span19_nodes = children(span19);
			t67 = claim_text(span19_nodes, "21/08/24");
			span19_nodes.forEach(detach);
			div38_nodes.forEach(detach);
			t68 = claim_space(div39_nodes);
			p6 = claim_element(div39_nodes, "P", {});
			var p6_nodes = children(p6);
			t69 = claim_text(p6_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p6_nodes.forEach(detach);
			div39_nodes.forEach(detach);
			t70 = claim_space(div41_nodes);
			div40 = claim_element(div41_nodes, "DIV", {});
			var div40_nodes = children(div40);
			a6 = claim_element(div40_nodes, "A", { class: true, href: true, target: true });
			var a6_nodes = children(a6);
			span20 = claim_element(a6_nodes, "SPAN", { class: true });
			var span20_nodes = children(span20);
			t71 = claim_text(span20_nodes, "Leer la noticia");
			span20_nodes.forEach(detach);
			t72 = claim_space(a6_nodes);

			svg6 = claim_svg_element(a6_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg6_nodes = children(svg6);

			path6 = claim_svg_element(svg6_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path6).forEach(detach);
			svg6_nodes.forEach(detach);
			a6_nodes.forEach(detach);
			div40_nodes.forEach(detach);
			div41_nodes.forEach(detach);
			div42_nodes.forEach(detach);
			div43_nodes.forEach(detach);
			div44_nodes.forEach(detach);
			div45_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "heading");
			if (!src_url_equal(img0.src, img0_src_value = /*imagep*/ ctx[1].url)) attr(img0, "src", img0_src_value);
			attr(img0, "alt", "Previous");
			attr(button0, "class", "carousel-control-prev");
			if (!src_url_equal(img1.src, img1_src_value = /*imagen*/ ctx[0].url)) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "Next");
			attr(button1, "class", "carousel-control-next");
			attr(div1, "class", "title svelte-lishb2");
			if (!src_url_equal(img2.src, img2_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img2, "src", img2_src_value);
			attr(img2, "alt", "first");
			attr(img2, "class", "svelte-lishb2");
			set_style(div2, "display", "flex");
			set_style(div2, "justify-content", "space-between");
			set_style(div2, "width", "100%");
			attr(div3, "class", "date svelte-lishb2");
			attr(span2, "class", "label");
			attr(path0, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path0, "stroke", "#7B5CF5");
			attr(path0, "stroke-width", "2.028");
			attr(path0, "stroke-linecap", "round");
			attr(path0, "stroke-linejoin", "round");
			attr(svg0, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg0, "width", "23");
			attr(svg0, "height", "23");
			attr(svg0, "viewBox", "0 0 23 23");
			attr(svg0, "fill", "none");
			attr(a0, "class", "link");
			attr(a0, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a0, "target", "_blank");
			attr(div5, "class", "text svelte-lishb2");
			attr(div6, "class", "part2 svelte-lishb2");
			attr(div7, "class", "card svelte-lishb2");
			if (!src_url_equal(img3.src, img3_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img3, "src", img3_src_value);
			attr(img3, "alt", "first");
			attr(img3, "class", "svelte-lishb2");
			set_style(div8, "display", "flex");
			set_style(div8, "justify-content", "space-between");
			set_style(div8, "width", "100%");
			attr(div9, "class", "date svelte-lishb2");
			attr(span5, "class", "label");
			attr(path1, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path1, "stroke", "#7B5CF5");
			attr(path1, "stroke-width", "2.028");
			attr(path1, "stroke-linecap", "round");
			attr(path1, "stroke-linejoin", "round");
			attr(svg1, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg1, "width", "23");
			attr(svg1, "height", "23");
			attr(svg1, "viewBox", "0 0 23 23");
			attr(svg1, "fill", "none");
			attr(a1, "class", "link");
			attr(a1, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a1, "target", "_blank");
			attr(div11, "class", "text svelte-lishb2");
			attr(div12, "class", "part2 svelte-lishb2");
			attr(div13, "class", "card svelte-lishb2");
			if (!src_url_equal(img4.src, img4_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img4, "src", img4_src_value);
			attr(img4, "alt", "first");
			attr(img4, "class", "svelte-lishb2");
			set_style(div14, "display", "flex");
			set_style(div14, "justify-content", "space-between");
			set_style(div14, "width", "100%");
			attr(div15, "class", "date svelte-lishb2");
			attr(span8, "class", "label");
			attr(path2, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path2, "stroke", "#7B5CF5");
			attr(path2, "stroke-width", "2.028");
			attr(path2, "stroke-linecap", "round");
			attr(path2, "stroke-linejoin", "round");
			attr(svg2, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg2, "width", "23");
			attr(svg2, "height", "23");
			attr(svg2, "viewBox", "0 0 23 23");
			attr(svg2, "fill", "none");
			attr(a2, "class", "link");
			attr(a2, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a2, "target", "_blank");
			attr(div17, "class", "text svelte-lishb2");
			attr(div18, "class", "part2 svelte-lishb2");
			attr(div19, "class", "card svelte-lishb2");
			if (!src_url_equal(img5.src, img5_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img5, "src", img5_src_value);
			attr(img5, "alt", "first");
			attr(img5, "class", "svelte-lishb2");
			set_style(div20, "display", "flex");
			set_style(div20, "justify-content", "space-between");
			set_style(div20, "width", "100%");
			attr(div21, "class", "date svelte-lishb2");
			attr(span11, "class", "label");
			attr(path3, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path3, "stroke", "#7B5CF5");
			attr(path3, "stroke-width", "2.028");
			attr(path3, "stroke-linecap", "round");
			attr(path3, "stroke-linejoin", "round");
			attr(svg3, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg3, "width", "23");
			attr(svg3, "height", "23");
			attr(svg3, "viewBox", "0 0 23 23");
			attr(svg3, "fill", "none");
			attr(a3, "class", "link");
			attr(a3, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a3, "target", "_blank");
			attr(div23, "class", "text svelte-lishb2");
			attr(div24, "class", "part2 svelte-lishb2");
			attr(div25, "class", "card svelte-lishb2");
			if (!src_url_equal(img6.src, img6_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img6, "src", img6_src_value);
			attr(img6, "alt", "first");
			attr(img6, "class", "svelte-lishb2");
			set_style(div26, "display", "flex");
			set_style(div26, "justify-content", "space-between");
			set_style(div26, "width", "100%");
			attr(div27, "class", "date svelte-lishb2");
			attr(span14, "class", "label");
			attr(path4, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path4, "stroke", "#7B5CF5");
			attr(path4, "stroke-width", "2.028");
			attr(path4, "stroke-linecap", "round");
			attr(path4, "stroke-linejoin", "round");
			attr(svg4, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg4, "width", "23");
			attr(svg4, "height", "23");
			attr(svg4, "viewBox", "0 0 23 23");
			attr(svg4, "fill", "none");
			attr(a4, "class", "link");
			attr(a4, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a4, "target", "_blank");
			attr(div29, "class", "text svelte-lishb2");
			attr(div30, "class", "part2 svelte-lishb2");
			attr(div31, "class", "card svelte-lishb2");
			if (!src_url_equal(img7.src, img7_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img7, "src", img7_src_value);
			attr(img7, "alt", "first");
			attr(img7, "class", "svelte-lishb2");
			set_style(div32, "display", "flex");
			set_style(div32, "justify-content", "space-between");
			set_style(div32, "width", "100%");
			attr(div33, "class", "date svelte-lishb2");
			attr(span17, "class", "label");
			attr(path5, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path5, "stroke", "#7B5CF5");
			attr(path5, "stroke-width", "2.028");
			attr(path5, "stroke-linecap", "round");
			attr(path5, "stroke-linejoin", "round");
			attr(svg5, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg5, "width", "23");
			attr(svg5, "height", "23");
			attr(svg5, "viewBox", "0 0 23 23");
			attr(svg5, "fill", "none");
			attr(a5, "class", "link");
			attr(a5, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a5, "target", "_blank");
			attr(div35, "class", "text svelte-lishb2");
			attr(div36, "class", "part2 svelte-lishb2");
			attr(div37, "class", "card svelte-lishb2");
			if (!src_url_equal(img8.src, img8_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img8, "src", img8_src_value);
			attr(img8, "alt", "first");
			attr(img8, "class", "svelte-lishb2");
			set_style(div38, "display", "flex");
			set_style(div38, "justify-content", "space-between");
			set_style(div38, "width", "100%");
			attr(div39, "class", "date svelte-lishb2");
			attr(span20, "class", "label");
			attr(path6, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path6, "stroke", "#7B5CF5");
			attr(path6, "stroke-width", "2.028");
			attr(path6, "stroke-linecap", "round");
			attr(path6, "stroke-linejoin", "round");
			attr(svg6, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg6, "width", "23");
			attr(svg6, "height", "23");
			attr(svg6, "viewBox", "0 0 23 23");
			attr(svg6, "fill", "none");
			attr(a6, "class", "link");
			attr(a6, "href", "https://www.tourinnovacion.cl/transformacion-digital/globot-el-asistente-virtual-para-pymes-que-nunca-duerme/");
			attr(a6, "target", "_blank");
			attr(div41, "class", "text svelte-lishb2");
			attr(div42, "class", "part2 svelte-lishb2");
			attr(div43, "class", "card svelte-lishb2");
			attr(div44, "class", "carousel-inner svelte-lishb2");
			attr(div45, "class", "carousel svelte-lishb2");
			attr(section, "class", "news-carousel svelte-lishb2");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div1);
			append_hydration(div1, h2);
			append_hydration(h2, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, button0);
			append_hydration(button0, img0);
			append_hydration(div0, t2);
			append_hydration(div0, button1);
			append_hydration(button1, img1);
			append_hydration(section, t3);
			append_hydration(section, div45);
			append_hydration(div45, div44);
			append_hydration(div44, div7);
			append_hydration(div7, img2);
			append_hydration(div7, t4);
			append_hydration(div7, div6);
			append_hydration(div6, div5);
			append_hydration(div5, div3);
			append_hydration(div3, div2);
			append_hydration(div2, span0);
			append_hydration(span0, t5);
			append_hydration(div2, t6);
			append_hydration(div2, span1);
			append_hydration(span1, t7);
			append_hydration(div3, t8);
			append_hydration(div3, p0);
			append_hydration(p0, t9);
			append_hydration(div5, t10);
			append_hydration(div5, div4);
			append_hydration(div4, a0);
			append_hydration(a0, span2);
			append_hydration(span2, t11);
			append_hydration(a0, t12);
			append_hydration(a0, svg0);
			append_hydration(svg0, path0);
			append_hydration(div44, t13);
			append_hydration(div44, div13);
			append_hydration(div13, img3);
			append_hydration(div13, t14);
			append_hydration(div13, div12);
			append_hydration(div12, div11);
			append_hydration(div11, div9);
			append_hydration(div9, div8);
			append_hydration(div8, span3);
			append_hydration(span3, t15);
			append_hydration(div8, t16);
			append_hydration(div8, span4);
			append_hydration(span4, t17);
			append_hydration(div9, t18);
			append_hydration(div9, p1);
			append_hydration(p1, t19);
			append_hydration(div11, t20);
			append_hydration(div11, div10);
			append_hydration(div10, a1);
			append_hydration(a1, span5);
			append_hydration(span5, t21);
			append_hydration(a1, t22);
			append_hydration(a1, svg1);
			append_hydration(svg1, path1);
			append_hydration(div44, t23);
			append_hydration(div44, div19);
			append_hydration(div19, img4);
			append_hydration(div19, t24);
			append_hydration(div19, div18);
			append_hydration(div18, div17);
			append_hydration(div17, div15);
			append_hydration(div15, div14);
			append_hydration(div14, span6);
			append_hydration(span6, t25);
			append_hydration(div14, t26);
			append_hydration(div14, span7);
			append_hydration(span7, t27);
			append_hydration(div15, t28);
			append_hydration(div15, p2);
			append_hydration(p2, t29);
			append_hydration(div17, t30);
			append_hydration(div17, div16);
			append_hydration(div16, a2);
			append_hydration(a2, span8);
			append_hydration(span8, t31);
			append_hydration(a2, t32);
			append_hydration(a2, svg2);
			append_hydration(svg2, path2);
			append_hydration(div44, t33);
			append_hydration(div44, div25);
			append_hydration(div25, img5);
			append_hydration(div25, t34);
			append_hydration(div25, div24);
			append_hydration(div24, div23);
			append_hydration(div23, div21);
			append_hydration(div21, div20);
			append_hydration(div20, span9);
			append_hydration(span9, t35);
			append_hydration(div20, t36);
			append_hydration(div20, span10);
			append_hydration(span10, t37);
			append_hydration(div21, t38);
			append_hydration(div21, p3);
			append_hydration(p3, t39);
			append_hydration(div23, t40);
			append_hydration(div23, div22);
			append_hydration(div22, a3);
			append_hydration(a3, span11);
			append_hydration(span11, t41);
			append_hydration(a3, t42);
			append_hydration(a3, svg3);
			append_hydration(svg3, path3);
			append_hydration(div44, t43);
			append_hydration(div44, div31);
			append_hydration(div31, img6);
			append_hydration(div31, t44);
			append_hydration(div31, div30);
			append_hydration(div30, div29);
			append_hydration(div29, div27);
			append_hydration(div27, div26);
			append_hydration(div26, span12);
			append_hydration(span12, t45);
			append_hydration(div26, t46);
			append_hydration(div26, span13);
			append_hydration(span13, t47);
			append_hydration(div27, t48);
			append_hydration(div27, p4);
			append_hydration(p4, t49);
			append_hydration(div29, t50);
			append_hydration(div29, div28);
			append_hydration(div28, a4);
			append_hydration(a4, span14);
			append_hydration(span14, t51);
			append_hydration(a4, t52);
			append_hydration(a4, svg4);
			append_hydration(svg4, path4);
			append_hydration(div44, t53);
			append_hydration(div44, div37);
			append_hydration(div37, img7);
			append_hydration(div37, t54);
			append_hydration(div37, div36);
			append_hydration(div36, div35);
			append_hydration(div35, div33);
			append_hydration(div33, div32);
			append_hydration(div32, span15);
			append_hydration(span15, t55);
			append_hydration(div32, t56);
			append_hydration(div32, span16);
			append_hydration(span16, t57);
			append_hydration(div33, t58);
			append_hydration(div33, p5);
			append_hydration(p5, t59);
			append_hydration(div35, t60);
			append_hydration(div35, div34);
			append_hydration(div34, a5);
			append_hydration(a5, span17);
			append_hydration(span17, t61);
			append_hydration(a5, t62);
			append_hydration(a5, svg5);
			append_hydration(svg5, path5);
			append_hydration(div44, t63);
			append_hydration(div44, div43);
			append_hydration(div43, img8);
			append_hydration(div43, t64);
			append_hydration(div43, div42);
			append_hydration(div42, div41);
			append_hydration(div41, div39);
			append_hydration(div39, div38);
			append_hydration(div38, span18);
			append_hydration(span18, t65);
			append_hydration(div38, t66);
			append_hydration(div38, span19);
			append_hydration(span19, t67);
			append_hydration(div39, t68);
			append_hydration(div39, p6);
			append_hydration(p6, t69);
			append_hydration(div41, t70);
			append_hydration(div41, div40);
			append_hydration(div40, a6);
			append_hydration(a6, span20);
			append_hydration(span20, t71);
			append_hydration(a6, t72);
			append_hydration(a6, svg6);
			append_hydration(svg6, path6);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*prev*/ ctx[3]),
					listen(button0, "keydown", /*handleKeydown*/ ctx[5]),
					listen(button1, "click", /*next*/ ctx[4]),
					listen(button1, "keydown", /*handleKeydown*/ ctx[5])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*heading*/ 4) set_data(t0, /*heading*/ ctx[2]);

			if (dirty & /*imagep*/ 2 && !src_url_equal(img0.src, img0_src_value = /*imagep*/ ctx[1].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (dirty & /*imagen*/ 1 && !src_url_equal(img1.src, img1_src_value = /*imagen*/ ctx[0].url)) {
				attr(img1, "src", img1_src_value);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section);
			mounted = false;
			run_all(dispose);
		}
	};
}

let totalItems = 7; // Número total de imágenes
const itemsPerViewDesktop = 4; // Número de imágenes visibles a la vez en desktop
const itemsPerViewMobile = 1; // Número de imágenes visibles a la vez en mobile
const itemWidthDesktop = 25; // Porcentaje del ancho de cada imagen en desktop
const itemWidthMobile = 75; // Porcentaje del ancho de cada imagen en mobile
const margin = 44; // Margen entre las imágenes

function getItemsPerView() {
	return window.innerWidth <= 768
	? itemsPerViewMobile
	: itemsPerViewDesktop;
}

function getItemWidth() {
	return window.innerWidth <= 768
	? itemWidthMobile
	: itemWidthDesktop;
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { cards } = $$props;
	let { imagen } = $$props;
	let { imagep } = $$props;
	let { heading } = $$props;
	let index = 0;
	let interval;

	function prev() {
		if (index > 0) {
			index--;
		} else {
			index = totalItems - getItemsPerView(); // Ir al final
		}

		updateTransform();
	}

	function next() {
		if (index < totalItems - getItemsPerView()) {
			index++;
		} else {
			index = 0; // Ir al inicio
		}

		updateTransform();
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowLeft') {
			prev();
		} else if (event.key === 'ArrowRight') {
			next();
		}
	}

	function updateTransform() {
		const carouselInner = document.querySelector('.carousel-inner');

		if (carouselInner) {
			carouselInner.style.transform = `translateX(-${index * (getItemWidth() + margin / getItemsPerView())}%)`;
		}
	}

	onMount(() => {
		updateTransform();

		// Elimina el desplazamiento automático
		// interval = setInterval(autoSlide, 8000); // Cambia cada 3 segundos
		// Ajusta la transformación al cambiar el tamaño de la ventana
		window.addEventListener('resize', updateTransform);
	});

	onDestroy(() => {
		// Limpia el intervalo cuando el componente se destruye
		clearInterval(interval);

		window.removeEventListener('resize', updateTransform);
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(6, props = $$props.props);
		if ('cards' in $$props) $$invalidate(7, cards = $$props.cards);
		if ('imagen' in $$props) $$invalidate(0, imagen = $$props.imagen);
		if ('imagep' in $$props) $$invalidate(1, imagep = $$props.imagep);
		if ('heading' in $$props) $$invalidate(2, heading = $$props.heading);
	};

	updateTransform();
	return [imagen, imagep, heading, prev, next, handleKeydown, props, cards];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 6,
			cards: 7,
			imagen: 0,
			imagep: 1,
			heading: 2
		});
	}
}

export { Component as default };
