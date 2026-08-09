import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game-model.ts";
import {
  appendPlayerDialogue,
  applyDialogueModelResult,
  chooseDialogueScreeningAction,
  ensureDialogueThread,
} from "../app/dialogue-session-controller.ts";

test("dialogue controller owns thread, relationship, memory, and dossier state transitions", () => {
  let game = createInitialGame("seer");
  const memberId = game.members[0].id;
  game = ensureDialogueThread(game, memberId);
  game = appendPlayerDialogue(game, memberId, "先核对现有记录。", "private");
  const trustBefore = game.members.find((member) => member.id === memberId).trust;
  const result = { reply: "我会先核对记录。", mood: "审慎", memory: "负责人要求先核对记录", trustDelta: 1, managementAction: null };
  const applied = applyDialogueModelResult(game, memberId, result, "private", null);
  const thread = applied.game.dialogueThreads.find((item) => item.memberId === memberId);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.messages[0].role, "player");
  assert.equal(thread.messages[1].role, "member");
  assert.deepEqual(thread.memories, ["负责人要求先核对记录"]);
  assert.equal(applied.game.members.find((member) => member.id === memberId).trust, trustBefore + 1);
  assert.equal(applied.screeningError, "");
});

test("candidate screening fallback is limited to the internal-affairs incumbent", () => {
  const initialGame = createInitialGame("seer");
  const incumbentId = initialGame.members[0].id;
  const game = {
    ...initialGame,
    management: {
      ...initialGame.management,
      offices: initialGame.management.offices.map((office) =>
        office.id === "internal-affairs" ? { ...office, incumbentId } : office,
      ),
    },
  };
  const action = chooseDialogueScreeningAction(game, incumbentId, "请筛选并提交基层候选人档案。", null);
  assert.equal(action?.kind, "screen-candidates");
  assert.equal(chooseDialogueScreeningAction(game, game.members.find((member) => member.id !== incumbentId).id, "请筛选候选人。", null), null);
});
