'use strict';
const fs=require('node:fs'),A=require('../../tools/playtest-dashboard/analytics.js');
const files=process.argv.slice(2);if(!files.length){console.error('Usage: node scripts/android/feedback-to-csv.cjs report.json [more.json ...] > feedback.csv');process.exit(1)}
const rows=[];for(const file of files){const text=fs.readFileSync(file,'utf8');rows.push(...(file.toLowerCase().endsWith('.csv')?A.parseCSV(text):A.fromReport(JSON.parse(text))))}
process.stdout.write(A.toCSV(A.dedupe(rows)));
