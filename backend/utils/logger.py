import logging
import os
from logging.handlers import TimedRotatingFileHandler
import sys
import traceback
import colorama
from colorama import Fore, Back, Style

# 初始化colorama
colorama.init(autoreset=True)

class ColoredFormatter(logging.Formatter):
    """带颜色的日志格式化器"""

    COLORS = {
        "DEBUG": Fore.CYAN,
        "INFO": Fore.GREEN,
        "WARNING": Fore.YELLOW,
        "ERROR": Fore.RED,
        "CRITICAL": Fore.RED + Back.WHITE,
    }

    def format(self, record):
        # 获取原始格式化的消息
        log_message = super().format(record)

        # 添加颜色
        level_color = self.COLORS.get(record.levelname, "")
        if level_color:
            # 只给日志级别添加颜色
            colored_level = f"{level_color}{record.levelname}{Style.RESET_ALL}"
            log_message = log_message.replace(record.levelname, colored_level)

        return log_message

class Logger:
    """日志管理器"""

    def __init__(self, name="workflow", log_dir=None):
        # 延迟导入避免循环依赖
        try:
            from config.config_loader import config
            logging_config = config.get_logging_config()
            self.log_dir = log_dir or logging_config['log_dir']
            main_level = logging_config['level']
            self.console_level = logging_config['console_level']
            self.file_level = logging_config['file_level']
            self.error_level = logging_config['error_level']
            print(f"日志设置: {logging_config}")

        except ImportError:
            # 如果配置加载失败，使用默认值
            self.log_dir = log_dir or "logs"
            main_level = logging.INFO
            self.console_level = logging.INFO
            self.file_level = logging.INFO
            self.error_level = logging.ERROR

        self.logger = logging.getLogger(name)
        self.logger.setLevel(main_level)

        # 创建日志目录
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir)

        # 清除已有的处理器
        self.logger.handlers.clear()

        # 设置日志格式（包含文件名和行号）
        self.formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        # 设置带颜色的控制台格式（包含文件名和行号）
        self.colored_formatter = ColoredFormatter(
            "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        self._setup_handlers()

    def _setup_handlers(self):
        """设置日志处理器"""

        # 控制台处理器（带颜色）
        console_handler = logging.StreamHandler()
        console_handler.setLevel(self.console_level)
        console_handler.setFormatter(self.colored_formatter)
        self.logger.addHandler(console_handler)

        # 文件处理器 - 所有日志
        file_handler = TimedRotatingFileHandler(
            filename=os.path.join(self.log_dir, "app.log"),
            when="midnight",
            interval=1,
            backupCount=30,
            encoding="utf-8",
        )
        file_handler.setLevel(self.file_level)
        file_handler.setFormatter(self.formatter)
        file_handler.suffix = "%Y-%m-%d"
        self.logger.addHandler(file_handler)

        # 错误日志单独记录
        error_handler = TimedRotatingFileHandler(
            filename=os.path.join(self.log_dir, "error.log"),
            when="midnight",
            interval=1,
            backupCount=30,
            encoding="utf-8",
        )
        error_handler.setLevel(self.error_level)
        error_handler.setFormatter(self.formatter)
        error_handler.suffix = "%Y-%m-%d"
        self.logger.addHandler(error_handler)

    def debug(self, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.debug(message, *args, **kwargs)

    def info(self, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.info(message, *args, **kwargs)

    def warning(self, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.warning(message, *args, **kwargs)

    def error(self, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.error(message, *args, **kwargs)

    def critical(self, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.critical(message, *args, **kwargs)

    def log(self, level, message, *args, **kwargs):
        kwargs.setdefault("stacklevel", 2)
        self.logger.log(level, message, *args, **kwargs)


def log_exception(
    logger: Logger, message="An exception occurred", exc_info=None, level=logging.ERROR
):
    """
    记录异常信息，包括完整的堆栈跟踪

    Args:
        logger: 日志记录器
        message: 日志消息
        exc_info: 异常信息，如果为None，则使用sys.exc_info()获取当前异常
        level: 日志级别，默认为ERROR
    """
    if exc_info is None:
        exc_info = sys.exc_info()

    if exc_info[0] is not None:  # 如果有异常
        # 获取完整的堆栈跟踪
        tb_str = "".join(traceback.format_exception(*exc_info))
        # 记录异常信息
        logger.log(level, "%s:\n%s" % (message, tb_str))
    else:
        # 如果没有异常，只记录消息
        logger.log(level, message)


# 创建全局日志实例
logger = Logger()