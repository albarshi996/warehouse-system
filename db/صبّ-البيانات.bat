@echo off
chcp 65001 >nul
title BHOME - Import data into the device
cd /d "%~dp0.."
echo.
echo   Pouring your data into the local device database...
echo   (reads db\dump, reconciles to zero-diff, does NOT touch Firebase)
echo.
node scripts\sqlite-import.mjs
echo.
echo   ====================================================
echo   If it says "sifr farq / zero-diff" your data moved intact.
echo   ====================================================
echo.
pause
