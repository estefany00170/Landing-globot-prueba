// carrusell - Updated January 14, 2025
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
	let div8;
	let div7;
	let div0;
	let img0;
	let img0_src_value;
	let t0;
	let span0;
	let h40;
	let t1;
	let t2;
	let div1;
	let img1;
	let img1_src_value;
	let t3;
	let span1;
	let h41;
	let t4;
	let t5;
	let div2;
	let img2;
	let img2_src_value;
	let t6;
	let span2;
	let h42;
	let t7;
	let t8;
	let div3;
	let img3;
	let img3_src_value;
	let t9;
	let span3;
	let h43;
	let t10;
	let t11;
	let div4;
	let img4;
	let img4_src_value;
	let t12;
	let span4;
	let h44;
	let t13;
	let t14;
	let div5;
	let img5;
	let img5_src_value;
	let t15;
	let span5;
	let h45;
	let t16;
	let t17;
	let div6;
	let img6;
	let img6_src_value;
	let t18;
	let span6;
	let h46;
	let t19;
	let t20;
	let button0;
	let img7;
	let img7_src_value;
	let t21;
	let button1;
	let img8;
	let img8_src_value;
	let mounted;
	let dispose;

	return {
		c() {
			div8 = element("div");
			div7 = element("div");
			div0 = element("div");
			img0 = element("img");
			t0 = space();
			span0 = element("span");
			h40 = element("h4");
			t1 = text("Centros de Salud");
			t2 = space();
			div1 = element("div");
			img1 = element("img");
			t3 = space();
			span1 = element("span");
			h41 = element("h4");
			t4 = text("E-commerce");
			t5 = space();
			div2 = element("div");
			img2 = element("img");
			t6 = space();
			span2 = element("span");
			h42 = element("h4");
			t7 = text("Inmobiliarias");
			t8 = space();
			div3 = element("div");
			img3 = element("img");
			t9 = space();
			span3 = element("span");
			h43 = element("h4");
			t10 = text("Automotriz");
			t11 = space();
			div4 = element("div");
			img4 = element("img");
			t12 = space();
			span4 = element("span");
			h44 = element("h4");
			t13 = text("Estética");
			t14 = space();
			div5 = element("div");
			img5 = element("img");
			t15 = space();
			span5 = element("span");
			h45 = element("h4");
			t16 = text("Centros educativos");
			t17 = space();
			div6 = element("div");
			img6 = element("img");
			t18 = space();
			span6 = element("span");
			h46 = element("h4");
			t19 = text("Sitios informativos");
			t20 = space();
			button0 = element("button");
			img7 = element("img");
			t21 = space();
			button1 = element("button");
			img8 = element("img");
			this.h();
		},
		l(nodes) {
			div8 = claim_element(nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			div0 = claim_element(div7_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			img0 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(div0_nodes);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			h40 = claim_element(span0_nodes, "H4", {});
			var h40_nodes = children(h40);
			t1 = claim_text(h40_nodes, "Centros de Salud");
			h40_nodes.forEach(detach);
			span0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(div7_nodes);
			div1 = claim_element(div7_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			img1 = claim_element(div1_nodes, "IMG", { src: true, alt: true, class: true });
			t3 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			h41 = claim_element(span1_nodes, "H4", {});
			var h41_nodes = children(h41);
			t4 = claim_text(h41_nodes, "E-commerce");
			h41_nodes.forEach(detach);
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t5 = claim_space(div7_nodes);
			div2 = claim_element(div7_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			img2 = claim_element(div2_nodes, "IMG", { src: true, alt: true, class: true });
			t6 = claim_space(div2_nodes);
			span2 = claim_element(div2_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			h42 = claim_element(span2_nodes, "H4", {});
			var h42_nodes = children(h42);
			t7 = claim_text(h42_nodes, "Inmobiliarias");
			h42_nodes.forEach(detach);
			span2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t8 = claim_space(div7_nodes);
			div3 = claim_element(div7_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			img3 = claim_element(div3_nodes, "IMG", { src: true, alt: true, class: true });
			t9 = claim_space(div3_nodes);
			span3 = claim_element(div3_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			h43 = claim_element(span3_nodes, "H4", {});
			var h43_nodes = children(h43);
			t10 = claim_text(h43_nodes, "Automotriz");
			h43_nodes.forEach(detach);
			span3_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t11 = claim_space(div7_nodes);
			div4 = claim_element(div7_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			img4 = claim_element(div4_nodes, "IMG", { src: true, alt: true, class: true });
			t12 = claim_space(div4_nodes);
			span4 = claim_element(div4_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			h44 = claim_element(span4_nodes, "H4", {});
			var h44_nodes = children(h44);
			t13 = claim_text(h44_nodes, "Estética");
			h44_nodes.forEach(detach);
			span4_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t14 = claim_space(div7_nodes);
			div5 = claim_element(div7_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			img5 = claim_element(div5_nodes, "IMG", { src: true, alt: true, class: true });
			t15 = claim_space(div5_nodes);
			span5 = claim_element(div5_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			h45 = claim_element(span5_nodes, "H4", {});
			var h45_nodes = children(h45);
			t16 = claim_text(h45_nodes, "Centros educativos");
			h45_nodes.forEach(detach);
			span5_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t17 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			img6 = claim_element(div6_nodes, "IMG", { src: true, alt: true, class: true });
			t18 = claim_space(div6_nodes);
			span6 = claim_element(div6_nodes, "SPAN", { class: true });
			var span6_nodes = children(span6);
			h46 = claim_element(span6_nodes, "H4", {});
			var h46_nodes = children(h46);
			t19 = claim_text(h46_nodes, "Sitios informativos");
			h46_nodes.forEach(detach);
			span6_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t20 = claim_space(nodes);
			button0 = claim_element(nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			img7 = claim_element(button0_nodes, "IMG", { src: true, alt: true });
			button0_nodes.forEach(detach);
			t21 = claim_space(nodes);
			button1 = claim_element(nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			img8 = claim_element(button1_nodes, "IMG", { src: true, alt: true });
			button1_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[0].url)) attr(img0, "src", img0_src_value);
			attr(img0, "alt", "Imagen 1");
			attr(img0, "class", "svelte-1sxeasa");
			attr(span0, "class", "text svelte-1sxeasa");
			attr(div0, "class", "carousel-item active svelte-1sxeasa");
			if (!src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[1].url)) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "Imagen 2");
			attr(img1, "class", "svelte-1sxeasa");
			attr(span1, "class", "text svelte-1sxeasa");
			attr(div1, "class", "carousel-item svelte-1sxeasa");
			if (!src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[2].url)) attr(img2, "src", img2_src_value);
			attr(img2, "alt", "Imagen 3");
			attr(img2, "class", "svelte-1sxeasa");
			attr(span2, "class", "text svelte-1sxeasa");
			attr(div2, "class", "carousel-item svelte-1sxeasa");
			if (!src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[3].url)) attr(img3, "src", img3_src_value);
			attr(img3, "alt", "Imagen 4");
			attr(img3, "class", "svelte-1sxeasa");
			attr(span3, "class", "text svelte-1sxeasa");
			attr(div3, "class", "carousel-item svelte-1sxeasa");
			if (!src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[4].url)) attr(img4, "src", img4_src_value);
			attr(img4, "alt", "Imagen 5");
			attr(img4, "class", "svelte-1sxeasa");
			attr(span4, "class", "text svelte-1sxeasa");
			attr(div4, "class", "carousel-item svelte-1sxeasa");
			if (!src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[5].url)) attr(img5, "src", img5_src_value);
			attr(img5, "alt", "Imagen 6");
			attr(img5, "class", "svelte-1sxeasa");
			attr(span5, "class", "text svelte-1sxeasa");
			attr(div5, "class", "carousel-item svelte-1sxeasa");
			if (!src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[6].url)) attr(img6, "src", img6_src_value);
			attr(img6, "alt", "Imagen 7");
			attr(img6, "class", "svelte-1sxeasa");
			attr(span6, "class", "text svelte-1sxeasa");
			attr(div6, "class", "carousel-item active svelte-1sxeasa");
			attr(div7, "class", "carousel-inner svelte-1sxeasa");
			attr(div8, "class", "carousel svelte-1sxeasa");
			if (!src_url_equal(img7.src, img7_src_value = /*imagep*/ ctx[8].url)) attr(img7, "src", img7_src_value);
			attr(img7, "alt", "Previous");
			attr(button0, "class", "carousel-control-prev svelte-1sxeasa");
			if (!src_url_equal(img8.src, img8_src_value = /*imagen*/ ctx[7].url)) attr(img8, "src", img8_src_value);
			attr(img8, "alt", "Next");
			attr(button1, "class", "carousel-control-next svelte-1sxeasa");
		},
		m(target, anchor) {
			insert_hydration(target, div8, anchor);
			append_hydration(div8, div7);
			append_hydration(div7, div0);
			append_hydration(div0, img0);
			append_hydration(div0, t0);
			append_hydration(div0, span0);
			append_hydration(span0, h40);
			append_hydration(h40, t1);
			append_hydration(div7, t2);
			append_hydration(div7, div1);
			append_hydration(div1, img1);
			append_hydration(div1, t3);
			append_hydration(div1, span1);
			append_hydration(span1, h41);
			append_hydration(h41, t4);
			append_hydration(div7, t5);
			append_hydration(div7, div2);
			append_hydration(div2, img2);
			append_hydration(div2, t6);
			append_hydration(div2, span2);
			append_hydration(span2, h42);
			append_hydration(h42, t7);
			append_hydration(div7, t8);
			append_hydration(div7, div3);
			append_hydration(div3, img3);
			append_hydration(div3, t9);
			append_hydration(div3, span3);
			append_hydration(span3, h43);
			append_hydration(h43, t10);
			append_hydration(div7, t11);
			append_hydration(div7, div4);
			append_hydration(div4, img4);
			append_hydration(div4, t12);
			append_hydration(div4, span4);
			append_hydration(span4, h44);
			append_hydration(h44, t13);
			append_hydration(div7, t14);
			append_hydration(div7, div5);
			append_hydration(div5, img5);
			append_hydration(div5, t15);
			append_hydration(div5, span5);
			append_hydration(span5, h45);
			append_hydration(h45, t16);
			append_hydration(div7, t17);
			append_hydration(div7, div6);
			append_hydration(div6, img6);
			append_hydration(div6, t18);
			append_hydration(div6, span6);
			append_hydration(span6, h46);
			append_hydration(h46, t19);
			insert_hydration(target, t20, anchor);
			insert_hydration(target, button0, anchor);
			append_hydration(button0, img7);
			insert_hydration(target, t21, anchor);
			insert_hydration(target, button1, anchor);
			append_hydration(button1, img8);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*prev*/ ctx[9]),
					listen(button0, "keydown", /*handleKeydown*/ ctx[11]),
					listen(button1, "click", /*next*/ ctx[10]),
					listen(button1, "keydown", /*handleKeydown*/ ctx[11])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*image1*/ 1 && !src_url_equal(img0.src, img0_src_value = /*image1*/ ctx[0].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (dirty & /*image2*/ 2 && !src_url_equal(img1.src, img1_src_value = /*image2*/ ctx[1].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (dirty & /*image3*/ 4 && !src_url_equal(img2.src, img2_src_value = /*image3*/ ctx[2].url)) {
				attr(img2, "src", img2_src_value);
			}

			if (dirty & /*image4*/ 8 && !src_url_equal(img3.src, img3_src_value = /*image4*/ ctx[3].url)) {
				attr(img3, "src", img3_src_value);
			}

			if (dirty & /*image5*/ 16 && !src_url_equal(img4.src, img4_src_value = /*image5*/ ctx[4].url)) {
				attr(img4, "src", img4_src_value);
			}

			if (dirty & /*image6*/ 32 && !src_url_equal(img5.src, img5_src_value = /*image6*/ ctx[5].url)) {
				attr(img5, "src", img5_src_value);
			}

			if (dirty & /*image7*/ 64 && !src_url_equal(img6.src, img6_src_value = /*image7*/ ctx[6].url)) {
				attr(img6, "src", img6_src_value);
			}

			if (dirty & /*imagep*/ 256 && !src_url_equal(img7.src, img7_src_value = /*imagep*/ ctx[8].url)) {
				attr(img7, "src", img7_src_value);
			}

			if (dirty & /*imagen*/ 128 && !src_url_equal(img8.src, img8_src_value = /*imagen*/ ctx[7].url)) {
				attr(img8, "src", img8_src_value);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div8);
			if (detaching) detach(t20);
			if (detaching) detach(button0);
			if (detaching) detach(t21);
			if (detaching) detach(button1);
			mounted = false;
			run_all(dispose);
		}
	};
}

let totalItems = 6; // Número total de imágenes
const itemsPerView = 4; // Número de imágenes visibles a la vez
const itemWidth = 25; // Porcentaje del ancho de cada imagen
const margin = 44; // Margen entre las imágenes

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { image1 } = $$props;
	let { image2 } = $$props;
	let { image3 } = $$props;
	let { image4 } = $$props;
	let { image5 } = $$props;
	let { image6 } = $$props;
	let { image7 } = $$props;
	let { imagen } = $$props;
	let { imagep } = $$props;
	let index = 0;
	let interval;

	function prev() {
		if (index > 0) {
			$$invalidate(13, index--, index);
		} else {
			$$invalidate(13, index = totalItems - itemsPerView); // Ir al final
		}
	}

	function next() {
		if (index < totalItems - itemsPerView) {
			$$invalidate(13, index++, index);
		} else {
			$$invalidate(13, index = 0); // Ir al inicio
		}
	}

	function autoSlide() {
		next();
	}

	function handleKeydown(event) {
		if (event.key === 'ArrowLeft') {
			prev();
		} else if (event.key === 'ArrowRight') {
			next();
		}
	}

	onMount(() => {
		const carouselInner = document.querySelector('.carousel-inner');
		carouselInner.style.transform = `translateX(-${index * (itemWidth + margin / itemsPerView)}%)`;

		// Inicia el desplazamiento automático
		interval = setInterval(autoSlide, 4000); // Cambia cada 3 segundos
	});

	onDestroy(() => {
		// Limpia el intervalo cuando el componente se destruye
		clearInterval(interval);
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(12, props = $$props.props);
		if ('image1' in $$props) $$invalidate(0, image1 = $$props.image1);
		if ('image2' in $$props) $$invalidate(1, image2 = $$props.image2);
		if ('image3' in $$props) $$invalidate(2, image3 = $$props.image3);
		if ('image4' in $$props) $$invalidate(3, image4 = $$props.image4);
		if ('image5' in $$props) $$invalidate(4, image5 = $$props.image5);
		if ('image6' in $$props) $$invalidate(5, image6 = $$props.image6);
		if ('image7' in $$props) $$invalidate(6, image7 = $$props.image7);
		if ('imagen' in $$props) $$invalidate(7, imagen = $$props.imagen);
		if ('imagep' in $$props) $$invalidate(8, imagep = $$props.imagep);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*index*/ 8192) {
			{
				const carouselInner = document.querySelector('.carousel-inner');

				if (carouselInner) {
					carouselInner.style.transform = `translateX(-${index * (itemWidth + margin / itemsPerView)}%)`;
				}
			}
		}
	};

	return [
		image1,
		image2,
		image3,
		image4,
		image5,
		image6,
		image7,
		imagen,
		imagep,
		prev,
		next,
		handleKeydown,
		props,
		index
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 12,
			image1: 0,
			image2: 1,
			image3: 2,
			image4: 3,
			image5: 4,
			image6: 5,
			image7: 6,
			imagen: 7,
			imagep: 8
		});
	}
}

export { Component as default };
