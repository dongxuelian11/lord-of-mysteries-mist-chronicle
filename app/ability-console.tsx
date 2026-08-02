"use client";

import { useState } from "react";
import { Activity, ArrowRight, Brain, CheckCircle2, ChevronRight, CircleAlert, Eye, Gauge, Layers3, Sparkles, WandSparkles, X } from "lucide-react";
import { Ability, AbilityContext, AbilityUseRecord, GameState, PATHWAYS } from "./game-model";

type Props = {
  game: GameState;
  abilities: Ability[];
  open: boolean;
  context: AbilityContext;
  selectedId: string;
  assistId: string;
  intent: string;
  loading: boolean;
  result: AbilityUseRecord | null;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAssist: (id: string) => void;
  onIntent: (value: string) => void;
  onUse: () => void;
  onContinueScene: (intent: string) => void;
  onExitScene: () => void;
};

export default function AbilityConsole(props: Props) {
  const [sceneIntent, setSceneIntent] = useState("");
  const freeMode = props.selectedId === "free-intent";
  const selected = props.abilities.find((item) => item.id === props.selectedId) ?? props.abilities.find((item) => !item.passive) ?? props.abilities[0];
  const displayAbility = freeMode ? { id: "free-intent", name: "按我的意图", verb: "先写目的，再决定是否附加能力或封印物", description: "你可以直接写下想做什么，并明确指定手段、排除条件与停止条件。系统只校验当前序列和世界规则，不会擅自换成吊坠、占卜、仪式或他人协助。", cost: 0, risk: "实际消耗与风险由最终采用的能力、封印物和场景决定。", passive: false } : selected;
  const scene = props.game.activeAbilityScene;
  const artifacts = props.game.inventory.filter((item) => item.category === "封印物");
  return <>
    <button className="global-ability-trigger" onClick={props.onOpen} aria-label="打开即时非凡能力盘">
      <span><WandSparkles size={19} /></span><div><small>即时非凡能力</small><strong>{PATHWAYS[props.game.pathwayId].name} · {props.game.spirituality}/{props.game.spiritualityMax}</strong></div><ChevronRight size={15} />
    </button>

    {props.open && <div className="complete-sheet-backdrop ability-backdrop" onMouseDown={props.onClose}>
      <section className="ability-console" role="dialog" aria-modal="true" aria-labelledby="ability-console-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p>不进入周日程 · 立即返回结果</p><h2 id="ability-console-title">发动非凡能力</h2><span>{props.context.label} · {props.context.kind === "dialogue" ? "当前谈话" : props.context.kind === "district" ? "城市区域" : props.context.kind === "organization" ? "组织现场" : "当前场景"}</span></div><button onClick={props.onClose} aria-label="关闭能力盘"><X size={18} /></button></header>
        <div className="ability-resource-strip"><span><Sparkles size={14} />灵性 <strong>{props.game.spirituality}/{props.game.spiritualityMax}</strong></span><span><Brain size={14} />精神负荷 <strong>{props.game.mentalLoad}/100</strong></span><span><Activity size={14} />本周已用 <strong>{props.game.abilityJournal.filter((item) => item.week === props.game.week).length}次</strong></span></div>
        <div className="ability-console-grid">
          <aside><button className={freeMode ? "selected free-intent" : "free-intent"} onClick={() => props.onSelect("free-intent")}><span><strong>自由施行</strong><small>完全按你的语言理解</small></span><b>自动校验</b></button>{props.abilities.map((ability) => <button key={ability.id} className={!freeMode && selected?.id === ability.id ? "selected" : ""} onClick={() => props.onSelect(ability.id)}><span><strong>{ability.name}</strong><small>{ability.verb}</small></span><b>{ability.passive ? "集中1" : `${ability.cost}灵性`}</b></button>)}</aside>
          <article>{displayAbility && <>
            <header><div style={{ "--ability-color": PATHWAYS[props.game.pathwayId].color } as React.CSSProperties}><Eye size={18} /></div><span><small>序列{props.game.currentSequence}可用</small><h3>{displayAbility.name}</h3></span></header>
            <p>{displayAbility.description}</p>
            {!["district", "spirit", "dream"].includes(props.context.kind) && <label className="ability-assist"><span>在场成员协同</span><select value={props.assistId} onChange={(event) => props.onAssist(event.target.value)}><option value="">仅使用自己的能力</option>{props.game.members.filter((member) => member.pathway).map((member) => <option key={member.id} value={member.id}>{member.name} · 序列{member.sequence} {member.pathway} · 疲劳{member.fatigue}</option>)}</select><small>成员会服从正式指令，但不会替你越过其原则和能力边界。</small></label>}
            {artifacts.length > 0 && <div className="artifact-attachments"><span>可自由附加封印物</span>{artifacts.map((item) => <button key={item.id} onClick={() => props.onIntent(`${props.intent}${props.intent.trim() ? "\n" : ""}我明确选择使用封印物“${item.name}”；只按我描述的方式解除必要封存，不自动触发其他用途。`)}><strong>{item.name}</strong><small>{item.location} · {item.risk}</small></button>)}</div>}
            <label><span>{freeMode ? "你具体想做什么？" : "你要如何使用它？"}</span><textarea value={props.intent} onChange={(event) => props.onIntent(event.target.value)} placeholder={freeMode ? `例如：我依靠自身能力主动进入灵界，以${props.context.label}为现实锚点；不占卜、不使用挂坠，先确认安全退路。` : `自由描述对象、观察重点和停止条件。例如：我对${props.context.label}集中使用${displayAbility.name}，只确认情绪变化及其触发点；不进行强制干涉。`} maxLength={900} /></label>
            <div className="ability-risk"><CircleAlert size={14} /><span><strong>{displayAbility.passive ? "主动深化被动感知" : displayAbility.risk}</strong><small>{freeMode ? "若当前序列无法使用指定手段，系统会明确说明缺少条件，不会偷换行动。" : props.game.spirituality < (displayAbility.passive ? 1 : displayAbility.cost) ? "灵性不足：继续将产生透支、污染与失控风险。" : "普通能力点击后直接结算；只有明确高危使用才需要额外确认。"}</small></span></div>
            <button className="ability-cast" onClick={props.onUse} disabled={!props.intent.trim() || props.loading}>{props.loading ? <><Sparkles size={16} />感知正在成形</> : <><WandSparkles size={16} />立即发动并获得反馈 <ArrowRight size={16} /></>}</button>
          </>}</article>
        </div>
        <footer>能力得到的是个人情报，不会自动成为教会或警方认可的公开证据。</footer>
      </section>
    </div>}

    {props.result && !props.open && <aside className="ability-result-card" aria-live="polite">
      <header><span><CheckCircle2 size={16} /><b>{props.result.abilityName} · 即时反馈</b></span><button onClick={props.onClose}><X size={15} /></button></header>
      <p>{props.result.observation}</p>
      <dl><div><dt>专业判断 · {props.result.confidence}</dt><dd>{props.result.interpretation}</dd></div><div><dt>仍无法确认</dt><dd>{props.result.unknown}</dd></div><div><dt>察觉反馈</dt><dd>{props.result.detection}</dd></div></dl>
      <footer><span>−{props.result.cost} 灵性 · +{props.result.mentalLoad} 负荷</span>{props.result.deepLayer && <b><Layers3 size={13} />已进入{props.result.deepLayer === "dream" ? "梦境" : "灵界"}表层</b>}</footer>
    </aside>}

    {scene && <div className={`ability-scene-backdrop ${scene.layer}`}>
      <section className="ability-scene" role="dialog" aria-modal="true" aria-labelledby="ability-scene-title">
        <header><div><p>{scene.layer === "dream" ? "DREAM LAYER" : "SPIRIT WORLD"}</p><h2 id="ability-scene-title">{scene.title}</h2><span>现实日期没有推进，但场景中的人物与危险会即时回应。</span></div><button onClick={props.onExitScene} aria-label="主动退出深层场景"><X size={18} /></button></header>
        <div className="scene-stability"><span><Gauge size={14} />场景稳定度</span><div><i style={{ width: `${scene.stability}%` }} /></div><strong>{scene.stability}%</strong></div>
        <div className="scene-turns">{scene.turns.map((turn, index) => <article key={turn.id}><small>{index === 0 ? "进入表层" : `深入 ${index}`}</small>{turn.playerIntent && <p className="scene-player">{turn.playerIntent}</p>}<p>{turn.response}</p></article>)}</div>
        <label><span>继续自由探索</span><textarea value={sceneIntent} onChange={(event) => setSceneIntent(event.target.value)} placeholder="描述你观察、接触、绕行或撤离的方式……" maxLength={700} /></label>
        <footer><button onClick={props.onExitScene}>保持已有信息并退出</button><button className="complete-primary" disabled={!sceneIntent.trim() || scene.stability <= 0 || props.game.spirituality < 2 || props.loading} onClick={() => { props.onContinueScene(sceneIntent.trim()); setSceneIntent(""); }}>{props.loading ? "场景正在回应" : "继续深入 · 2灵性"} <ArrowRight size={15} /></button></footer>
      </section>
    </div>}
  </>;
}
