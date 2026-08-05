import { ADVANCEMENT_RITUALS, type Ability, type AbilityUseRecord, type ActionContract, type ActionResult, type ActingMark, type AdvancementProcess, type GameState, PATHWAYS } from "./game-model.ts";

const ACTING_PRINCIPLES: Record<GameState["pathwayId"], Record<number, string[]>> = {
  seer: {
    9: ["给出启示，但不替别人决定命运", "用可复核的征兆校正直觉", "面对未知时承认占卜边界"],
    8: ["用笑容承受命运的荒诞", "在失衡中保持精确控制", "把危险化作一场不伤人的表演"],
    7: ["先准备退路，再制造不可能", "让观众只看见你愿意展示的部分", "以替代手段化解失控"],
    6: ["记住自己是谁，再成为别人", "理解身份的习惯而不只复制容貌", "在伪装结束时守住真实关系"],
    5: ["让每根线都有明确目的", "操纵局面而非滥用他人生命", "始终保留能切断控制的边界"],
    4: ["让诡异遵循可说明的规则", "预置复生也不把他人当替死者", "用错位化解冲突而非炫耀权柄"],
    3: ["借取历史前先核验历史", "见证被遗忘者而不篡改他们", "每次离开当下都保留归返锚点"],
    2: ["先兑现微小愿望再承载奇迹", "奇迹必须说明受益者与代价", "复原曾存在之物而不制造空壳"],
    1: ["嫁接概念时逐一命名两端", "领域必须保留破解与退出可能", "神性越强越要维护真实关系"],
    0: ["愚弄认知而不欺骗世界账本", "回应祈祷也尊重凡人的选择", "以锚点确认自己仍是谁"],
  },
  spectator: {
    9: ["观察舞台，不贸然登台", "把事实、推断与情绪分开", "从细微矛盾建立可验证画像"],
    8: ["理解思想而不把推测当事实", "尊重没有被说出口的边界", "用语言而非强迫改变交流"],
    7: ["治疗心灵而不抹去人格", "让当事人保留拒绝权", "承担心理干预留下的后果"],
    6: ["让选择看似自然也仍可撤回", "精确控制暗示的范围与时限", "不把服从误认成信任"],
    5: ["穿行梦境而不迷失现实", "尊重梦主的自我防卫", "把创伤线索带回现实验证"],
    4: ["影响群体前先看见个体", "人格编织必须保留解除方式", "不把社会当作没有名字的材料"],
    3: ["共享梦境必须允许集体醒来", "修复心灵而不复刻旧伤", "让梦的逻辑接受现实核验"],
    2: ["洞察漏洞也承认遮蔽", "保护心灵而不隔绝共情", "集体象征不能冒充个人罪证"],
    1: ["未来必须由人物性格自然抵达", "书写趋势而不抹去反对者", "作者也接受角色改变故事"],
    0: ["空想成真前承担其全部后果", "创造人格即承认新的主体", "群体心灵不能吞没个人选择"],
  },
  apprentice: {
    9: ["把封闭看作边界而非绝境", "每次进入前先确认归路", "用小技巧完成真正的脱困"],
    8: ["以出其不意解决僵局", "让戏法服务目的而非炫耀", "不为便利破坏安全边界"],
    7: ["以坐标和观测校正方向", "敬畏星空下的未知距离", "为每条路线留下可靠记录"],
    6: ["只记录真正理解的能力", "复现前明确代价与停止条件", "把知识变成可安全调用的手段"],
    5: ["抵达远方也始终记得归处", "用移动避免无谓正面冲突", "建立能让同伴一起返回的坐标"],
    4: ["隐藏坐标也保留恢复钥匙", "放逐前确认终点不是死刑", "封锁空间必须留下破局规则"],
    3: ["漫游星界仍维持双重归途", "定位必须建立在真实联系上", "适应异域而不把异域带回家"],
    2: ["跨越规则前声明携带与舍弃", "永久门径必须可以治理和关闭", "远行造成的交流与污染都要结算"],
    1: ["概念之门只开启真实存在的边界", "任何绝对定位都先校验坐标", "关闭通路前清点所有依赖者"],
    0: ["重写空间仍保留改变前的历史", "多点存在不用于逃避真实风险", "世界边界必须定义通行与紧急关闭"],
  },
  hunter: {
    9: ["追踪猎物，也观察猎物如何反追踪", "先找环境弱点再决定冲突", "让陷阱替代无意义的硬拼"],
    8: ["激怒对手但不被怒火反控", "让挑衅暴露真实意图", "为冲突预设收束方式"],
    7: ["控制火焰而不是纵容毁灭", "把破坏限制在必要范围", "在危险里保持战术节奏"],
    6: ["让多方选择汇入同一结果", "阴谋必须允许修正与退出", "用情报差而非无辜者作筹码"],
    5: ["以决定性行动终止冲突", "收割成果也承担战场余波", "让队伍在压力下仍保持秩序"],
    4: ["军团连接建立在自愿追随上", "分配伤害不等于消灭伤害", "战争纪律必须包含撤离命令"],
    3: ["号令军队也校验每一层情报", "放大战意前先设计收束", "战争领域必须划出平民边界"],
    2: ["操纵天气也承担灾害余波", "压制敌人时保留安全走廊", "环境优势必须来自可核验弱点"],
    1: ["征服必须先有真实胜利", "胜利之后用治理而非恐惧维持秩序", "压制权柄也接受优势逆转的风险"],
    0: ["定义战争时拒绝把平民默认为敌人", "神战必须划定战区与终止条件", "战争锚点也要承认和平状态"],
  },
  mystery: {
    9: ["先识别，再命名，最后使用", "把未知拆成可验证层次", "不让好奇越过污染边界"],
    8: ["以知识击败单纯力量", "在冲突前辨认结构弱点", "把理论落实为可复核动作"],
    7: ["术式必须可重复、可中止", "记录每次反噬的真实原因", "用对应关系而非蛮力施术"],
    6: ["把知识封装成安全工具", "让使用者理解触发条件", "制作前先设计失效与回收"],
    5: ["以长期观测校正预兆", "预告异常也准备应对方案", "不为证明正确而强迫事件发生"],
    4: ["创造神秘效果必须可重复验证", "让知识实体化前先校验知识", "定义未知时始终保留未知项"],
    3: ["预言给出分支而非唯一命运", "读取知识轨迹不越过权限", "干扰预言也保留己方可执行道路"],
    2: ["赋予知识生命即承认它的主体性", "知识生物必须拥有学习边界", "信息成真必须建立在真实与清晰上"],
    1: ["知识秩序必须允许申诉和纠错", "真伪宣告只覆盖证据支持的语境", "封存危险知识也留下授权审计"],
    0: ["掌控知识而不改写世界真相", "显现与隐藏都说明受众和期限", "知识神国必须保留人格与退出边界"],
  },
};

