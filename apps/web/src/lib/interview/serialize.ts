/**
 * 题库题目 → 对外形状的序列化。
 *
 * 只有这一份:题库列表接口(GET /api/questions)与单题接口(PATCH /api/questions/[id])
 * 要给前端的是同一套字段、同一种 Date → ISO 转换。两处各写一份,早晚会走偏
 * (多一个字段、少转一次时间,客户端就白屏或显示 "[object Object]")。
 */
import type { QuestionItemRow } from "./repo";

/** 题目 → 客户端形状(Date 转 ISO 字符串,userId / fingerprint 不外泄) */
export function serializeItem(row: QuestionItemRow) {
  return {
    id: row.id,
    setId: row.setId,
    resumeId: row.resumeId,
    resumeTitle: row.resumeTitle,
    question: row.question,
    answer: row.answer,
    topic: row.topic,
    category: row.category,
    difficulty: row.difficulty,
    starred: row.starred,
    createdAt: row.createdAt.toISOString(),
  };
}
