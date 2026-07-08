# -*- coding: utf-8 -*-
"""Rule definitions for task CRUD via natural-language commands.

All rules implement the same shape:
    - ``name``: stable identifier used in trace logs.
    - ``try_match(ctx) -> Optional[ResolutionResult]`` returning ``None`` if
      the rule does not apply.

Multi-match scenarios produce ``NEED_DISAMBIGUATION``; zero-match scenarios
return ``status=PASS`` so the dispatcher can try the next rule (or fall
through to the next handler).
"""

import json as _json
import re
from datetime import datetime, timedelta
from typing import Optional

from database.dao.task_dao import task_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.date_parser import extract_date

# =========================================================================
# 共用片段：所有任务规则都基于以下片段拼装，保证同义词/标点/任务名词的修改
# 只需要在一个地方维护，避免规则之间漂移。
# =========================================================================

# 任务名词同义词：所有规则共用（create/complete/delete 末尾可选；query 必选）。
_TASK_NOUN = r"(?:任务|todo|to ?do)"

# 动词词表：动作类（create/complete/delete）规则各自一份，外加 _QUERY_NOT_VERB
# 反向断言时统一从这里拼，避免动词清单两处维护漂移。
_ACTION_VERBS: dict[str, list[str]] = {
    "create": ["加", "添加", "新建", "创建", "新增"],
    "complete": ["完成", "搞定", "做完", "勾掉", "打钩"],
    "delete": ["删", "删除", "去掉", "移除"],
}

# 数量修饰词："个 / 一个 / 条"，只有 create/delete 这种带名词宾语的动词适用；
# complete（"完成饺子"）不需要这种修饰词。
_QUANTITY_MODIFIER = r"(?:个|一个|条)?"

# 标点 + 空白：动作动词与宾语之间可选的分隔。
_OPTIONAL_COLON_WS = r"[:：]?\s*"


def _build_action_pattern(verb_kind: str, with_modifier: bool) -> re.Pattern[str]:
    """根据动词类别生成动作类规则的正则。

    匹配形如 "<动词><可选修饰><可选'任务'><可选冒号空白><捕获内容>" 的整句。
    捕获组 1 是动词后的剩余文本（标题/关键词），由调用方再 strip。

    Args:
        verb_kind: ``_ACTION_VERBS`` 的键（``"create"`` / ``"complete"`` / ``"delete"``）。
        with_modifier: 是否允许 "个/一个/条" 修饰词。complete 不允许。
    """
    verbs = "|".join(_ACTION_VERBS[verb_kind])
    modifier = _QUANTITY_MODIFIER if with_modifier else ""
    return re.compile(
        rf"^(?:{verbs}){modifier}{_TASK_NOUN}?{_OPTIONAL_COLON_WS}(.+)$",
        re.IGNORECASE,
    )


# 动作类规则：和 query 规则一样从共用片段拼出，避免硬编码。
_CREATE_PATTERN = _build_action_pattern("create", with_modifier=True)
_COMPLETE_PATTERN = _build_action_pattern("complete", with_modifier=False)
_DELETE_PATTERN = _build_action_pattern("delete", with_modifier=True)


# =========================================================================
# 查询类规则：放宽前后缀，覆盖以下常见说法（前缀+核心+可选后缀均可省略）
#   - "今天的任务"、"今日任务"、"明天任务"、"本周任务"、"这个月任务"
#   - "查一下今天的任务"、"看看明天有什么任务"、"本周有哪些任务"
#   - "今天的任务？"、"本月任务呢"、"过期任务啊"
# 关键约束：核心关键字（时间词/状态词 + 任务）之间允许少量字符（如"有什么"、"有哪些"），
# 但禁止包含可能改变意图的动词（完成/删除/添加），避免误吃 create/complete/delete 命令。
# =========================================================================
_QUERY_PREFIX = r"(?:查(?:一下|查|看)?|看(?:一下|看|下)?|列(?:一下|出)?|显示|有(?:没有|什么|哪些)?|帮我(?:查|看|列)?)?"
_QUERY_SUFFIX = r"(?:有(?:什么|哪些|啥)?|是(?:什么|啥|哪些)?|呢|吗|嘛|呀|啊|？|\?|！|!|。|\.)*"
# 反向断言：从 _ACTION_VERBS 自动拼接所有动作动词，保证和动作规则同步演进。
# 仅禁止 create/delete 指令动词出现在查询里。complete 动词（"完成"/"搞定"/
# "做完"）会作为状态修饰词合法出现在"已完成/未完成的任务"中，不能一并禁止；
# 真正的完成指令由 CompleteTaskRule 在本规则之前拦截。
_QUERY_NOT_VERB = (
    r"(?!.*(?:"
    + "|".join(v for key in ("create", "delete") for v in _ACTION_VERBS[key])
    + r"))"
)

