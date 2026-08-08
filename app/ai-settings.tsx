"use client";

import { Check, ChevronDown, CircleAlert, Gauge, KeyRound, LoaderCircle, Network, RotateCcw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { AiConfig, AiProviderId, AiQuality, DEEPSEEK_FLASH_PRESET } from "./ai-client";
import { PATHWAYS, PathwayId } from "./game-model";
import { LORE_LIBRARY_SUMMARY } from "./lore-meta";

type ConnectionState = { status: "idle" | "testing" | "success" | "error"; message: string };
type TurnStage = { name: string; ms: number; status: "ok" | "error" };

type Props = {
  config: AiConfig;
  rememberKey: boolean;
  secureStorageAvailable: boolean;
  connection: ConnectionState;
  turnStages: TurnStage[];
  showDiagnostics: boolean;
  autoDecision: boolean;
  onAutoDecision: (value: boolean) => void;
  draftPathway: PathwayId;
  onChange: (patch: Partial<AiConfig>) => void;
  onRememberKey: (value: boolean) => void;
  onTest: () => void;
  onSave: () => void;
  onClearKey: () => void;
  onPathway: (value: PathwayId) => void;
  onNewGame: () => void;
};

export default function AiSettings({ config, rememberKey, secureStorageAvailable, connection, turnStages, showDiagnostics, autoDecision, onAutoDecision, draftPathway, onChange, onRememberKey, onTest, onSave, onClearKey, onPathway, onNewGame }: Props) {
  const provider = config.provider ?? "deepseek";
  const ready = Boolean(config.endpoint.trim() && config.apiKey.trim() && config.model.trim());
  function selectProvider(value: AiProviderId) {
    if (value === "deepseek") onChange({ ...DEEPSEEK_FLASH_PRESET, apiKey: config.apiKey });
    else onChange({ provider: "compatible", endpoint: "", model: "", quality: config.quality ?? "balanced" });
  }
  return <>
    <div className={`api-health ${connection.status === "success" ? "success" : connection.status === "error" ? "error" : ready ? "ready" : "offline"}`}>
      {connection.status === "testing" ? <LoaderCircle className="spin" size={19} /> : connection.status === "success" ? <ShieldCheck size={19} /> : connection.status === "error" ? <CircleAlert size={19} /> : <Sparkles size={19} />}
      <span><strong>{connection.status === "testing" ? "正在验证真实请求" : connection.status === "success" ? "模型连接可用" : connection.status === "error" ? "连接尚未通过" : ready ? "配置完整，尚未测试" : "AI 世界推演已暂停"}</strong><small>{connection.message || (ready ? `${config.model} · 点击测试后再保存` : "游戏不会用本地事件表冒充人物回应或世界变化")}</small></span>
    </div>

    {showDiagnostics && <div className="diagnostics-block"><header><Gauge size={13} /><strong>最近一次推演诊断</strong><button onClick={onTest} disabled={!ready || connection.status === "testing"}>一键诊断</button></header>{turnStages.length ? <ul>{turnStages.map((stage) => <li key={stage.name} className={stage.status}><span>{stage.name}</span><b>{stage.ms}ms</b><em>{stage.status === "ok" ? "成功" : "失败"}</em></li>)}</ul> : <p>还没有记录；完成一次“闭会并进入推演”后，这里会显示各阶段耗时。</p>}</div>}

    <section className="provider-choice" aria-label="模型服务商">
      <button className={provider === "deepseek" ? "selected" : ""} onClick={() => selectProvider("deepseek")}><Zap size={17} /><span><strong>DeepSeek V4 Flash</strong><small>推荐 · 快速文学与世界推演</small></span>{provider === "deepseek" && <Check size={15} />}</button>
      <button className={provider === "compatible" ? "selected" : ""} onClick={() => selectProvider("compatible")}><Network size={17} /><span><strong>OpenAI 兼容接口</strong><small>自定义服务商、端点与模型名</small></span>{provider === "compatible" && <Check size={15} />}</button>
    </section>

    {provider === "deepseek" && <div className="deepseek-note"><Zap size={15} /><p><strong>已使用官方 V4 Flash 预设</strong><span>模型 deepseek-v4-flash · 请求通过本站同源转发，避免浏览器跨域失败；密钥不会保存在服务器。</span></p></div>}

    <label className="api-key-field"><span><KeyRound size={13} />API Key</span><input type="password" autoComplete="off" value={config.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} placeholder={provider === "deepseek" ? "sk-… 仅用于调用 DeepSeek" : "仅发送给你填写的模型端点"} /></label>
    <label className="remember-key"><button className={rememberKey ? "on" : ""} onClick={() => onRememberKey(!rememberKey)} role="switch" aria-checked={rememberKey} disabled={!secureStorageAvailable}><i /></button><span><strong>在这台设备长期保存密钥</strong><small>{rememberKey ? "密钥由操作系统凭据保护，不写入浏览器存储" : secureStorageAvailable ? "默认只保留到当前应用会话结束" : "浏览器预览不提供系统凭据库，只支持会话保存"}</small></span></label>
    {rememberKey && <button className="clear-key-button" onClick={onClearKey}>清除已保存的 Key</button>}
    <label className="remember-key"><button className={autoDecision ? "on" : ""} onClick={() => onAutoDecision(!autoDecision)} role="switch" aria-checked={autoDecision}><i /></button><span><strong>讨论生成决议后直接执行</strong><small>{autoDecision ? "书记员整理出的决议不再弹确认，直接写入本周计划" : "书记员整理后先给你确认草稿，确认后才写入"}</small></span></label>

    <div className="api-actions"><button className="connection-test" disabled={!ready || connection.status === "testing"} onClick={onTest}><Gauge size={15} />{connection.status === "testing" ? "正在测试…" : "测试真实连接"}</button><button className="complete-primary" disabled={!ready} onClick={onSave}><Check size={15} />保存并启用</button></div>

    <details className="api-advanced">
      <summary><span>高级接口选项</span><small>模型、端点与章节质量</small><ChevronDown size={15} /></summary>
      <div>
        <label><span>接口基础地址</span><input value={config.endpoint} onChange={(event) => onChange({ endpoint: event.target.value })} placeholder="https://api.example.com/v1" readOnly={provider === "deepseek"} /></label>
        <label><span>模型名称</span><input value={config.model} onChange={(event) => onChange({ model: event.target.value })} placeholder="model-name" readOnly={provider === "deepseek"} /></label>
        <label><span>专用世界推演模型（可选）</span><input value={config.worldModel ?? ""} onChange={(event) => onChange({ worldModel: event.target.value })} placeholder="留空则与人物对话共用当前模型" /><small>每周会先运行世界，再处理人物对话与小说化叙事。</small></label>
        <div className="lore-library-status"><ShieldCheck size={16} /><span><strong>设定知识库已启用 · {LORE_LIBRARY_SUMMARY.version}</strong><small>{LORE_LIBRARY_SUMMARY.recordCount}条权限化设定 · {LORE_LIBRARY_SUMMARY.pathwayCount}条途径 · {LORE_LIBRARY_SUMMARY.sourceCount}个来源；世界真相、角色认知、玩家已知与公共消息分别检索。</small></span></div>
        <label className="world-bible-field"><span>世界推演补充资料（可选）</span><textarea value={config.worldBible ?? ""} onChange={(event) => onChange({ worldBible: event.target.value.slice(0, 24000) })} placeholder="只补充本局原创组织、历史分支或你想覆盖的裁定。内建设定库无需重复粘贴。" rows={6} /><small>{(config.worldBible ?? "").length}/24000 · 只供全知世界推演器读取，不会发送给NPC对话或玩家现状</small></label>
        <div className="quality-choice"><span><strong>小说生成模式</strong><small>平衡模式每回合减少两次模型调用</small></span>{([[
          "balanced", "平衡", "一次完成章节，速度快"], ["literary", "文学", "导演、作者、编辑三阶段"]] as [AiQuality, string, string][]).map(([id, title, detail]) => <button key={id} className={(config.quality ?? "balanced") === id ? "selected" : ""} onClick={() => onChange({ quality: id })}><strong>{title}</strong><small>{detail}</small></button>)}</div>
        <label><span>单次超时</span><select value={config.timeoutMs ?? 90000} onChange={(event) => onChange({ timeoutMs: Number(event.target.value) })}><option value={60000}>60 秒</option><option value={90000}>90 秒</option><option value={150000}>150 秒</option></select></label>
      </div>
    </details>

    <small className="settings-note">存档与规则账本始终留在本地。DeepSeek 预设只允许访问官方 api.deepseek.com；自定义兼容接口由浏览器直接请求，需要服务商允许跨域访问。</small>

    <div className="settings-divider"><span>建立新历史分支</span></div>
    <div className="pathway-choice">{Object.values(PATHWAYS).map((item) => <button key={item.id} className={draftPathway === item.id ? "selected" : ""} onClick={() => onPathway(item.id)}><span>{item.name}</span><small>序列9 · {item.sequences[0].name}</small></button>)}</div>
    <button className="danger-reset" disabled={!ready} onClick={onNewGame}><RotateCcw size={14} />{ready ? "以所选途径开始新游戏" : "连接模型后开始新游戏"}</button>
  </>;
}
