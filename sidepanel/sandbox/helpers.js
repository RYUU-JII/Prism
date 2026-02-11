import { PRISM_DEFAULT_IMPORTS } from "./constants.js";

export function stripImports(code) {
  return (code || "").replace(/^\s*import\s+[^;]+;?\s*$/gm, "");
}

export function normalizeExports(code) {
  return (code || "").replace(/^\s*export\s+default\s+/gm, "const PrismDefault = ");
}

export function escapeHtml(value) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function rewriteKnownCdnScriptUrls(code) {
  if (!code) return "";
  return String(code)
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)three(?:@[^"'\s>]+)?\/build\/three(?:\.module)?\.js(?:\?[^"'\s>]*)?/gi,
      "./vendor/three.module.js"
    )
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)three(?:@[^"'\s>]+)?\/examples\/jsm\/([^"'\s>]+)(?:\?[^"'\s>]*)?/gi,
      "./vendor/three-addons/$1"
    )
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)react(?:@[^"'\s>]+)?\/umd\/react(?:\.development|\.production\.min|\.min)?\.js/gi,
      "./vendor/react.production.min.js"
    )
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)react-dom(?:@[^"'\s>]+)?\/umd\/react-dom(?:\.development|\.production\.min|\.min)?\.js/gi,
      "./vendor/react-dom.production.min.js"
    )
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)@babel\/standalone(?:@[^"'\s>]+)?\/babel(?:\.min)?\.js/gi,
      "./vendor/babel.min.js"
    )
    .replace(
      /https?:\/\/(?:unpkg\.com\/|cdn\.jsdelivr\.net\/npm\/)vue(?:@[^"'\s>]+)?\/dist\/vue(?:\.global)?(?:\.prod|\.production|\.runtime\.global)?(?:\.min)?\.js(?:\?[^"'\s>]*)?/gi,
      "./vendor/vue.global.prod.js"
    );
}

export function isTypeScriptLike(code) {
  const source = String(code || "");
  const tsIndicators = [
    /\binterface\s+[A-Za-z_$][\w$]*\s*{/, 
    /\btype\s+[A-Za-z_$][\w$]*\s*=/,
    /\benum\s+[A-Za-z_$][\w$]*\s*{/,
    /\bimplements\s+[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*/,
    /\bas\s+const\b/,
    /\breadonly\s+[A-Za-z_$][\w$]*\s*:/,
    /\b[A-Za-z_$][\w$]*\s*:\s*(?:string|number|boolean|unknown|any|never|void|object|Record|Partial|Array|Promise)\b/,
    /<\s*[A-Za-z_$][\w$]*\s*>/,
    /\b[A-Za-z_$][\w$]*\s*!\s*:/
  ];
  return tsIndicators.some((r) => r.test(source));
}

function transformWithBabel(code, options) {
  if (!window.Babel || typeof window.Babel.transform !== "function") {
    throw new Error("Babel runtime is unavailable.");
  }
  return window.Babel.transform(code, options).code;
}

export function transformReactSourceWithFallback(code, sourceType, options) {
  const safeOptions = options || {};
  const jsxRuntime = safeOptions.jsxRuntime === "automatic" ? "automatic" : "classic";
  const reactPreset = jsxRuntime === "automatic"
    ? ["react", { runtime: "automatic" }]
    : "react";
  const reactOnly = {
    presets: [reactPreset],
    sourceType: sourceType === "module" ? "module" : "script"
  };
  if (!isTypeScriptLike(code)) {
    return transformWithBabel(code, reactOnly);
  }
  const reactTs = {
    presets: [
      ["typescript", { allExtensions: true, isTSX: true }],
      reactPreset
    ],
    sourceType: sourceType === "module" ? "module" : "script"
  };
  try {
    return transformWithBabel(code, reactTs);
  } catch (tsError) {
    return transformWithBabel(code, reactOnly);
  }
}

export function stripTypeScriptSyntax(code, sourceType) {
  const options = {
    presets: [["typescript", { allExtensions: true, isTSX: true }]],
    sourceType: sourceType === "module" ? "module" : "script"
  };
  return transformWithBabel(code, options);
}

export function parseVueSfc(sourceCode) {
  const source = String(sourceCode || "");
  const hasAnySfcBlock = /<(template|script|style)\b/i.test(source);
  if (!hasAnySfcBlock) return null;

  const templateMatch = source.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i);
  const scriptBlocks = Array.from(source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    .map((entry) => {
      const attrs = entry[1] || "";
      const content = entry[2] || "";
      const langMatch = attrs.match(/\blang\s*=\s*["']([^"']+)["']/i);
      const lang = langMatch ? langMatch[1].toLowerCase() : "js";
      const isSetup = /\bsetup\b/i.test(attrs);
      return { attrs, content, lang, isSetup };
    });
  const styleBlocks = Array.from(source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi))
    .map((entry) => ({
      attrs: entry[1] || "",
      content: entry[2] || ""
    }));

  const normalScript = scriptBlocks.find((block) => !block.isSetup) || null;
  const setupScript = scriptBlocks.find((block) => block.isSetup) || null;

  if (!templateMatch && !normalScript && !setupScript && styleBlocks.length === 0) {
    return null;
  }

  if (normalScript && setupScript) {
    return {
      error: "Use either <script> or <script setup> in Vue SFC source."
    };
  }

  return {
    template: templateMatch ? templateMatch[1] : "",
    script: normalScript ? normalScript.content : "",
    scriptLang: normalScript ? normalScript.lang : "js",
    setupScript: setupScript ? setupScript.content : "",
    setupScriptLang: setupScript ? setupScript.lang : "js",
    hasSetup: Boolean(setupScript),
    styles: styleBlocks.map((block) => block.content).filter(Boolean)
  };
}

export function collectTopLevelBindingNames(code) {
  const source = String(code || "");
  const names = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)\s*(?:\{|extends)/g
  ];

  patterns.forEach((pattern) => {
    let match = pattern.exec(source);
    while (match) {
      if (match[1]) names.add(match[1]);
      match = pattern.exec(source);
    }
  });

  return Array.from(names).filter(Boolean);
}

function isBareModuleSpecifier(specifier) {
  const value = String(specifier || "").trim();
  if (!value) return false;
  if (value.startsWith(".") || value.startsWith("/") || value.startsWith("#")) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return false;
  return true;
}

function isHandledByDefaultImportMap(specifier) {
  const keys = Object.keys(PRISM_DEFAULT_IMPORTS);
  return keys.some((key) => {
    if (key.endsWith("/")) return specifier.startsWith(key);
    return specifier === key;
  });
}

function extractBareImportSpecifiers(sourceCode) {
  const code = String(sourceCode || "");
  const scriptBodies = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch = scriptRegex.exec(code);
  while (scriptMatch) {
    const attrs = String(scriptMatch[1] || "").toLowerCase();
    const isImportMap = attrs.includes('type="importmap"') || attrs.includes("type='importmap'");
    if (!isImportMap) {
      scriptBodies.push(String(scriptMatch[2] || ""));
    }
    scriptMatch = scriptRegex.exec(code);
  }
  if (scriptBodies.length === 0) {
    scriptBodies.push(code);
  }

  const specifiers = new Set();
  const importPatterns = [
    /\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  scriptBodies.forEach((body) => {
    importPatterns.forEach((pattern) => {
      let match = pattern.exec(body);
      while (match) {
        const specifier = String(match[1] || "").trim();
        if (isBareModuleSpecifier(specifier) && !isHandledByDefaultImportMap(specifier)) {
          specifiers.add(specifier);
        }
        match = pattern.exec(body);
      }
    });
  });

  return Array.from(specifiers);
}

function resolveBareImportSpecifierToUrl(specifier) {
  const normalized = String(specifier || "").trim();
  if (!normalized) return "";
  // Extension sandbox CSP blocks remote module execution.
  // Keep bare specifiers unresolved unless they are covered
  // by built-in/local import map entries.
  return "";
}

export function buildAutoImportMap(sourceCode) {
  const imports = {};
  extractBareImportSpecifiers(sourceCode).forEach((specifier) => {
    const url = resolveBareImportSpecifierToUrl(specifier);
    if (!url) return;
    imports[specifier] = url;
  });
  return imports;
}

export function stringifyImportMap(mapObject) {
  return JSON.stringify(mapObject, null, 2).replace(/<\//g, "<\\/");
}

export function rewriteBareModuleSpecifiersInJs(sourceCode) {
  let code = String(sourceCode || "");
  const replacer = (match, prefix, specifier, suffix) => {
    if (!isBareModuleSpecifier(specifier)) return match;
    if (isHandledByDefaultImportMap(specifier)) return match;
    const resolved = resolveBareImportSpecifierToUrl(specifier);
    if (!resolved) return match;
    return prefix + resolved + suffix;
  };
  code = code.replace(/(\bimport\s+[^'"]*?\bfrom\s*['"])([^'"]+)(['"])/g, replacer);
  code = code.replace(/(\bexport\s+[^'"]*?\bfrom\s*['"])([^'"]+)(['"])/g, replacer);
  code = code.replace(/(\bimport\s*['"])([^'"]+)(['"])/g, replacer);
  code = code.replace(/(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g, replacer);
  return code;
}

function mergeDarkClassToHtmlTag(doc) {
  return doc.replace(/<html([^>]*)>/i, (match, attrs) => {
    const classMatch = attrs.match(/\bclass\s*=\s*(['"])(.*?)\1/i);
    if (!classMatch) return `<html${attrs} class="dark">`;
    if (/\bdark\b/i.test(classMatch[2] || "")) return match;
    const quote = classMatch[1];
    const nextValue = classMatch[2] ? `${classMatch[2]} dark` : "dark";
    const patchedAttrs = attrs.replace(classMatch[0], `class=${quote}${nextValue}${quote}`);
    return `<html${patchedAttrs}>`;
  });
}

export function buildHtmlSrcdoc(code, theme, headExtras, bodyExtras) {
  const source = String(code || "");
  const hasFullDocument = /^\s*<!DOCTYPE\s+html/i.test(source) || /<html[\s>]/i.test(source);

  if (!hasFullDocument) {
    return `<!DOCTYPE html><html class="${theme === "dark" ? "dark" : ""}"><head>${headExtras}</head><body>${source}${bodyExtras}</body></html>`;
  }

  let doc = source;
  if (theme === "dark" && /<html[\s>]/i.test(doc)) {
    doc = mergeDarkClassToHtmlTag(doc);
  }

  if (/<head[^>]*>/i.test(doc)) {
    // Inject at the beginning of <head> so import maps are applied
    // before any module scripts declared by user code.
    doc = doc.replace(/<head[^>]*>/i, (openTag) => `${openTag}${headExtras}`);
  } else if (/<\/head>/i.test(doc)) {
    doc = doc.replace(/<\/head>/i, `${headExtras}</head>`);
  } else if (/<html[^>]*>/i.test(doc)) {
    doc = doc.replace(/<html[^>]*>/i, (openTag) => `${openTag}<head>${headExtras}</head>`);
  } else {
    doc = `<head>${headExtras}</head>${doc}`;
  }

  if (/<\/body>/i.test(doc)) {
    doc = doc.replace(/<\/body>/i, `${bodyExtras}</body>`);
  } else {
    doc = `${doc}${bodyExtras}`;
  }

  return doc;
}

export function hasModuleSyntax(code) {
  return /^\s*import\s+/m.test(code || "") || /^\s*export\s+/m.test(code || "");
}

export function pickStyles(style, keys) {
  const out = {};
  keys.forEach((key) => {
    const value = style[key];
    if (value) out[key] = value;
  });
  return out;
}
