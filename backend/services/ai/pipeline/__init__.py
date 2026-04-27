# -*- coding: utf-8 -*-
"""AI processing pipeline.

Three-layer architecture: RuleHandler -> JsonModeHandler -> ToolsCallHandler.
The public surface is intentionally narrow: only ``pipeline_chat_stream``
is intended for use by ``services.ai.chat_stream``.
"""

# Note: pipeline_chat_stream is added in a later task. Keep this file minimal
# until then to avoid import cycles during incremental implementation.

__all__: list[str] = []
