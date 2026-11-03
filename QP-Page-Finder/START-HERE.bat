@echo off
setlocal
title QP Page Finder - local PDF page finder
cd /d "%~dp0"

echo.
echo   QP Page Finder - starting local server...
echo.

where py >nul 2>nul
if %errorlevel%==0 goto :python_py
where python >nul 2>nul
if %errorlevel%==0 goto :python_plain
where node >nul 2>nul
if %errorlevel%==0 goto :nodejs
goto :noruntimes

:python_py
echo   Using Python 3 (py launcher). Keep this window open while you use the app.
echo.
py -3 "%~dp0server.py"
goto :done

:python_plain
echo   Using Python 3. Keep this window open while you use the app.
echo.
python "%~dp0server.py"
goto :done

:nodejs
echo   Using Node.js. Keep this window open while you use the app.
echo.
node "%~dp0server.js"
goto :done

:noruntimes
echo   Neither Python 3 nor Node.js was found on this computer.
echo.
echo   Install ONE of these free runtimes, then double-click this file again:
echo     Python 3:  https://www.python.org/downloads/   (tick "Add Python to PATH")
echo     Node.js :   https://nodejs.org/
echo.
echo   Everything else the app needs is already bundled in this folder;
echo   no internet connection is required once a runtime is installed.
echo.
pause
exit /b 1

:done
echo.
echo   The local server has stopped. You can close this window.
pause
