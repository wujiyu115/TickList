# -*- coding: utf-8 -*-
"""Layer 1 dispatcher: iterates registered rules and routes to the first hit.

If no rule matches (or every matching rule returns ``PASS``), the request
is forwarded to ``self.next_handler`` with an ``upstream_hint`` describing
why the rule layer abstained.
"""

from typing import AsyncGenerator

from .base import ChatContext, Handler, ResolutionStatus
from .executor import execute_resolution
from .rules import ALL_RULES

class RuleHandler(Handler):
    def __init__(self, next_handler=None):
        super().__init__(next_handler=next_handler)
        self.rules = ALL_RULES

    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        for rule in self.rules:
            result = rule.try_match(ctx)
            if result is None:
                continue
            if result.status == ResolutionStatus.PASS:
                continue
            ctx.trace.append(f"rule:{rule.name}")
            async for ev in execute_resolution(result, ctx):
                yield ev
            return

        ctx.trace.append("rule:miss")
        ctx.upstream_hint = {"reason": "no_rule_match"}
        if self.next_handler is None:
            return
        async for ev in self.next_handler.handle(ctx):
            yield ev

__all__ = ["RuleHandler"]
