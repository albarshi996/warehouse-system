@echo off
chcp 65001 >nul
title Firebase Export - Warehouse System
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export.ps1"
