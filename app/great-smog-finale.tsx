"use client";

import { BookOpen, CheckCircle2, ChevronDown, CircleAlert, CloudFog, Landmark, MapPin, Route, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import { DISTRICTS, FinaleDoctrine, GameState } from "./game-model";

type Props = {
  game: GameState;
  busy?: boolean;
  onDoctrine: (doctrine: FinaleDoctrine) => void;
  onAssign: (crisisId: string, kind: "member" | "faction" | "facility", id: string) => void;
  onAutoDeploy: () => void;
  onResolve: () => void;
};

const DOCTRINES: { id: FinaleDoctrine; title: string; description: string; cost: string }[] = [
  { id: "阻止", title: "阻止灾难", description: "集中证据与破坏力量，切断煤气和仪式结构。", cost: "需要正面承担最高层次的反击" },
  { id: "改变", title: "改变汇合", description: "改变人口、管网与材料的汇合，让历史驶向另一种结果。", cost: "偏转越大，未知后果越难预测" },
  { id: "利用", title: "从雾中夺火", description: "以灾难结构换取材料、知识和晋升机会。", cost: "污染与组织道德压力最高" },
  { id: "逃离", title: "保存火种", description: "救出人员，带走证据，让组织与真相离开首都。", cost: "贝克兰德将承受你没有阻止的部分" },
];

const TAGS: Record<string, string> = {
  protect: "救援", social: "交涉", track: "追踪", document: "档案", build: "工程", covert: "隐蔽",
  access: "路线", occult: "神秘学", force: "对抗", official: "官方", reveal: "揭露", reality: "高位干涉",
};

function preparationLabel(game: GameState, crisisId: string) {
  const crisis = game.ending.campaign?.crises.find((item) => item.id === crisisId);
  if (!crisis?.assignedMemberId) return "尚未部署";
  const evidence = crisis.evidenceIds.filter((id) => game.evidenceNodes.some((item) => item.id === id && item.discovered && !item.compromised)).length;
  const support = Number(Boolean(crisis.assignedFactionId)) + Number(Boolean(crisis.assignedFacilityId));
  const total = evidence + support;
  return total >= 4 ? "准备充分" : total >= 2 ? "具备支点" : "情报薄弱";
}

export default function GreatSmogFinale({ game, busy, onDoctrine, onAssign, onAutoDeploy, onResolve }: Props) {
  const campaign = game.ending.campaign;
  if (!campaign) return null;
  const ready = Boolean(campaign.doctrine && campaign.crises.every((item) => item.assignedMemberId));
  const livingMembers = game.members.filter((item) => item.status !== "阵亡");
  const allies = game.factions.filter((item) => item.trust >= 35);
  const facilities = game.facilities.filter((item) => item.status === "运转中");
  const activeCanon = game.canonActors.filter((item) => item.location.includes("贝克兰德") || item.awareness !== "未知").slice(0, 3);

  return <div className="smog-campaign-backdrop">
    <main className="smog-campaign" role="dialog" aria-modal="true" aria-labelledby="smog-title">
      <header className="smog-command-header">
        <div className="smog-mark"><CloudFog size={24} /></div>
        <div>
          <p>贝克兰德大雾霾 · 第 {campaign.stage}/4 阶段</p>
          <h1 id="smog-title">{campaign.stageTitle}</h1>
          <span>{campaign.stageBrief}</span>
        </div>
        <div className="smog-stage-track" aria-label={`终局第${campaign.stage}阶段，共4阶段`}>
          {[1, 2, 3, 4].map((stage) => <i key={stage} className={stage <= campaign.stage ? "active" : ""}>{stage}</i>)}
        </div>
      </header>

      <section className="smog-metrics" aria-label="终局态势">
        <article><small>我方势头</small><strong>{campaign.momentum}</strong><span>由已完成部署累积</span></article>
        <article className="enemy"><small>敌方进度</small><strong>{campaign.enemyProgress}%</strong><span>降至越低越有利</span></article>
        <article><small>已撤离</small><strong>{campaign.rescued.toLocaleString()}</strong><span>已离开危险区域</span></article>
        <article><small>记录伤亡</small><strong>{campaign.casualties.toLocaleString()}</strong><span>不会被叙事抹去</span></article>
      </section>

      {!campaign.doctrine ? <section className="smog-doctrine">
        <header><Route size={17} /><div><strong>先确定组织立场</strong><span>这是方向，不是自动结局；之后仍需完成四阶段部署。</span></div></header>
        <div>{DOCTRINES.map((item) => <button key={item.id} onClick={() => onDoctrine(item.id)}>
          <span>{item.id}</span><strong>{item.title}</strong><p>{item.description}</p><small>{item.cost}</small>
        </button>)}</div>
      </section> : <>
        <section className="smog-current-order">
          <div><Route size={16} /><span>当前路线</span><strong>{campaign.doctrine}</strong><small>{DOCTRINES.find((item) => item.id === campaign.doctrine)?.description}</small></div>
          <button onClick={onAutoDeploy}>按专长建议部署</button>
        </section>

        <section className="smog-crises" aria-label="本阶段并发危机">
          {campaign.crises.map((crisis, index) => {
            const district = DISTRICTS.find((item) => item.id === crisis.districtId);
            const knownEvidence = crisis.evidenceIds.filter((id) => game.evidenceNodes.some((item) => item.id === id && item.discovered && !item.compromised));
            const missingEvidence = crisis.evidenceIds.filter((id) => !knownEvidence.includes(id));
            return <article className={`smog-crisis ${crisis.risk === "致命" ? "fatal" : ""}`} key={crisis.id}>
              <header>
                <span className="crisis-number">0{index + 1}</span>
                <div><small><MapPin size={12} />{district?.name} · {crisis.risk}风险</small><h2>{crisis.title}</h2></div>
                <b>{preparationLabel(game, crisis.id)}</b>
              </header>
              <p className="crisis-scene">{crisis.scene}</p>
              <div className="crisis-threat"><ShieldAlert size={14} /><span><strong>已知威胁</strong>{crisis.threat}</span></div>
              <div className="crisis-tags">{crisis.tags.map((tag) => <span key={tag}>{TAGS[tag] ?? tag}</span>)}</div>
              <details className="crisis-intel">
                <summary><BookOpen size={13} />情报支点 <b>{knownEvidence.length}/{crisis.evidenceIds.length}</b><ChevronDown size={13} /></summary>
                <div>
                  {knownEvidence.map((id) => <p className="known" key={id}><CheckCircle2 size={13} />{game.evidenceNodes.find((item) => item.id === id)?.title}</p>)}
                  {missingEvidence.map((id) => <p key={id}><CircleAlert size={13} />{game.evidenceNodes.find((item) => item.id === id)?.title ?? "未知证据"} · 未取得</p>)}
                </div>
              </details>
              <div className="crisis-deployment">
                <label><span><UsersRound size={13} />执行者</span><select value={crisis.assignedMemberId ?? ""} onChange={(event) => onAssign(crisis.id, "member", event.target.value)}>
                  <option value="">必须选择</option><option value="player">你 · 组织负责人（亲自行动）</option>
                  {livingMembers.map((member) => <option key={member.id} value={member.id} disabled={Boolean(member.injury)}>{member.name} · {member.specialty}{member.injury ? "（负伤）" : ""}</option>)}
                </select></label>
                <label><span><Landmark size={13} />势力支援</span><select value={crisis.assignedFactionId ?? ""} onChange={(event) => onAssign(crisis.id, "faction", event.target.value)}>
                  <option value="">不调用</option>{allies.map((item) => <option key={item.id} value={item.id}>{item.name} · 信任{item.trust}</option>)}
                </select></label>
                <label><span><Sparkles size={13} />设施支点</span><select value={crisis.assignedFacilityId ?? ""} onChange={(event) => onAssign(crisis.id, "facility", event.target.value)}>
                  <option value="">不调用</option>{facilities.map((item) => <option key={item.id} value={item.id}>{item.name} · Lv.{item.level}</option>)}
                </select></label>
              </div>
              {crisis.assignedMemberId === "player" && crisis.risk === "致命" && <p className="player-fatal-note"><ShieldAlert size={14} />若本项未成功，你会进入明确的致命处境选择；不会被叙事直接判死。</p>}
              <footer><strong>若放任：</strong>{crisis.consequence}</footer>
            </article>;
          })}
        </section>

        <section className="smog-world-response">
          <details>
            <summary><Landmark size={15} />城市中的其他行动者 <b>{activeCanon.length}人可见</b><ChevronDown size={14} /></summary>
            <div>{activeCanon.length ? activeCanon.map((actor) => <article key={actor.id}><strong>{actor.name}</strong><small>{actor.publicIdentity} · {actor.location}</small><p>{actor.lastMove}</p><span>他们依自己的目标行动，不受玩家直接调度。</span></article>) : <p>你尚未建立足够视野，无法确认原著人物正在何处行动。</p>}</div>
          </details>
          <details>
            <summary><BookOpen size={15} />此前阶段战报 <b>{campaign.reports.length}份</b><ChevronDown size={14} /></summary>
            <div>{campaign.reports.length ? campaign.reports.map((report) => <article key={report.stage}><strong>第{report.stage}阶段 · {report.title}</strong><small>{report.summary}</small>{report.results.map((result) => <p key={result.crisisId}><b>{result.outcome}</b> {result.title}：{result.detail}</p>)}</article>) : <p>完成当前阶段后，小说式战报会永久写入“纪事”，这里也会保留行动摘要。</p>}</div>
          </details>
        </section>

        <footer className="smog-resolve-bar">
          <div><strong>{ready ? "部署已经形成可执行方案" : "仍有危机没有执行者"}</strong><span>结算后城市与敌对势力会继续行动，不能撤回。</span></div>
          <button disabled={!ready || busy} onClick={onResolve}>{busy ? "正在写入历史…" : `结算第${campaign.stage}阶段`}</button>
        </footer>
      </>}
    </main>
  </div>;
}
