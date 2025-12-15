export function initIntegrityMonitors({ store, sessionId }){
  const integrity = {
    flags: [],
    visibilityChanges: 0,
    focusLosses: 0,
    pasteAttempts: 0,
    copyAttempts: 0,
    contextMenu: 0,
    fullscreenExits: 0,
    pointerLockLosses: 0,
    rapidGuessingCount: 0
  };

  function flag(type, data={}){
    integrity.flags.push({ type, ...data, at: new Date().toISOString() });
    store?.appendEvent(sessionId, { type: "INTEGRITY_FLAG", payload: { type, ...data } });
  }

  const onVis = () => {
    if (document.hidden){
      integrity.visibilityChanges++;
      flag("VISIBILITY_CHANGE", { count: integrity.visibilityChanges });
    }
  };

  const onBlur = () => {
    integrity.focusLosses++;
    flag("FOCUS_LOSS", { count: integrity.focusLosses });
  };

  const onPaste = (e) => {
    integrity.pasteAttempts++;
    flag("PASTE_ATTEMPT", { count: integrity.pasteAttempts });
  };

  const onCopy = (e) => {
    integrity.copyAttempts++;
    flag("COPY_ATTEMPT", { count: integrity.copyAttempts });
  };

  const onContext = (e) => {
    integrity.contextMenu++;
    flag("CONTEXT_MENU", { count: integrity.contextMenu });
  };

  const onFs = () => {
    if (!document.fullscreenElement){
      integrity.fullscreenExits++;
      flag("FULLSCREEN_EXIT", { count: integrity.fullscreenExits });
    }
  };

  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("blur", onBlur);
  window.addEventListener("paste", onPaste);
  window.addEventListener("copy", onCopy);
  window.addEventListener("contextmenu", onContext);
  document.addEventListener("fullscreenchange", onFs);

  return {
    integrity,
    addRapidGuess(rtMs){
      if (rtMs < 900){
        integrity.rapidGuessingCount++;
        if (integrity.rapidGuessingCount === 3 || integrity.rapidGuessingCount === 5){
          flag("RAPID_GUESSING", { count: integrity.rapidGuessingCount });
        }
      }
    },
    stop(){
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("contextmenu", onContext);
      document.removeEventListener("fullscreenchange", onFs);
    }
  };
}