# 相对时间窗口关键词 → 内部 window 标识。顺序无所谓，但同义词必须列全。
# 注意：长串（"这个月"）必须在短串（"这"/"月"）前面，避免被部分吃掉。
_TIME_WINDOW_KEYWORDS: list[tuple[str, str]] = [
    # 今 / 明 / 后 / 昨 / 前
    (r"今天|今日", "today"),
    (r"明天|明日", "tomorrow"),
    (r"后天", "day_after_tomorrow"),
    (r"昨天|昨日", "yesterday"),
    (r"前天", "day_before_yesterday"),
    # 周（这周 / 本周 / 上周 / 下周）
    (r"这个?周|本周", "this_week"),
    (r"上(?:个|一)?周", "last_week"),
    (r"下(?:个|一)?周", "next_week"),
    # 月（这个月 / 本月 / 上个月 / 下个月）
    (r"这个?月|本月", "this_month"),
    (r"上(?:个|一)?月", "last_month"),
    (r"下(?:个|一)?月", "next_month"),
]

# 拼出大正则 (?:今天|今日|明天|...)
_TIME_WINDOW_ALT = "|".join(f"(?:{kw})" for kw, _ in _TIME_WINDOW_KEYWORDS)

# 状态修饰词：可与时间窗口自由组合（如"本周已完成的任务" / "已完成的本周任务"）。
# 值规则：
#   - "completed"     → DAO 参数 status="completed"
#   - "not_completed" → DAO 参数 exclude_status="completed"
# 同义词长串在前（"已完成" 在 "完成" 前），避免短串误匹配。
_STATUS_KEYWORDS: list[tuple[str, str]] = [
    (r"已完成|完成的|做完的|搞定的", "completed"),
    (r"未完成|没完成|没做完|待办|未做", "not_completed"),
]
_STATUS_ALT = "|".join(f"(?:{kw})" for kw, _ in _STATUS_KEYWORDS)
# 状态修饰可选片段：可在时间词前或后出现，前后允许 "的"。
_STATUS_OPT = rf"(?:({_STATUS_ALT})的?)?"


def _match_status(matched_keyword: Optional[str]) -> Optional[str]:
    """根据匹配到的状态关键词返回内部状态标识。"""
    if not matched_keyword:
        return None
    for pattern, status in _STATUS_KEYWORDS:
        if re.fullmatch(pattern, matched_keyword, re.IGNORECASE):
            return status
    return None


# 时间窗口规则：支持 "本周任务" / "本周已完成的任务" / "已完成的本周任务" 三种形态。
# 捕获组：
#   1 = 状态前缀（可空）  2 = 时间窗口  3 = 状态后缀（可空）
# 注意：状态前缀和状态后缀至多有一个非空（语义上不会同时出现）。
_QUERY_TIME_WINDOW_PATTERN = re.compile(
    rf"^{_QUERY_NOT_VERB}{_QUERY_PREFIX}{_STATUS_OPT}({_TIME_WINDOW_ALT})的?{_STATUS_OPT}{_TASK_NOUN}\s*{_QUERY_SUFFIX}$",
    re.IGNORECASE,
)
_QUERY_UNFINISHED_PATTERN = re.compile(
    rf"^{_QUERY_NOT_VERB}{_QUERY_PREFIX}(?:未完成|没做完|待办|没完成)的?{_TASK_NOUN}\s*{_QUERY_SUFFIX}$",
    re.IGNORECASE,
)
_QUERY_COMPLETED_PATTERN = re.compile(
    rf"^{_QUERY_NOT_VERB}{_QUERY_PREFIX}(?:已完成|做完了?|搞定了?|完成了)的?{_TASK_NOUN}\s*{_QUERY_SUFFIX}$",
    re.IGNORECASE,
)
_QUERY_OVERDUE_PATTERN = re.compile(
    rf"^{_QUERY_NOT_VERB}{_QUERY_PREFIX}(?:过期|逾期|超期)的?{_TASK_NOUN}\s*{_QUERY_SUFFIX}$",
    re.IGNORECASE,
)


