@echo off
echo =======================================================
echo    CalfWatch AI — Automated Demo Launcher
echo =======================================================
cd /d "%~dp0\.."
echo Running scripted demo pipeline (no GPU/model required)...
python main.py --demo
echo.
echo Demo finished. State saved to output/state.json.
echo To launch the Streamlit dashboard, run:
echo    streamlit run dashboard/app.py
echo =======================================================
pause
