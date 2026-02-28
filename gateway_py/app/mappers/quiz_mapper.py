from __future__ import annotations
from typing import Any


def quiz_to_json(q: Any) -> dict[str, Any]:
    questions = []
    for qq in getattr(q, "questions", []):
        row = {"id": qq.id, "text": qq.text, "options": list(qq.options)}
        has_field = getattr(qq, "HasField", None)
        if callable(has_field):
            if qq.HasField("correct_option_index"):
                row["correctIndex"] = qq.correct_option_index
        elif hasattr(qq, "correct_option_index"):
            row["correctIndex"] = qq.correct_option_index
        questions.append(row)
    return {"quizId": q.quiz_id.value, "ownerUserId": q.owner_user_id.value, "title": q.title, "description": q.description, "questions": questions}
