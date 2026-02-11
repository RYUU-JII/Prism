const ReactDOMGlobal = window.ReactDOM;

if (!ReactDOMGlobal) {
  throw new Error("[Prism] ReactDOM UMD global is not loaded.");
}

export default ReactDOMGlobal;

export const createRoot = ReactDOMGlobal.createRoot
  ? ReactDOMGlobal.createRoot.bind(ReactDOMGlobal)
  : undefined;

export const hydrateRoot = ReactDOMGlobal.hydrateRoot
  ? ReactDOMGlobal.hydrateRoot.bind(ReactDOMGlobal)
  : undefined;
