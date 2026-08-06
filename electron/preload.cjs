// 渲染端 RAG 桥：只暴露受限的检索接口，不暴露路径/任意读取。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mistRag", {
  search: (request) => ipcRenderer.invoke("rag:search", request),
  listChunkIds: () => ipcRenderer.invoke("rag:listChunkIds"),
  status: () => ipcRenderer.invoke("rag:status"),
});
