// Page views are editable projections of the single canonical PRD.
const block=(chapter,from,to)=>({chapter,from,to});
export const pageSpecs=[
 {id:'api-settings',title:'标准化 API 连接',navNumber:'5.1',parts:[block('5.1')]},
 {id:'master-standardization-config',title:'マスタ设定与照合组',navNumber:'5.2',parts:[block('5.2')]},
 {id:'ocr-confirmation',title:'OCR抽出确认与重新照合',navNumber:'5.4',parts:[block('5.4.1'),block('5.4.2')]}
];
export const pageKey=id=>`prd/pages/${id}.md`;
export function pageSpec(key){return pageSpecs.find(spec=>pageKey(spec.id)===key)}
function ranges(text,spec){return spec.parts.map(part=>{const chapterStart=text.indexOf('### '+part.chapter+' ');if(chapterStart<0)throw Error('页面关联章节不存在');const next=text.indexOf('\n### ',chapterStart+1),chapterEnd=next<0?text.length:next+1;const from=part.from==='#### 自动采用规则'&&!text.includes(part.from)?'#### Master人工确认的分类条件':part.from;let start=from?text.indexOf(from,chapterStart):chapterStart;if(start<chapterStart||start>=chapterEnd)throw Error('页面关联段落不存在：'+part.from);let end=chapterEnd;if(part.to){end=text.indexOf(part.to,start+1);if(end<start||end>chapterEnd)throw Error('页面段落边界不存在：'+part.to)}else if(part.from){const nextHeading=text.indexOf('\n#### ',start+1);if(nextHeading>=0&&nextHeading<end)end=nextHeading+1}return [start,end]})}
const marker=index=>`<!-- prd-fragment:${index} -->`;
export function readPage(text,key){const spec=pageSpec(key);return `### ${spec.title}\n\n`+ranges(text,spec).map(([start,end],index)=>`${marker(index)}\n${text.slice(start,end).trimEnd()}\n<!-- /prd-fragment:${index} -->`).join('\n\n')+'\n'}
export function replacePage(text,key,content){const spec=pageSpec(key);if(!content.startsWith(`### ${spec.title}\n`))throw Error('请保留页面标题');const sourceRanges=ranges(text,spec);const replacements=sourceRanges.map(([start,end],index)=>{const open=marker(index)+'\n',close=`\n<!-- /prd-fragment:${index} -->`;const first=content.indexOf(open),last=content.indexOf(close,first+open.length);if(first<0||last<0||content.indexOf(open,first+1)>=0)throw Error('请保留页面段落边界注释');return {start,end,value:content.slice(first+open.length,last).trimEnd()+(text.slice(start,end).match(/\s*$/)?.[0]||'')}}).sort((a,b)=>b.start-a.start);for(let i=1;i<replacements.length;i++)if(replacements[i].end>replacements[i-1].start)throw Error('页面段落重叠');for(const {start,end,value} of replacements)text=text.slice(0,start)+value+text.slice(end);return text}