export function actingPrinciplesFor(game: Pick<GameState, "pathwayId" | "currentSequence">) {
  return ACTING_PRINCIPLES[game.pathwayId][game.currentSequence] ?? [PATHWAYS[game.pathwayId].sequences.find((item) => item.rank === game.currentSequence)?.acting ?? "保持自我锚点"];
}

export function evaluateActing(game: GameState, contract: ActionContract, outcome: ActionResult["outcome"]): ActingMark | null {
  if (contract.leaderId !== "player") return null;
  const principles = actingPrinciplesFor(game);
  const source = `${contract.rawIntent} ${contract.desiredOutcome} ${contract.approach} ${contract.redLines} ${contract.retreat}`;
  const tokens: Record<GameState["pathwayId"], RegExp[]> = {
    seer: [/启示|占卜|预兆|验证|退路|替身|伪装|操纵/],
    spectator: [/观察|情绪|心理|拒绝|边界|治疗|暗示|梦境/],
    apprentice: [/边界|入口|坐标|撤离|返回|记录|空间|灵界/],
    hunter: [/追踪|陷阱|挑衅|冲突|火焰|战术|弱点|终止/],
    mystery: [/识别|知识|验证|仪式|术式|记录|卷轴|星象/],
  };
  const index = tokens[game.pathwayId].findIndex((pattern) => pattern.test(source));
  const principle = principles[index < 0 ? game.week % principles.length : index % principles.length];
  const repeated = game.actingMarks.slice(-5).filter((item) => item.sequence === game.currentSequence && item.principle === principle).length >= 2;
  const base = outcome === "成功" ? 8 : outcome === "部分成功" ? 6 : 3;
  const gain = Math.max(2, base + (contract.abilityIds.length ? 2 : 0) - (repeated ? 3 : 0));
  return { id: `acting-${game.week}-${contract.id}`, week: game.week, sequence: game.currentSequence, principle, evidence: `${contract.title}：${outcome}；${contract.desiredOutcome}`, gain, repeated };
}

