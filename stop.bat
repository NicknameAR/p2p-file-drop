@echo off
taskkill /FI "WINDOWTITLE eq backend" /T /F
taskkill /FI "WINDOWTITLE eq frontend" /T /F
exit