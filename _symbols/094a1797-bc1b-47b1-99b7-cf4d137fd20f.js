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

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[10] = list[i];
	child_ctx[12] = i;
	return child_ctx;
}

// (241:6) {#each cards as card, index}
function create_each_block(ctx) {
	let div5;
	let img;
	let img_src_value;
	let img_alt_value;
	let t0;
	let div4;
	let div3;
	let div1;
	let div0;
	let span0;
	let t1_value = /*card*/ ctx[10].subtitle + "";
	let t1;
	let t2;
	let span1;
	let t3_value = /*card*/ ctx[10].date + "";
	let t3;
	let t4;
	let p;
	let t5_value = /*card*/ ctx[10].title + "";
	let t5;
	let t6;
	let div2;
	let a;
	let span2;
	let t7_value = /*card*/ ctx[10].link.label + "";
	let t7;
	let t8;
	let svg;
	let path;
	let a_href_value;
	let t9;

	return {
		c() {
			div5 = element("div");
			img = element("img");
			t0 = space();
			div4 = element("div");
			div3 = element("div");
			div1 = element("div");
			div0 = element("div");
			span0 = element("span");
			t1 = text(t1_value);
			t2 = space();
			span1 = element("span");
			t3 = text(t3_value);
			t4 = space();
			p = element("p");
			t5 = text(t5_value);
			t6 = space();
			div2 = element("div");
			a = element("a");
			span2 = element("span");
			t7 = text(t7_value);
			t8 = space();
			svg = svg_element("svg");
			path = svg_element("path");
			t9 = space();
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			img = claim_element(div5_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { style: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t1 = claim_text(span0_nodes, t1_value);
			span0_nodes.forEach(detach);
			t2 = claim_space(div0_nodes);
			span1 = claim_element(div0_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t3 = claim_text(span1_nodes, t3_value);
			span1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t5 = claim_text(p_nodes, t5_value);
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t6 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", {});
			var div2_nodes = children(div2);
			a = claim_element(div2_nodes, "A", { class: true, href: true, target: true });
			var a_nodes = children(a);
			span2 = claim_element(a_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t7 = claim_text(span2_nodes, t7_value);
			span2_nodes.forEach(detach);
			t8 = claim_space(a_nodes);

			svg = claim_svg_element(a_nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true,
				fill: true
			});

			var svg_nodes = children(svg);

			path = claim_svg_element(svg_nodes, "path", {
				d: true,
				stroke: true,
				"stroke-width": true,
				"stroke-linecap": true,
				"stroke-linejoin": true
			});

			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			a_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t9 = claim_space(div5_nodes);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img.src, img_src_value = /*card*/ ctx[10].image.url)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*card*/ ctx[10].title);
			attr(img, "class", "svelte-jusuwq");
			attr(span0, "class", "subtitle svelte-jusuwq");
			attr(span1, "class", "fecha svelte-jusuwq");
			set_style(div0, "display", "flex");
			set_style(div0, "justify-content", "space-between");
			set_style(div0, "width", "100%");
			set_style(div0, "font-size", "14.421px");
			attr(p, "class", "titleContent svelte-jusuwq");
			attr(div1, "class", "date svelte-jusuwq");
			attr(span2, "class", "label svelte-jusuwq");
			attr(path, "d", "M11.7747 5.42969L17.8587 11.5137L11.7747 17.5977M17.0137 11.5137H4.67664");
			attr(path, "stroke", "#7B5CF5");
			attr(path, "stroke-width", "2.028");
			attr(path, "stroke-linecap", "round");
			attr(path, "stroke-linejoin", "round");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg, "width", "23");
			attr(svg, "height", "23");
			attr(svg, "viewBox", "0 0 23 23");
			attr(svg, "fill", "none");
			attr(a, "class", "link svelte-jusuwq");
			attr(a, "href", a_href_value = /*card*/ ctx[10].link.url);
			attr(a, "target", "_blank");
			attr(div3, "class", "text svelte-jusuwq");
			attr(div4, "class", "part2 svelte-jusuwq");
			attr(div5, "class", "slider-item svelte-jusuwq");
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, img);
			append_hydration(div5, t0);
			append_hydration(div5, div4);
			append_hydration(div4, div3);
			append_hydration(div3, div1);
			append_hydration(div1, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t1);
			append_hydration(div0, t2);
			append_hydration(div0, span1);
			append_hydration(span1, t3);
			append_hydration(div1, t4);
			append_hydration(div1, p);
			append_hydration(p, t5);
			append_hydration(div3, t6);
			append_hydration(div3, div2);
			append_hydration(div2, a);
			append_hydration(a, span2);
			append_hydration(span2, t7);
			append_hydration(a, t8);
			append_hydration(a, svg);
			append_hydration(svg, path);
			append_hydration(div5, t9);
		},
		p(ctx, dirty) {
			if (dirty & /*cards*/ 1 && !src_url_equal(img.src, img_src_value = /*card*/ ctx[10].image.url)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*cards*/ 1 && img_alt_value !== (img_alt_value = /*card*/ ctx[10].title)) {
				attr(img, "alt", img_alt_value);
			}

			if (dirty & /*cards*/ 1 && t1_value !== (t1_value = /*card*/ ctx[10].subtitle + "")) set_data(t1, t1_value);
			if (dirty & /*cards*/ 1 && t3_value !== (t3_value = /*card*/ ctx[10].date + "")) set_data(t3, t3_value);
			if (dirty & /*cards*/ 1 && t5_value !== (t5_value = /*card*/ ctx[10].title + "")) set_data(t5, t5_value);
			if (dirty & /*cards*/ 1 && t7_value !== (t7_value = /*card*/ ctx[10].link.label + "")) set_data(t7, t7_value);

			if (dirty & /*cards*/ 1 && a_href_value !== (a_href_value = /*card*/ ctx[10].link.url)) {
				attr(a, "href", a_href_value);
			}
		},
		d(detaching) {
			if (detaching) detach(div5);
		}
	};
}

