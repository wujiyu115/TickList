#!/usr/bin/env python
# -*- coding: utf-8 -*-

import uvicorn
from utils.logger import logger

if __name__ == "__main__":
    logger.info("Starting TickList development server...")
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        log_level="info"
    )
