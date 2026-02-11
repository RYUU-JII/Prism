const dayjsGlobal = window.dayjs;

if (!dayjsGlobal) {
  throw new Error("[Prism] Day.js global is not loaded.");
}

export default dayjsGlobal;
