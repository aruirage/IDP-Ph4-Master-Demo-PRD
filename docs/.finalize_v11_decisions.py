# -*- coding: utf-8 -*-
from pathlib import Path
import re

root = Path(__file__).resolve().parent

zh = root / "主数据照合_规格与真实场景差异确认_中文.html"
s = zh.read_text(encoding="utf-8")
s = s.replace("<strong>本次需要确认的接口行为</strong>", "<strong>本次设计结论</strong>")
s = s.replace(
    "IDP 希望采用「一批文件一个任务、补件新增任务、各任务独立处理」的批次模型，但该模型尚未确认。请 Zurich 确认这种任务划分是否可行，尤其要确认同一案件能否并发多个任务，以及超过 50 份文件时如何形成这一批的完整结果。",
    "V1.1 已明确请求队列、同优先级受理顺序和 50 份以上拆分的关联方式。IDP 在此基础上确定：新文件或补件创建独立任务并分别进入 OCR抽出确认；同一业务批次拆成多个 API 任务时，由 IDP 合并展示结果。",
)
s = s.replace(
    '<div class="panel gap">\n        <h3>仍需 Zurich 明确</h3>\n        <ul><li>新文件到达时，是否创建独立批次任务</li><li>补件是否也创建新的批次任务</li><li>同一案件多个批次任务是并行执行还是排队执行；若排队，按什么顺序</li><li>超过 50 份文件拆成多个请求后，如何形成这一批的完整结果</li></ul>\n      </div>',
    '<div class="panel spec">\n        <h3>IDP 已定处理方式</h3>\n        <ul><li>新文件或补件创建新的独立批次任务</li><li>每个独立任务的结果分别进入 OCR抽出确认</li><li>超过 50 份时，一个业务批次拆成多个 API 任务</li><li>多个 taskId 的结果由 IDP 合并为同一批次展示</li><li>同一优先级按受理顺序排队，并发量由 Zurich 控制</li></ul>\n      </div>',
)
s = s.replace(
    '<div class="flow-note is-blue"><b>IDP 内部已定</b><span>旧任务结果晚到时，只更新该任务自己的结果和待办，不修改其他任务。</span></div>\n    <div class="callout">式样书没有定义同一案件多次收件时的任务划分、补件归属、并行方式和 50 份以上的合并规则。以上内容需要 Zurich 确认后再确定设计和开发。</div>',
    '<div class="flow-note is-blue"><b>IDP 内部已定</b><span>旧任务结果晚到时，只更新该任务自己的结果和待办，不修改其他任务。</span></div>\n    <div class="callout">V1.1 已回答请求排队和 50 份以上拆分的接口规则。批次任务划分与多个 taskId 的合并展示属于 IDP 内部处理，本次无需再向 Zurich 提问。</div>',
)
s = s.replace(
    '<thead><tr><th style="width:23%">真实场景</th><th style="width:31%">式样书现状</th><th>需要 Zurich 确认</th></tr></thead>',
    '<thead><tr><th style="width:23%">真实场景</th><th style="width:31%">式样书依据</th><th>IDP 已定处理方式</th></tr></thead>',
)
s = s.replace(
    '<tr><td><strong>追加文件到达</strong></td><td>已说明要发送案件全部文件</td><td class="gap-col">是否创建新的批次任务，不合并到旧任务？</td></tr>',
    '<tr><td><strong>追加文件到达</strong></td><td>案件全部有效文件随新请求发送</td><td>创建新的独立批次任务</td></tr>',
)
s = s.replace(
    '<tr><td><strong>补件到达</strong></td><td>没有补件专用字段</td><td class="gap-col">补件是否同样创建新的批次任务？</td></tr>',
    '<tr><td><strong>补件到达</strong></td><td>没有补件专用字段</td><td>创建新的独立批次任务</td></tr>',
)
s = s.replace(
    '<tr><td><strong>每次重发全部文件</strong></td><td>要求发送全部有效文件</td><td class="gap-col">是否按提交时点的全部有效文件处理，并生成本批次的新结果？</td></tr>',
    '<tr><td><strong>每次重发全部文件</strong></td><td>要求发送全部有效文件</td><td>按提交时点的全部有效文件处理，生成本批次结果</td></tr>',
)
s = s.replace(
    '<tr><td><strong>多批次执行顺序</strong></td><td>只有通用任务队列，没有说明同一案件的批次顺序</td><td class="gap-col">多个批次任务是并行执行还是排队执行？若排队，按什么顺序？</td></tr>',
    '<tr><td><strong>多批次执行顺序</strong></td><td>同一优先级按受理顺序处理，并发量由 API 控制</td><td>沿用 Zurich 队列，不另建案件级队列</td></tr>',
)
s = s.replace(
    '<tr><td><strong>单次超过 50 份文件</strong></td><td>规定单个请求最多 50 份</td><td class="gap-col">多个请求如何合并成这一批的完整结果？</td></tr>',
    '<tr><td><strong>单次超过 50 份文件</strong></td><td>相同 caseNo 拆分请求，变更 clientRequestId 序号</td><td>一个业务批次对应多个 API 任务，由 IDP 合并展示</td></tr>',
)
s = s.replace(
    '<h3>待确认的批次处理方式</h3>\n      <p>以下示意仅用于说明需要确认的问题，尚未定案。IDP 希望每次文件到达时分发一个独立批次任务；每个任务提交当时案件的全部有效文件，并独立保存结果。</p>',
    '<h3>IDP 批次处理方式</h3>\n      <p>新文件或补件创建独立批次任务，并分别进入 OCR抽出确认。超过 50 份时，一个业务批次拆成多个 Zurich 任务，由 IDP 保存 taskId 并合并结果。</p>',
)
s = s.replace(
    '<div class="architecture-summary">每个任务独立进入 OCR抽出确认<br /><span>旧任务只更新自己的结果，不修改其他任务</span></div>',
    '<div class="architecture-summary">每个业务批次独立进入 OCR抽出确认<br /><span>50 份以上由 IDP 合并多个 taskId；旧任务只更新自身</span></div>',
)
s = s.replace(
    '<div class="callout">以上仅为待确认方案。后续设计取决于 Zurich 对任务划分、并行执行和 50 份以上结果合并的回答。</div>',
    '<div class="callout">V1.1 的队列与拆分规则作为接口依据。批次划分和结果合并由 IDP 实现，无需新增 Zurich 确认项。</div>',
)
s = s.replace('<div class="flow-question-link">问题 No. 1｜请在「确认问题列表」页回答</div>', '<div class="flow-question-link">配置流程已由 V1.1 明确</div>')
s = s.replace('<div class="flow-question-link">问题 No. 2｜请在「确认问题列表」页回答</div>', '<div class="flow-question-link">批次处理方式已确定</div>')
s = re.sub(r'\n  <section class="sheet sheet-confirm is-all-questions">.*?</section>\s*', "\n", s, flags=re.S)
s = s.replace(' / 7', ' / 6')
zh.write_text(s, encoding="utf-8")

