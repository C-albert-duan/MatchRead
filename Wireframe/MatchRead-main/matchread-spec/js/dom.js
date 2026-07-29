/* =========================================================================
   dom.js — the only rendering primitive in this prototype.
   -------------------------------------------------------------------------
   Classic script, no modules, no build. ES modules are blocked by CORS on
   file:// in every browser, and the brief requires this to open locally with
   no installation. So: ordered <script> tags and one global namespace.

   `h()` is deliberately close to React.createElement so that a component
   written here reads like the .tsx it specifies.
   ========================================================================= */

var MR = window.MR || {};
window.MR = MR;

(function () {
  'use strict';

  /**
   * h(tag, props, ...children)
   *
   * props:
   *   class      -> className
   *   on{Event}  -> addEventListener
   *   data-*     -> setAttribute
   *   html       -> innerHTML (used only for the docs viewer)
   *   anything else -> setAttribute, with booleans handled
   */
  function h(tag, props) {
    var el = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);

    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;

        if (key === 'class') {
          el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
        } else if (key === 'html') {
          el.innerHTML = value;
        } else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          el.setAttribute(key, '');
        } else {
          el.setAttribute(key, String(value));
        }
      });
    }

    append(el, children);
    return el;
  }

  function append(el, children) {
    children.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) return append(el, child);
      el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    });
  }

  /** Replace everything inside a node. */
  function mount(host, node) {
    while (host.firstChild) host.removeChild(host.firstChild);
    if (node) host.appendChild(node);
  }

  /** A document fragment, for components that return a list. */
  function frag() {
    var f = document.createDocumentFragment();
    append(f, Array.prototype.slice.call(arguments));
    return f;
  }

  MR.h = h;
  MR.mount = mount;
  MR.frag = frag;
})();