def _match_time_window(matched_keyword: str) -> str:
    """根据匹配到的中文关键词找回内部 window 标识。"""
    for pattern, window in _TIME_WINDOW_KEYWORDS:
        if re.fullmatch(pattern, matched_keyword, re.IGNORECASE):
            return window
    return "today"  # 兜底，理论上不会走到


def _resolve_time_window(window: str) -> tuple[datetime, datetime, str]:
    """把 window 标识转成 (start_dt, end_dt, reply_prefix)。

    边界一律对齐到天：start = 当天 00:00:00.000，end = 当天 23:59:59.999999，
    避免 list_tasks 在边界毫秒上抖动。
    """
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = lambda d: d.replace(hour=23, minute=59, second=59, microsecond=999999)

    if window == "today":
        return today, end_of_day(today), "今天的任务如下："
    if window == "tomorrow":
        d = today + timedelta(days=1)
        return d, end_of_day(d), "明天的任务如下："
    if window == "day_after_tomorrow":
        d = today + timedelta(days=2)
        return d, end_of_day(d), "后天的任务如下："
    if window == "yesterday":
        d = today - timedelta(days=1)
        return d, end_of_day(d), "昨天的任务如下："
    if window == "day_before_yesterday":
        d = today - timedelta(days=2)
        return d, end_of_day(d), "前天的任务如下："

    # 周：周一为起点（weekday() 周一=0、周日=6）
    weekday = today.weekday()
    week_start = today - timedelta(days=weekday)
    week_end = end_of_day(week_start + timedelta(days=6))
    if window == "this_week":
        return week_start, week_end, "本周的任务如下："
    if window == "last_week":
        return week_start - timedelta(days=7), end_of_day(week_end - timedelta(days=7)), "上周的任务如下："
    if window == "next_week":
        return week_start + timedelta(days=7), end_of_day(week_end + timedelta(days=7)), "下周的任务如下："

    # 月：当前月 1 号 ~ 下个月 1 号 - 1 微秒
    month_start = today.replace(day=1)
    # 下个月 1 号
    if month_start.month == 12:
        next_month_start = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month_start = month_start.replace(month=month_start.month + 1)
    month_end = next_month_start - timedelta(microseconds=1)
    if window == "this_month":
        return month_start, month_end, "本月的任务如下："
    if window == "last_month":
        if month_start.month == 1:
            last_month_start = month_start.replace(year=month_start.year - 1, month=12)
        else:
            last_month_start = month_start.replace(month=month_start.month - 1)
        last_month_end = month_start - timedelta(microseconds=1)
        return last_month_start, last_month_end, "上月的任务如下："
    if window == "next_month":
        if next_month_start.month == 12:
            after_next_start = next_month_start.replace(year=next_month_start.year + 1, month=1)
        else:
            after_next_start = next_month_start.replace(month=next_month_start.month + 1)
        return next_month_start, after_next_start - timedelta(microseconds=1), "下月的任务如下："

    # 兜底
    return today, end_of_day(today), "今天的任务如下："


# Content marker word + colon.  The marker word is kept in the title;
# only the colon is the split point.  Capture groups:
#   group(1) = marker word,  group(2) = colon char.
_CONTENT_MARKER_PATTERN = re.compile(
    r"(检查项|检查事项|清单|检查清单|checklist|content|items)([:：])"
)

# Marker words that are *separators* — they introduce a list and are NOT
# part of the title.  "清单" can be part of the title ("购物清单"), so
# it stays in title when not preceded by a comma.
_CONTENT_SEPARATOR_WORDS = {"检查项", "检查事项", "检查清单", "checklist", "content", "items"}


