import { MAX_BABEL_CHARS } from "../core/constants.js";
import {
  hasModuleSyntax,
  normalizeExports,
  rewriteBareModuleSpecifiersInJs,
  stripImports,
  transformReactSourceWithFallback
} from "../core/helpers.js";

function extractDestructuredPropNames(code) {
  const source = String(code || "");
  const names = new Set();
  const patterns = [
    /\(\s*\{([^}]*)\}\s*(?::[^)]*)?\)\s*=>/g,
    /function\s+[A-Za-z_$][\w$]*\s*\(\s*\{([^}]*)\}\s*(?::[^)]*)?\)/g
  ];

  patterns.forEach((pattern) => {
    let match = pattern.exec(source);
    while (match) {
      const block = String(match[1] || "");
      block.split(",").forEach((part) => {
        let token = String(part || "").trim();
        if (!token) return;
        if (token.startsWith("...")) token = token.slice(3).trim();
        if (token.includes(":")) token = token.split(":")[0].trim();
        if (token.includes("=")) token = token.split("=")[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(token)) names.add(token);
      });
      match = pattern.exec(source);
    }
  });

  return Array.from(names);
}

function inferDefaultPropValue(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower) return "";
  if (
    lower.startsWith("is") ||
    lower.startsWith("has") ||
    lower.startsWith("can") ||
    lower.startsWith("should") ||
    /(enabled|disabled|visible|active|selected|checked|open|loading|ready|error)/.test(lower)
  ) {
    return false;
  }
  if (/(id|count|index|num|age|size|width|height|length|price|total|amount|score|quantity|level|page|step|year|month|day|time|duration)/.test(lower)) {
    return 0;
  }
  if (/(items|list|data|rows|children|options|values|records)/.test(lower)) {
    return [];
  }
  if (/(user|config|meta|info|detail|payload|params|state)/.test(lower)) {
    return {};
  }
  return "";
}

function deriveAutoPropsFromSource(code) {
  const names = extractDestructuredPropNames(code);
  const autoProps = {};
  names.forEach((name) => {
    autoProps[name] = inferDefaultPropValue(name);
  });
  return autoProps;
}

