# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(__file__).resolve().parent

zh = root / "主数据照合_规格与真实场景差异确认_中文.html"
s = zh.read_text(encoding="utf-8")
s = s.replace('<div class="eyebrow">Gap 与处理方案</div><h1>当前缺少哪些规则</h1>', '<div class="eyebrow">真实场景与处理结论</div><h1>各类文件到达后的处理方式</h1>')
s = s.replace('<div class="eyebrow">逐项确认</div><h1>1. 配置接口流程</h1>', '<div class="eyebrow">接口流程</div><h1>1. 配置接口流程</h1>')
s = s.replace('<div class="eyebrow">逐项确认</div><h1>2. 案件照合与批次/补件流程</h1>', '<div class="eyebrow">业务流程</div><h1>2. 案件照合与批次/补件流程</h1>')
s = s.replace('<b>IDP 拟采用方案・待确认</b>', '<b>IDP 处理方式（已定）</b>')
zh.write_text(s, encoding="utf-8")

ja = root / "主数据照合_仕様と実運用Gap確認.html"
s = ja.read_text(encoding="utf-8")
s = s.replace('<div class="eyebrow">差分と処理方針</div><h1>現時点で不足しているルール</h1>', '<div class="eyebrow">実運用と処理結論</div><h1>書類到着パターンごとの処理方式</h1>')
s = s.replace('<div class="eyebrow">個別確認</div><h1>1. 設定APIフロー</h1>', '<div class="eyebrow">インターフェースフロー</div><h1>1. 設定APIフロー</h1>')
s = s.replace('<div class="eyebrow">個別確認</div><h1>2. 案件照合・バッチ・補件フロー</h1>', '<div class="eyebrow">業務フロー</div><h1>2. 案件照合・バッチ・補件フロー</h1>')
s = s.replace('<b>IDP 想定案・要確認</b>', '<b>IDP の確定方式</b>')
ja.write_text(s, encoding="utf-8")

print("polished closed-document headings")
