# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(__file__).resolve().parent

zh = root / "主数据照合_规格与真实场景差异确认_中文.html"
s = zh.read_text(encoding="utf-8")
s = s.replace(
    '<tr><td>50 份以上</td><td>拆分请求、结果关联、合并与失败恢复，具体规则待 Zurich 确认</td><td><span class="status do">本期做</span></td></tr>',
    '<tr><td>50 份以上</td><td>相同案件拆分请求，由 IDP 关联并合并多个 taskId 的结果</td><td><span class="status do">本期做</span></td></tr>',
)
zh.write_text(s, encoding="utf-8")

ja = root / "主数据照合_仕様と実運用Gap確認.html"
s = ja.read_text(encoding="utf-8")
s = s.replace(
    '<tr><td>50件超</td><td>リクエスト分割、結果の関連付け、統合、失敗時の復旧。具体的な規則は Zurich 様へ確認</td><td><span class="status do">今回実施</span></td></tr>',
    '<tr><td>50件超</td><td>同じ案件でリクエストを分割し、IDP が複数 taskId の結果を関連付けて統合</td><td><span class="status do">今回実施</span></td></tr>',
)
s = s.replace('接口根拠', 'インターフェース根拠')
ja.write_text(s, encoding="utf-8")

print("updated final status wording")