export function evaluateImmediateActing(game: GameState, ability: Ability, intent: string, record: AbilityUseRecord): ActingMark | null {
  const principles = actingPrinciplesFor(game);
  const source = `${ability.name} ${ability.verb} ${ability.description} ${intent} ${record.observation} ${record.interpretation}`;
  const principleSignals: Record<GameState["pathwayId"], RegExp[]> = {
    seer: [/启示|占卜|预兆|征兆|命运/, /复核|验证|校正|判断/, /边界|未知|无法确认|不替|停止/],
    spectator: [/观察|旁观|微表情|行为/, /事实|推断|情绪|判断|无法确认/, /矛盾|画像|验证|细微/],
    apprentice: [/边界|封闭|入口|脱困/, /归路|返回|撤离|坐标/, /技巧|开锁|通路|空间/],
    hunter: [/追踪|反追踪|猎物/, /环境|弱点|冲突|战术/, /陷阱|避免|替代|收束/],
    mystery: [/识别|命名|辨认/, /未知|层次|验证|复核/, /污染|边界|停止|不使用/],
  };
  const scores = principleSignals[game.pathwayId].map((signals) => signals.test(source) ? 1 : 0);
  const index = scores.findIndex((score) => score === Math.max(...scores));
  if (index < 0 || Math.max(...scores) === 0) return null;
  const principle = principles[index % principles.length];
  const recentMatches = game.actingMarks.slice(-6).filter((item) => item.sequence === game.currentSequence && item.principle === principle).length;
  const repeated = recentMatches >= 2;
  const boundaryBonus = /不施加|不强迫|不把.{0,12}当作事实|只观察|停止条件|撤离|返回|复核|验证/.test(intent) ? 1 : 0;
  const gain = Math.max(2, 4 + boundaryBonus - (repeated ? 2 : 0));
  return {
    id: `acting-${record.id}`,
    week: game.week,
    sequence: game.currentSequence,
    principle,
    evidence: `${ability.name}：${intent.slice(0, 84)}${intent.length > 84 ? "……" : ""}`,
    gain,
    repeated,
  };
}

export function createAdvancementProcess(game: GameState): AdvancementProcess {
  if (game.currentSequence <= 0) throw new Error("这条途径已经没有更低的序列编号。");
  if (game.digestion < 100) throw new Error("魔药尚未完全消化；继续以当前序列的原则经历真实事件。 ");
  return {
    targetRank: game.currentSequence - 1,
    stage: "配方核验",
    startedWeek: game.week,
    formulaIntegrity: 0,
    brewIntegrity: 0,
    ritualIntegrity: 0,
    stabilization: 0,
    flaws: [],
    safeguards: [],
    log: [`第${game.week}周：建立序列${game.currentSequence - 1}晋升档案；既有消化成果已保留。`],
  };
}

function materialQuality(game: GameState) {
  const obtained = game.materials.filter((item) => item.obtained);
  if (!obtained.length) return 0;
  return Math.round(obtained.reduce((sum, item) => sum + (item.purity ?? 50) + (item.freshness ?? 50) - (item.contamination ?? 0) * 2, 0) / obtained.length / 2);
}