def _extract_content(text: str) -> tuple[str, str | None]:
    """Split text at content markers. Returns (title_part, content_json_or_None).

    If no marker found, returns (text, None).
    If marker found, splits into title + items, parses items into JSON string.
    The marker word stays in the title if it is naturally part of it (e.g.
    "购物清单"), but is stripped if it's a pure separator after a comma
    (e.g. "出差准备，检查项：...").
    Items are split by comma/顿号/newline.
    """
    m = _CONTENT_MARKER_PATTERN.search(text)
    if not m:
        return text, None
    # Title = everything before the colon (keeps the marker word in title).
    colon_start = m.start(2)
    title = text[:colon_start]
    marker_word = m.group(1)
    # If the marker word is a pure separator (not "清单") and it follows
    # a comma/顿号, strip it from the title.
    if marker_word in _CONTENT_SEPARATOR_WORDS:
        title = title[:m.start(1)].strip().rstrip("，,、")
    else:
        # "清单" — keep it in the title, just strip trailing commas.
        title = title.strip().rstrip("，,、")
    items_text = text[m.end():].strip()
    items = re.split(r"[，,、\n]", items_text)
    items = [i.strip() for i in items if i.strip()]
    if not items:
        return title, None
    content_json = _json.dumps(
        [{"text": item, "checked": False} for item in items],
        ensure_ascii=False,
    )
    return title, content_json


class CreateTaskRule:
    name = "create_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title_raw = m.group(1).strip()
        if not title_raw:
            return None
        title, content_json = _extract_content(title_raw)
        title, due_date = extract_date(title)
        params: dict = {"title": title}
        if due_date is not None:
            params["due_date"] = due_date.isoformat()
        if content_json is not None:
            params["content"] = content_json
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params=params,
            reply_text=f"已添加任务：{title}",
            source="rule",
        )

def _resolve_task_target(user_id: str, keyword: str) -> list[dict]:
    """Lookup user's open tasks and apply entity_matcher."""
    from .shared.entity_matcher import match_entities
    tasks = task_dao.get_user_tasks(user_id, skip=0, limit=200)
    return match_entities(keyword, tasks)

class CompleteTaskRule:
    name = "complete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _COMPLETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="update_task",
                params={"task_id": t["id"], "status": "completed"},
                reply_text=f"已完成：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="update_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            params={"status": "completed"},
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要完成的：",
            source="rule",
        )

class DeleteTaskRule:
    name = "delete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_task",
                params={"task_id": t["id"]},
                reply_text=f"准备删除：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要删除的：",
            source="rule",
        )

class QueryTasksRule:
    name = "query_tasks"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        msg = ctx.message.strip()

        # 1) 相对时间窗口（可选状态修饰）：
        #    "今天的任务" / "本周已完成的任务" / "已完成的本月任务" / "明天未完成的任务"
        m = _QUERY_TIME_WINDOW_PATTERN.match(msg)
        if m:
            # 捕获组：1=状态前缀（可空） 2=时间窗口 3=状态后缀（可空）
            status_keyword = m.group(1) or m.group(3)
            window_keyword = m.group(2)
            window = _match_time_window(window_keyword)
            status = _match_status(status_keyword)
            start_dt, end_dt, reply = _resolve_time_window(window)

            params: dict = {
                "filter": window,
                "start_date": start_dt.isoformat(),
                "end_date": end_dt.isoformat(),
            }
            # 叠加状态过滤，并在 reply 文案里体现
            if status == "completed":
                params["status"] = "completed"
                reply = reply.replace("的任务", "已完成的任务")
            elif status == "not_completed":
                params["exclude_status"] = "completed"
                reply = reply.replace("的任务", "未完成的任务")

            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params=params,
                reply_text=reply,
                source="rule",
            )

        # 2) 未完成 / 待办（无时间限定）
        if _QUERY_UNFINISHED_PATTERN.match(msg):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={"filter": "unfinished", "exclude_status": "completed"},
                reply_text="未完成的任务：",
                source="rule",
            )

        # 3) 已完成（无时间限定）
        if _QUERY_COMPLETED_PATTERN.match(msg):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={"filter": "completed", "status": "completed"},
                reply_text="已完成的任务：",
                source="rule",
            )

        # 4) 过期 / 逾期
        if _QUERY_OVERDUE_PATTERN.match(msg):
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_end = (today - timedelta(microseconds=1))
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={
                    "filter": "overdue",
                    "end_date": yesterday_end.isoformat(),
                    "exclude_status": "completed",
                },
                reply_text="过期的任务：",
                source="rule",
            )

        return None

RULES = [
    CreateTaskRule(),
    CompleteTaskRule(),
    DeleteTaskRule(),
    QueryTasksRule(),
]

__all__ = [
    "CreateTaskRule",
    "CompleteTaskRule",
    "DeleteTaskRule",
    "QueryTasksRule",
    "RULES",
]
