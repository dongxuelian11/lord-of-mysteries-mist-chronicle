// 渲染端 RAG 桥：只暴露受限的检索接口，不暴露路径/任意读取。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mistRag", {
  search: (request) => ipcRenderer.invoke("rag:search", request),
  listChunkIds: () => ipcRenderer.invoke("rag:listChunkIds"),
  status: () => ipcRenderer.invoke("rag:status"),
});

contextBridge.exposeInMainWorld("mistCredentials", {
  load: () => ipcRenderer.invoke("credentials:load"),
  save: (apiKey) => ipcRenderer.invoke("credentials:save", apiKey),
  clear: () => ipcRenderer.invoke("credentials:clear"),
});

contextBridge.exposeInMainWorld("mistPersistence", {
  get: (key) => ipcRenderer.invoke("persistence:get", key),
  set: (key, payload) => ipcRenderer.invoke("persistence:set", key, payload),
  remove: (key) => ipcRenderer.invoke("persistence:remove", key),
  appendRecovery: (key, checkpoint, maxEntries) => ipcRenderer.invoke("persistence:append-recovery", key, checkpoint, maxEntries),
});
