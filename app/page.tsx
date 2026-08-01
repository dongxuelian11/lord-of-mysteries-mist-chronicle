"use client";

import { useEffect, useMemo, useState } from "react";

type PathwayId = "seer" | "spectator" | "apprentice" | "hunter" | "mystery";
type OrganizationId = "agency" | "salon" | "clinic" | "caravan";
type ViewId = "situation" | "organization" | "archive";

type Member = {
  id: string;
  name: string;
  role: string;
  sequence: string;
  specialty: string;
  status: "空闲" | "执行中" | "休养";
  trust: number;
};

type District = {
  id: string;
  name: string;
  subtitle: string;
  danger: number;
  influence: number;
  intel: number;
  tone: string;
};

type Incident = {
  id: string;
  districtId: string;
  title: string;
  summary: string;
  progress: number;
  urgency: number;
  confidence: "传闻" | "线索" | "可信证据" | "已确认";
};

type Order = {
  id: string;
  type: string;
  memberId: string;
  districtId: string;
  brief: string;
};

type ChronicleEntry = {
  id: string;
  week: number;
  title: string;
  text: string;
  tone: "good" | "warn" | "neutral";
};

type GameState = {
  week: number;
  date: string;
  pathway: PathwayId;
  organization: OrganizationId;
  actionPoints: number;
  money: number;
  intel: number;
  concealment: number;
  stability: number;
  members: Member[];
  districts: District[];
  incidents: Incident[];
  orders: Order[];
  chronicle: ChronicleEntry[];
};

const STORAGE_KEY = "mist-chronicle-save-v1";

const PATHWAYS: Record<PathwayId, { name: string; sequence: string; ability: string; note: string }> = {
  seer: { name: "占卜家", sequence: "序列9", ability: "灵视 · 占卜", note: "擅长预警、追索与仪式准备" },
  spectator: { name: "观众", sequence: "序列9", ability: "观察 · 读心倾向", note: "擅长识人、交涉与心理干预" },
  apprentice: { name: "学徒", sequence: "序列9", ability: "开门 · 灵性直觉", note: "擅长潜入、脱身与空间探索" },
  hunter: { name: "猎人", sequence: "序列9", ability: "追踪 · 陷阱", note: "擅长侦察、伏击与正面冲突" },
  mystery: { name: "窥秘人", sequence: "序列9", ability: "神秘学识 · 仪式", note: "擅长研究、鉴定与污染辨识" },
};

const ORGANIZATIONS: Record<OrganizationId, { name: string; cover: string; perk: string }> = {
  agency: { name: "鸦羽侦探事务所", cover: "私人调查与失物寻回", perk: "合法委托与警务关系" },
  salon: { name: "银灯神秘学沙龙", cover: "贵族神秘学交流会", perk: "上流社交与知识交易" },
  clinic: { name: "圣槲慈善诊所", cover: "东区平价诊疗", perk: "底层影响与异常病例" },
  caravan: { name: "灰鲸地下商队", cover: "旧货与海外香料贸易", perk: "采购、走私与黑市渠道" },
};

const INITIAL_MEMBERS: Member[] = [
  { id: "mara", name: "玛拉·维恩", role: "外勤调查员", sequence: "普通人", specialty: "跟踪与街头关系", status: "空闲", trust: 72 },
  { id: "cedric", name: "塞德里克·霍尔", role: "账房兼掩护人", sequence: "普通人", specialty: "账目与身份文书", status: "空闲", trust: 64 },
  { id: "ines", name: "伊妮丝·科尔", role: "情报联络员", sequence: "普通人", specialty: "报业与贵族传闻", status: "空闲", trust: 59 },
  { id: "rowan", name: "罗文·布莱克", role: "非凡顾问", sequence: "序列9 · 收尸人", specialty: "灵体与死亡痕迹", status: "空闲", trust: 67 },
];

