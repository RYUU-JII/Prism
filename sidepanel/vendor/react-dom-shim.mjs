const ReactDOMGlobal = window.ReactDOM;

if (!ReactDOMGlobal) {
  throw new Error("[Prism] ReactDOM UMD global is not loaded.");
}

export default ReactDOMGlobal;

export const createPortal = ReactDOMGlobal.createPortal;
export const flushSync = ReactDOMGlobal.flushSync;
export const render = ReactDOMGlobal.render;
export const unmountComponentAtNode = ReactDOMGlobal.unmountComponentAtNode;
export const version = ReactDOMGlobal.version;