function create_fragment(ctx) {
	let section;
	let style;
	let t0;
	let t1;
	let div1;
	let h2;
	let t2;
	let t3;
	let div0;
	let button0;
	let img0;
	let img0_src_value;
	let t4;
	let button1;
	let img1;
	let img1_src_value;
	let t5;
	let div3;
	let div2;
	let mounted;
	let dispose;
	let each_value = /*cards*/ ctx[0];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			section = element("section");
			style = element("style");
			t0 = text("@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Roboto&display=swap');");
			t1 = space();
			div1 = element("div");
			h2 = element("h2");
			t2 = text(/*heading*/ ctx[3]);
			t3 = space();
			div0 = element("div");
			button0 = element("button");
			img0 = element("img");
			t4 = space();
			button1 = element("button");
			img1 = element("img");
			t5 = space();
			div3 = element("div");
			div2 = element("div");

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
			t0 = claim_text(style_nodes, "@import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Roboto&display=swap');");
			style_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			div1 = claim_element(section_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t2 = claim_text(h2_nodes, /*heading*/ ctx[3]);
			h2_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { style: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			img0 = claim_element(button0_nodes, "IMG", { src: true, alt: true });
			button0_nodes.forEach(detach);
			t4 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			img1 = claim_element(button1_nodes, "IMG", { src: true, alt: true });
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t5 = claim_space(section_nodes);
			div3 = claim_element(section_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div2_nodes);
			}

			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "heading svelte-jusuwq");
			if (!src_url_equal(img0.src, img0_src_value = /*imagep*/ ctx[2].url)) attr(img0, "src", img0_src_value);
			attr(img0, "alt", "Previous");
			attr(button0, "class", "slider-control-prev");
			if (!src_url_equal(img1.src, img1_src_value = /*imagen*/ ctx[1].url)) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "Next");
			attr(button1, "class", "slider-control-next");
			set_style(div0, "display", "flex");
			set_style(div0, "align-items", "center");
			set_style(div0, "gap", "12px");
			attr(div1, "class", "title svelte-jusuwq");
			attr(div2, "class", "slider-inner svelte-jusuwq");
			attr(div3, "class", "slider svelte-jusuwq");
			attr(section, "class", "news-slider svelte-jusuwq");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, style);
			append_hydration(style, t0);
			append_hydration(section, t1);
			append_hydration(section, div1);
			append_hydration(div1, h2);
			append_hydration(h2, t2);
			append_hydration(div1, t3);
			append_hydration(div1, div0);
			append_hydration(div0, button0);
			append_hydration(button0, img0);
			append_hydration(div0, t4);
			append_hydration(div0, button1);
			append_hydration(button1, img1);
			append_hydration(section, t5);
			append_hydration(section, div3);
			append_hydration(div3, div2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div2, null);
				}
			}

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*goPrev*/ ctx[4]),
					listen(button0, "keydown", /*handleKeyNavigation*/ ctx[6]),
					listen(button1, "click", /*goNext*/ ctx[5]),
					listen(button1, "keydown", /*handleKeyNavigation*/ ctx[6])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*heading*/ 8) set_data(t2, /*heading*/ ctx[3]);

			if (dirty & /*imagep*/ 4 && !src_url_equal(img0.src, img0_src_value = /*imagep*/ ctx[2].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (dirty & /*imagen*/ 2 && !src_url_equal(img1.src, img1_src_value = /*imagen*/ ctx[1].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (dirty & /*cards*/ 1) {
				each_value = /*cards*/ ctx[0];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div2, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

let totalSlides = 7; // Número total de imágenes
const slidesPerViewDesktop = 4; // Número de imágenes visibles a la vez en desktop
const slidesPerViewMobile = 1; // Número de imágenes visibles a la vez en mobile
const slideWidthDesktop = 25; // Porcentaje del ancho de cada imagen en desktop
const slideWidthMobile = 75; // Porcentaje del ancho de cada imagen en mobile
const slideMargin = 44; // Margen entre las imágenes

function getSlidesPerView() {
	return window.innerWidth <= 768
	? slidesPerViewMobile
	: slidesPerViewDesktop;
}

function getSlideWidth() {
	return window.innerWidth <= 768
	? slideWidthMobile
	: slideWidthDesktop;
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { cards } = $$props;
	let { imagen } = $$props;
	let { imagep } = $$props;
	let { heading } = $$props;
	let currentIndex = 0;
	let autoSlideInterval;

	function goPrev() {
		if (currentIndex > 0) {
			$$invalidate(8, currentIndex--, currentIndex);
		} else {
			$$invalidate(8, currentIndex = totalSlides - getSlidesPerView()); // Ir al final
		}
	}

	function goNext() {
		if (currentIndex < totalSlides - getSlidesPerView()) {
			$$invalidate(8, currentIndex++, currentIndex);
		} else {
			$$invalidate(8, currentIndex = 0); // Ir al inicio
		}
	}

	function handleKeyNavigation(event) {
		if (event.key === 'ArrowLeft') {
			goPrev();
		} else if (event.key === 'ArrowRight') {
			goNext();
		}
	}

	onMount(() => {
		const sliderInner = document.querySelector('.slider-inner');
		sliderInner.style.transform = `translateX(-${currentIndex * (getSlideWidth() + slideMargin / getSlidesPerView())}%)`;

		// Elimina el desplazamiento automático
		// autoSlideInterval = setInterval(autoSlide, 8000); // Cambia cada 3 segundos
		// Ajusta la transformación al cambiar el tamaño de la ventana
		window.addEventListener('resize', () => {
			sliderInner.style.transform = `translateX(-${currentIndex * (getSlideWidth() + slideMargin / getSlidesPerView())}%)`;
		});
	});

	onDestroy(() => {
		// Limpia el intervalo cuando el componente se destruye
		clearInterval(autoSlideInterval);

		window.removeEventListener('resize', () => {
			const sliderInner = document.querySelector('.slider-inner');
			sliderInner.style.transform = `translateX(-${currentIndex * (getSlideWidth() + slideMargin / getSlidesPerView())}%)`;
		});
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(7, props = $$props.props);
		if ('cards' in $$props) $$invalidate(0, cards = $$props.cards);
		if ('imagen' in $$props) $$invalidate(1, imagen = $$props.imagen);
		if ('imagep' in $$props) $$invalidate(2, imagep = $$props.imagep);
		if ('heading' in $$props) $$invalidate(3, heading = $$props.heading);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*currentIndex*/ 256) {
			{
				const sliderInner = document.querySelector('.slider-inner');

				if (sliderInner) {
					sliderInner.style.transform = `translateX(-${currentIndex * (getSlideWidth() + slideMargin / getSlidesPerView())}%)`;
				}
			}
		}
	};

	return [
		cards,
		imagen,
		imagep,
		heading,
		goPrev,
		goNext,
		handleKeyNavigation,
		props,
		currentIndex
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 7,
			cards: 0,
			imagen: 1,
			imagep: 2,
			heading: 3
		});
	}
}

export { Component as default };