const INITIAL_DISTRICTS: District[] = [
  { id: "cherwood", name: "乔伍德区", subtitle: "据点所在", danger: 24, influence: 42, intel: 56, tone: "safe" },
  { id: "east", name: "东区", subtitle: "失踪案频发", danger: 72, influence: 18, intel: 31, tone: "danger" },
  { id: "west", name: "西区", subtitle: "贵族与教会", danger: 38, influence: 11, intel: 22, tone: "gold" },
];

const INITIAL_INCIDENTS: Incident[] = [
  {
    id: "missing-workers",
    districtId: "east",
    title: "煤气灯下的失踪者",
    summary: "三名码头工人在一周内失踪。警察认为他们只是逃债，但最后出现地点都靠近废弃纺织厂。",
    progress: 18,
    urgency: 68,
    confidence: "线索",
  },
  {
    id: "black-market-formula",
    districtId: "cherwood",
    title: "被涂改的魔药配方",
    summary: "黑市掮客正在出售一张来历不明的低序列配方，其中两种辅料被人为替换。",
    progress: 35,
    urgency: 42,
    confidence: "传闻",
  },
  {
    id: "noble-salon",
    districtId: "west",
    title: "西区的午夜沙龙",
    summary: "一场只对受邀者开放的神秘学聚会正在寻找新的占卜师，邀请函上带有微弱灵性。",
    progress: 10,
    urgency: 35,
    confidence: "线索",
  },
];

function createInitialState(pathway: PathwayId = "seer", organization: OrganizationId = "agency"): GameState {
  const moneyBonus = organization === "caravan" ? 80 : organization === "salon" ? 35 : 0;
  const intelBonus = organization === "agency" ? 8 : organization === "clinic" ? 5 : 0;
  return {
    week: 1,
    date: "1349年6月28日",
    pathway,
    organization,
    actionPoints: 3,
    money: 420 + moneyBonus,
    intel: 24 + intelBonus,
    concealment: 86,
    stability: 92,
    members: INITIAL_MEMBERS.map((member) => ({ ...member })),
    districts: INITIAL_DISTRICTS.map((district) => ({ ...district })),
    incidents: INITIAL_INCIDENTS.map((incident) => ({ ...incident })),
    orders: [],
    chronicle: [
      {
        id: "opening",
        week: 1,
        title: "灰雾之下，历史开始转动",
        text: "廷根传来一则不起眼的自杀案消息。与此同时，你在贝克兰德的组织完成了第一次正式集会。",
        tone: "neutral",
      },
    ],
  };
}

function numberHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function nextDate(week: number) {
  const date = new Date(Date.UTC(1349, 5, 28));
  date.setUTCDate(date.getUTCDate() + week * 7);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function confidenceFromProgress(progress: number): Incident["confidence"] {
  if (progress >= 85) return "已确认";
  if (progress >= 55) return "可信证据";
  if (progress >= 20) return "线索";
  return "传闻";
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewId>("situation");
  const [selectedDistrictId, setSelectedDistrictId] = useState("east");
  const [selectedMemberId, setSelectedMemberId] = useState("mara");
  const [actionType, setActionType] = useState("调查");
  const [brief, setBrief] = useState("暗中接触失踪工人的家属，核对他们最后出现的时间与地点。不要惊动警察。");
  const [showSettings, setShowSettings] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [draftPathway, setDraftPathway] = useState<PathwayId>("seer");
  const [draftOrganization, setDraftOrganization] = useState<OrganizationId>("agency");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const savedAi = window.localStorage.getItem(`${STORAGE_KEY}-ai`);
    if (saved) {
      try {
        setGame(JSON.parse(saved) as GameState);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    if (savedAi) {
      try {
        const config = JSON.parse(savedAi) as { endpoint?: string; apiKey?: string; model?: string };
        setEndpoint(config.endpoint ?? "");
        setApiKey(config.apiKey ?? "");
        setModel(config.model ?? "");
      } catch {
        window.localStorage.removeItem(`${STORAGE_KEY}-ai`);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedDistrict = game.districts.find((district) => district.id === selectedDistrictId) ?? game.districts[0];
  const selectedIncident = game.incidents.find((incident) => incident.districtId === selectedDistrict.id);
  const pathway = PATHWAYS[game.pathway];
  const organization = ORGANIZATIONS[game.organization];
  const availableMembers = game.members.filter((member) => !game.orders.some((order) => order.memberId === member.id));
  const selectedMember = game.members.find((member) => member.id === selectedMemberId) ?? game.members[0];
  const activeMemberId = availableMembers.some((member) => member.id === selectedMemberId)
    ? selectedMemberId
    : availableMembers[0]?.id ?? "";

  const situationScore = useMemo(() => {
    return Math.round((game.intel + game.concealment + game.stability) / 3);
  }, [game.intel, game.concealment, game.stability]);

  function queueOrder() {
    if (!brief.trim() || game.actionPoints <= 0 || !activeMemberId) return;
    const order: Order = {
      id: `order-${Date.now()}`,
      type: actionType,
      memberId: activeMemberId,
      districtId: selectedDistrict.id,
      brief: brief.trim(),
    };
    setGame((current) => ({
      ...current,
      actionPoints: current.actionPoints - 1,
      orders: [...current.orders, order],
    }));
    setBrief("");
    setToast("指令已加入本周计划");
  }

  function removeOrder(orderId: string) {
    setGame((current) => ({
      ...current,
      actionPoints: Math.min(3, current.actionPoints + 1),
      orders: current.orders.filter((order) => order.id !== orderId),
    }));
  }

  function resolveWeek() {
    const orders = game.orders;
    const entries: ChronicleEntry[] = [];
    let moneyDelta = -18;
    let intelDelta = 0;
    let concealmentDelta = 0;
    let stabilityDelta = 0;
    const progressByIncident: Record<string, number> = {};

    if (orders.length === 0) {
      entries.push({
        id: `quiet-${game.week}`,
        week: game.week,
        title: "谨慎的一周",
        text: "组织没有执行重点行动。成员维持日常掩护，街巷中的暗流仍在继续。",
        tone: "neutral",
      });
      concealmentDelta += 3;
      stabilityDelta += 2;
    }

    orders.forEach((order, index) => {
      const member = game.members.find((item) => item.id === order.memberId) ?? selectedMember;
      const district = game.districts.find((item) => item.id === order.districtId) ?? selectedDistrict;
      const incident = game.incidents.find((item) => item.districtId === order.districtId);
      const roll = numberHash(`${game.week}:${order.memberId}:${order.districtId}:${order.type}:${order.brief}`) % 100;
      const preparation = Math.min(18, Math.floor(order.brief.length / 12));
      const memberBonus = member.sequence === "普通人" ? 8 : 15;
      const threshold = 48 + preparation + memberBonus - Math.floor(district.danger / 4);
      const success = roll < threshold;

      moneyDelta -= order.type === "采购" ? 35 : order.type === "交涉" ? 20 : 12;
      intelDelta += success ? 6 : 2;
      concealmentDelta += success ? -1 : -4;
      stabilityDelta += success ? 0 : -2;
      if (incident) progressByIncident[incident.id] = (progressByIncident[incident.id] ?? 0) + (success ? 18 : 7);

      entries.push({
        id: `week-${game.week}-${index}`,
        week: game.week,
        title: `${member.name} · ${order.type}${success ? "取得进展" : "遭遇阻力"}`,
        text: success
          ? `${member.name}依照你的计划进入${district.name}。准备工作发挥了作用，组织获得了可交叉验证的新信息。`
          : `${member.name}在${district.name}遭遇意外阻力。行动没有完全暴露，但有人开始留意组织的动向。`,
        tone: success ? "good" : "warn",
      });
    });

    const nextWeek = game.week + 1;
    setGame((current) => ({
      ...current,
      week: nextWeek,
      date: nextDate(nextWeek - 1),
      actionPoints: 3,
      money: Math.max(0, current.money + moneyDelta),
      intel: Math.min(100, Math.max(0, current.intel + intelDelta)),
      concealment: Math.min(100, Math.max(0, current.concealment + concealmentDelta)),
      stability: Math.min(100, Math.max(0, current.stability + stabilityDelta)),
      orders: [],
      incidents: current.incidents.map((incident) => {
        const progress = Math.min(100, incident.progress + (progressByIncident[incident.id] ?? 0) + (incident.urgency > 60 ? 2 : 0));
        return {
          ...incident,
          progress,
          urgency: Math.min(100, incident.urgency + (progressByIncident[incident.id] ? -3 : 4)),
          confidence: confidenceFromProgress(progress),
        };
      }),
      chronicle: [...entries, ...current.chronicle].slice(0, 40),
    }));
    setToast(`第${game.week}周结算完成`);
  }

  function startNewGame() {
    setGame(createInitialState(draftPathway, draftOrganization));
    setSelectedDistrictId("east");
    setShowNewGame(false);
    setToast("新的历史分支已经建立");
  }

  function saveAiSettings() {
    window.localStorage.setItem(`${STORAGE_KEY}-ai`, JSON.stringify({ endpoint, apiKey, model }));
    setShowSettings(false);
    setToast(endpoint && model ? "模型配置已保存在本机" : "已启用离线叙事模式");
  }

  return (
    <main className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">雾</div>
          <div>
            <p className="eyebrow">诡秘之主 · 同人推演原型</p>
            <h1>灰雾纪事</h1>
          </div>
        </div>
        <div className="date-block">
          <span>第 {game.week} 周</span>
          <strong>{game.date}</strong>
          <small>世界线偏转：0.7%</small>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setShowNewGame(true)} aria-label="新游戏">↻</button>
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="模型设置">⚙</button>
        </div>
      </header>

      <nav className="section-tabs" aria-label="主要页面">
        <button className={view === "situation" ? "active" : ""} onClick={() => setView("situation")}>局势推演</button>
        <button className={view === "organization" ? "active" : ""} onClick={() => setView("organization")}>组织与成员</button>
        <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>历史档案</button>
        <span className="autosave"><i /> 本地自动存档</span>
      </nav>

      {view === "situation" && (
        <div className="command-grid">
          <section className="panel map-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">城市态势</p>
                <h2>贝克兰德</h2>
              </div>
              <span className="weather">薄雾 · 12°C</span>
            </div>

            <div className="map-field" aria-label="贝克兰德城区地图">
              <div className="river" />
              {game.districts.map((district, index) => (
                <button
                  key={district.id}
                  className={`district district-${index + 1} ${district.tone} ${selectedDistrict.id === district.id ? "selected" : ""}`}
                  onClick={() => setSelectedDistrictId(district.id)}
                >
                  <span className="district-pulse" />
                  <strong>{district.name}</strong>
                  <small>{district.subtitle}</small>
                </button>
              ))}
              <span className="map-label label-north">北区</span>
              <span className="map-label label-river">塔索克河</span>
              <span className="map-compass">N<br />↑</span>
            </div>

            <div className="district-summary">
              <div>
                <p className="eyebrow">当前区域</p>
                <h3>{selectedDistrict.name}</h3>
              </div>
              <div className="mini-stat"><span>危险</span><strong>{selectedDistrict.danger}</strong></div>
              <div className="mini-stat"><span>影响</span><strong>{selectedDistrict.influence}</strong></div>
              <div className="mini-stat"><span>情报</span><strong>{selectedDistrict.intel}</strong></div>
            </div>
          </section>

          <section className="center-stack">
            <article className="panel incident-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">本周焦点 · {selectedIncident?.confidence ?? "未知"}</p>
                  <h2>{selectedIncident?.title ?? "暂无线索"}</h2>
                </div>
                <span className={`risk-badge ${(selectedIncident?.urgency ?? 0) > 60 ? "high" : "medium"}`}>
                  风险 {selectedIncident?.urgency ?? 0}
                </span>
              </div>
              <p className="incident-copy">{selectedIncident?.summary ?? "这个城区暂时没有进入组织视野的异常。"}</p>
              <div className="evidence-track">
                <div className="track-label"><span>证据链</span><strong>{selectedIncident?.progress ?? 0}%</strong></div>
                <div className="track"><i style={{ width: `${selectedIncident?.progress ?? 0}%` }} /></div>
              </div>
              <div className="clue-row">
                <span>来源：街头线人</span>
                <span>可信度：{selectedIncident?.confidence ?? "未知"}</span>
                <span>剩余窗口：约3周</span>
              </div>
            </article>

            <article className="panel order-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">重点指令</p>
                  <h2>安排本周行动</h2>
                </div>
                <div className="action-points" aria-label={`剩余${game.actionPoints}个行动点`}>
                  {[0, 1, 2].map((point) => <i key={point} className={point < game.actionPoints ? "filled" : ""} />)}
                </div>
              </div>

              <div className="order-controls">
                <label>
                  <span>行动类型</span>
                  <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
                    {['调查', '交涉', '研究', '采购', '仪式', '休整'].map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <span>执行成员</span>
                  <select value={activeMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} disabled={!availableMembers.length}>
                    {availableMembers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}
                  </select>
                </label>
              </div>
              <label className="brief-field">
                <span>具体计划</span>
                <textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="描述目标、方法、底线和撤退条件……"
                  maxLength={280}
                />
                <small>{brief.length}/280 · 计划越具体，准备加成越高</small>
              </label>
              <button className="primary-button" onClick={queueOrder} disabled={!brief.trim() || game.actionPoints <= 0 || !availableMembers.length}>
                下达指令 <span>消耗1行动点</span>
              </button>
            </article>

            {game.orders.length > 0 && (
              <article className="panel queue-panel">
                <p className="eyebrow">待执行计划</p>
                {game.orders.map((order, index) => {
                  const member = game.members.find((item) => item.id === order.memberId);
                  return (
                    <div className="queued-order" key={order.id}>
                      <span className="queue-index">0{index + 1}</span>
                      <div><strong>{order.type} · {member?.name}</strong><p>{order.brief}</p></div>
                      <button onClick={() => removeOrder(order.id)} aria-label="撤销指令">×</button>
                    </div>
                  );
                })}
              </article>
            )}
          </section>

          <aside className="right-stack">
            <section className="panel organization-card">
              <div className="organization-seal">鸦</div>
              <p className="eyebrow">当前组织</p>
              <h2>{organization.name}</h2>
              <p className="muted">{organization.cover}</p>
              <div className="resource-list">
                <div><span>可用资金</span><strong>£ {game.money}</strong></div>
                <div><span>情报储备</span><strong>{game.intel}</strong></div>
                <div><span>隐秘度</span><strong>{game.concealment}</strong></div>
                <div><span>组织稳定</span><strong>{game.stability}</strong></div>
              </div>
              <div className="situation-ring" style={{ "--score": `${situationScore * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{situationScore}</strong><span>综合态势</span></div>
              </div>
            </section>

            <section className="panel player-card">
              <div className="panel-heading compact">
                <div><p className="eyebrow">负责人</p><h2>无名的记录者</h2></div>
                <span className="sequence-badge">{pathway.sequence}</span>
              </div>
              <div className="pathway-line"><span>{pathway.name}</span><strong>{pathway.ability}</strong></div>
              <p className="muted">{pathway.note}</p>
            </section>

            <button className="turn-button" onClick={resolveWeek}>
              <span><small>世界将同步推进</small>结束本周</span>
              <b>→</b>
            </button>
          </aside>
        </div>
      )}

      {view === "organization" && (
        <div className="secondary-view">
          <section className="panel roster-panel">
            <div className="panel-heading"><div><p className="eyebrow">核心成员</p><h2>{organization.name}</h2></div><span className="weather">4 / 6 席位</span></div>
            <div className="member-grid">
              {game.members.map((member) => (
                <article className="member-card" key={member.id}>
                  <div className="member-avatar">{member.name.slice(0, 1)}</div>
                  <div className="member-info"><h3>{member.name}</h3><p>{member.role}</p></div>
                  <span className="member-sequence">{member.sequence}</span>
                  <div className="member-detail"><span>专长</span><strong>{member.specialty}</strong></div>
                  <div className="member-detail"><span>关系判断</span><strong>{member.trust >= 70 ? "信任" : member.trust >= 60 ? "合作稳定" : "有所保留"}</strong></div>
                  <button className="text-button">查看档案与对话 →</button>
                </article>
              ))}
            </div>
          </section>
          <aside className="panel doctrine-panel">
            <p className="eyebrow">长期政策</p>
            <h2>谨慎调查</h2>
            <p>成员优先保全身份，遇到未知非凡者时不主动交战，并在午夜前返回据点。</p>
            <div className="doctrine-item"><span>撤退阈值</span><strong>中等风险</strong></div>
            <div className="doctrine-item"><span>情报共享</span><strong>核心成员</strong></div>
            <div className="doctrine-item"><span>对教会态度</span><strong>保持距离</strong></div>
            <button className="secondary-button">调整组织政策</button>
          </aside>
        </div>
      )}

      {view === "archive" && (
        <div className="secondary-view archive-view">
          <section className="panel chronicle-panel">
            <div className="panel-heading"><div><p className="eyebrow">世界记忆</p><h2>组织编年史</h2></div><span className="weather">{game.chronicle.length} 条记录</span></div>
            <div className="timeline">
              {game.chronicle.map((entry) => (
                <article key={entry.id} className={`timeline-entry ${entry.tone}`}>
                  <span className="timeline-week">W{entry.week}</span>
                  <div><h3>{entry.title}</h3><p>{entry.text}</p></div>
                </article>
              ))}
            </div>
          </section>
          <aside className="panel evidence-index">
            <p className="eyebrow">证据索引</p>
            <h2>当前调查</h2>
            {game.incidents.map((incident) => (
              <button key={incident.id} onClick={() => { setSelectedDistrictId(incident.districtId); setView("situation"); }}>
                <span>{incident.confidence}</span>
                <strong>{incident.title}</strong>
                <small>{incident.progress}%</small>
              </button>
            ))}
          </aside>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)} aria-label="关闭">×</button>
            <p className="eyebrow">本机配置</p>
            <h2 id="settings-title">AI叙事接口</h2>
            <p className="modal-copy">不填写也可以游玩。接口只负责对话与叙事，规则结算始终在本地完成。</p>
            <label><span>OpenAI兼容端点</span><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1" /></label>
            <label><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" /></label>
            <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅保存在本机" /></label>
            <button className="primary-button" onClick={saveAiSettings}>保存设置</button>
            <small className="security-note">当前切片使用离线模板叙事；下一阶段接通实际请求与结构化校验。</small>
          </section>
        </div>
      )}

      {showNewGame && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowNewGame(false)}>
          <section className="modal new-game-modal" role="dialog" aria-modal="true" aria-labelledby="new-game-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowNewGame(false)} aria-label="关闭">×</button>
            <p className="eyebrow">建立新的历史分支</p>
            <h2 id="new-game-title">选择你的开局</h2>
            <div className="choice-grid">
              <div>
                <span className="choice-label">非凡途径</span>
                {(Object.entries(PATHWAYS) as [PathwayId, (typeof PATHWAYS)[PathwayId]][]).map(([id, item]) => (
                  <button key={id} className={draftPathway === id ? "selected-choice" : ""} onClick={() => setDraftPathway(id)}>
                    <strong>{item.name}</strong><small>{item.note}</small>
                  </button>
                ))}
              </div>
              <div>
                <span className="choice-label">组织掩护</span>
                {(Object.entries(ORGANIZATIONS) as [OrganizationId, (typeof ORGANIZATIONS)[OrganizationId]][]).map(([id, item]) => (
                  <button key={id} className={draftOrganization === id ? "selected-choice" : ""} onClick={() => setDraftOrganization(id)}>
                    <strong>{item.name}</strong><small>{item.perk}</small>
                  </button>
                ))}
              </div>
            </div>
            <button className="primary-button" onClick={startNewGame}>进入贝克兰德</button>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