ja = root / "主数据照合_仕様と実運用Gap確認.html"
s = ja.read_text(encoding="utf-8")
s = s.replace("<strong>今回確認する API 動作</strong>", "<strong>今回の設計結論</strong>")
s = s.replace(
    "IDP は「1バッチ＝1タスク、追加書類は新しいタスク、各タスクは独立して処理」というバッチ方式を希望していますが、この方式は未確認です。このタスク分割が可能かを Zurich 様に確認したいです。特に、同一案件で複数タスクを同時実行できるか、50件超の書類を複数リクエストに分けた場合に、1バッチ分の完全な結果をどう作るかを確認する必要があります。",
    "V1.1 でリクエストの待ち行列、同一優先度の受付順、50件超の分割時の関連付けが明確になりました。IDP はこれを前提に、新規書類または補件は独立タスクとして作成し、それぞれ OCR 抽出確認へ進めます。1つの業務バッチが複数の API タスクになる場合は、IDP が結果を統合して表示します。",
)
s = s.replace(
    '<div class="panel gap">\n        <h3>Zurich 様に確認が必要な内容</h3>\n        <ul><li>新しい書類の到着時に独立したバッチタスクを作成するか</li><li>補件も新しいバッチタスクとして作成するか</li><li>同一案件の複数バッチタスクを並行実行するか、待ち行列で処理するか。待ち行列の場合の順序</li><li>50件超の書類を複数リクエストに分けた場合、1バッチ分の完全な結果をどう作るか</li></ul>\n      </div>',
    '<div class="panel spec">\n        <h3>IDP の確定方式</h3>\n        <ul><li>新規書類または補件は新しい独立バッチタスクを作成する</li><li>各独立タスクの結果は個別に OCR 抽出確認へ進む</li><li>50件超の場合は1つの業務バッチを複数の API タスクへ分割する</li><li>複数 taskId の結果は IDP が同一バッチとして統合表示する</li><li>同一優先度は受付順で待ち行列、並行数は Zurich 側が制御する</li></ul>\n      </div>',
)
s = s.replace(
    '<div class="flow-note is-blue"><b>IDP 内部で決定済み</b><span>旧タスクの結果が遅れて返った場合、そのタスク自身の結果と確認待ちだけを更新し、他のタスクは変更しません。</span></div>\n    <div class="callout">式様書には、同一案件で書類を複数回受信した場合のタスク分割、補件の扱い、並行実行、50件超の統合方法が定義されていません。これらを Zurich 様に確認してから、設計と開発を確定します。</div>',
    '<div class="flow-note is-blue"><b>IDP 内部で決定済み</b><span>旧タスクの結果が遅れて返った場合、そのタスク自身の結果と確認待ちだけを更新し、他のタスクは変更しません。</span></div>\n    <div class="callout">V1.1 で待ち行列と50件超分割時の関連付けが明確になりました。バッチ分割と複数 taskId の統合表示は IDP 内部処理とし、今回 Zurich 様へ追加確認しません。</div>',
)
s = s.replace(
    '<thead><tr><th style="width:23%">実運用</th><th style="width:31%">仕様書の記載</th><th>Zurich 様への確認事項</th></tr></thead>',
    '<thead><tr><th style="width:23%">実運用</th><th style="width:31%">仕様書の根拠</th><th>IDP の確定方式</th></tr></thead>',
)
s = s.replace(
    '<tr><td><strong>追加書類の到着</strong></td><td>案件の全書類を送信すると記載</td><td class="gap-col">新しいバッチタスクを作成し、旧タスクには統合しないか。</td></tr>',
    '<tr><td><strong>追加書類の到着</strong></td><td>新規リクエストで案件の全有効書類を送信</td><td>新しい独立バッチタスクを作成</td></tr>',
)
s = s.replace(
    '<tr><td><strong>補件の到着</strong></td><td>補件専用の項目はない</td><td class="gap-col">補件も新しいバッチタスクとして作成するか。</td></tr>',
    '<tr><td><strong>補件の到着</strong></td><td>補件専用の項目はない</td><td>新しい独立バッチタスクを作成</td></tr>',
)
s = s.replace(
    '<tr><td><strong>毎回の全書類再送</strong></td><td>案件の全有効書類を送信すると記載</td><td class="gap-col">作成時点の全有効書類で処理し、そのバッチの新しい結果を生成するか。</td></tr>',
    '<tr><td><strong>毎回の全書類再送</strong></td><td>案件の全有効書類を送信すると記載</td><td>作成時点の全有効書類で処理し、そのバッチの結果を生成</td></tr>',
)
s = s.replace(
    '<tr><td><strong>複数バッチの実行順</strong></td><td>共通タスクキューはあるが、同一案件内のバッチ順は明記なし</td><td class="gap-col">複数バッチは並行実行か待ち行列か。待ち行列の場合の順序は何か。</td></tr>',
    '<tr><td><strong>複数バッチの実行順</strong></td><td>同一優先度は受付順、並行数は API 側で制御</td><td>Zurich のキューを利用し、案件専用キューは追加しない</td></tr>',
)
s = s.replace(
    '<tr><td><strong>1回50件超の書類</strong></td><td>1リクエスト最大50件と記載</td><td class="gap-col">複数リクエストを1バッチ分の完全な結果へどう統合するか。</td></tr>',
    '<tr><td><strong>1回50件超の書類</strong></td><td>同じ caseNo で分割し、clientRequestId の連番を変更</td><td>1業務バッチを複数 API タスクとし、IDP が結果を統合表示</td></tr>',
)
s = s.replace(
    '<h3>確認中のバッチ処理方式</h3>\n      <p>以下は確認対象を説明するための図であり、未確定です。IDP は、書類が到着するたびに独立したバッチタスクを作成し、各タスクで作成時点の案件の全有効書類を送信して、結果を独立して保存する方式を希望しています。</p>',
    '<h3>IDP のバッチ処理方式</h3>\n      <p>新規書類または補件は独立したバッチタスクを作成し、それぞれ OCR 抽出確認へ進めます。50件超の場合は1つの業務バッチを複数の Zurich タスクに分け、IDP が taskId を保存して結果を統合します。</p>',
)
s = s.replace(
    '<div class="architecture-summary">各タスクが独立して OCR 抽出確認へ進む<br /><span>旧タスクは自身の結果だけを更新し、他のタスクは変更しない</span></div>',
    '<div class="architecture-summary">各業務バッチが独立して OCR 抽出確認へ進む<br /><span>50件超は IDP が複数 taskId を統合。旧タスクは自身だけ更新</span></div>',
)
s = s.replace(
    '<div class="callout">上記は未確認の方式です。今後の設計は、タスク分割、並行実行、50件超の結果統合に対する Zurich 様の回答を基に決定します。</div>',
    '<div class="callout">V1.1 の待ち行列と分割規則を接口根拠とします。バッチ分割と複数 taskId の統合表示は IDP 側で実装します。</div>',
)
s = s.replace('<div class="flow-question-link">設問 No. 1｜「確認事項一覧」ページで回答してください</div>', '<div class="flow-question-link">設定フローは V1.1 で明確化済みです</div>')
s = s.replace('<div class="flow-question-link">設問 No. 2｜「確認事項一覧」ページで回答してください</div>', '<div class="flow-question-link">バッチ処理方式は確定済みです</div>')
s = re.sub(r'\n  <section class="sheet sheet-confirm is-all-questions">.*?</section>\s*', "\n", s, flags=re.S)
s = s.replace(' / 7', ' / 6')
ja.write_text(s, encoding="utf-8")

print("closed remaining questions and updated decisions")