export function advanceAdvancementStage(game: GameState): GameState {
  const process = game.advancementProcess ?? createAdvancementProcess(game);
  const log = [...process.log];
  const flaws = [...process.flaws];
  const safeguards = [...process.safeguards];
  if (process.stage === "配方核验") {
    if (game.formulaKnowledge < 80) throw new Error("配方信息仍存在关键缺口。你可以继续调查、交易或请可靠神秘学家交叉核验；已有知识不会丢失。 ");
    const integrity = Math.min(100, game.formulaKnowledge - game.materials.filter((item) => item.authenticity === "未知").length * 6);
    if (integrity < 90) flaws.push("配方来源尚未完成三方交叉核验，调制时需要保留一份样本。 ");
    safeguards.push("已将主辅材料顺序、温度与替代禁忌分别抄录。 ");
    log.push(`配方核验完成，完整度${integrity}%；${integrity < 90 ? "一处疑点被带入后续流程，而非清空进度。" : "未发现会改变药性的缺口。"}`);
    return { ...game, advancementProcess: { ...process, stage: "魔药调制", formulaIntegrity: integrity, flaws, safeguards, log } };
  }
  if (process.stage === "魔药调制") {
    if (!game.materials.every((item) => item.obtained)) throw new Error("材料尚未齐备。每份已取得材料及其鉴定进度都会保留。 ");
    if (game.materials.some((item) => item.authenticity !== "已确认")) throw new Error("至少一份材料尚未确认真伪；先鉴定，避免把风险留到服食时。 ");
    const quality = materialQuality(game);
    if (quality < 55) throw new Error("材料污染或纯度已经越过安全线；可以净化、替换或寻找更可靠来源。 ");
    if (quality < 78) flaws.push("魔药出现轻微分层，稳定阶段会承受额外精神负荷。 ");
    safeguards.push("保留材料样本，并由一名成员在隔离门外记录调制过程。 ");
    log.push(`魔药调制完成，综合品质${quality}%；调制成果已封存在避光容器中。`);
    return { ...game, advancementProcess: { ...process, stage: "仪式执行", brewIntegrity: quality, flaws, safeguards, log } };
  }
  if (process.stage === "仪式执行") {
    if (game.ritualReadiness < 70) throw new Error("仪式尚未形成足够完整的现实条件。继续推进相关经历即可；当前准备不会被清空。 ");
    const integrity = Math.min(100, Math.round(game.ritualReadiness * .72 + game.stability * .18 + game.influence * .1));
    if (integrity < 85) flaws.push("仪式完成，但现实见证与自我锚点偏弱。 ");
    safeguards.push(`仪式文本已锁定：${ADVANCEMENT_RITUALS[game.pathwayId][process.targetRank]}`);
    log.push(`晋升仪式完成，规则认可度${integrity}%；仪式结果已经发生，不能靠重试抹去。`);
    return { ...game, advancementProcess: { ...process, stage: "精神稳定", ritualIntegrity: integrity, flaws, safeguards, log } };
  }
  if (process.stage === "精神稳定") {
    if (game.instability >= 70 || game.playerCondition.pollution >= 55) throw new Error("当前精神或污染状态不适合服食；先休整、治疗或补强锚点。 ");
    const stabilization = Math.max(0, Math.min(100, Math.round(game.stability * .5 + (100 - game.instability) * .3 + (100 - game.playerCondition.pollution) * .2 - flaws.length * 4)));
    if (stabilization < 60) throw new Error("稳定度不足，但既有调制和仪式成果仍会保留；改善组织锚点与个人状态后再继续。 ");
    log.push(`精神稳定完成，锚点稳定度${stabilization}%；可以由玩家明确决定是否服食。`);
    return { ...game, advancementProcess: { ...process, stage: "可以晋升", stabilization, flaws, safeguards, log } };
  }
  return { ...game, advancementProcess: process };
}

export function advancementStatus(game: GameState) {
  return game.advancementProcess?.stage ?? (game.digestion >= 100 ? "可建立晋升档案" : "继续消化");
}
