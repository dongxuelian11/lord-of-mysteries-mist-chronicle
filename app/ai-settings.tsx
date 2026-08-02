"use client";

import { Check, ChevronDown, CircleAlert, Gauge, KeyRound, LoaderCircle, Network, RotateCcw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { AiConfig, AiProviderId, AiQuality, DEEPSEEK_FLASH_PRESET } from "./ai-client";
import { PATHWAYS, PathwayId } from "./game-model";

type ConnectionState = { status: "idle" | "testing" | "success" | "error"; message: string };

type Props = {
  config: AiConfig;
  rememberKey: boolean;
  connection: ConnectionState;
  draftPathway: PathwayId;
  onChange: (patch: Partial<AiConfig>) => void;
  onRememberKey: (value: boolean) => void;
  onTest: () => void;
  onSave: () => void;
  onPathway: (value: PathwayId) => void;
  onNewGame: () => void;
};

export default function AiSettings({ config, rememberKey, connection, draftPathway, onChange, onRememberKey, onTest, onSave, onPathway, onNewGame }: Props) {
  const provider = config.provider ?? "deepseek";
  const ready = Boolean(config.endpoint.trim() && config.apiKey.trim() && config.model.trim());
  function selectProvider(value: AiProviderId) {
    if (value === "deepseek") onChange({ ...DEEPSEEK_FLASH_PRESET, apiKey: config.apiKey });
    else onChange({ provider: "compatible", endpoint: "", model: "", thinking: false, quality: config.quality ?? "balanced" });
  }
  return <>
    <div className={`api-health ${connection.status === "success" ? "success" : connection.status === "error" ? "error" : ready ? "ready" : "offline"}`}>
      {connection.status === "testing" ? <LoaderCircle className="spin" size={19} /> : connection.status === "success" ? <ShieldCheck size={19} /> : connection.status === "error" ? <CircleAlert size={19} /> : <Sparkles size={19} />}
      <span><strong>{connection.status === "testing" ? "正在验证真实请求" : connection.status === "success" ? "模型连接可用" : connection.status === "error" ? "连接尚未通过" : ready ? "配置完整，尚未测试" : "当前使用离线规则"}</strong><small>{connection.message || (ready ? `${config.model} · 点击测试后再保存` : "配置后开放自由契约、人物对话、世界推演与小说章节")}</small></span>
    </div>

    <section className="provider-choice" aria-label="模型服务商">
      <button className={provider === "deepseek" ? "selected" : ""} onClick={() => selectProvider("deepseek")}><Zap size={17} /><span><strong>DeepSeek V4 Flash</strong><small>推荐 · 快速文学与世界推演</small></span>{provider === "deepseek" && <Check size={15} />}</button>
      <button className={provider === "compatible" ? "selected" : ""} onClick={() => selectProvider("compatible")}><Network size={17} /><span><strong>OpenAI 兼容接口</strong><small>自定义服务商、端点与模型名</small></span>{provider === "compatible" && <Check size={15} />}</button>
    </section>

    {provider === "deepseek" && <div className="deepseek-note"><Zap size={15} /><p><strong>已使用官方 V4 Flash 预设</strong><span>模型 deepseek-v4-flash · 请求通过本站同源转发，避免浏览器跨域失败；密钥不会保存在服务器。</span></p></div>}

    <label className="api-key-field"><span><KeyRound size={13} />API Key</span><input type="password" autoComplete="off" value={config.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} placeholder={provider === "deepseek" ? "sk-… 仅用于调用 DeepSeek" : "仅发送给你填写的模型端点"} /></label>
    <label className="remember-key"><button className={rememberKey ? "on" : ""} onClick={() => onRememberKey(!rememberKey)} role="switch" aria-checked={rememberKey}><i /></button><span><strong>在这台设备长期保存密钥</strong><small>{rememberKey ? "密钥会写入本浏览器本地存储" : "默认只保留到当前浏览器会话结束"}</small></span></label>

    <div className="api-actions"><button className="connection-test" disabled={!ready || connection.status === "testing"} onClick={onTest}><Gauge size={15} />{connection.status === "testing" ? "正在测试…" : "测试真实连接"}</button><button className="complete-primary" onClick={onSave}><Check size={15} />保存并启用</button></div>

    <details className="api-advanced">
      <summary><span>高级接口选项</span><small>模型、端点、思考与章节质量</small><ChevronDown size={15} /></summary>
      <div>
        <label><span>接口基础地址</span><input value={config.endpoint} onChange={(event) => onChange({ endpoint: event.target.value })} placeholder="https://api.example.com/v1" readOnly={provider === "deepseek"} /></label>
        <label><span>模型名称</span><input value={config.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="model-name" readOnly={provider === "deepseek"} /></label>
        <div className="api-option-row"><span><strong>思考模式</strong><small>复杂推演更稳，但响应更慢、消耗更多</small></span><button className={config.thinking ? "option-toggle on" : "option-toggle"} onClick={() => onChange({ thinking: !config.thinking })} role="switch" aria-checked={Boolean(config.thinking)}><i /></button></div>
        {config.thinking && <label><span>推理强度</span><select value={config.reasoningEffort ?? "high"} onChange={(event) => onChange({ reasoningEffort: event.target.value as "high" | "max" })}><option value="high">High · 常规推演</option><option value="max">Max · 关键终局</option></select></label>}
        <div className="quality-choice"><span><strong>小说生成模式</strong><small>平衡模式每回合减少两次模型调用</small></span>{([[
          "balanced", "平衡", "一次完成章节，速度快"], ["literary", "文学", "导演、作者、编辑三阶段"]] as [AiQuality, string, string][]).map(([id, title, detail]) => <button key={id} className={(config.quality ?? "balanced") === id ? "selected" : ""} onClick={() => onChange({ quality: id })}><strong>{title}</strong><small>{detail}</small></button>)}</div>
        <label><span>单次超时</span><select value={config.timeoutMs ?? 90000} onChange={(event) => onChange({ timeoutMs: Number(event.target.value) })}><option value={60000}>60 秒</option><option value={90000}>90 秒</option><option value={150000}>150 秒</option></select></label>
      </div>
    </details>

    <small className="settings-note">存档与规则账本始终留在本地。DeepSeek 预设只允许访问官方 api.deepseek.com；自定义兼容接口由浏览器直接请求，需要服务商允许跨域访问。</small>

    <div className="settings-divider"><span>建立新历史分支</span></div>
    <div className="pathway-choice">{Object.values(PATHWAYS).map((item) => <button key={item.id} className={draftPathway === item.id ? "selected" : ""} onClick={() => onPathway(item.id)}><span>{item.name}</span><small>序列9 · {item.sequences[0].name}</small></button>)}</div>
    <button className="danger-reset" onClick={onNewGame}><RotateCcw size={14} />以所选途径开始新游戏</button>
  </>;
}
