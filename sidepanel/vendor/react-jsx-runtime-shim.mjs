import React from "./react-shim.mjs";

if (!React || typeof React.createElement !== "function") {
  throw new Error("[Prism] React JSX runtime requires React.createElement.");
}

export const Fragment = React.Fragment;

function withKey(props, key) {
  if (key === undefined) return props;
  if (props == null || typeof props !== "object") return { key };
  return { ...props, key };
}

export function jsx(type, props, key) {
  return React.createElement(type, withKey(props, key));
}

export function jsxs(type, props, key) {
  return React.createElement(type, withKey(props, key));
}

export function jsxDEV(type, props, key) {
  return React.createElement(type, withKey(props, key));
}
