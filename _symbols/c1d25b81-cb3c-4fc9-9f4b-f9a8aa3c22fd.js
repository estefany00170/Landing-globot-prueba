// globot - Updated January 14, 2025
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
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
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
	let style;
	let t0;
	let t1;
	let div2;
	let figure;
	let img0;
	let img0_src_value;
	let img0_alt_value;
	let t2;
	let div1;
	let h1;
	let t3;
	let t4;
	let div0;
	let raw_value = /*subheading*/ ctx[11].html + "";
	let t5;
	let button0;
	let img1;
	let img1_src_value;
	let t6;
	let div11;
	let div10;
	let div3;
	let img2;
	let img2_src_value;
	let t7;
	let span0;
	let h40;
	let t8;
	let t9;
	let div4;
	let img3;
	let img3_src_value;
	let t10;
	let span1;
	let h41;
	let t11;
	let t12;
	let div5;
	let img4;
	let img4_src_value;
	let t13;
	let span2;
	let h42;
	let t14;
	let t15;
	let div6;
	let img5;
	let img5_src_value;
	let t16;
	let span3;
	let h43;
	let t17;
	let t18;
	let div7;
	let img6;
	let img6_src_value;
	let t19;
	let span4;
	let h44;
	let t20;
	let t21;
	let div8;
	let img7;
	let img7_src_value;
	let t22;
	let span5;
	let h45;
	let t23;
	let t24;
	let div9;
	let img8;
	let img8_src_value;
	let t25;
	let span6;
	let h46;
	let t26;
	let t27;
	let button1;
	let img9;
	let img9_src_value;
	let mounted;
	let dispose;

	return {
		c() {
			section = element("section");
			style = element("style");
			t0 = text("@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;700&family=Roboto&display=swap');");
			t1 = space();
			div2 = element("div");
			figure = element("figure");
			img0 = element("img");
			t2 = space();
			div1 = element("div");
			h1 = element("h1");
			t3 = text(/*heading*/ ctx[10]);
			t4 = space();
			div0 = element("div");
			t5 = space();
			button0 = element("button");
			img1 = element("img");
			t6 = space();
			div11 = element("div");
			div10 = element("div");
			div3 = element("div");
			img2 = element("img");
			t7 = space();
			span0 = element("span");
			h40 = element("h4");
			t8 = text("Centros de Salud");
			t9 = space();
			div4 = element("div");
			img3 = element("img");
			t10 = space();
			span1 = element("span");
			h41 = element("h4");
			t11 = text("E-commerce");
			t12 = space();
			div5 = element("div");
			img4 = element("img");
			t13 = space();
			span2 = element("span");
			h42 = element("h4");
			t14 = text("Inmobiliarias");
			t15 = space();
			div6 = element("div");
			img5 = element("img");
			t16 = space();
			span3 = element("span");
			h43 = element("h4");
			t17 = text("Automotriz");
			t18 = space();
			div7 = element("div");
			img6 = element("img");
			t19 = space();
			span4 = element("span");
			h44 = element("h4");
			t20 = text("Estética");
			t21 = space();
			div8 = element("div");
			img7 = element("img");
			t22 = space();
			span5 = element("span");
			h45 = element("h4");
			t23 = text("Centros educativos");
			t24 = space();
			div9 = element("div");
			img8 = element("img");
			t25 = space();
			span6 = element("span");
			h46 = element("h4");
			t26 = text("Sitios informativos");
			t27 = space();
			button1 = element("button");
			img9 = element("img");
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
			div2 = claim_element(section_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			figure = claim_element(div2_nodes, "FIGURE", { class: true });
			var figure_nodes = children(figure);

			img0 = claim_element(figure_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true
			});

			figure_nodes.forEach(detach);
			t2 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h1 = claim_element(div1_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t3 = claim_text(h1_nodes, /*heading*/ ctx[10]);
			h1_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t5 = claim_space(section_nodes);
			button0 = claim_element(section_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			img1 = claim_element(button0_nodes, "IMG", { src: true, alt: true, loading: true });
			button0_nodes.forEach(detach);
			t6 = claim_space(section_nodes);
			div11 = claim_element(section_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			div10 = claim_element(div11_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div3 = claim_element(div10_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);

			img2 = claim_element(div3_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t7 = claim_space(div3_nodes);
			span0 = claim_element(div3_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			h40 = claim_element(span0_nodes, "H4", {});
			var h40_nodes = children(h40);
			t8 = claim_text(h40_nodes, "Centros de Salud");
			h40_nodes.forEach(detach);
			span0_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t9 = claim_space(div10_nodes);
			div4 = claim_element(div10_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);

			img3 = claim_element(div4_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t10 = claim_space(div4_nodes);
			span1 = claim_element(div4_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			h41 = claim_element(span1_nodes, "H4", {});
			var h41_nodes = children(h41);
			t11 = claim_text(h41_nodes, "E-commerce");
			h41_nodes.forEach(detach);
			span1_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t12 = claim_space(div10_nodes);
			div5 = claim_element(div10_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);

			img4 = claim_element(div5_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t13 = claim_space(div5_nodes);
			span2 = claim_element(div5_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			h42 = claim_element(span2_nodes, "H4", {});
			var h42_nodes = children(h42);
			t14 = claim_text(h42_nodes, "Inmobiliarias");
			h42_nodes.forEach(detach);
			span2_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t15 = claim_space(div10_nodes);
			div6 = claim_element(div10_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);

			img5 = claim_element(div6_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t16 = claim_space(div6_nodes);
			span3 = claim_element(div6_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			h43 = claim_element(span3_nodes, "H4", {});
			var h43_nodes = children(h43);
			t17 = claim_text(h43_nodes, "Automotriz");
			h43_nodes.forEach(detach);
			span3_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t18 = claim_space(div10_nodes);
			div7 = claim_element(div10_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);

			img6 = claim_element(div7_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t19 = claim_space(div7_nodes);
			span4 = claim_element(div7_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			h44 = claim_element(span4_nodes, "H4", {});
			var h44_nodes = children(h44);
			t20 = claim_text(h44_nodes, "Estética");
			h44_nodes.forEach(detach);
			span4_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t21 = claim_space(div10_nodes);
			div8 = claim_element(div10_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);

			img7 = claim_element(div8_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t22 = claim_space(div8_nodes);
			span5 = claim_element(div8_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			h45 = claim_element(span5_nodes, "H4", {});
			var h45_nodes = children(h45);
			t23 = claim_text(h45_nodes, "Centros educativos");
			h45_nodes.forEach(detach);
			span5_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t24 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);

			img8 = claim_element(div9_nodes, "IMG", {
				src: true,
				width: true,
				alt: true,
				loading: true,
				class: true
			});

			t25 = claim_space(div9_nodes);
			span6 = claim_element(div9_nodes, "SPAN", { class: true });
			var span6_nodes = children(span6);
			h46 = claim_element(span6_nodes, "H4", {});
			var h46_nodes = children(h46);
			t26 = claim_text(h46_nodes, "Sitios informativos");
			h46_nodes.forEach(detach);
			span6_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			t27 = claim_space(section_nodes);
			button1 = claim_element(section_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			img9 = claim_element(button1_nodes, "IMG", { src: true, alt: true });
			button1_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img0.src, img0_src_value = /*image*/ ctx[0].url)) attr(img0, "src", img0_src_value);
			attr(img0, "width", "100%");
			attr(img0, "alt", img0_alt_value = /*image*/ ctx[0].alt);
			attr(img0, "loading", "lazy");
			attr(figure, "class", "svelte-7ybtty");
			attr(h1, "class", "headline svelte-7ybtty");
			attr(div0, "class", "subheading svelte-7ybtty");
			attr(div1, "class", "body svelte-7ybtty");
			attr(div2, "class", "section-container svelte-7ybtty");
			if (!src_url_equal(img1.src, img1_src_value = /*imagep*/ ctx[9].url)) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "Previous");
			attr(img1, "loading", "lazy");
			attr(button0, "class", "carousel-control-prev svelte-7ybtty");
			if (!src_url_equal(img2.src, img2_src_value = /*image1*/ ctx[1].url)) attr(img2, "src", img2_src_value);
			attr(img2, "width", "100%");
			attr(img2, "alt", "Imagen 1");
			attr(img2, "loading", "lazy");
			attr(img2, "class", "svelte-7ybtty");
			attr(span0, "class", "text svelte-7ybtty");
			attr(div3, "class", "carousel-item active svelte-7ybtty");
			if (!src_url_equal(img3.src, img3_src_value = /*image2*/ ctx[2].url)) attr(img3, "src", img3_src_value);
			attr(img3, "width", "100%");
			attr(img3, "alt", "Imagen 2");
			attr(img3, "loading", "lazy");
			attr(img3, "class", "svelte-7ybtty");
			attr(span1, "class", "text svelte-7ybtty");
			attr(div4, "class", "carousel-item svelte-7ybtty");
			if (!src_url_equal(img4.src, img4_src_value = /*image3*/ ctx[3].url)) attr(img4, "src", img4_src_value);
			attr(img4, "width", "100%");
			attr(img4, "alt", "Imagen 3");
			attr(img4, "loading", "lazy");
			attr(img4, "class", "svelte-7ybtty");
			attr(span2, "class", "text svelte-7ybtty");
			attr(div5, "class", "carousel-item svelte-7ybtty");
			if (!src_url_equal(img5.src, img5_src_value = /*image4*/ ctx[4].url)) attr(img5, "src", img5_src_value);
			attr(img5, "width", "100%");
			attr(img5, "alt", "Imagen 4");
			attr(img5, "loading", "lazy");
			attr(img5, "class", "svelte-7ybtty");
			attr(span3, "class", "text svelte-7ybtty");
			attr(div6, "class", "carousel-item svelte-7ybtty");
			if (!src_url_equal(img6.src, img6_src_value = /*image5*/ ctx[5].url)) attr(img6, "src", img6_src_value);
			attr(img6, "width", "100%");
			attr(img6, "alt", "Imagen 5");
			attr(img6, "loading", "lazy");
			attr(img6, "class", "svelte-7ybtty");
			attr(span4, "class", "text svelte-7ybtty");
			attr(div7, "class", "carousel-item svelte-7ybtty");
			if (!src_url_equal(img7.src, img7_src_value = /*image6*/ ctx[6].url)) attr(img7, "src", img7_src_value);
			attr(img7, "width", "100%");
			attr(img7, "alt", "Imagen 6");
			attr(img7, "loading", "lazy");
			attr(img7, "class", "svelte-7ybtty");
			attr(span5, "class", "text svelte-7ybtty");
			attr(div8, "class", "carousel-item svelte-7ybtty");
			if (!src_url_equal(img8.src, img8_src_value = /*image7*/ ctx[7].url)) attr(img8, "src", img8_src_value);
			attr(img8, "width", "100%");
			attr(img8, "alt", "Imagen 7");
			attr(img8, "loading", "lazy");
			attr(img8, "class", "svelte-7ybtty");
			attr(span6, "class", "text svelte-7ybtty");
			attr(div9, "class", "carousel-item active svelte-7ybtty");
			attr(div10, "class", "carousel-inner svelte-7ybtty");
			attr(div11, "class", "carousel svelte-7ybtty");
			if (!src_url_equal(img9.src, img9_src_value = /*imagen*/ ctx[8].url)) attr(img9, "src", img9_src_value);
			attr(img9, "alt", "Next");
			attr(button1, "class", "carousel-control-next svelte-7ybtty");
			attr(section, "class", "svelte-7ybtty");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, style);
			append_hydration(style, t0);
			append_hydration(section, t1);
			append_hydration(section, div2);
			append_hydration(div2, figure);
			append_hydration(figure, img0);
			append_hydration(div2, t2);
			append_hydration(div2, div1);
			append_hydration(div1, h1);
			append_hydration(h1, t3);
			append_hydration(div1, t4);
			append_hydration(div1, div0);
			div0.innerHTML = raw_value;
			append_hydration(section, t5);
			append_hydration(section, button0);
			append_hydration(button0, img1);
			append_hydration(section, t6);
			append_hydration(section, div11);
			append_hydration(div11, div10);
			append_hydration(div10, div3);
			append_hydration(div3, img2);
			append_hydration(div3, t7);
			append_hydration(div3, span0);
			append_hydration(span0, h40);
			append_hydration(h40, t8);
			append_hydration(div10, t9);
			append_hydration(div10, div4);
			append_hydration(div4, img3);
			append_hydration(div4, t10);
			append_hydration(div4, span1);
			append_hydration(span1, h41);
			append_hydration(h41, t11);
			append_hydration(div10, t12);
			append_hydration(div10, div5);
			append_hydration(div5, img4);
			append_hydration(div5, t13);
			append_hydration(div5, span2);
			append_hydration(span2, h42);
			append_hydration(h42, t14);
			append_hydration(div10, t15);
			append_hydration(div10, div6);
			append_hydration(div6, img5);
			append_hydration(div6, t16);
			append_hydration(div6, span3);
			append_hydration(span3, h43);
			append_hydration(h43, t17);
			append_hydration(div10, t18);
			append_hydration(div10, div7);
			append_hydration(div7, img6);
			append_hydration(div7, t19);
			append_hydration(div7, span4);
			append_hydration(span4, h44);
			append_hydration(h44, t20);
			append_hydration(div10, t21);
			append_hydration(div10, div8);
			append_hydration(div8, img7);
			append_hydration(div8, t22);
			append_hydration(div8, span5);
			append_hydration(span5, h45);
			append_hydration(h45, t23);
			append_hydration(div10, t24);
			append_hydration(div10, div9);
			append_hydration(div9, img8);
			append_hydration(div9, t25);
			append_hydration(div9, span6);
			append_hydration(span6, h46);
			append_hydration(h46, t26);
			append_hydration(section, t27);
			append_hydration(section, button1);
			append_hydration(button1, img9);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*prev*/ ctx[12]),
					listen(button0, "keydown", /*handleKeydown*/ ctx[14]),
					listen(button1, "click", /*next*/ ctx[13]),
					listen(button1, "keydown", /*handleKeydown*/ ctx[14])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*image*/ 1 && !src_url_equal(img0.src, img0_src_value = /*image*/ ctx[0].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (dirty & /*image*/ 1 && img0_alt_value !== (img0_alt_value = /*image*/ ctx[0].alt)) {
				attr(img0, "alt", img0_alt_value);
			}

			if (dirty & /*heading*/ 1024) set_data(t3, /*heading*/ ctx[10]);
			if (dirty & /*subheading*/ 2048 && raw_value !== (raw_value = /*subheading*/ ctx[11].html + "")) div0.innerHTML = raw_value;
			if (dirty & /*imagep*/ 512 && !src_url_equal(img1.src, img1_src_value = /*imagep*/ ctx[9].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (dirty & /*image1*/ 2 && !src_url_equal(img2.src, img2_src_value = /*image1*/ ctx[1].url)) {
				attr(img2, "src", img2_src_value);
			}

			if (dirty & /*image2*/ 4 && !src_url_equal(img3.src, img3_src_value = /*image2*/ ctx[2].url)) {
				attr(img3, "src", img3_src_value);
			}

			if (dirty & /*image3*/ 8 && !src_url_equal(img4.src, img4_src_value = /*image3*/ ctx[3].url)) {
				attr(img4, "src", img4_src_value);
			}

			if (dirty & /*image4*/ 16 && !src_url_equal(img5.src, img5_src_value = /*image4*/ ctx[4].url)) {
				attr(img5, "src", img5_src_value);
			}

			if (dirty & /*image5*/ 32 && !src_url_equal(img6.src, img6_src_value = /*image5*/ ctx[5].url)) {
				attr(img6, "src", img6_src_value);
			}

			if (dirty & /*image6*/ 64 && !src_url_equal(img7.src, img7_src_value = /*image6*/ ctx[6].url)) {
				attr(img7, "src", img7_src_value);
			}

			if (dirty & /*image7*/ 128 && !src_url_equal(img8.src, img8_src_value = /*image7*/ ctx[7].url)) {
				attr(img8, "src", img8_src_value);
			}

			if (dirty & /*imagen*/ 256 && !src_url_equal(img9.src, img9_src_value = /*imagen*/ ctx[8].url)) {
				attr(img9, "src", img9_src_value);
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

let totalItems = 6; // Número total de imágenes
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
	let { image } = $$props;
	let { image1 } = $$props;
	let { image2 } = $$props;
	let { image3 } = $$props;
	let { image4 } = $$props;
	let { image5 } = $$props;
	let { image6 } = $$props;
	let { image7 } = $$props;
	let { imagen } = $$props;
	let { imagep } = $$props;
	let { heading } = $$props;
	let { background } = $$props;
	let { subheading } = $$props;
	let index = 0;
	let interval;

	function prev() {
		if (index > 0) {
			$$invalidate(17, index--, index);
		} else {
			$$invalidate(17, index = totalItems - getItemsPerView()); // Ir al final
		}
	}

	function next() {
		if (index < totalItems - getItemsPerView()) {
			$$invalidate(17, index++, index);
		} else {
			$$invalidate(17, index = 0); // Ir al inicio
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
		carouselInner.style.transform = `translateX(-${index * (getItemWidth() + margin / getItemsPerView())}%)`;

		// Inicia el desplazamiento automático
		interval = setInterval(autoSlide, 3000); // Cambia cada 3 segundos

		// Ajusta la transformación al cambiar el tamaño de la ventana
		window.addEventListener('resize', () => {
			carouselInner.style.transform = `translateX(-${index * (getItemWidth() + margin / getItemsPerView())}%)`;
		});
	});

	onDestroy(() => {
		// Limpia el intervalo cuando el componente se destruye
		clearInterval(interval);

		window.removeEventListener('resize', () => {
			carouselInner.style.transform = `translateX(-${index * (getItemWidth() + margin / getItemsPerView())}%)`;
		});
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(15, props = $$props.props);
		if ('image' in $$props) $$invalidate(0, image = $$props.image);
		if ('image1' in $$props) $$invalidate(1, image1 = $$props.image1);
		if ('image2' in $$props) $$invalidate(2, image2 = $$props.image2);
		if ('image3' in $$props) $$invalidate(3, image3 = $$props.image3);
		if ('image4' in $$props) $$invalidate(4, image4 = $$props.image4);
		if ('image5' in $$props) $$invalidate(5, image5 = $$props.image5);
		if ('image6' in $$props) $$invalidate(6, image6 = $$props.image6);
		if ('image7' in $$props) $$invalidate(7, image7 = $$props.image7);
		if ('imagen' in $$props) $$invalidate(8, imagen = $$props.imagen);
		if ('imagep' in $$props) $$invalidate(9, imagep = $$props.imagep);
		if ('heading' in $$props) $$invalidate(10, heading = $$props.heading);
		if ('background' in $$props) $$invalidate(16, background = $$props.background);
		if ('subheading' in $$props) $$invalidate(11, subheading = $$props.subheading);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*index*/ 131072) {
			{
				const carouselInner = document.querySelector('.carousel-inner');

				if (carouselInner) {
					carouselInner.style.transform = `translateX(-${index * (getItemWidth() + margin / getItemsPerView())}%)`;
				}
			}
		}
	};

	return [
		image,
		image1,
		image2,
		image3,
		image4,
		image5,
		image6,
		image7,
		imagen,
		imagep,
		heading,
		subheading,
		prev,
		next,
		handleKeydown,
		props,
		background,
		index
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 15,
			image: 0,
			image1: 1,
			image2: 2,
			image3: 3,
			image4: 4,
			image5: 5,
			image6: 6,
			image7: 7,
			imagen: 8,
			imagep: 9,
			heading: 10,
			background: 16,
			subheading: 11
		});
	}
}

export { Component as default };
