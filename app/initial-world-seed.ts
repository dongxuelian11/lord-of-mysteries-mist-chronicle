import type { CanonActor, FactionState, TimelineEvent } from "./game-model.ts";

export const INITIAL_FACTIONS: FactionState[] = [
  { id: "night-church", name: "黑夜教会", kind: "教会", publicGoal: "维持首都神秘秩序", currentPlan: "观察非法非凡组织与异常人口报告", trust: 8, interest: 18, suspicion: 20, leverage: 0, planProgress: 12, visibility: "传闻", lastMove: "值夜者正在汇总东区失踪案。" },
  { id: "steam-church", name: "蒸汽与机械之神教会", kind: "教会", publicGoal: "保护工业与技术秩序", currentPlan: "审查煤气、港务与大型工程事故", trust: 4, interest: 12, suspicion: 15, leverage: 0, planProgress: 8, visibility: "传闻", lastMove: "机械之心接管了一份异常设备事故档案。" },
  { id: "royal-project", name: "王室特别工程集团", kind: "王室", publicGoal: "推进保密公共工程", currentPlan: "集中材料、人口与行政掩护", trust: 0, interest: 5, suspicion: 6, leverage: 0, planProgress: 18, visibility: "未知", lastMove: "一批不公开招标的物资完成转运。" },
  { id: "witch-sect", name: "魔女教派", kind: "密教", publicGoal: "身份与目的均未公开", currentPlan: "提供仪式支持并清理知情者", trust: 0, interest: 4, suspicion: 4, leverage: 0, planProgress: 14, visibility: "未知", lastMove: "一名使用假身份的女子在东区更换住所。" },
  { id: "aurora-order", name: "极光会外围", kind: "密教", publicGoal: "散播末日与救赎言论", currentPlan: "争夺被忽视的异常与失踪者", trust: 0, interest: 10, suspicion: 8, leverage: 0, planProgress: 7, visibility: "传闻", lastMove: "地下聚会出现新的布道者。" },
  { id: "police", name: "贝克兰德警察厅", kind: "官方", publicGoal: "控制治安与舆论", currentPlan: "把失踪人口归入普通治安案件", trust: 10, interest: 8, suspicion: 12, leverage: 0, planProgress: 10, visibility: "已接触", lastMove: "警察要求事务所补交执业文件。" },
  { id: "press", name: "晚报消息网", kind: "灰色势力", publicGoal: "用新闻换取生存和影响", currentPlan: "收集东区事故与上流丑闻", trust: 22, interest: 28, suspicion: 5, leverage: 8, planProgress: 16, visibility: "已接触", lastMove: "一名社会版编辑压下了工人失踪短讯。" },
  { id: "black-market", name: "桥区非凡黑市", kind: "灰色势力", publicGoal: "维持隐秘交易", currentPlan: "垄断配方、材料和危险物品流向", trust: 8, interest: 24, suspicion: 10, leverage: 4, planProgress: 13, visibility: "已接触", lastMove: "有人开始询问黑玻璃制品的买家。" },
];

export const INITIAL_TIMELINE: TimelineEvent[] = [
  { id: "tl-awakening", title: "廷根的苏醒者", scheduledWeek: 1, kind: "历史锚点", status: "active", summary: "远方一名本不属于这个时代的人从死亡中醒来；贝克兰德暂时无人知晓。", revealed: true, pressure: 5 },
  { id: "tl-tingen-shadow", title: "廷根阴影加深", scheduledWeek: 6, kind: "可变事件", status: "upcoming", summary: "廷根的隐秘冲突将逼近灾变窗口。玩家只能通过极少数远方情报察觉。", revealed: false, pressure: 18 },
  { id: "tl-detective-arrival", title: "一位侦探抵达贝克兰德", scheduledWeek: 10, kind: "历史锚点", status: "upcoming", summary: "如果历史没有严重偏转，一名新的私人侦探会进入首都。", revealed: false, pressure: 12 },
  { id: "tl-population", title: "不可见人口开始汇聚", scheduledWeek: 14, kind: "可变事件", status: "upcoming", summary: "招工、迁移、失踪和收容记录将逐渐出现同一方向。", revealed: false, pressure: 36 },
  { id: "tl-procurement", title: "王室采购进入加速期", scheduledWeek: 18, kind: "可变事件", status: "upcoming", summary: "材料、煤气设施和封闭仓库的调度会明显增多。", revealed: false, pressure: 55 },
  { id: "tl-smog-eve", title: "雾霾前夜", scheduledWeek: 22, kind: "可变事件", status: "upcoming", summary: "相关势力完成最后准备，玩家的证据、盟友与破坏成果开始决定事件形态。", revealed: false, pressure: 78 },
  { id: "tl-great-smog", title: "贝克兰德大雾霾", scheduledWeek: 24, kind: "终局", status: "upcoming", summary: "终局事件可能被阻止、削弱、转移、利用或按原历史爆发。", revealed: true, pressure: 92 },
];

export const INITIAL_KERNEL_CANON_ACTORS: CanonActor[] = [
  { id: "klein", name: "克莱恩·莫雷蒂", publicIdentity: "廷根毕业生", location: "廷根", agenda: "活下去，并理解自己为何苏醒。", state: "刚从死亡中醒来", awareness: "未知", recruitable: false, lastMove: "在远方整理原主留下的痕迹。" },
  { id: "dunn", name: "邓恩·史密斯", publicIdentity: "廷根值夜者队长", location: "廷根", agenda: "保护队员与廷根的神秘秩序。", state: "正在处理一宗神秘案件", awareness: "未知", recruitable: false, lastMove: "把一名新成员纳入观察。" },
  { id: "audrey", name: "奥黛丽·霍尔", publicIdentity: "贵族小姐", location: "贝克兰德·皇后区", agenda: "接触神秘世界，同时维持家族与自身安全。", state: "尚未与玩家组织发生直接联系", awareness: "未知", recruitable: false, lastMove: "寻找不惊动家人的神秘学渠道。" },
  { id: "azik", name: "阿兹克·艾格斯", publicIdentity: "历史系教员", location: "廷根", agenda: "寻找失落的过去。", state: "记忆仍不完整", awareness: "未知", recruitable: false, lastMove: "留意一名学生身上不协调的命运痕迹。" },
];

export const INITIAL_CANON_ACTORS: CanonActor[] = [
  { ...INITIAL_KERNEL_CANON_ACTORS[0], state: "刚从死亡中醒来，尚未进入贝克兰德视野。" },
  { ...INITIAL_KERNEL_CANON_ACTORS[1], state: "正在处理一宗与安提哥努斯家族笔记有关的案件。" },
  { ...INITIAL_KERNEL_CANON_ACTORS[2], state: "尚未与玩家组织发生直接联系。", lastMove: "在社交季里寻找一条不惊动家人的神秘学渠道。" },
  { ...INITIAL_KERNEL_CANON_ACTORS[3], state: "记忆仍不完整。" },
];
