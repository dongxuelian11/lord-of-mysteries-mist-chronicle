"use client";

import { useState } from "react";
import { BookOpen, Crown, Globe2, History, MapPinned, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import type { GameState, PathwayId } from "./game-model.ts";
import { PATHWAY_SEQUENCE_LEDGER } from "./pathway-sequence-ledger.ts";
import { highSequenceAdvancementRequirement } from "./high-sequence-ledger.ts";

type Props = {
  game: GameState;
  onPropose: (intent: string) => void;
};

export default function CampaignWorldConsole({ game, onPropose }: Props) {
  const [cityId, setCityId] = useState(game.campaignWorld.activeCityId);
  const [pathwayId, setPathwayId] = useState<PathwayId>(game.pathwayId);
  const stage = game.campaignWorld.stages.find((item) => item.id === game.campaignWorld.currentStageId)!;
  const city = game.campaignWorld.cities.find((item) => item.id === cityId) ?? game.campaignWorld.cities[0];
  const pathway = PATHWAY_SEQUENCE_LEDGER[pathwayId];
  const targetSequence = Math.max(0, game.currentSequence - 1);
  const requirement = highSequenceAdvancementRequirement(game.highSequenceLedger, game.pathwayId, targetSequence);
  const heldCharacteristics = game.highSequenceLedger.characteristics.filter((item) => item.holderRef === "player");
  const heldUnique = game.highSequenceLedger.uniquenesses.filter((item) => item.holderRef === "player");
  const heldSefirot = game.highSequenceLedger.sefirot.filter((item) => item.holderRef === "player");

  return <section className="campaign-world-console complete-card" aria-label="跨城世界、历史阶段与高位账本">
    <header className="campaign-world-heading">
      <span><Globe2 size={16} /><strong>持续世界总览</strong></span>
      <b>{stage.title}</b>
      <small>{stage.objective}</small>
    </header>

    <div className="campaign-stage-track" aria-label="重大历史阶段">
      {game.campaignWorld.stages.map((item) => <span key={item.id} className={item.status}><i>{item.status === "completed" ? "✓" : item.status === "active" ? "◆" : "·"}</i><small>{item.title}</small></span>)}
    </div>

    <div className="campaign-world-grid">
      <article className="campaign-city-panel">
        <header><MapPinned size={15} /><strong>城市与远方分部</strong><small>{game.campaignWorld.cities.filter((item) => item.status === "branch" || item.status === "stronghold").length} 个外地分部</small></header>
        <nav aria-label="选择城市">{game.campaignWorld.cities.map((item) => <button key={item.id} className={city.id === item.id ? "active" : ""} onClick={() => setCityId(item.id)}><span>{item.name}</span><small>{item.status}</small></button>)}</nav>
        <div className="campaign-city-detail">
          <div><strong>{city.name}</strong><small>{city.region} · {city.summary}</small></div>
          <dl><div><dt>控制</dt><dd>{city.playerControl}</dd></div><div><dt>情报</dt><dd>{city.intelligence}</dd></div><div><dt>地方压力</dt><dd>{city.localPressure}</dd></div><div><dt>驻扎人力</dt><dd>{city.committedManpower}</dd></div></dl>
          <div className="campaign-sector-list">{city.sectors.map((item) => <span key={item.id}><b>{item.name}</b><small>价值 {item.value} · 控制 {item.control} · 压力 {item.pressure}</small></span>)}</div>
          <p>{city.lastEvent}</p>
          <footer>
            <button onClick={() => onPropose(`调查${city.name}的地方势力、关键战略点与安全联络人，只把已核验情报写入地图。`)}>探查城市</button>
            {city.id !== "backlund" && <button onClick={() => onPropose(`向${city.name}派遣合适成员并建立长期分部；明确驻扎人力、掩护、撤离线和持续资源回报。`)}>筹建分部</button>}
          </footer>
        </div>
      </article>

      <article className="campaign-high-ledger">
        <header><Crown size={15} /><strong>高位唯一账本</strong><small>全局排他 · 事实守恒</small></header>
        <div className="high-ledger-counts"><span><b>{heldCharacteristics.length}</b>高位特性</span><span><b>{heldUnique.length}</b>唯一性</span><span><b>{heldSefirot.length}</b>源质</span></div>
        <div className={requirement.satisfied ? "advancement-requirement ready" : "advancement-requirement"}>
          {requirement.satisfied ? <Sparkles size={15} /> : <ShieldAlert size={15} />}
          <span><strong>序列{targetSequence}高位条件</strong><small>{requirement.satisfied ? "账本条件已经满足；仍需完成配方、仪式和精神稳定。" : `尚缺：${requirement.missing.join("、")}`}</small></span>
        </div>
        <details><summary>查看 22 个唯一性与 9 大源质</summary><div className="unique-assets">{game.highSequenceLedger.uniquenesses.map((item) => <span key={item.id}><b>{item.name}</b><small>{item.state === "unlocated" ? "位置未知" : `${item.state} · ${item.holderRef}`}</small></span>)}{game.highSequenceLedger.sefirot.map((item) => <span key={item.id} className="sefirot"><b>{item.name}</b><small>{item.state === "unlocated" ? "位置未知" : `${item.state} · ${item.holderRef}`}</small></span>)}</div></details>
      </article>
    </div>

    <details className="pathway-ledger-browser">
      <summary><BookOpen size={15} /><span><strong>22 途径 · 220 序列知识账本</strong><small>每条序列均登记作用尺度、组织影响、失控风险与知识证据</small></span></summary>
      <label>查看途径<select value={pathwayId} onChange={(event) => setPathwayId(event.target.value as PathwayId)}>{Object.values(PATHWAY_SEQUENCE_LEDGER).map((item) => <option key={item.pathwayId} value={item.pathwayId}>{item.pathwayName} · {item.sefirot}</option>)}</select></label>
      <div className="pathway-sequence-table">{pathway.sequences.map((item) => <article key={item.id}><span><b>序列{item.sequence}</b><strong>{item.name}</strong><small>{item.tier}</small></span><p>{item.organizationEffect}</p><em>{item.lossOfControlRisk}</em><footer>{item.loreEvidenceIds.join(" · ")}</footer></article>)}</div>
    </details>

    <details className="historical-ledger">
      <summary><History size={15} /><span><strong>五大纪元与当前世界线</strong><small>历史用于解释遗迹、势力债务与高位资产来源，不是静态背景</small></span></summary>
      {game.campaignWorld.historicalEpochs.map((epoch) => <article key={epoch.id}><b>{epoch.name}</b><p>{epoch.summary}</p><small>{epoch.loreEvidenceIds.join(" · ")}</small></article>)}
    </details>

    {game.campaignWorld.postDeity.active && <article className="post-deity-panel"><header><Crown size={16} /><strong>成神后世界仍在运行</strong></header><div><span><b>{game.campaignWorld.postDeity.anchorStrength}</b>锚强度</span><span><b>{Math.round(game.campaignWorld.postDeity.humanity)}</b>人性</span><span><b>{game.campaignWorld.postDeity.prayerBacklog}</b>祈祷积压</span><span><b>{game.campaignWorld.postDeity.outerDeityPressure}</b>外神压力</span></div><p>{game.campaignWorld.postDeity.lastReckoning}</p><small><UsersRound size={13} />成神不会触发结局；每周继续结算城市、信徒、神国、同级权柄与末日阵营。</small></article>}
  </section>;
}
