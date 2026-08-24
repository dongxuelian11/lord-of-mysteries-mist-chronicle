"use client";

import { useState } from "react";
import { Activity, ArrowRight, Brain, CheckCircle2, ChevronRight, CircleAlert, Gauge, Layers3, Sparkles, WandSparkles, X } from "lucide-react";
import { type Ability, type AbilityContext, type AbilityUseRecord, type GameState, PATHWAYS } from "./game-model";

type Props = {
  game: GameState;
  abilities: Ability[];
  open: boolean;
  context: AbilityContext;
  selectedId: string;
  supportIds: string[];
  assistId: string;
  intent: string;
  loading: boolean;
  error: string;
  result: AbilityUseRecord | null;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onToggleSupport: (id: string) => void;
  onAssist: (id: string) => void;
  onIntent: (value: string) => void;
  onUse: () => void;
  onContinueScene: (intent: string) => void;
  onExitScene: () => void;
};

export default function AbilityConsole(props: Props) {
  const [sceneIntent, setSceneIntent] = useState("");
  const scene = props.game.activeAbilityScene;
  const artifacts = props.game.inventory.filter((item) => item.category === "封印物");
  const appendTag = (label: string) => {
    props.onSelect("free-intent");
    props.onIntent(`${props.intent}${props.intent.trim() ? " " : ""}【${label}】`);
  };

  return <>
    <button className="global-ability-trigger" onClick={props.onOpen} aria-label="打开自由能力命令">
      <span><WandSparkles size={19} /></span><div><small>自由能力命令</small><strong>{PATHWAYS[props.game.pathwayId].name} · {props.game.spirituality}/{props.game.spiritualityMax}</strong></div><ChevronRight size={15} />
    </button>

    {props.open && <div className="complete-sheet-backdrop ability-backdrop" onMouseDown={props.onClose}>
      <section className="ability-console ability-console-simple" role="dialog" aria-modal="true" aria-labelledby="ability-console-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p>自由输入 · 规则判定 · AI反馈</p><h2 id="ability-console-title">你打算如何使用非凡能力？</h2><span>{props.context.label} · 不需要先选择能力</span></div><button onClick={props.onClose} aria-label="关闭能力浮窗"><X size={18} /></button></header>
        <div className="ability-resource-strip"><span><Sparkles size={14} />灵性 <strong>{props.game.spirituality}/{props.game.spiritualityMax}</strong></span><span><Brain size={14} />精神负荷 <strong>{props.game.mentalLoad}/100</strong></span><span><Activity size={14} />本周已用 <strong>{props.game.abilityJournal.filter((item) => item.week === props.game.week).length}次</strong></span></div>
        <article className="ability-free-command">
          <div className="ability-command-tags" aria-label="点击插入自由命令">{props.abilities.map((ability) => <button key={ability.id} onClick={() => appendTag(ability.name)} title={ability.description}>{ability.name}</button>)}{artifacts.map((item) => <button key={item.id} onClick={() => appendTag(`封印物：${item.name}`)} title={item.risk}>{item.name}</button>)}</div>
          <label><span>自由描述对象、手段与停止条件</span><textarea value={props.intent} onChange={(event) => props.onIntent(event.target.value)} placeholder={`例如：我使用【能力标签】观察${props.context.label}的异常，但不触碰未知联系；一旦察觉高位污染立刻停止。`} maxLength={900} /></label>
          <small>标签只补全命令，不替你决定做法。系统会依据当前序列、灵性、污染与现场条件自动判定所用能力。</small>
          {props.error && <div className="ability-inline-feedback" role="alert"><CircleAlert size={16} /><span><strong>这项意图现在无法照原样实现</strong><small>{props.error}</small></span></div>}
          <div className="ability-risk"><CircleAlert size={14} /><span><strong>失控风险始终存在</strong><small>若能力、仪式或封印物超出当前知识与序列，系统会明确报出缺少条件，不会偷换行动。</small></span></div>
          <button className="ability-cast" onClick={props.onUse} disabled={!props.intent.trim() || props.loading}>{props.loading ? <><Sparkles size={16} />正在判定</> : <><WandSparkles size={16} />提交自由能力命令 <ArrowRight size={16} /></>}</button>
        </article>
        <footer>能力得到的是个人情报，不会自动成为教会或警方认可的公开证据。</footer>
      </section>
    </div>}

    {props.result && !props.open && <aside className="ability-result-card" role="status" aria-live="polite" aria-label={`${props.result.abilityName}即时能力反馈`}>
      <header><span><CheckCircle2 size={16} /><b>{props.result.abilityName} · 即时反馈</b></span><button onClick={props.onClose} aria-label="关闭即时能力反馈"><X size={15} /></button></header>
      <p>{props.result.observation}</p>
      <details><summary>展开专业判读、未知项与察觉反馈</summary><dl><div><dt>专业判断 · {props.result.confidence}</dt><dd>{props.result.interpretation}</dd></div><div><dt>仍无法确认</dt><dd>{props.result.unknown}</dd></div><div><dt>察觉反馈</dt><dd>{props.result.detection}</dd></div></dl></details>
      <footer><span>−{props.result.cost} 灵性 · +{props.result.mentalLoad} 负荷</span>{props.result.deepLayer && <b><Layers3 size={13} />已进入{props.result.deepLayer === "dream" ? "梦境" : "灵界"}表层</b>}</footer>
    </aside>}

    {scene && <div className={`ability-scene-backdrop ${scene.layer}`}>
      <section className="ability-scene" role="dialog" aria-modal="true" aria-labelledby="ability-scene-title">
        <header><div><p>{scene.layer === "dream" ? "DREAM LAYER" : "SPIRIT WORLD"}</p><h2 id="ability-scene-title">{scene.title}</h2><span>现实日期没有推进，但场景中的人物与危险会即时回应。</span></div><button onClick={props.onExitScene} aria-label="主动退出深层场景"><X size={18} /></button></header>
        <div className="scene-stability"><span><Gauge size={14} />场景稳定度</span><div><i aria-hidden="true"><svg className="progress-fill" viewBox="0 0 100 1" focusable="false"><rect width={Math.max(0, Math.min(100, scene.stability))} height="1" /></svg></i></div><strong>{scene.stability}%</strong></div>
        <div className="scene-turns">{scene.turns.map((turn, index) => <article key={turn.id}><small>{index === 0 ? "进入表层" : `深入 ${index}`}</small>{turn.playerIntent && <p className="scene-player">{turn.playerIntent}</p>}<p>{turn.response}</p></article>)}</div>
        <label><span>继续自由探索</span><textarea value={sceneIntent} onChange={(event) => setSceneIntent(event.target.value)} placeholder="描述你观察、接触、绕行或撤离的方式……" maxLength={700} /></label>
        <footer><button onClick={props.onExitScene}>保持已有信息并退出</button><button className="complete-primary" disabled={!sceneIntent.trim() || scene.stability <= 0 || props.game.spirituality < 2 || props.loading} onClick={() => { props.onContinueScene(sceneIntent.trim()); setSceneIntent(""); }}>{props.loading ? "场景正在回应" : "继续深入 · 2灵性"} <ArrowRight size={15} /></button></footer>
      </section>
    </div>}
  </>;
}
