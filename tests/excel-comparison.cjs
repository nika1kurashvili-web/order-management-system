const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),XLSX=require('xlsx');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/excel-comparison.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:n=>{assert.equal(n,'xlsx');return XLSX}});
const {readSource,compare,parsePrice,reportWorkbook,statuses}=mod.exports;
function source(rows,modify){const b=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet(rows);modify?.(s);XLSX.utils.book_append_sheet(b,s,'First');XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['Ignored']]),'Second');const bytes=XLSX.write(b,{type:'buffer',bookType:'xlsx'});const original=Buffer.from(bytes);const parsed=readSource(bytes);assert.ok(bytes.equals(original));return parsed}
const a=source([['SKU','Price','Other'],['equal',50],['different',50],['only1',12],['duplicate',4],['duplicate',4],['conflict',5],['conflict',6],['',7],['blank',null],['invalid','abc'],[123,9],['00123',8],['zero',0],['down',1000000],['up',1],['  trimmed  ','55,50'],[1,8],[],['text','₾ 20.00']],s=>s.A18.z='00000');
const b=source([['Cost','Code'],[20,'text'],[55.5,'trimmed'],[1000000,'up'],[1,'down'],[10,'zero'],[8,'00123'],[9,'123'],[5,'conflict'],[4,'duplicate'],[55,'different'],[50,'equal'],[99,'only2'],[8,'00001']]);
const snapshot=JSON.stringify([a,b]),result=compare(a,0,1,b,1,0),by=Object.fromEntries(result.rows.map(r=>[r.code,r]));
assert.equal(by.equal.status,statuses.equal);assert.equal(by.different.difference,5);assert.equal(by.different.percent,10);assert.equal(by.only1.status,statuses.missing2);assert.equal(by.only2.status,statuses.missing1);assert.equal(by.duplicate.status,statuses.equal);assert.equal(by.conflict.status,statuses.duplicate);assert.equal(by.conflict.difference,null);assert.equal(by.blank.status,statuses.invalid);assert.equal(by.invalid.status,statuses.invalid);assert.equal(by['123'].status,statuses.equal);assert.equal(by['00123'].status,statuses.equal);assert.equal(by['00001'].status,statuses.equal);assert.equal(by.zero.percent,null);assert.equal(by.down.difference,-999999);assert.equal(by.up.difference,999999);assert.equal(by.trimmed.status,statuses.equal);assert.equal(by.text.status,statuses.equal);assert.ok(result.warnings.some(w=>w.includes('9:')));assert.equal(by[''],undefined);assert.equal(JSON.stringify([a,b]),snapshot);
for(const [input,expected] of [['1,234.56',1234.56],['1.234,56',1234.56],['1 234,56 ₾',1234.56],['1,234',null],['1.234',null],['',null],['   ',null],[null,null],[true,null],['12abc',null],[Infinity,null],[0,0],['-10.50',-10.5]])assert.equal(parsePrice(input),expected,String(input));
const book=reportWorkbook(result.rows),bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'}),back=XLSX.read(bytes,{type:'buffer'}),report=XLSX.utils.sheet_to_json(back.Sheets.Comparison,{header:1});assert.equal(report[0].length,6);assert.equal(report.length,result.rows.filter(r=>r.status!==statuses.equal).length+1);assert.ok(report.slice(1).every(r=>r[5]!==statuses.equal));assert.equal(back.Sheets.Comparison.A2.t,'s');assert.equal(back.Sheets.Comparison.B2.t,'n');assert.equal(JSON.stringify([a,b]),snapshot);
assert.throws(()=>compare(a,0,0,b,1,0));assert.throws(()=>source([['Only header']]));assert.throws(()=>source([[123,456],[1,2]]));
const large=source([['Code','Price'],...Array.from({length:15000},(_,i)=>['SKU'+i,i])]);assert.equal(compare(large,0,1,large,0,1).rows.length,15000);
const page=fs.readFileSync('app/excel-price-fill/page.tsx','utf8'),helper=fs.readFileSync('lib/excel-comparison.ts','utf8'),shell=fs.readFileSync('app/AppShell.tsx','utf8');assert.ok(!/supabase|fetch\(/i.test(page+helper));assert.ok(shell.includes('(pathname === "/excel-price-fill" && userRole !== "admin")'));assert.ok(shell.includes('{role === "admin" && ('));
console.log('PASS: matching both directions, duplicates, invalid/blank data, numeric/text/zero-padded SKUs, zero base, signed differences, text prices, reordered columns/rows, report round-trip, source immutability, 15k rows, no database access, existing admin gate.');


function matching(left,right) {
  return compare(source([['Code','Price'],...left]),0,1,source([['Code','Price'],...right]),0,1);
}
for(const cell of ['123456',' 123456','123456 ','Product 123456','Samsung TV - 123456','123456 Black','ABC 123456 / New']) {
  const r=matching([['123456',50]],[[cell,55]]);
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].difference,5,cell);
}
for(const [clean,decorated] of [['ABC123','Product ABC123 Black'],['001234','SKU: 001234'],['12345','12345 - Product Name']]) {
  for(const reverse of [false,true]) {
    const r=matching([[reverse?decorated:clean,50]],[[reverse?clean:decorated,55]]);
    assert.equal(r.rows.length,1);assert.equal(r.rows[0].difference,5);
  }
}
let r=matching([['123',10],['12345',20]],[['Product 12345',25]]);
assert.equal(r.rows.find(x=>x.code==='12345').difference,5);assert.equal(r.rows.find(x=>x.code==='123').status,statuses.missing2);
r=matching([['ABC',10],['ABC123',20]],[['Product ABC123',25]]);
assert.equal(r.rows.find(x=>x.code==='ABC123').difference,5);assert.equal(r.rows.find(x=>x.code==='ABC').status,statuses.missing2);
for(const [a,b] of [['123','00123'],['123','SKU 00123'],['00123','123'],['00123','123 Black']]) {
  r=matching([[a,10]],[[b,10]]);assert.equal(r.rows.length,2);assert.ok(r.rows.every(x=>x.difference===null));
}
r=matching([['ABC123',10],['Product ABC123',20]],[['Product ABC123',25]]);
assert.equal(r.rows.find(x=>x.code==='Product ABC123').difference,5);assert.equal(r.rows.find(x=>x.code==='ABC123').status,statuses.missing2);
r=matching([['ABC',10],['XYZ',20]],[['Product ABC / XYZ',25]]);
assert.equal(r.rows.length,3);assert.ok(r.rows.every(x=>x.status===statuses.ambiguous && x.difference===null && x.percent===null));assert.equal(r.warnings.length,3);
const ambiguousReport=XLSX.utils.sheet_to_json(reportWorkbook(r.rows).Sheets.Comparison,{header:1});assert.equal(ambiguousReport.length,4);assert.ok(ambiguousReport.slice(1).every(x=>x[5]===statuses.ambiguous));
r=matching([['ABC',10]],[['Product ABC',20],['ABC Black',20]]);assert.ok(r.rows.every(x=>x.status===statuses.ambiguous));
r=matching([['ABC',10],['ABC',11]],[['Product ABC',20]]);assert.equal(r.rows[0].status,statuses.duplicate);
r=matching([['ABC',10],['ABC',10]],[['Product ABC',10]]);assert.equal(r.rows[0].status,statuses.equal);
r=matching([['abc',10]],[['ABC',10]]);assert.equal(r.rows.length,2);
console.log('PASS: leading/trailing text, whitespace, exact priority, longest code, digit boundaries/leading zeros, reverse containment, tied and competing matches, ambiguity export, duplicate behavior.');
