// casos de uso - Updated October 2, 2023
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
	let header;
	let div0;
	let t0;
	let t1;
	let h2;
	let t2;
	let div1;
	let t3;
	let t4;
	let div3;
	let div2;
	let button0;
	let span0;
	let t5_value = /*tarjetas*/ ctx[5][0].title + "";
	let t5;
	let t6;
	let span1;
	let t7_value = /*tarjetas*/ ctx[5][0].description + "";
	let t7;
	let t8;
	let button1;
	let span2;
	let t9_value = /*tarjetas*/ ctx[5][1].title + "";
	let t9;
	let t10;
	let span3;
	let t11_value = /*tarjetas*/ ctx[5][1].description + "";
	let t11;
	let t12;
	let button2;
	let span4;
	let t13_value = /*tarjetas*/ ctx[5][2].title + "";
	let t13;
	let t14;
	let span5;
	let t15_value = /*tarjetas*/ ctx[5][2].description + "";
	let t15;
	let t16;
	let img;
	let img_src_value;
	let mounted;
	let dispose;

	return {
		c() {
			section = element("section");
			header = element("header");
			div0 = element("div");
			t0 = text(/*superhead*/ ctx[2]);
			t1 = space();
			h2 = element("h2");
			t2 = space();
			div1 = element("div");
			t3 = text(/*subhead*/ ctx[1]);
			t4 = space();
			div3 = element("div");
			div2 = element("div");
			button0 = element("button");
			span0 = element("span");
			t5 = text(t5_value);
			t6 = space();
			span1 = element("span");
			t7 = text(t7_value);
			t8 = space();
			button1 = element("button");
			span2 = element("span");
			t9 = text(t9_value);
			t10 = space();
			span3 = element("span");
			t11 = text(t11_value);
			t12 = space();
			button2 = element("button");
			span4 = element("span");
			t13 = text(t13_value);
			t14 = space();
			span5 = element("span");
			t15 = text(t15_value);
			t16 = space();
			img = element("img");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			header = claim_element(section_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div0 = claim_element(header_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, /*superhead*/ ctx[2]);
			div0_nodes.forEach(detach);
			t1 = claim_space(header_nodes);
			h2 = claim_element(header_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			h2_nodes.forEach(detach);
			t2 = claim_space(header_nodes);
			div1 = claim_element(header_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t3 = claim_text(div1_nodes, /*subhead*/ ctx[1]);
			div1_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t4 = claim_space(section_nodes);
			div3 = claim_element(section_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button0 = claim_element(div2_nodes, "BUTTON", { id: true, class: true });
			var button0_nodes = children(button0);
			span0 = claim_element(button0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t5 = claim_text(span0_nodes, t5_value);
			span0_nodes.forEach(detach);
			t6 = claim_space(button0_nodes);
			span1 = claim_element(button0_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t7 = claim_text(span1_nodes, t7_value);
			span1_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			t8 = claim_space(div2_nodes);
			button1 = claim_element(div2_nodes, "BUTTON", { id: true, class: true });
			var button1_nodes = children(button1);
			span2 = claim_element(button1_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t9 = claim_text(span2_nodes, t9_value);
			span2_nodes.forEach(detach);
			t10 = claim_space(button1_nodes);
			span3 = claim_element(button1_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t11 = claim_text(span3_nodes, t11_value);
			span3_nodes.forEach(detach);
			button1_nodes.forEach(detach);
			t12 = claim_space(div2_nodes);
			button2 = claim_element(div2_nodes, "BUTTON", { id: true, class: true });
			var button2_nodes = children(button2);
			span4 = claim_element(button2_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			t13 = claim_text(span4_nodes, t13_value);
			span4_nodes.forEach(detach);
			t14 = claim_space(button2_nodes);
			span5 = claim_element(button2_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			t15 = claim_text(span5_nodes, t15_value);
			span5_nodes.forEach(detach);
			button2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t16 = claim_space(div3_nodes);

			img = claim_element(div3_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			div3_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "superhead svelte-1ogtcux");
			attr(h2, "class", "heading svelte-1ogtcux");
			attr(div1, "class", "subheading");
			attr(header, "class", "heading-group svelte-1ogtcux");
			attr(span0, "class", "title svelte-1ogtcux");
			attr(span1, "class", "description svelte-1ogtcux");
			attr(button0, "id", "box1");
			attr(button0, "class", "card svelte-1ogtcux");
			attr(span2, "class", "title svelte-1ogtcux");
			attr(span3, "class", "description svelte-1ogtcux");
			attr(button1, "id", "box2");
			attr(button1, "class", "card svelte-1ogtcux");
			attr(span4, "class", "title svelte-1ogtcux");
			attr(span5, "class", "description svelte-1ogtcux");
			attr(button2, "id", "box3");
			attr(button2, "class", "card svelte-1ogtcux");
			attr(div2, "class", "cards svelte-1ogtcux");
			attr(img, "id", "imgbox");
			if (!src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[3])) attr(img, "src", img_src_value);
			attr(img, "alt", /*currentAlt*/ ctx[4]);
			attr(img, "class", "svelte-1ogtcux");
			attr(div3, "class", "content  svelte-1ogtcux");
			attr(section, "class", "section-container svelte-1ogtcux");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, header);
			append_hydration(header, div0);
			append_hydration(div0, t0);
			append_hydration(header, t1);
			append_hydration(header, h2);
			h2.innerHTML = /*heading*/ ctx[0];
			append_hydration(header, t2);
			append_hydration(header, div1);
			append_hydration(div1, t3);
			append_hydration(section, t4);
			append_hydration(section, div3);
			append_hydration(div3, div2);
			append_hydration(div2, button0);
			append_hydration(button0, span0);
			append_hydration(span0, t5);
			append_hydration(button0, t6);
			append_hydration(button0, span1);
			append_hydration(span1, t7);
			append_hydration(div2, t8);
			append_hydration(div2, button1);
			append_hydration(button1, span2);
			append_hydration(span2, t9);
			append_hydration(button1, t10);
			append_hydration(button1, span3);
			append_hydration(span3, t11);
			append_hydration(div2, t12);
			append_hydration(div2, button2);
			append_hydration(button2, span4);
			append_hydration(span4, t13);
			append_hydration(button2, t14);
			append_hydration(button2, span5);
			append_hydration(span5, t15);
			append_hydration(div3, t16);
			append_hydration(div3, img);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[12]),
					listen(button1, "click", /*click_handler_1*/ ctx[13]),
					listen(button2, "click", /*click_handler_2*/ ctx[14])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*superhead*/ 4) set_data(t0, /*superhead*/ ctx[2]);
			if (dirty & /*heading*/ 1) h2.innerHTML = /*heading*/ ctx[0];			if (dirty & /*subhead*/ 2) set_data(t3, /*subhead*/ ctx[1]);

			if (dirty & /*currentImage*/ 8 && !src_url_equal(img.src, img_src_value = /*currentImage*/ ctx[3])) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*currentAlt*/ 16) {
				attr(img, "alt", /*currentAlt*/ ctx[4]);
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

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { cards } = $$props;
	let { image1 } = $$props;
	let { image2 } = $$props;
	let { image3 } = $$props;
	let { heading } = $$props;
	let { subhead } = $$props;
	let { superhead } = $$props;

	let tarjetas = [
		{
			title: 'Atención al cliente',
			description: 'Tu chatbot responderá preguntas frecuentes, brindará asistencia inmediata y aliviará carga del personal de atención al cliente.',
			image: 'https://s3-alpha-sig.figma.com/img/dada/170d/42d2ddef457d5eae58372fd30fa2ad9e?Expires=1696809600&Signature=Z3Q8nv-8ND~t3oMIAFqcUtNJ6LgjVzfFQDowRJZcKuymbrduTq4qkiB178R5fuoUOCUpZW0blYW6piqn9Po3H0sTIB792tbuRs~Pqlm9U~c3NzN9t3IJ4CCLu11UltKy4U19ueR17kyF3h1VVoJYBBxTbJbZerf0MqMGCtBHGPNY8szeVSMyr~fZHT01H6VAeM~gsRmbEjrIhcozY~JwA5h47p~TWZF6LguprINJFlO8eNk6VLK6YxBj-O5DJbx2pyTGVNIdHyHLOXjlhRDZKn9gp6sVFszvX4aYkrLHinLiz8~Wwx6ISKnWYe6ceIsQwfKK8vP9nBt8anEvK0zrPA__&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4',
			alt: image1
		},
		{
			title: 'Consultas rápidas de PDF',
			description: 'Tu chatbot te ayudará a encontrar información en tus documentos de forma rápida.',
			image: 'https://s3-alpha-sig.figma.com/img/73c6/e9b0/61f65d5ab8626f8964cae78e89ba699a?Expires=1696809600&Signature=S9XKohO9-63iEsSaOJKiDCokoPRhxqzP0JNhZ5iDL92ptTCSIsD-eJYbf1qjLeluOZLjY5leJjY6CWWjmxxxWrij3-Tw8XoSKTL4Q7DAf-MRBoPx7Ry8l4DHZ7FAhc6HJExCVBs-bCv4BuYIGnzD5iHxIddl2CqqrPAoY9BBSL95Y5NktFW5IpjX5RZ~R4Tl1if~6idHPCndZXcLs9KVJHw4hZvE1vBFLE9Zx5HFdipigvQPpKK3ty8nw03gWkyp1ZyV9l58KLNWVFaaWw~8ha-uMUnn~vn6JRNTYrZUMotoPsTlJ5Bpi7ibxJoszs6gOifXgZWmD7UI8s2tZ4eHcw__&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4',
			alt: image2
		},
		{
			title: 'Experiencia de usuario personalizada',
			description: 'Podrás crear un chatbot adaptado a los usuarios de tu sitio, para que realicen consultas específicas.',
			image: 'https://s3-alpha-sig.figma.com/img/0e90/a0ea/fd690ce11fd68bff112923e0090a2da9?Expires=1696809600&Signature=Y6aT5ZDwyz54Nl6oseBi8XthdlQZC2Nj7eseC8I677kEIbeGGbwT9GKP4jzinzTv3L6BCllXTQdIGynqS~LiUsT2l5B7JtdExgDcQOXSv9w8Z4C3nkuof8TYRwPYHS8p7Ib-Pe9p6m7seqc5OndfZIDxpZLbd245smSC~mnTZziPihVhjuwytYNtif2p7w9nN9MF6IXwaMtKUOLHE~m~pXoT4JpkJtmxmzHkgSYAbXl93K1rZukcMXeYUctBmSc-nC0g8epxyuHsT7KQL0O8pH987BFA8F6EWzxqzZhYeOSoZBuuRwA9gZTPRKeuKjyZYdRPXDWGgHjx6oO5Brctjg__&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4',
			alt: image2
		}
	];

	let currentImage = '';
	let currentAlt = '';
	currentImage = 'https://s3-alpha-sig.figma.com/img/dada/170d/42d2ddef457d5eae58372fd30fa2ad9e?Expires=1696809600&Signature=Z3Q8nv-8ND~t3oMIAFqcUtNJ6LgjVzfFQDowRJZcKuymbrduTq4qkiB178R5fuoUOCUpZW0blYW6piqn9Po3H0sTIB792tbuRs~Pqlm9U~c3NzN9t3IJ4CCLu11UltKy4U19ueR17kyF3h1VVoJYBBxTbJbZerf0MqMGCtBHGPNY8szeVSMyr~fZHT01H6VAeM~gsRmbEjrIhcozY~JwA5h47p~TWZF6LguprINJFlO8eNk6VLK6YxBj-O5DJbx2pyTGVNIdHyHLOXjlhRDZKn9gp6sVFszvX4aYkrLHinLiz8~Wwx6ISKnWYe6ceIsQwfKK8vP9nBt8anEvK0zrPA__&Key-Pair-Id=APKAQ4GOSFWCVNEHN3O4';
	currentAlt = 'Default image';

	function changeimg(i) {
		$$invalidate(3, currentImage = tarjetas[i].image);
		$$invalidate(4, currentAlt = tarjetas[i].alt);
	}

	const click_handler = () => changeimg(0);
	const click_handler_1 = () => changeimg(1);
	const click_handler_2 = () => changeimg(2);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(7, props = $$props.props);
		if ('cards' in $$props) $$invalidate(8, cards = $$props.cards);
		if ('image1' in $$props) $$invalidate(9, image1 = $$props.image1);
		if ('image2' in $$props) $$invalidate(10, image2 = $$props.image2);
		if ('image3' in $$props) $$invalidate(11, image3 = $$props.image3);
		if ('heading' in $$props) $$invalidate(0, heading = $$props.heading);
		if ('subhead' in $$props) $$invalidate(1, subhead = $$props.subhead);
		if ('superhead' in $$props) $$invalidate(2, superhead = $$props.superhead);
	};

	return [
		heading,
		subhead,
		superhead,
		currentImage,
		currentAlt,
		tarjetas,
		changeimg,
		props,
		cards,
		image1,
		image2,
		image3,
		click_handler,
		click_handler_1,
		click_handler_2
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 7,
			cards: 8,
			image1: 9,
			image2: 10,
			image3: 11,
			heading: 0,
			subhead: 1,
			superhead: 2
		});
	}
}

export { Component as default };
