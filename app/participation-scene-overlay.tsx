"use client";

import { useState } from "react";
import { Send, ShieldAlert, Swords } from "lucide-react";
import type { ParticipationScene } from "./participation-scene";

export default function ParticipationSceneOverlay({ scene, loading, error, onDecision, onResume }: {
  scene: ParticipationScene;
  loading: boolean;
  error: string;
  onDecision: (intent: string) => void;
  onResume: () => void;
}) {
  const [intent, setIntent] = useState("");
  const complete = scene.status === "complete";
  return <div className="participation-lock" role="dialog" aria-modal="true" aria-labelledby="participation-title">
    <section className="participation-scene">
      <header><span>{scene.mode === "combat" ? <Swords size={18} /> : <ShieldAlert size={18} />}<small>{scene.mode === "combat" ? "玩家亲历战斗" : "玩家亲历任务"}</small></span><h2 id="participation-title">{scene.title}</h2><p>{scene.objective}</p></header>
      <div className="participation-meters"><span>现场位置 <b>{scene.position}</b></span><span>危险压力 <b>{scene.danger}</b></span><span>阶段 <b>{scene.phase}</b></span></div>
      <div className="participation-transcript">{scene.turns.length ? scene.turns.map((turn) => <article key={turn.id}><small>你的命令</small><p>{turn.playerIntent}</p><small>现场回应</small><p>{turn.narrative}</p></article>) : <p className="participation-opening">事实将在后台先行锁定，但结果不会提前显示。你可以用任何自然语言亲自处理现场。</p>}</div>
      {error && <p className="participation-error">{error}</p>}
      {complete ? <footer><p>现场过程已经结束。现在可以公开结算结果，并继续独立世界推演与文学生成。</p><button onClick={onResume}>继续推演</button></footer> : <footer><label><span>{scene.prompt}</span><textarea value={intent} disabled={loading} onChange={(event) => setIntent(event.target.value)} placeholder="自由输入任何行动、能力使用、战术或撤离命令……" maxLength={1600} /></label><button disabled={loading || !intent.trim()} onClick={() => { const next = intent.trim(); setIntent(""); onDecision(next); }}><Send size={15} />{loading ? "正在推演现场……" : "执行"}</button></footer>}
    </section>
  </div>;
}
