@echo off
cd /d C:\ai_Realprice
npx tsx scripts/import.ts --path "C:\ai_Realprice\source" > C:\ai_Realprice\scripts\import_done.txt 2>&1
