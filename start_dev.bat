@echo off
setlocal enabledelayedexpansion

REM TickList 任务管理系统启动脚本 (Windows)
REM 用法: start_dev.bat [PORT]
REM   PORT: 可选，后端服务端口，默认 5000

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5000"

echo ==================================
echo TickList 任务管理系统
echo 服务端口: %PORT%
echo ==================================

REM 检查是否安装了 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo 错误: 未找到 Node.js，请先安装 Node.js
    exit /b 1
)

REM 检查是否安装了 Python
where python >nul 2>nul
if errorlevel 1 (
    echo 错误: 未找到 Python，请先安装 Python
    exit /b 1
)

echo 正在构建前端应用...

cd frontend

echo 正在安装前端依赖...
call bun install

echo 正在构建前端开发版本 [带 source map]...
call bun run build:dev
if errorlevel 1 (
    echo 前端构建失败，请检查错误信息
    exit /b 1
)

echo 前端构建完成！
echo 正在启动前端监听模式...

REM 在同一控制台后台启动前端监听构建（这样 Ctrl+C 能同时结束前后端）
start /b cmd /c "bun run build:dev -- --watch"

echo 前端监听模式已在后台启动，文件变化时将自动重新构建

cd ..\backend

REM 复制config.yaml.example到config.yaml（如果config.yaml不存在）
if not exist "config.yaml" (
    if exist "config.yaml.example" (
        echo 正在复制 config.yaml.example 到 config.yaml...
        copy config.yaml.example config.yaml >nul
        echo 配置文件复制完成！
    )
)

echo 正在准备 Python 环境...

REM 记录系统 python 路径（在激活 venv 之前，供 uv 使用）
set "SYSPY=python"
for /f "delims=" %%i in ('where python 2^>nul') do (
    set "SYSPY=%%i"
    goto :got_syspy
)
:got_syspy

REM 检测 uv：优先 PATH 上的 uv.exe，否则用系统 python -m uv
set "UVCMD="
where uv >nul 2>nul && set "UVCMD=uv"
if not defined UVCMD (
    "%SYSPY%" -m uv --version >nul 2>nul && set UVCMD="%SYSPY%" -m uv
)

REM 创建 Python 虚拟环境（如果不存在）
if not exist ".venv" (
    echo 创建 Python 虚拟环境...
    if defined UVCMD (
        call %UVCMD% venv .venv
    ) else (
        python -m venv .venv
    )
)

echo 正在安装后端依赖...
if defined UVCMD (
    REM 用 --python 显式指定安装到 .venv，避免误装进系统 Python
    call %UVCMD% pip install -r requirements.txt --python .venv\Scripts\python.exe
) else (
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)
if errorlevel 1 (
    echo 后端依赖安装失败，请检查错误信息
    exit /b 1
)

echo ==================================
echo 服务启动完成!
echo 应用地址: http://localhost:%PORT%
echo API 文档: http://localhost:%PORT%/docs
echo ==================================
echo 前端监听已在后台运行，文件变化时自动重新构建
echo 按 Ctrl+C 停止服务（前后端一起结束）
echo.

echo 后端服务启动中...
.venv\Scripts\python.exe run_dev.py

endlocal
