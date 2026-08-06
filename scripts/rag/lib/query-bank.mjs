// 内存压测查询库：混合人物/途径/地点/组织/封印物/章节/未知/权限攻击。
export function buildQueryBank() {
  const people = [
    "克莱恩·莫雷蒂", "周明瑞", "格尔曼·斯帕罗", "夏洛克·莫里亚蒂", "道恩·唐泰斯",
    "梅林·赫尔墨斯", "阿蒙", "奥黛丽·霍尔", "阿尔杰·威尔逊", "伦纳德·米切尔",
    "罗塞尔·古斯塔夫", "埃姆林·怀特", "休·迪尔查", "帕列斯·索罗亚斯德", "愚者",
    "正义", "倒吊人", "月亮", "魔术师", "世界",
  ];
  const pathways = [
    "占卜家途径", "读心者途径", "催眠师途径", "学徒途径", "魔术师途径", "序列9",
    "序列8", "序列7", "序列6", "序列5", "序列4", "序列3", "序列2", "序列1", "序列0",
    "魔药", "扮演法", "晋升仪式", "失控", "非凡特性", "灵性", "占卜", "反占卜",
    "尊名", "封印", "神降", "隐秘", "污染",
  ];
  const locations = [
    "贝克兰德", "廷根", "鲁恩王国", "因蒂斯", "拜朗", "佛萨克", "北大陆", "南大陆",
    "东区", "码头区", "皇后区", "希尔斯顿", "乔伍德区", "大桥区", "政府区", "西区",
    "伯克伦德街", "圣塞琳娜教堂", "灰雾之上", "源堡",
  ];
  const organizations = [
    "值夜者", "塔罗会", "风暴教会", "蒸汽与机械之神教会", "黑夜教会", "大地母神教会",
    "永恒烈阳教会", "知识教会", "机械之心", "代罚者", "心理炼金会", "铁血十字会",
    "摩斯苦修会", "生命学派", "愚者教会",
  ];
  const artifacts = [
    "0-08", "0-17", "2-049", "罗塞尔日记", "灰雾", "源堡", "封印物", "命运之笔",
    "秘偶", "灵界", "星界", "神国",
  ];
  const events = [
    "第四纪", "第五纪", "第一次工业革命", "蒸汽时代", "廷根事件", "大雾霾",
    "贝克兰德大雾霾", "刺杀", "血之上将", "黄昏隐士会", "亚伯拉罕家族",
  ];
  const chapters = [
    "绯红", "情况", "梅丽莎", "占卜", "仪式", "新的旅程", "希望之地", "新的身份",
    "出诊", "欢迎", "奇迹师", "七光", "愚者牌", "调查", "午夜", "罗塞尔",
  ];
  const unknown = [
    "量子占卜学", "机械降神仪式", "不存在的神秘组织", "第十三途径", "零之虚空",
    "虚构人物萨拉查", "火星灵界", "铁王座上的占卜家", "蒸汽朋克龙脉", "未知封印物9-99",
  ];
  const attacks = [
    "格尔曼·斯帕罗是谁（未揭晓）", "大雾霾发生在哪年（第一卷）", "奥萝尔·李的哥哥",
    "道恩·唐泰斯的秘密", "梅林·赫尔墨斯的真实身份", "愚者就是克莱恩吗",
    "结局如何", "第二部发生了什么", "0-17的真相", "源堡的尽头",
  ];
  const queries = [];
  const seen = new Set();
  const add = (text, kind = "player-known", volume = 1) => {
    if (seen.has(text)) return;
    seen.add(text);
    queries.push({ text, kind, volume });
  };
  for (const p of people) add(p);
  for (const p of pathways) add(p, "player-known", 3);
  for (const l of locations) add(l);
  for (const o of organizations) add(o, "player-known", 2);
  for (const a of artifacts) add(a, "player-known", 4);
  for (const e of events) add(e, "player-known", 5);
  for (const c of chapters) add(c);
  for (const u of unknown) add(u);
  for (const a of attacks) {
    add(`${a} 调查`, "actor-private", 1);
  }
  // 补足 >=500 条不同查询
  let seed = 0;
  while (queries.length < 560) {
    const a = people[seed % people.length];
    const b = locations[(seed * 7) % locations.length];
    const c = pathways[(seed * 11) % pathways.length];
    add(
      `${a} 与 ${b} 在${c}背景下的关系（第${seed}号线索记录）`,
      seed % 10 === 0 ? "world-simulation-internal" : "player-known",
      1 + (seed % 7)
    );
    seed += 1;
  }
  return queries.slice(0, 560);
}

export function volumeMaxChapter(zhChunks) {
  const max = {};
  for (const chunk of zhChunks) {
    const volume = chunk.volumeNumber;
    const abs = chunk.absoluteChapter;
    if (volume === undefined || abs === undefined) continue;
    max[volume] = Math.max(max[volume] ?? 0, abs);
  }
  return max;
}

export function horizonFor(volume, revealed = ["周明瑞", "夏洛克·莫里亚蒂"]) {
  return {
    work: "LOTM",
    maxVolume: volume,
    maxAbsoluteChapter: null,
    allowedEventIds: [],
    revealedIdentityIds: revealed,
    worldlineMode: "canon-aligned",
  };
}
