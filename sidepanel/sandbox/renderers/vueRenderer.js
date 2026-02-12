import {
  collectTopLevelBindingNames,
  isTypeScriptLike,
  normalizeExports,
  parseVueSfc,
  stripImports,
  stripTypeScriptSyntax
} from "../core/helpers.js";

export function createVueRenderer(context) {
  const {
    root,
    applyVueStyles,
    cleanupReactRunner,
    loadLibraries,
    setActiveVueApp
  } = context;

async function maybeTransformTypeScriptForVue(code, sourceType, forceTs) {
  const source = String(code || "");
  if (!source) return source;
  if (!forceTs && !isTypeScriptLike(source)) return source;
  await loadLibraries(["babel"]);
  return stripTypeScriptSyntax(source, sourceType);
}

async function renderVue(code, theme) {
  try {
    const parsedSfc = parseVueSfc(code);
    if (parsedSfc && parsedSfc.error) {
      throw new Error(parsedSfc.error);
    }

    const sfcScriptLang = parsedSfc ? String(parsedSfc.scriptLang || "") : "";
    const sfcSetupLang = parsedSfc ? String(parsedSfc.setupScriptLang || "") : "";
    const needsBabel =
      isTypeScriptLike(code) ||
      sfcScriptLang.startsWith("ts") ||
      sfcSetupLang.startsWith("ts");

    await loadLibraries(needsBabel ? ["vue", "babel"] : ["vue"]);
    cleanupReactRunner();

    root.innerHTML = "";
    root.className = "mode-app";
    if (theme === "dark") root.classList.add("dark");

    const mount = document.createElement("div");
    mount.id = "app";
    root.appendChild(mount);

    let inlineTemplate = "";
    let optionScript = String(code || "");
    let setupScript = "";
    let setupBindings = [];
    let isSetupSfc = false;
    let forceOptionTs = false;
    let forceSetupTs = false;

    if (parsedSfc) {
      inlineTemplate = String(parsedSfc.template || "").trim();
      applyVueStyles(parsedSfc.styles || []);
      if (parsedSfc.hasSetup) {
        isSetupSfc = true;
        setupScript = String(parsedSfc.setupScript || "");
        forceSetupTs = String(parsedSfc.setupScriptLang || "").startsWith("ts");
      } else {
        optionScript = parsedSfc.script
          ? String(parsedSfc.script)
          : "const App = {};";
        forceOptionTs = String(parsedSfc.scriptLang || "").startsWith("ts");
      }
    } else {
      applyVueStyles([]);
    }

    const templateLiteral = JSON.stringify(inlineTemplate || "");
    const baseVueBindings = `
        const {
          createApp,
          ref,
          reactive,
          computed,
          watch,
          watchEffect,
          onMounted,
          onUnmounted,
          onUpdated,
          nextTick
        } = Vue || {};
      `;

    if (isSetupSfc) {
      let setupCode = stripImports(setupScript || "");
      setupCode = await maybeTransformTypeScriptForVue(setupCode, "script", forceSetupTs);
      setupBindings = collectTopLevelBindingNames(setupCode);
      const setupBindingsSource = setupBindings.length > 0
        ? `{ ${setupBindings.map((name) => `${JSON.stringify(name)}: (typeof ${name} === "undefined" ? undefined : ${name})`).join(", ")} }`
        : "{}";
      const setupReturnSource = `Object.assign({}, (__props && typeof __props === "object" ? __props : {}), (typeof props !== "undefined" && props && typeof props === "object" ? props : {}), ${setupBindingsSource})`;
      const runner = `
          ${baseVueBindings}
          const mountSelector = "#app";
          const __prismInlineTemplate = ${templateLiteral};
          const Candidate = {
            setup(__props, __ctx) {
              const defineProps = (value) => value || __props || {};
              const defineEmits = () => (...args) => (__ctx && __ctx.emit ? __ctx.emit(...args) : undefined);
              const defineExpose = () => {};
              const withDefaults = (props, defaults) => Object.assign({}, defaults || {}, props || {});
              ${setupCode}
              return ${setupReturnSource};
            },
            template: __prismInlineTemplate || "<div></div>"
          };
          if (Vue && typeof Vue.createApp === "function") {
            const app = Vue.createApp(Candidate);
            app.mount(mountSelector);
            window.__PRISM_VUE_APP__ = app;
          }
        `;
      new Function("Vue", runner)(window.Vue);
    } else {
      let optionCode = normalizeExports(stripImports(optionScript || ""));
      optionCode = await maybeTransformTypeScriptForVue(optionCode, "script", forceOptionTs);
      const runner = `
          ${baseVueBindings}
          const mountSelector = "#app";
          const __prismInlineTemplate = ${templateLiteral};
          ${optionCode}
          let Candidate =
            typeof PrismDefault !== "undefined"
              ? PrismDefault
              : (typeof App !== "undefined" ? App : null);

          if (!Candidate && __prismInlineTemplate) {
            Candidate = { template: __prismInlineTemplate };
          } else if (
            Candidate &&
            typeof Candidate === "object" &&
            __prismInlineTemplate &&
            !Candidate.template
          ) {
            Candidate = Object.assign({}, Candidate, { template: __prismInlineTemplate });
          }

          if (Candidate && Vue && typeof Vue.createApp === "function") {
            const app = Vue.createApp(Candidate);
            app.mount(mountSelector);
            window.__PRISM_VUE_APP__ = app;
          }
        `;
      new Function("Vue", runner)(window.Vue);
    }

    setActiveVueApp(window.__PRISM_VUE_APP__ || null);
  } catch (e) {
    root.innerHTML = `<div class="prism-error">${e.message}</div>`;
  }
}


  return {
    renderVue
  };
}
