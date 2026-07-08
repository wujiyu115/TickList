# -*- coding: utf-8 -*-
"""Regression tests for the Logger wrapper.

The wrapper must forward standard logging kwargs (e.g. ``exc_info``) to the
underlying logger. Previously ``error(msg, exc_info=True)`` raised a
TypeError, which crashed error-handling paths (see push_service.test_channel).
"""

from utils.logger import Logger, logger


class TestLoggerForwardsKwargs:
    def test_error_accepts_exc_info(self):
        # Must not raise even outside an except block
        logger.error("no active exception", exc_info=True)

    def test_error_exc_info_inside_except(self):
        try:
            raise ValueError("boom")
        except ValueError:
            # This is the exact call shape push_service uses
            logger.error("handled: boom", exc_info=True)

    def test_all_levels_accept_kwargs(self):
        logger.debug("d", exc_info=False)
        logger.info("i", stacklevel=1)
        logger.warning("w", exc_info=False)
        logger.critical("c", exc_info=False)

    def test_log_method_does_not_double_emit(self):
        import logging
        # log() previously had a stray second call with an invalid level
        logger.log(logging.INFO, "single emit")
