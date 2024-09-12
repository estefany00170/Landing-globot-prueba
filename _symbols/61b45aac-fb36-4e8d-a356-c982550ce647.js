// carrusel  - Updated September 12, 2024
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
	let div0;
	let h2;
	let t0;
	let t1;
	let div38;
	let div37;
	let div6;
	let img0;
	let img0_src_value;
	let t2;
	let div5;
	let div4;
	let div2;
	let div1;
	let span0;
	let t3;
	let t4;
	let span1;
	let t5;
	let t6;
	let p0;
	let t7;
	let t8;
	let div3;
	let a0;
	let span2;
	let t9;
	let t10;
	let svg0;
	let path0;
	let t11;
	let div12;
	let img1;
	let img1_src_value;
	let t12;
	let div11;
	let div10;
	let div8;
	let div7;
	let span3;
	let t13;
	let t14;
	let span4;
	let t15;
	let t16;
	let p1;
	let t17;
	let t18;
	let div9;
	let a1;
	let span5;
	let t19;
	let t20;
	let svg1;
	let path1;
	let t21;
	let div18;
	let img2;
	let img2_src_value;
	let t22;
	let div17;
	let div16;
	let div14;
	let div13;
	let span6;
	let t23;
	let t24;
	let span7;
	let t25;
	let t26;
	let p2;
	let t27;
	let t28;
	let div15;
	let a2;
	let span8;
	let t29;
	let t30;
	let svg2;
	let path2;
	let t31;
	let div24;
	let img3;
	let img3_src_value;
	let t32;
	let div23;
	let div22;
	let div20;
	let div19;
	let span9;
	let t33;
	let t34;
	let span10;
	let t35;
	let t36;
	let p3;
	let t37;
	let t38;
	let div21;
	let a3;
	let span11;
	let t39;
	let t40;
	let svg3;
	let path3;
	let t41;
	let div30;
	let img4;
	let img4_src_value;
	let t42;
	let div29;
	let div28;
	let div26;
	let div25;
	let span12;
	let t43;
	let t44;
	let span13;
	let t45;
	let t46;
	let p4;
	let t47;
	let t48;
	let div27;
	let a4;
	let span14;
	let t49;
	let t50;
	let svg4;
	let path4;
	let t51;
	let div36;
	let img5;
	let img5_src_value;
	let t52;
	let div35;
	let div34;
	let div32;
	let div31;
	let span15;
	let t53;
	let t54;
	let span16;
	let t55;
	let t56;
	let p5;
	let t57;
	let t58;
	let div33;
	let a5;
	let span17;
	let t59;
	let t60;
	let svg5;
	let path5;
	let t61;
	let button0;
	let t62;
	let t63;
	let button1;
	let t64;

	return {
		c() {
			section = element("section");
			div0 = element("div");
			h2 = element("h2");
			t0 = text(/*heading*/ ctx[0]);
			t1 = space();
			div38 = element("div");
			div37 = element("div");
			div6 = element("div");
			img0 = element("img");
			t2 = space();
			div5 = element("div");
			div4 = element("div");
			div2 = element("div");
			div1 = element("div");
			span0 = element("span");
			t3 = text("Tour Innovación");
			t4 = space();
			span1 = element("span");
			t5 = text("21/08/24");
			t6 = space();
			p0 = element("p");
			t7 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t8 = space();
			div3 = element("div");
			a0 = element("a");
			span2 = element("span");
			t9 = text("Leer la noticia");
			t10 = space();
			svg0 = svg_element("svg");
			path0 = svg_element("path");
			t11 = space();
			div12 = element("div");
			img1 = element("img");
			t12 = space();
			div11 = element("div");
			div10 = element("div");
			div8 = element("div");
			div7 = element("div");
			span3 = element("span");
			t13 = text("Tour Innovación");
			t14 = space();
			span4 = element("span");
			t15 = text("21/08/24");
			t16 = space();
			p1 = element("p");
			t17 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t18 = space();
			div9 = element("div");
			a1 = element("a");
			span5 = element("span");
			t19 = text("Leer la noticia");
			t20 = space();
			svg1 = svg_element("svg");
			path1 = svg_element("path");
			t21 = space();
			div18 = element("div");
			img2 = element("img");
			t22 = space();
			div17 = element("div");
			div16 = element("div");
			div14 = element("div");
			div13 = element("div");
			span6 = element("span");
			t23 = text("Tour Innovación");
			t24 = space();
			span7 = element("span");
			t25 = text("21/08/24");
			t26 = space();
			p2 = element("p");
			t27 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t28 = space();
			div15 = element("div");
			a2 = element("a");
			span8 = element("span");
			t29 = text("Leer la noticia");
			t30 = space();
			svg2 = svg_element("svg");
			path2 = svg_element("path");
			t31 = space();
			div24 = element("div");
			img3 = element("img");
			t32 = space();
			div23 = element("div");
			div22 = element("div");
			div20 = element("div");
			div19 = element("div");
			span9 = element("span");
			t33 = text("Tour Innovación");
			t34 = space();
			span10 = element("span");
			t35 = text("21/08/24");
			t36 = space();
			p3 = element("p");
			t37 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t38 = space();
			div21 = element("div");
			a3 = element("a");
			span11 = element("span");
			t39 = text("Leer la noticia");
			t40 = space();
			svg3 = svg_element("svg");
			path3 = svg_element("path");
			t41 = space();
			div30 = element("div");
			img4 = element("img");
			t42 = space();
			div29 = element("div");
			div28 = element("div");
			div26 = element("div");
			div25 = element("div");
			span12 = element("span");
			t43 = text("Tour Innovación");
			t44 = space();
			span13 = element("span");
			t45 = text("21/08/24");
			t46 = space();
			p4 = element("p");
			t47 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t48 = space();
			div27 = element("div");
			a4 = element("a");
			span14 = element("span");
			t49 = text("Leer la noticia");
			t50 = space();
			svg4 = svg_element("svg");
			path4 = svg_element("path");
			t51 = space();
			div36 = element("div");
			img5 = element("img");
			t52 = space();
			div35 = element("div");
			div34 = element("div");
			div32 = element("div");
			div31 = element("div");
			span15 = element("span");
			t53 = text("Tour Innovación");
			t54 = space();
			span16 = element("span");
			t55 = text("21/08/24");
			t56 = space();
			p5 = element("p");
			t57 = text("Globot: El asistente virtual para Pymes que nunca duerme");
			t58 = space();
			div33 = element("div");
			a5 = element("a");
			span17 = element("span");
			t59 = text("Leer la noticia");
			t60 = space();
			svg5 = svg_element("svg");
			path5 = svg_element("path");
			t61 = space();
			button0 = element("button");
			t62 = text("❮");
			t63 = space();
			button1 = element("button");
			t64 = text("❯");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div0 = claim_element(section_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, /*heading*/ ctx[0]);
			h2_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t1 = claim_space(section_nodes);
			div38 = claim_element(section_nodes, "DIV", { class: true });
			var div38_nodes = children(div38);
			div37 = claim_element(div38_nodes, "DIV", { class: true });
			var div37_nodes = children(div37);
			div6 = claim_element(div37_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			img0 = claim_element(div6_nodes, "IMG", { src: true, alt: true, class: true });
			t2 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { style: true });
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", {});
			var span0_nodes = children(span0);
			t3 = claim_text(span0_nodes, "Tour Innovación");
			span0_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", {});
			var span1_nodes = children(span1);
			t5 = claim_text(span1_nodes, "21/08/24");
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t6 = claim_space(div2_nodes);
			p0 = claim_element(div2_nodes, "P", {});
			var p0_nodes = children(p0);
			t7 = claim_text(p0_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t8 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", {});
			var div3_nodes = children(div3);
			a0 = claim_element(div3_nodes, "A", { class: true, href: true, target: true });
			var a0_nodes = children(a0);
			span2 = claim_element(a0_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t9 = claim_text(span2_nodes, "Leer la noticia");
			span2_nodes.forEach(detach);
			t10 = claim_space(a0_nodes);

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
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t11 = claim_space(div37_nodes);
			div12 = claim_element(div37_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			img1 = claim_element(div12_nodes, "IMG", { src: true, alt: true, class: true });
			t12 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			div10 = claim_element(div11_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div8 = claim_element(div10_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div7 = claim_element(div8_nodes, "DIV", { style: true });
			var div7_nodes = children(div7);
			span3 = claim_element(div7_nodes, "SPAN", {});
			var span3_nodes = children(span3);
			t13 = claim_text(span3_nodes, "Tour Innovación");
			span3_nodes.forEach(detach);
			t14 = claim_space(div7_nodes);
			span4 = claim_element(div7_nodes, "SPAN", {});
			var span4_nodes = children(span4);
			t15 = claim_text(span4_nodes, "21/08/24");
			span4_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t16 = claim_space(div8_nodes);
			p1 = claim_element(div8_nodes, "P", {});
			var p1_nodes = children(p1);
			t17 = claim_text(p1_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p1_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t18 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", {});
			var div9_nodes = children(div9);
			a1 = claim_element(div9_nodes, "A", { class: true, href: true, target: true });
			var a1_nodes = children(a1);
			span5 = claim_element(a1_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			t19 = claim_text(span5_nodes, "Leer la noticia");
			span5_nodes.forEach(detach);
			t20 = claim_space(a1_nodes);

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
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			t21 = claim_space(div37_nodes);
			div18 = claim_element(div37_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			img2 = claim_element(div18_nodes, "IMG", { src: true, alt: true, class: true });
			t22 = claim_space(div18_nodes);
			div17 = claim_element(div18_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			div16 = claim_element(div17_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			div14 = claim_element(div16_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			div13 = claim_element(div14_nodes, "DIV", { style: true });
			var div13_nodes = children(div13);
			span6 = claim_element(div13_nodes, "SPAN", {});
			var span6_nodes = children(span6);
			t23 = claim_text(span6_nodes, "Tour Innovación");
			span6_nodes.forEach(detach);
			t24 = claim_space(div13_nodes);
			span7 = claim_element(div13_nodes, "SPAN", {});
			var span7_nodes = children(span7);
			t25 = claim_text(span7_nodes, "21/08/24");
			span7_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t26 = claim_space(div14_nodes);
			p2 = claim_element(div14_nodes, "P", {});
			var p2_nodes = children(p2);
			t27 = claim_text(p2_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p2_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			t28 = claim_space(div16_nodes);
			div15 = claim_element(div16_nodes, "DIV", {});
			var div15_nodes = children(div15);
			a2 = claim_element(div15_nodes, "A", { class: true, href: true, target: true });
			var a2_nodes = children(a2);
			span8 = claim_element(a2_nodes, "SPAN", { class: true });
			var span8_nodes = children(span8);
			t29 = claim_text(span8_nodes, "Leer la noticia");
			span8_nodes.forEach(detach);
			t30 = claim_space(a2_nodes);

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
			div15_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			div17_nodes.forEach(detach);
			div18_nodes.forEach(detach);
			t31 = claim_space(div37_nodes);
			div24 = claim_element(div37_nodes, "DIV", { class: true });
			var div24_nodes = children(div24);
			img3 = claim_element(div24_nodes, "IMG", { src: true, alt: true, class: true });
			t32 = claim_space(div24_nodes);
			div23 = claim_element(div24_nodes, "DIV", { class: true });
			var div23_nodes = children(div23);
			div22 = claim_element(div23_nodes, "DIV", { class: true });
			var div22_nodes = children(div22);
			div20 = claim_element(div22_nodes, "DIV", { class: true });
			var div20_nodes = children(div20);
			div19 = claim_element(div20_nodes, "DIV", { style: true });
			var div19_nodes = children(div19);
			span9 = claim_element(div19_nodes, "SPAN", {});
			var span9_nodes = children(span9);
			t33 = claim_text(span9_nodes, "Tour Innovación");
			span9_nodes.forEach(detach);
			t34 = claim_space(div19_nodes);
			span10 = claim_element(div19_nodes, "SPAN", {});
			var span10_nodes = children(span10);
			t35 = claim_text(span10_nodes, "21/08/24");
			span10_nodes.forEach(detach);
			div19_nodes.forEach(detach);
			t36 = claim_space(div20_nodes);
			p3 = claim_element(div20_nodes, "P", {});
			var p3_nodes = children(p3);
			t37 = claim_text(p3_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p3_nodes.forEach(detach);
			div20_nodes.forEach(detach);
			t38 = claim_space(div22_nodes);
			div21 = claim_element(div22_nodes, "DIV", {});
			var div21_nodes = children(div21);
			a3 = claim_element(div21_nodes, "A", { class: true, href: true, target: true });
			var a3_nodes = children(a3);
			span11 = claim_element(a3_nodes, "SPAN", { class: true });
			var span11_nodes = children(span11);
			t39 = claim_text(span11_nodes, "Leer la noticia");
			span11_nodes.forEach(detach);
			t40 = claim_space(a3_nodes);

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
			div21_nodes.forEach(detach);
			div22_nodes.forEach(detach);
			div23_nodes.forEach(detach);
			div24_nodes.forEach(detach);
			t41 = claim_space(div37_nodes);
			div30 = claim_element(div37_nodes, "DIV", { class: true });
			var div30_nodes = children(div30);
			img4 = claim_element(div30_nodes, "IMG", { src: true, alt: true, class: true });
			t42 = claim_space(div30_nodes);
			div29 = claim_element(div30_nodes, "DIV", { class: true });
			var div29_nodes = children(div29);
			div28 = claim_element(div29_nodes, "DIV", { class: true });
			var div28_nodes = children(div28);
			div26 = claim_element(div28_nodes, "DIV", { class: true });
			var div26_nodes = children(div26);
			div25 = claim_element(div26_nodes, "DIV", { style: true });
			var div25_nodes = children(div25);
			span12 = claim_element(div25_nodes, "SPAN", {});
			var span12_nodes = children(span12);
			t43 = claim_text(span12_nodes, "Tour Innovación");
			span12_nodes.forEach(detach);
			t44 = claim_space(div25_nodes);
			span13 = claim_element(div25_nodes, "SPAN", {});
			var span13_nodes = children(span13);
			t45 = claim_text(span13_nodes, "21/08/24");
			span13_nodes.forEach(detach);
			div25_nodes.forEach(detach);
			t46 = claim_space(div26_nodes);
			p4 = claim_element(div26_nodes, "P", {});
			var p4_nodes = children(p4);
			t47 = claim_text(p4_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p4_nodes.forEach(detach);
			div26_nodes.forEach(detach);
			t48 = claim_space(div28_nodes);
			div27 = claim_element(div28_nodes, "DIV", {});
			var div27_nodes = children(div27);
			a4 = claim_element(div27_nodes, "A", { class: true, href: true, target: true });
			var a4_nodes = children(a4);
			span14 = claim_element(a4_nodes, "SPAN", { class: true });
			var span14_nodes = children(span14);
			t49 = claim_text(span14_nodes, "Leer la noticia");
			span14_nodes.forEach(detach);
			t50 = claim_space(a4_nodes);

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
			div27_nodes.forEach(detach);
			div28_nodes.forEach(detach);
			div29_nodes.forEach(detach);
			div30_nodes.forEach(detach);
			t51 = claim_space(div37_nodes);
			div36 = claim_element(div37_nodes, "DIV", { class: true });
			var div36_nodes = children(div36);
			img5 = claim_element(div36_nodes, "IMG", { src: true, alt: true, class: true });
			t52 = claim_space(div36_nodes);
			div35 = claim_element(div36_nodes, "DIV", { class: true });
			var div35_nodes = children(div35);
			div34 = claim_element(div35_nodes, "DIV", { class: true });
			var div34_nodes = children(div34);
			div32 = claim_element(div34_nodes, "DIV", { class: true });
			var div32_nodes = children(div32);
			div31 = claim_element(div32_nodes, "DIV", { style: true });
			var div31_nodes = children(div31);
			span15 = claim_element(div31_nodes, "SPAN", {});
			var span15_nodes = children(span15);
			t53 = claim_text(span15_nodes, "Tour Innovación");
			span15_nodes.forEach(detach);
			t54 = claim_space(div31_nodes);
			span16 = claim_element(div31_nodes, "SPAN", {});
			var span16_nodes = children(span16);
			t55 = claim_text(span16_nodes, "21/08/24");
			span16_nodes.forEach(detach);
			div31_nodes.forEach(detach);
			t56 = claim_space(div32_nodes);
			p5 = claim_element(div32_nodes, "P", {});
			var p5_nodes = children(p5);
			t57 = claim_text(p5_nodes, "Globot: El asistente virtual para Pymes que nunca duerme");
			p5_nodes.forEach(detach);
			div32_nodes.forEach(detach);
			t58 = claim_space(div34_nodes);
			div33 = claim_element(div34_nodes, "DIV", {});
			var div33_nodes = children(div33);
			a5 = claim_element(div33_nodes, "A", { class: true, href: true, target: true });
			var a5_nodes = children(a5);
			span17 = claim_element(a5_nodes, "SPAN", { class: true });
			var span17_nodes = children(span17);
			t59 = claim_text(span17_nodes, "Leer la noticia");
			span17_nodes.forEach(detach);
			t60 = claim_space(a5_nodes);

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
			div33_nodes.forEach(detach);
			div34_nodes.forEach(detach);
			div35_nodes.forEach(detach);
			div36_nodes.forEach(detach);
			div37_nodes.forEach(detach);
			t61 = claim_space(div38_nodes);
			button0 = claim_element(div38_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t62 = claim_text(button0_nodes, "❮");
			button0_nodes.forEach(detach);
			t63 = claim_space(div38_nodes);
			button1 = claim_element(div38_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t64 = claim_text(button1_nodes, "❯");
			button1_nodes.forEach(detach);
			div38_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "heading");
			attr(div0, "class", "title");
			if (!src_url_equal(img0.src, img0_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img0, "src", img0_src_value);
			attr(img0, "alt", "imagen1");
			attr(img0, "class", "svelte-75vrg0");
			set_style(div1, "display", "flex");
			set_style(div1, "justify-content", "space-between");
			set_style(div1, "width", "100%");
			attr(div2, "class", "date svelte-75vrg0");
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
			attr(div4, "class", "text svelte-75vrg0");
			attr(div5, "class", "part2 svelte-75vrg0");
			attr(div6, "class", "card svelte-75vrg0");
			if (!src_url_equal(img1.src, img1_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "imagen1");
			attr(img1, "class", "svelte-75vrg0");
			set_style(div7, "display", "flex");
			set_style(div7, "justify-content", "space-between");
			set_style(div7, "width", "100%");
			attr(div8, "class", "date svelte-75vrg0");
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
			attr(div10, "class", "text svelte-75vrg0");
			attr(div11, "class", "part2 svelte-75vrg0");
			attr(div12, "class", "card svelte-75vrg0");
			if (!src_url_equal(img2.src, img2_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726150725486view%201.svg")) attr(img2, "src", img2_src_value);
			attr(img2, "alt", "imagen1");
			attr(img2, "class", "svelte-75vrg0");
			set_style(div13, "display", "flex");
			set_style(div13, "justify-content", "space-between");
			set_style(div13, "width", "100%");
			attr(div14, "class", "date svelte-75vrg0");
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
			attr(div16, "class", "text svelte-75vrg0");
			attr(div17, "class", "part2 svelte-75vrg0");
			attr(div18, "class", "card svelte-75vrg0");
			if (!src_url_equal(img3.src, img3_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img3, "src", img3_src_value);
			attr(img3, "alt", "imagen1");
			attr(img3, "class", "svelte-75vrg0");
			set_style(div19, "display", "flex");
			set_style(div19, "justify-content", "space-between");
			set_style(div19, "width", "100%");
			attr(div20, "class", "date svelte-75vrg0");
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
			attr(div22, "class", "text svelte-75vrg0");
			attr(div23, "class", "part2 svelte-75vrg0");
			attr(div24, "class", "card svelte-75vrg0");
			if (!src_url_equal(img4.src, img4_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img4, "src", img4_src_value);
			attr(img4, "alt", "imagen1");
			attr(img4, "class", "svelte-75vrg0");
			set_style(div25, "display", "flex");
			set_style(div25, "justify-content", "space-between");
			set_style(div25, "width", "100%");
			attr(div26, "class", "date svelte-75vrg0");
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
			attr(div28, "class", "text svelte-75vrg0");
			attr(div29, "class", "part2 svelte-75vrg0");
			attr(div30, "class", "card svelte-75vrg0");
			if (!src_url_equal(img5.src, img5_src_value = "https://bvyolarusyudhhaxhyjk.supabase.co/storage/v1/object/public/images/8762b14d-dc88-46a2-89e9-945b4c930503/1726151745924view%201%20(1).svg")) attr(img5, "src", img5_src_value);
			attr(img5, "alt", "imagen1");
			attr(img5, "class", "svelte-75vrg0");
			set_style(div31, "display", "flex");
			set_style(div31, "justify-content", "space-between");
			set_style(div31, "width", "100%");
			attr(div32, "class", "date svelte-75vrg0");
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
			attr(div34, "class", "text svelte-75vrg0");
			attr(div35, "class", "part2 svelte-75vrg0");
			attr(div36, "class", "card svelte-75vrg0");
			attr(div37, "class", "carousel-inner svelte-75vrg0");
			attr(button0, "class", "carousel-control-prev svelte-75vrg0");
			attr(button1, "class", "carousel-control-next svelte-75vrg0");
			attr(div38, "class", "carousel svelte-75vrg0");
			attr(section, "class", "news-carousel svelte-75vrg0");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(section, t1);
			append_hydration(section, div38);
			append_hydration(div38, div37);
			append_hydration(div37, div6);
			append_hydration(div6, img0);
			append_hydration(div6, t2);
			append_hydration(div6, div5);
			append_hydration(div5, div4);
			append_hydration(div4, div2);
			append_hydration(div2, div1);
			append_hydration(div1, span0);
			append_hydration(span0, t3);
			append_hydration(div1, t4);
			append_hydration(div1, span1);
			append_hydration(span1, t5);
			append_hydration(div2, t6);
			append_hydration(div2, p0);
			append_hydration(p0, t7);
			append_hydration(div4, t8);
			append_hydration(div4, div3);
			append_hydration(div3, a0);
			append_hydration(a0, span2);
			append_hydration(span2, t9);
			append_hydration(a0, t10);
			append_hydration(a0, svg0);
			append_hydration(svg0, path0);
			append_hydration(div37, t11);
			append_hydration(div37, div12);
			append_hydration(div12, img1);
			append_hydration(div12, t12);
			append_hydration(div12, div11);
			append_hydration(div11, div10);
			append_hydration(div10, div8);
			append_hydration(div8, div7);
			append_hydration(div7, span3);
			append_hydration(span3, t13);
			append_hydration(div7, t14);
			append_hydration(div7, span4);
			append_hydration(span4, t15);
			append_hydration(div8, t16);
			append_hydration(div8, p1);
			append_hydration(p1, t17);
			append_hydration(div10, t18);
			append_hydration(div10, div9);
			append_hydration(div9, a1);
			append_hydration(a1, span5);
			append_hydration(span5, t19);
			append_hydration(a1, t20);
			append_hydration(a1, svg1);
			append_hydration(svg1, path1);
			append_hydration(div37, t21);
			append_hydration(div37, div18);
			append_hydration(div18, img2);
			append_hydration(div18, t22);
			append_hydration(div18, div17);
			append_hydration(div17, div16);
			append_hydration(div16, div14);
			append_hydration(div14, div13);
			append_hydration(div13, span6);
			append_hydration(span6, t23);
			append_hydration(div13, t24);
			append_hydration(div13, span7);
			append_hydration(span7, t25);
			append_hydration(div14, t26);
			append_hydration(div14, p2);
			append_hydration(p2, t27);
			append_hydration(div16, t28);
			append_hydration(div16, div15);
			append_hydration(div15, a2);
			append_hydration(a2, span8);
			append_hydration(span8, t29);
			append_hydration(a2, t30);
			append_hydration(a2, svg2);
			append_hydration(svg2, path2);
			append_hydration(div37, t31);
			append_hydration(div37, div24);
			append_hydration(div24, img3);
			append_hydration(div24, t32);
			append_hydration(div24, div23);
			append_hydration(div23, div22);
			append_hydration(div22, div20);
			append_hydration(div20, div19);
			append_hydration(div19, span9);
			append_hydration(span9, t33);
			append_hydration(div19, t34);
			append_hydration(div19, span10);
			append_hydration(span10, t35);
			append_hydration(div20, t36);
			append_hydration(div20, p3);
			append_hydration(p3, t37);
			append_hydration(div22, t38);
			append_hydration(div22, div21);
			append_hydration(div21, a3);
			append_hydration(a3, span11);
			append_hydration(span11, t39);
			append_hydration(a3, t40);
			append_hydration(a3, svg3);
			append_hydration(svg3, path3);
			append_hydration(div37, t41);
			append_hydration(div37, div30);
			append_hydration(div30, img4);
			append_hydration(div30, t42);
			append_hydration(div30, div29);
			append_hydration(div29, div28);
			append_hydration(div28, div26);
			append_hydration(div26, div25);
			append_hydration(div25, span12);
			append_hydration(span12, t43);
			append_hydration(div25, t44);
			append_hydration(div25, span13);
			append_hydration(span13, t45);
			append_hydration(div26, t46);
			append_hydration(div26, p4);
			append_hydration(p4, t47);
			append_hydration(div28, t48);
			append_hydration(div28, div27);
			append_hydration(div27, a4);
			append_hydration(a4, span14);
			append_hydration(span14, t49);
			append_hydration(a4, t50);
			append_hydration(a4, svg4);
			append_hydration(svg4, path4);
			append_hydration(div37, t51);
			append_hydration(div37, div36);
			append_hydration(div36, img5);
			append_hydration(div36, t52);
			append_hydration(div36, div35);
			append_hydration(div35, div34);
			append_hydration(div34, div32);
			append_hydration(div32, div31);
			append_hydration(div31, span15);
			append_hydration(span15, t53);
			append_hydration(div31, t54);
			append_hydration(div31, span16);
			append_hydration(span16, t55);
			append_hydration(div32, t56);
			append_hydration(div32, p5);
			append_hydration(p5, t57);
			append_hydration(div34, t58);
			append_hydration(div34, div33);
			append_hydration(div33, a5);
			append_hydration(a5, span17);
			append_hydration(span17, t59);
			append_hydration(a5, t60);
			append_hydration(a5, svg5);
			append_hydration(svg5, path5);
			append_hydration(div38, t61);
			append_hydration(div38, button0);
			append_hydration(button0, t62);
			append_hydration(div38, t63);
			append_hydration(div38, button1);
			append_hydration(button1, t64);
		},
		p(ctx, [dirty]) {
			if (dirty & /*heading*/ 1) set_data(t0, /*heading*/ ctx[0]);
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { cards } = $$props;
	let { heading } = $$props;

	document.addEventListener('DOMContentLoaded', function () {
		let currentIndex = 0;

		function showSlide(index) {
			const slides = document.querySelectorAll('.card');
			const totalSlides = slides.length;
			const visibleSlides = 4; // Número de tarjetas visibles a la vez

			if (index >= totalSlides - visibleSlides + 1) {
				currentIndex = 0;
			} else if (index < 0) {
				currentIndex = totalSlides - visibleSlides;
			} else {
				currentIndex = index;
			}

			const offset = -currentIndex * (100 / visibleSlides);
			document.querySelector('.carousel-inner').style.transform = `translateX(${offset}%)`;
		}

		function nextSlide() {
			showSlide(currentIndex + 1);
		}

		function prevSlide() {
			showSlide(currentIndex - 1);
		}

		// Inicializar el carrusel
		showSlide(currentIndex);

		document.querySelector('.carousel-control-next').addEventListener('click', nextSlide);
		document.querySelector('.carousel-control-prev').addEventListener('click', prevSlide);
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(1, props = $$props.props);
		if ('cards' in $$props) $$invalidate(2, cards = $$props.cards);
		if ('heading' in $$props) $$invalidate(0, heading = $$props.heading);
	};

	return [heading, props, cards];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 1, cards: 2, heading: 0 });
	}
}

export { Component as default };
