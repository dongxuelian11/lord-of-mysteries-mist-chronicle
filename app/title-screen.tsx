"use client";

import { useRef } from "react";
import { ArrowRight, BookOpen, CloudFog, Database, Download, Settings, Sparkles, Upload } from "lucide-react";
import { GameState } from "./game-model";
import { SituationBrief } from "./game-engine";

type TitleProps = {
  hydrated: boolean;
  hasSave: boolean;
  save: GameState;
  onContinue: () => void;
  onNewGame: () => void;
  onSettings: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
};

export function TitleScreen({ hydrated, hasSave, save, onContinue, onNewGame, onSettings, onExport, onImport }: TitleProps) {
  const importRef = useRef<HTMLInputElement>(null);
  return <main className="chronicle-title-screen">
    <div className="title-fog" aria-hidden="true" />
    <section className="title-edition">
      <header><span>AN AI-DRIVEN BEYONDER CHRONICLE</span><i /><small>贝克兰德 · 1349</small></header>
      <div className="title-sigil"><CloudFog size={34} /><span /></div>
      <p>世界不会等待议长落槌</p>
      <h1>灰雾纪事</h1>
      <blockquote>建立一个不被历史记住的组织，然后亲眼看它如何改变历史。</blockquote>
      <div className="title-actions">
        <button className="title-primary" disabled={!hydrated || !hasSave} onClick={onContinue}><BookOpen size={18} /><span><strong>{hasSave ? "继续上次存档" : "尚无可读取存档"}</strong>{hasSave && <small>第{save.week}周 · {save.date} · {save.organizationName}</small>}</span><ArrowRight size={17} /></button>
        <button onClick={onNewGame} disabled={!hydrated}><Sparkles size={17} /><span><strong>开始新游戏</strong><small>重新选择身份、经历、途径与初始班底</small></span></button>
        <button onClick={onSettings}><Settings size={17} /><span><strong>模型与世界资料</strong><small>配置人物对话、专用世界推演模型和设定资料</small></span></button>
      </div>
      <div className="title-save-tools"><button disabled={!hasSave} onClick={onExport}><Download size={14} />导出唯一存档</button><button onClick={() => importRef.current?.click()}><Upload size={14} />导入并预览</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ""; }} /></div>
      <footer><Database size={13} /><span>存档保存在当前浏览器；每次打开都从标题页进入。</span></footer>
    </section>
  </main>;
}

type SituationProps = {
  brief: SituationBrief;
  loading: boolean;
  onEnter: () => void;
};

export function SituationOpening({ brief, loading, onEnter }: SituationProps) {
  return <div className="situation-opening-backdrop">
    <section className="situation-opening" role="dialog" aria-modal="true" aria-labelledby="situation-title">
      <header><span>{brief.dateline}</span><i /></header>
      <article>
        <small>{loading ? "世界推演模型正在重写这一页……" : "你重新推开了密议室的门"}</small>
        <h1 id="situation-title">{brief.title}</h1>
        {brief.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)}
      </article>
      <footer><span>这不是任务列表。你可以回应、调查、使用能力，也可以什么都不做；时间仍会前进。</span><button onClick={onEnter}>进入本周集会 <ArrowRight size={16} /></button></footer>
    </section>
  </div>;
}