function needsDayjsLibrary(code) {
  return /\bfrom\s*["']dayjs["']/.test(String(code || "")) ||
    /\bimport\s*\(\s*["']dayjs["']\s*\)/.test(String(code || ""));
}

export function createReactRenderer(context) {
  const {
    root,
    cleanupReactRunner,
    loadLibraries,
    nextReactRenderToken,
    setActiveReactRoot,
    setReactEsmRunner
  } = context;

async function renderReactModule(code, theme) {
  if ((code || "").length > MAX_BABEL_CHARS) throw new Error("Code is too large.");

  const libs = ["react", "reactDom", "babel"];
  if (needsDayjsLibrary(code)) libs.push("dayjs");
  await loadLibraries(libs);
  cleanupReactRunner();

  root.innerHTML = "";
  root.className = "mode-app";
  if (theme === "dark") root.classList.add("dark");

  const mount = document.createElement("div");
  mount.id = "react-mount";
  root.appendChild(mount);

  const cleaned = rewriteBareModuleSpecifiersInJs(normalizeExports(code));
  const transformed = transformReactSourceWithFallback(cleaned, "module", {
    jsxRuntime: "automatic"
  });

  const token = nextReactRenderToken();
  window.__PRISM_REACT_RENDER_TOKEN__ = token;
  const autoProps = deriveAutoPropsFromSource(code);
  const autoPropsKey = "__PRISM_REACT_AUTO_PROPS__" + token;
  window[autoPropsKey] = autoProps;

  const moduleScript = document.createElement("script");
  moduleScript.type = "module";
  moduleScript.dataset.prismReactEsmRunner = "true";
  moduleScript.textContent =
    'import { createElement as __PrismInternalCreateElement, Component as __PrismInternalComponent } from "react";\n' +
    'import { createRoot as __PrismCreateRoot } from "react-dom/client";\n\n' +
    transformed + "\n" +
    "const __token = " + token + ";\n" +
    "if (window.__PRISM_REACT_RENDER_TOKEN__ === __token) {\n" +
    "  try {\n" +
    "    const __prismAutoProps = (window[" + JSON.stringify(autoPropsKey) + "] && typeof window[" + JSON.stringify(autoPropsKey) + "] === \"object\") ? window[" + JSON.stringify(autoPropsKey) + "] : {};\n" +
    '    const Comp = typeof PrismDefault !== "undefined" ? PrismDefault : (typeof App !== "undefined" ? App : null);\n' +
    "    const __prismExplicitProps = (\n" +
    '      (typeof prismProps !== "undefined" ? prismProps : undefined) ||\n' +
    '      (typeof PrismProps !== "undefined" ? PrismProps : undefined) ||\n' +
    "      (Comp && Comp.prismProps ? Comp.prismProps : undefined) ||\n" +
    "      (Comp && Comp.defaultProps ? Comp.defaultProps : undefined) ||\n" +
    "      window.__PRISM_REACT_PROPS__ ||\n" +
    "      {}\n" +
    "    );\n" +
    "    const __prismInputProps = Object.assign({}, __prismAutoProps);\n" +
    "    if (__prismExplicitProps && typeof __prismExplicitProps === \"object\") {\n" +
    "      Object.keys(__prismExplicitProps).forEach((key) => {\n" +
    "        const value = __prismExplicitProps[key];\n" +
    "        if (value !== undefined) __prismInputProps[key] = value;\n" +
    "      });\n" +
    "    }\n" +
    "    if (Comp) {\n" +
    '      const mountNode = document.getElementById("react-mount");\n' +
    "      if (mountNode) {\n" +
    "        class __PrismRenderBoundary extends __PrismInternalComponent {\n" +
    "          constructor(props) {\n" +
    "            super(props);\n" +
    "            this.state = { error: null };\n" +
    "          }\n" +
    "          static getDerivedStateFromError(error) {\n" +
    "            return { error };\n" +
    "          }\n" +
    "          componentDidCatch(error) {\n" +
    "            try { console.error(error); } catch (_) {}\n" +
    "          }\n" +
    "          render() {\n" +
    "            if (this.state && this.state.error) {\n" +
    "              const message = (this.state.error && this.state.error.message)\n" +
    "                ? this.state.error.message\n" +
    "                : String(this.state.error);\n" +
    '              return __PrismInternalCreateElement("div", { className: "prism-error" }, message + " (This component may require props. Export `prismProps` for preview.)");\n' +
    "            }\n" +
    "            return this.props.children;\n" +
    "          }\n" +
    "        }\n" +
    "        const r = __PrismCreateRoot(mountNode);\n" +
    "        r.render(\n" +
    "          __PrismInternalCreateElement(\n" +
    "            __PrismRenderBoundary,\n" +
    "            null,\n" +
    "            __PrismInternalCreateElement(Comp, __prismInputProps)\n" +
    "          )\n" +
    "        );\n" +
    "        window.__PRISM_ROOT__ = { unmount: () => r.unmount() };\n" +
    "      }\n" +
    "    }\n" +
    "  } catch (error) {\n" +
    '    const target = document.getElementById("prism-root");\n' +
    "    if (target) {\n" +
    '      const block = document.createElement("div");\n' +
    '      block.className = "prism-error";\n' +
    "      block.textContent = (error && error.message) ? error.message : String(error);\n" +
    "      target.innerHTML = '';\n" +
    "      target.appendChild(block);\n" +
    "    }\n" +
    "  } finally {\n" +
    "    try { delete window[" + JSON.stringify(autoPropsKey) + "]; } catch (_) {}\n" +
    "  }\n" +
    "}\n";
  moduleScript.addEventListener("error", () => {
    if (window.__PRISM_REACT_RENDER_TOKEN__ !== token) return;
    root.innerHTML = `<div class="prism-error">Failed to execute ESM render path.</div>`;
  });

  document.head.appendChild(moduleScript);
  setReactEsmRunner(moduleScript);
  setActiveReactRoot({
    unmount: () => {
      if (window.__PRISM_ROOT__ && typeof window.__PRISM_ROOT__.unmount === "function") {
        try {
          window.__PRISM_ROOT__.unmount();
        } catch (err) {}
      }
      window.__PRISM_ROOT__ = null;
    }
  });
}

// React renderer
async function renderReact(code, theme) {
  try {
    if (hasModuleSyntax(code)) {
      await renderReactModule(code, theme);
      return;
    }

    if ((code || "").length > MAX_BABEL_CHARS) throw new Error("Code is too large.");

    const libs = ["react", "reactDom", "babel"];
    if (needsDayjsLibrary(code)) libs.push("dayjs");
    await loadLibraries(libs);
    cleanupReactRunner();

    root.innerHTML = "";
    root.className = "mode-app";
    if (theme === "dark") root.classList.add("dark");

    const mount = document.createElement("div");
    mount.id = "react-mount";
    root.appendChild(mount);

    const cleaned = normalizeExports(stripImports(code));
    const transformed = transformReactSourceWithFallback(cleaned, "script");
    const autoProps = deriveAutoPropsFromSource(code);

    const runner = `
        ${transformed}
        const __prismAutoProps = (__PRISM_AUTO_PROPS__ && typeof __PRISM_AUTO_PROPS__ === "object")
          ? __PRISM_AUTO_PROPS__
          : {};
        const Comp = typeof PrismDefault !== "undefined" ? PrismDefault : (typeof App !== "undefined" ? App : null);
        const __prismExplicitProps = (
          (typeof prismProps !== "undefined" ? prismProps : undefined) ||
          (typeof PrismProps !== "undefined" ? PrismProps : undefined) ||
          (Comp && Comp.prismProps ? Comp.prismProps : undefined) ||
          (Comp && Comp.defaultProps ? Comp.defaultProps : undefined) ||
          window.__PRISM_REACT_PROPS__ ||
          {}
        );
        const __prismInputProps = Object.assign({}, __prismAutoProps);
        if (__prismExplicitProps && typeof __prismExplicitProps === "object") {
          Object.keys(__prismExplicitProps).forEach((key) => {
            const value = __prismExplicitProps[key];
            if (value !== undefined) __prismInputProps[key] = value;
          });
        }
        if(Comp) {
          class __PrismRenderBoundary extends React.Component {
            constructor(props) {
              super(props);
              this.state = { error: null };
            }
            static getDerivedStateFromError(error) {
              return { error };
            }
            componentDidCatch(error) {
              try { console.error(error); } catch (_) {}
            }
            render() {
              if (this.state && this.state.error) {
                const message = (this.state.error && this.state.error.message)
                  ? this.state.error.message
                  : String(this.state.error);
                return React.createElement(
                  "div",
                  { className: "prism-error" },
                  message + " (This component may require props. Set window.__PRISM_REACT_PROPS__ or Comp.prismProps.)"
                );
              }
              return this.props.children;
            }
          }
          const r = ReactDOM.createRoot(document.getElementById("react-mount"));
          r.render(
            React.createElement(
              __PrismRenderBoundary,
              null,
              React.createElement(Comp, __prismInputProps)
            )
          );
          window.__PRISM_ROOT__ = r;
        }
      `;
    new Function("React", "ReactDOM", "__PRISM_AUTO_PROPS__", runner)(window.React, window.ReactDOM, autoProps);
    setActiveReactRoot(window.__PRISM_ROOT__);
  } catch (e) {
    root.innerHTML = `<div class="prism-error">${e.message}</div>`;
  }
}


  return {
    renderReact
  };
}
