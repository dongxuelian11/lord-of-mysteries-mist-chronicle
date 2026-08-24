// 渲染端 RAG 桥：只暴露受限的检索接口，不暴露路径/任意读取。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mistRag", {
  search: (request) => ipcRenderer.invoke("rag:search", request),
  status: () => ipcRenderer.invoke("rag:status"),
});

contextBridge.exposeInMainWorld("mistCredentials", {
  status: () => ipcRenderer.invoke("credentials:status"),
  set: (apiKey, persist) => ipcRenderer.invoke("credentials:set", apiKey, persist),
  clear: () => ipcRenderer.invoke("credentials:clear"),
});

contextBridge.exposeInMainWorld("mistInference", {
  request: (task) => ipcRenderer.invoke("inference:request", task),
  requestAutonomous: (task) => ipcRenderer.invoke("inference:autonomous", task),
  lockWorld: (request) => ipcRenderer.invoke("inference:lock-world", request),
  stageWorld: (request) => ipcRenderer.invoke("inference:stage-world", request),
  finalizeWorld: (request) => ipcRenderer.invoke("inference:finalize-world", request),
  prepareWorld: (request) => ipcRenderer.invoke("inference:prepare-world", request),
  statusWorld: (request) => ipcRenderer.invoke("inference:world-status", request),
  requestWorld: (task) => ipcRenderer.invoke("inference:world", task),
});

contextBridge.exposeInMainWorld("mistPersistence", {
  get: (key) => ipcRenderer.invoke("persistence:get", key),
  appendRecovery: (key, checkpoint, maxEntries) => ipcRenderer.invoke("persistence:append-recovery", key, checkpoint, maxEntries),
  commitTurn: (key, payload, traces) => ipcRenderer.invoke("persistence:commit-turn", key, payload, traces),
  runtimeTraces: (originId, limit) => ipcRenderer.invoke("persistence:runtime-traces", originId, limit),
  listQuarantine: (key) => ipcRenderer.invoke("persistence:list-quarantine", key),
  replaceWithRecovery: (activeKey, payload, recoveryKey, checkpoint, maxEntries) => ipcRenderer.invoke("persistence:replace-with-recovery", activeKey, payload, recoveryKey, checkpoint, maxEntries),
  quarantine: (key, reason) => ipcRenderer.invoke("persistence:quarantine", key, reason),
});

contextBridge.exposeInMainWorld("mistRuntimeTrace", {
  record: (trace) => ipcRenderer.invoke("persistence:append-runtime-traces", "mist-chronicle-complete-v21", [trace]),
});
