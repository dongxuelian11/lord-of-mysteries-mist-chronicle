// 轻量失控参数：全部为可替换的 MVP 游戏参数，不是原著设定。
import type { ControlStage } from "./types.ts";

export const CONTROL_ALGORITHM_VERSION = "loss-of-control-v1";
export const CONTROL_STATE_VERSION = 1;
export const CONTROL_RESOLVED_LIMIT = 128;
export const CONTROL_ACTION_COOLDOWN = 3;

export const RISK_MAX = 100;
export const RISK_DISTURBED = 25;
export const RISK_CRITICAL = 50;
export const RISK_PARTIAL_LOSS = 75;
export const RISK_CONTAINED = 90;

export const WEIGHT_POLLUTION = 1;
export const WEIGHT_MENTAL_LOAD = 0.6;
export const SPIRITUALITY_EXHAUSTED_THRESHOLD = 30;
export const SPIRITUALITY_EXHAUSTED_ADD = 15;
export const BACKLASH_PER_ADD = 6;
export const BACKLASH_MAX_ADD = 24;
export const FORCED_CAST_ADD = 10;
export const OVERREACH_ADD = 6;
export const RITUAL_FAILURE_ADD = 8;
export const FATE_SEVERITY3_ADD = 12;
export const FATE_SEVERITY4_ADD = 20;

export const REST_RELIEF = 10;
export const ABSTAIN_RELIEF = 8;
export const COMPANION_RELIEF = 6;
export const RITUAL_TREATMENT_RELIEF = 18;
export const PURIFICATION_RELIEF = 15;
export const LEAVE_SOURCE_RELIEF = 12;
export const CUSTODY_RELIEF = 12;
export const RECOVERY_TASK_RELIEF = 20;

// 恢复后阶段降级的风险阈值。
export const STAGE_DOWNGRADE_RISK: Record<"contained-loss" | "critical" | "disturbed", number> = {
  "contained-loss": 45,
  critical: 25,
  disturbed: 10,
};

// 安全症状模板：AI 候选失败时兜底，少量、可复现。
export const SAFE_SYMPTOM_POOL: Record<ControlStage, string[]> = {
  stable: [],
  disturbed: [
    "眼角余光里总有影子在重复同一动作。",
    "听见的水声比实际晚了一拍。",
    "情绪像被拨动的琴弦，来得快去得也快。",
    "指尖偶尔掠过不属于自己的触感。",
  ],
  critical: [
    "视野边缘的轮廓开始轻微融化。",
    "对话时突然忘记对方上一句话的内容。",
    "能力在未主动使用的情况下微微外溢。",
    "房间角落的阴影似乎有自己的呼吸。",
  ],
  "partial-loss": [
    "无意识释放了一次能力，目标完全错误。",
    "短暂相信了刚刚编造的谎言。",
    "身体某一侧出现不属于自己的动作。",
    "强迫性地重复一个短语或手势。",
  ],
  "contained-loss": [
    "意识清醒但身体被强制按在床上。",
    "记忆出现数小时空白，被队友描述为‘失去控制’。",
    "能力暂时无法主动调用。",
    "身边必须有人陪同，否则症状加剧。",
  ],
};
