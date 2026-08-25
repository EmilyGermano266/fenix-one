// ============================================================
// FÊNIX ONE — SCRIPT.JS
// Frontend conectado ao Supabase
// ============================================================

const SUPABASE_URL = "https://dfnzpmbjmfumtyljudox.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2SkrIlyI5K59mMVSUmyKyg_GwrRbqh2";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  session:null, profile:null, mobilePlans:[], smePackages:[], services:[], products:[],
  proposals:[], notifications:[], profiles:[],
  mobileItems:[], smeItems:[], productItems:[], serviceSelections:{},
  previewPayload:null, duplicateSourceId:null
};

const $ = id => document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];
const money = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((Number(cents)||0)/100);
const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const isoToday = () => new Date().toISOString().slice(0,10);
const isoTomorrow = () => { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); };
const brDate = v => v ? new Intl.DateTimeFormat("pt-BR").format(new Date(v.includes?.("T")?v:`${v}T12:00:00`)) : "-";
const brDateTime = v => v ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)) : "-";

function cents(v){
  const s=String(v??"").trim().replace(/[R$\s.]/g,"").replace(",",".");
  const n=Number(s); return Number.isFinite(n)?Math.round(n*100):0;
}
function formatMoneyInput(el){
  const digits=el.value.replace(/\D/g,"");
  el.value=digits?money(Number(digits)):"";
}
function toast(msg,type=""){
  const el=$("toast"); el.textContent=msg; el.className=`toast show ${type}`;
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.className="toast",3200);
}
function formatCNPJ(v){
  return v.replace(/\D/g,"").slice(0,14)
    .replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2");
}
function validCNPJ(v){
  const x=v.replace(/\D/g,""); if(x.length!==14||/^(\d)\1+$/.test(x))return false;
  const calc=(base,w)=>{const sum=base.split("").reduce((a,d,i)=>a+Number(d)*w[i],0),m=sum%11;return m<2?0:11-m};
  const d1=calc(x.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2=calc(x.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return x.endsWith(`${d1}${d2}`);
}
const supervisor = () => state.profile?.role==="supervisora";

function showView(id){
  $$(".view").forEach(v=>v.classList.remove("active")); $(id)?.classList.add("active");
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  const t={dashboardView:"Dashboard",calculatorView:"Nova proposta",proposalsView:"Propostas",notificationsView:"Notificações",adminView:"Administração"};
  $("pageTitle").textContent=t[id]||"Fênix One"; window.scrollTo({top:0,behavior:"smooth"});
}
function roleUI(){
  $$(".supervisor-only").forEach(el=>el.classList.toggle("hidden",!supervisor()));
  $("proposalsScopeText").textContent=supervisor()?"Consulte as propostas de toda a Equipe Fênix.":"Consulte somente as suas propostas.";
}
function identity(){
  const name=state.profile?.full_name||state.session?.user?.email||"Usuário";
  $("sidebarUserName").textContent=name; $("sidebarUserRole").textContent=supervisor()?"Supervisora":"Colaborador";
  $("userAvatar").textContent=name.trim().charAt(0).toUpperCase(); $("welcomeName").textContent=`Olá, ${name.split(" ")[0]}! 💜`;
  $("consultantName").value=name;
}
function defaultDates(){ $("proposalDate").value ||= isoToday(); $("validityDate").value ||= isoTomorrow(); }

async function login(e){
  e.preventDefault(); $("loginMessage").textContent="Entrando...";
  const {data,error}=await db.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  if(error){$("loginMessage").textContent="Não foi possível entrar. Confira e-mail e senha.";return}
  state.session=data.session; $("loginMessage").textContent=""; await bootstrap();
}
async function logout(){
  await db.auth.signOut(); state.session=null;state.profile=null;
  $("app").classList.add("hidden");$("loginScreen").classList.remove("hidden");$("loginPassword").value="";
}
async function loadProfile(){
  const {data,error}=await db.from("profiles").select("*").eq("id",state.session.user.id).single();
  if(error||!data)throw new Error("Perfil não encontrado.");
  if(!data.active)throw new Error("Seu usuário está inativo.");
  state.profile=data;
}
async function bootstrap(){
  try{
    await loadProfile(); roleUI();identity();
    $("loginScreen").classList.add("hidden");$("app").classList.remove("hidden");
    await loadCatalogs(); await loadProposals();
    if(supervisor()){await loadNotifications();await loadProfiles();}
    renderAll();showView("dashboardView");
  }catch(e){console.error(e);toast(e.message||"Erro ao iniciar.","error");}
}

async function loadCatalogs(){
  const [a,b,c,d]=await Promise.all([
    db.from("mobile_plans").select("*").eq("active",true).order("gb"),
    db.from("sme_packages").select("*").eq("active",true).order("gb"),
    db.from("additional_services").select("*").eq("active",true).order("name"),
    db.from("products").select("*").eq("active",true).order("category")
  ]);
  for(const r of [a,b,c,d])if(r.error)throw r.error;
  state.mobilePlans=a.data||[];state.smePackages=b.data||[];state.services=c.data||[];state.products=d.data||[];
  renderCatalogs();
}
function renderCatalogs(){
  $("mobilePlanSelect").innerHTML=state.mobilePlans.map(p=>`<option value="${p.id}">${Number(p.gb)} GB — ${money(p.price_cents)}</option>`).join("");
  $("smeSelect").innerHTML=state.smePackages.map(p=>`<option value="${p.id}">${Number(p.gb)} GB — R$ 0,00</option>`).join("");
  renderServices();renderProductOptions();renderAdminPlans();
}
function renderProductOptions(){
  const list=state.products.filter(p=>p.category===$("productCategory").value);
  $("productSelect").innerHTML=list.map(p=>`<option value="${p.id}">${esc(p.variant||p.name)} — ${money(p.price_cents)}</option>`).join("");
}
function renderServices(){
  $("servicesGrid").innerHTML=state.services.map(s=>{
    const x=state.serviceSelections[s.id];
    return `<div class="service-card" data-service="${s.id}">
      <label class="service-head"><input type="checkbox" class="service-toggle" ${x?.enabled?"checked":""}><span>${esc(s.name)}</span></label>
      <div class="service-fields ${x?.enabled?"":"hidden"}">
        <label>Quantidade<input class="service-qty" type="number" min="1" value="${x?.quantity||1}"></label>
        <label>Valor unitário<input class="service-value money-input" inputmode="decimal" value="${x?.unitValueCents?money(x.unitValueCents):""}" placeholder="R$ 0,00"></label>
        <label>Manter no novo?<select class="service-keep"><option value="yes" ${x?.keepNew!==false?"selected":""}>Sim</option><option value="no" ${x?.keepNew===false?"selected":""}>Não</option></select></label>
      </div></div>`;
  }).join("");
  $$("[data-service]").forEach(card=>{
    const id=Number(card.dataset.service),toggle=card.querySelector(".service-toggle"),fields=card.querySelector(".service-fields"),
      qty=card.querySelector(".service-qty"),val=card.querySelector(".service-value"),keep=card.querySelector(".service-keep");
    const sync=()=>{ if(!toggle.checked)delete state.serviceSelections[id];else state.serviceSelections[id]={enabled:true,quantity:Math.max(1,+qty.value||1),unitValueCents:cents(val.value),keepNew:keep.value==="yes"};fields.classList.toggle("hidden",!toggle.checked);updateCalc();};
    toggle.onchange=sync;qty.oninput=sync;keep.onchange=sync;val.onblur=()=>{if(val.value)formatMoneyInput(val);sync()};
  });
}

function addMobile(){
  const p=state.mobilePlans.find(x=>String(x.id)===$("mobilePlanSelect").value);if(!p)return;
  const type=$("mobileType").value,q=Math.max(1,+$("mobileQuantity").value||1),m=$("mobileM").value.trim();
  if(type==="migration"&&!m)return toast("Informe o M das linhas da migração.","error");
  state.mobileItems.push({uid:crypto.randomUUID(),planId:p.id,gb:Number(p.gb),priceCents:p.price_cents,type,quantity:q,m:type==="migration"?m:null});
  $("mobileQuantity").value=1;$("mobileM").value="";renderMobile();updateCalc();
}
function addSme(){
  const p=state.smePackages.find(x=>String(x.id)===$("smeSelect").value);if(!p)return;
  state.smeItems.push({uid:crypto.randomUUID(),packageId:p.id,gb:Number(p.gb),quantity:Math.max(1,+$("smeQuantity").value||1)});
  $("smeQuantity").value=1;renderSme();updateCalc();
}
function addProduct(){
  const p=state.products.find(x=>String(x.id)===$("productSelect").value);if(!p)return;
  const type=$("productType").value,q=Math.max(1,+$("productQuantity").value||1),m=$("productM").value.trim(),old=cents($("currentProductValue").value);
  if(type==="migration"&&!m)return toast("Informe o M do produto migrado.","error");
  if(type==="migration"&&old<=0)return toast("Informe o valor atual do produto migrado.","error");
  state.productItems.push({uid:crypto.randomUUID(),productId:p.id,category:p.category,name:p.name,variant:p.variant,priceCents:p.price_cents,benefits:p.benefits||[],type,quantity:q,currentValueCents:type==="migration"?old:0,m:type==="migration"?m:null});
  $("productQuantity").value=1;$("productM").value="";$("currentProductValue").value="";renderProducts();updateCalc();
}
function renderMobile(){
  const el=$("mobileItems");if(!state.mobileItems.length){el.className="items-list empty-state";el.textContent="Nenhuma linha adicionada.";return}
  el.className="items-list";el.innerHTML=state.mobileItems.map(i=>`<div class="item-row"><div><strong>${i.type==="migration"?"Migração":"E-SIM"} • ${i.gb} GB</strong><span>${i.type==="migration"?`M: ${esc(i.m)}`:"Chip virtual"}</span></div><span>${i.quantity} un.</span><span>${i.gb*i.quantity} GB</span><span>${money(i.priceCents*i.quantity)}</span><button type="button" class="item-remove" data-rm="${i.uid}">Remover</button></div>`).join("");
  $$("[data-rm]").forEach(b=>b.onclick=()=>{state.mobileItems=state.mobileItems.filter(i=>i.uid!==b.dataset.rm);renderMobile();updateCalc()});
}
function renderSme(){
  const el=$("smeItems");if(!state.smeItems.length){el.className="items-list empty-state";el.textContent="Nenhum pacote SME adicionado.";return}
  el.className="items-list";el.innerHTML=state.smeItems.map(i=>`<div class="item-row"><div><strong>Pacote SME • ${i.gb} GB</strong><span>Bônus sem custo</span></div><span>${i.quantity} un.</span><span>${i.gb*i.quantity} GB</span><span>R$ 0,00</span><button type="button" class="item-remove" data-rs="${i.uid}">Remover</button></div>`).join("");
  $$("[data-rs]").forEach(b=>b.onclick=()=>{state.smeItems=state.smeItems.filter(i=>i.uid!==b.dataset.rs);renderSme();updateCalc()});
}
function renderProducts(){
  const el=$("productItems");if(!state.productItems.length){el.className="items-list empty-state";el.textContent="Nenhum produto adicionado.";return}
  el.className="items-list";el.innerHTML=state.productItems.map(i=>`<div class="item-row"><div><strong>${esc(i.name)} • ${esc(i.variant||"")}</strong><span>${i.type==="migration"?`Migração • M: ${esc(i.m)}`:"Produto novo"}</span></div><span>${i.quantity} un.</span><span>${i.type==="migration"?`Atual ${money(i.currentValueCents*i.quantity)}`:"Novo"}</span><span>${money(i.priceCents*i.quantity)}</span><button type="button" class="item-remove" data-rp="${i.uid}">Remover</button></div>`).join("");
  $$("[data-rp]").forEach(b=>b.onclick=()=>{state.productItems=state.productItems.filter(i=>i.uid!==b.dataset.rp);renderProducts();updateCalc()});
}
function serviceTotals(){
  let current=0,newTotal=0;const selected=[];
  for(const s of state.services){const x=state.serviceSelections[s.id];if(!x?.enabled)continue;const total=x.quantity*x.unitValueCents;current+=total;if(x.keepNew)newTotal+=total;selected.push({serviceId:s.id,name:s.name,quantity:x.quantity,unitValueCents:x.unitValueCents,totalCents:total,keepNew:x.keepNew})}
  return {current,newTotal,selected};
}
function calc(){
  const currentBillingCents=cents($("currentBilling").value),adj=+$("adjustmentPercent").value||0,adjusted=Math.round(currentBillingCents*(1+adj/100)),limit=cents($("billingLimit").value);
  const mig=state.mobileItems.filter(i=>i.type==="migration"),es=state.mobileItems.filter(i=>i.type==="esim");
  const mobile=state.mobileItems.reduce((s,i)=>s+i.priceCents*i.quantity,0),eligible=mobile;
  const migrationLines=mig.reduce((s,i)=>s+i.quantity,0),esimCount=es.reduce((s,i)=>s+i.quantity,0);
  const newGb=state.mobileItems.reduce((s,i)=>s+i.gb*i.quantity,0)+state.smeItems.reduce((s,i)=>s+i.gb*i.quantity,0);
  const svc=serviceTotals(),oldProducts=state.productItems.filter(i=>i.type==="migration").reduce((s,i)=>s+i.currentValueCents*i.quantity,0),newProducts=state.productItems.reduce((s,i)=>s+i.priceCents*i.quantity,0);
  return {currentBillingCents,adj,adjusted,limit,eligible,diff:Math.max(0,limit-eligible),migrationLines,esimCount,newGb,currentGb:+$("currentFranchise").value||0,currentTotal:adjusted+svc.current+oldProducts,newTotal:mobile+svc.newTotal+newProducts,svc};
}
function benefits(){
  const b=new Set();if(state.mobileItems.length)["Vivo Gestão","1.000 SMS por linha","Ligações ilimitadas para qualquer operadora do Brasil"].forEach(x=>b.add(x));
  if(state.mobileItems.some(i=>i.type==="esim"))b.add("Chip Virtual: reforço de internet para suas linhas.");
  state.productItems.forEach(i=>(i.benefits||[]).forEach(x=>b.add(x)));return [...b];
}
function updateCalc(){
  const c=calc();$("adjustedBillingDisplay").textContent=money(c.adjusted);$("billingLimitDisplay").textContent=money(c.limit);$("eligibleTotalDisplay").textContent=money(c.eligible);
  const box=$("limitStatusBox");
  if(!c.limit){box.className="status-box warning";$("limitStatusText").textContent="Informe o limite"}
  else if(c.eligible>=c.limit){box.className="status-box success";$("limitStatusText").textContent=c.eligible>c.limit?`Limite OK • Excedente ${money(c.eligible-c.limit)}`:"Faturamento limite OK"}
  else{box.className="status-box danger";$("limitStatusText").textContent=`Faltam ${money(c.diff)}`}
  $("currentPlanTotal").textContent=money(c.currentTotal);$("newPlanTotal").textContent=money(c.newTotal);
  $("currentPlanMeta").textContent=`${c.migrationLines} linhas • ${c.currentGb} GB`;
  $("newPlanMeta").textContent=`${c.migrationLines} linhas • ${c.newGb} GB${c.esimCount?` • ${c.esimCount} E-SIM`:""}`;
  const b=benefits();$("benefitsPreview").innerHTML=b.length?b.map(x=>`<span class="benefit-chip">${esc(x)}</span>`).join(""):"<small>Os benefícios aparecerão automaticamente conforme a composição.</small>";
}
function validate(){
  const e=[],c=calc();if(!$("clientName").value.trim())e.push("Informe a Razão Social.");if(!validCNPJ($("cnpj").value))e.push("Informe um CNPJ válido.");
  if(c.currentBillingCents<=0)e.push("Informe o Faturamento Atual.");if(c.limit<=0)e.push("Informe o Faturamento Limite.");
  if(!state.mobileItems.length&&!state.productItems.length)e.push("Adicione ao menos um item à proposta.");
  if(state.mobileItems.length&&c.eligible<c.limit)e.push(`Faltam ${money(c.diff)} para atingir o Faturamento Limite com Migrações e/ou E-SIMs.`);
  if(Object.values(state.serviceSelections).some(x=>x.enabled&&(!x.quantity||x.unitValueCents<=0)))e.push("Preencha quantidade e valor dos Serviços Adicionais selecionados.");
  return e;
}
function payload(){
  const c=calc(),b=benefits(),ms=[...new Set(state.mobileItems.filter(i=>i.type==="migration").map(i=>i.m).filter(Boolean))];
  const snapshot={clientName:$("clientName").value.trim(),cnpj:$("cnpj").value,consultant:state.profile.full_name,proposalDate:$("proposalDate").value,validityDate:$("validityDate").value,current:{lines:c.migrationLines,franchiseGb:c.currentGb,valueCents:c.currentTotal},next:{lines:c.migrationLines,franchiseGb:c.newGb,esimCount:c.esimCount,valueCents:c.newTotal},benefits:b};
  return {consultant_id:state.session.user.id,client_name:$("clientName").value.trim(),cnpj:$("cnpj").value,proposal_date:$("proposalDate").value,validity_at:new Date(`${$("validityDate").value}T23:59:59`).toISOString(),status:"Enviada",current_billing_cents:c.currentBillingCents,adjustment_percent:c.adj,adjusted_billing_cents:c.adjusted,current_franchise_gb:c.currentGb,current_plan_total_cents:c.currentTotal,billing_limit_cents:c.limit,limit_eligible_total_cents:c.eligible,new_plan_total_cents:c.newTotal,new_franchise_gb:c.newGb,migration_lines:c.migrationLines,esim_count:c.esimCount,migration_m:ms.join(" | ")||null,composition:{mobileItems:state.mobileItems,smeItems:state.smeItems,services:c.svc.selected,products:state.productItems},benefits:b,client_snapshot:snapshot,internal_data:{migrationMs:ms,migratedProducts:state.productItems.filter(i=>i.type==="migration").map(i=>({name:i.name,variant:i.variant,m:i.m})),duplicatedFrom:state.duplicateSourceId}};
}
function proposalHTML(s,num=""){
  const a=s.current||{},n=s.next||{};
  return `<div class="proposal-top"><h2>Vivo Empresas</h2><p>PROPOSTA COMERCIAL</p><small>Benefícios renovados por 24 meses</small></div>
  <div class="client-box"><div><span>Razão Social</span><strong>${esc(s.clientName)}</strong></div><div><span>CNPJ</span><strong>${esc(s.cnpj)}</strong></div><div><span>Data</span><strong>${brDate(s.proposalDate)}</strong></div><div><span>Validade</span><strong>${brDate(s.validityDate)}</strong></div><div><span>Consultor</span><strong>${esc(s.consultant)}</strong></div>${num?`<div><span>Proposta</span><strong>${esc(num)}</strong></div>`:""}</div>
  <div class="plan-grid"><div class="proposal-plan"><span>PLANO ATUAL</span><div class="plan-row"><b>Linhas</b><b>${a.lines||0}</b></div><div class="plan-row"><b>Franquia</b><b>${a.franchiseGb||0} GB</b></div><div class="plan-price">${money(a.valueCents||0)} <small>/mês</small></div></div>
  <div class="proposal-plan new"><span>PLANO NOVO</span><div class="plan-row"><b>Linhas</b><b>${n.lines||0}</b></div><div class="plan-row"><b>Franquia</b><b>${n.franchiseGb||0} GB</b></div>${n.esimCount?`<div class="plan-row"><b>E-SIM</b><b>${n.esimCount} un.</b></div>`:""}<div class="plan-price">${money(n.valueCents||0)} <small>/mês</small></div></div></div>
  <div class="proposal-benefits">${(s.benefits||[]).map(x=>`<span>● ${esc(x)}</span>`).join("")}</div>`;
}
function preview(){
  const e=validate();if(e.length)return toast(e[0],"error");
  state.previewPayload=payload();$("proposalDocument").innerHTML=proposalHTML(state.previewPayload.client_snapshot);$("proposalModal").classList.remove("hidden");
}
async function save(){
  if(!state.previewPayload)return;$("saveProposalBtn").disabled=true;$("saveProposalBtn").textContent="Salvando...";
  const {data,error}=await db.from("proposals").insert(state.previewPayload).select("*").single();
  $("saveProposalBtn").disabled=false;$("saveProposalBtn").textContent="Salvar / Enviar proposta";
  if(error){console.error(error);return toast(error.message||"Não foi possível salvar.","error")}
  $("proposalModal").classList.add("hidden");toast(`Proposta ${data.fenix_number||""} salva com sucesso!`,"success");await loadProposals();if(supervisor())await loadNotifications();reset();showView("proposalsView");
}
function reset(){
  $("proposalForm").reset();state.mobileItems=[];state.smeItems=[];state.productItems=[];state.serviceSelections={};state.previewPayload=null;state.duplicateSourceId=null;
  defaultDates();identity();renderMobile();renderSme();renderProducts();renderServices();renderProductOptions();updateCalc();
}

async function loadProposals(){
  let q=db.from("proposals").select("*").order("created_at",{ascending:false});
  if(!supervisor())q=q.eq("consultant_id",state.session.user.id);
  const {data,error}=await q;if(error)throw error;state.proposals=data||[];
}
function cutoff(period){const d=new Date();if(period==="today")d.setHours(0,0,0,0);else if(period==="week")d.setDate(d.getDate()-7);else if(period==="month")d.setMonth(d.getMonth()-1);else if(period==="3months")d.setMonth(d.getMonth()-3);else if(period==="6months")d.setMonth(d.getMonth()-6);else return null;return d}
function table(list,actions=true){
  return `<table><thead><tr><th>Proposta</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th>${actions?"<th>Ações</th>":""}</tr></thead><tbody>${list.map(p=>`<tr><td><strong>${esc(p.fenix_number||"-")}</strong></td><td>${esc(p.client_name)}</td><td>${money(p.new_plan_total_cents)}</td><td><span class="status-pill status-${p.status}">${p.status}</span></td><td>${brDate(p.proposal_date)}</td>${actions?`<td><div class="row-actions"><button class="mini-btn" data-viewp="${p.id}">Ver</button><button class="mini-btn" data-resend="${p.id}">Reenviar</button><button class="mini-btn" data-dup="${p.id}">Duplicar</button>${p.status==="Enviada"?`<button class="mini-btn" data-status="${p.id}" data-value="Aprovada">Aprovar</button><button class="mini-btn" data-status="${p.id}" data-value="Cancelada">Cancelar</button>`:""}</div></td>`:""}</tr>`).join("")}</tbody></table>`;
}
function renderDashboard(){
  const cut=cutoff($("dashboardPeriod").value),list=state.proposals.filter(p=>!cut||new Date(p.created_at)>=cut);
  $("metricSent").textContent=list.filter(p=>p.status==="Enviada").length;$("metricApproved").textContent=list.filter(p=>p.status==="Aprovada").length;$("metricCancelled").textContent=list.filter(p=>p.status==="Cancelada").length;
  $("metricValue").textContent=money(list.reduce((s,p)=>s+(p.new_plan_total_cents||0),0));$("metricMigrations").textContent=list.reduce((s,p)=>s+(p.migration_lines||0),0);$("metricEsims").textContent=list.reduce((s,p)=>s+(p.esim_count||0),0);
  $("recentProposals").innerHTML=list.length?table(list.slice(0,5),false):'<div class="empty-state">Nenhuma proposta neste período.</div>';
}
function filtered(){
  const q=$("proposalSearch").value.trim().toLowerCase(),st=$("proposalStatusFilter").value;
  return state.proposals.filter(p=>(!st||p.status===st)&&(!q||`${p.fenix_number||""} ${p.client_name||""} ${p.cnpj||""}`.toLowerCase().includes(q)));
}
function renderProposals(){
  const l=filtered();$("proposalsTable").innerHTML=l.length?table(l,true):'<div class="empty-state">Nenhuma proposta encontrada.</div>';bindRows();
}
function bindRows(){
  $$("[data-viewp]").forEach(b=>b.onclick=()=>openSaved(b.dataset.viewp));$$("[data-resend]").forEach(b=>b.onclick=()=>resend(b.dataset.resend));
  $$("[data-dup]").forEach(b=>b.onclick=()=>duplicate(b.dataset.dup));$$("[data-status]").forEach(b=>b.onclick=()=>statusChange(b.dataset.status,b.dataset.value));
}
function openSaved(id){
  const p=state.proposals.find(x=>String(x.id)===String(id));if(!p)return;
  $("savedProposalTitle").textContent=p.fenix_number||"Proposta";$("savedProposalDocument").innerHTML=proposalHTML(p.client_snapshot||{},p.fenix_number);
  const i=p.internal_data||{},ms=i.migrationMs?.join(", ")||p.migration_m||"—",prod=(i.migratedProducts||[]).map(x=>`${esc(x.name)} ${esc(x.variant||"")} — M: ${esc(x.m||"—")}`).join("<br>")||"Nenhum";
  $("savedInternalInfo").innerHTML=`<strong>🔒 Informações internas — não aparecem ao cliente</strong><p><b>M das linhas:</b> ${esc(ms)}</p><p><b>Produtos migrados:</b><br>${prod}</p><p><b>Status:</b> ${esc(p.status)} • <b>Criada em:</b> ${brDateTime(p.created_at)}</p>`;
  $("savedProposalModal").classList.remove("hidden");
}
async function resend(id){
  const p=state.proposals.find(x=>String(x.id)===String(id));if(!p)return;
  const {error}=await db.from("proposal_events").insert({proposal_id:id,actor_id:state.session.user.id,event_type:"reenviada",details:{source:"historico_fenix"}});
  if(error)return toast("Não foi possível registrar o reenvio.","error");openSaved(id);toast(`Reenvio de ${p.fenix_number||"proposta"} registrado.`,"success");
}
async function statusChange(id,status){
  const {error}=await db.from("proposals").update({status}).eq("id",id);if(error)return toast("Não foi possível alterar o status.","error");
  toast(`Status alterado para ${status}.`,"success");await loadProposals();renderAll();
}
function duplicate(id){
  const p=state.proposals.find(x=>String(x.id)===String(id));if(!p)return;const comp=p.composition||{};
  $("clientName").value=p.client_name||"";$("cnpj").value=p.cnpj||"";$("currentBilling").value=money(p.current_billing_cents||0);$("adjustmentPercent").value=String(p.adjustment_percent||0);$("currentFranchise").value=p.current_franchise_gb??"";$("billingLimit").value=money(p.billing_limit_cents||0);
  $("proposalDate").value=isoToday();$("validityDate").value=isoTomorrow();
  state.mobileItems=(comp.mobileItems||[]).map(i=>({...i,uid:crypto.randomUUID()}));state.smeItems=(comp.smeItems||[]).map(i=>({...i,uid:crypto.randomUUID()}));state.productItems=(comp.products||[]).map(i=>({...i,uid:crypto.randomUUID()}));state.serviceSelections={};
  (comp.services||[]).forEach(s=>state.serviceSelections[s.serviceId]={enabled:true,quantity:s.quantity,unitValueCents:s.unitValueCents,keepNew:s.keepNew});
  state.duplicateSourceId=id;renderMobile();renderSme();renderProducts();renderServices();updateCalc();showView("calculatorView");toast("Cópia carregada. Ao salvar, será uma nova proposta.","success");
}
async function loadNotifications(){const {data,error}=await db.from("notifications").select("*").order("created_at",{ascending:false});if(error)throw error;state.notifications=data||[];renderNotifications()}
function renderNotifications(){
  if(!supervisor())return;const unread=state.notifications.filter(n=>!n.read).length;$("notificationBadge").textContent=unread;$("notificationBadge").classList.toggle("hidden",!unread);
  $("notificationsList").innerHTML=state.notifications.length?state.notifications.map(n=>`<div class="notification ${n.read?"":"unread"}"><div><h4>${esc(n.title)}</h4><p>${esc(n.message)}</p><p>${brDateTime(n.created_at)}</p></div>${!n.read?`<button class="mini-btn" data-read="${n.id}">Marcar como lida</button>`:""}</div>`).join(""):'<div class="empty-state">Nenhuma notificação.</div>';
  $$("[data-read]").forEach(b=>b.onclick=async()=>{const {error}=await db.from("notifications").update({read:true,read_at:new Date().toISOString()}).eq("id",b.dataset.read);if(!error)await loadNotifications()});
}
async function loadProfiles(){const {data,error}=await db.from("profiles").select("*").order("full_name");if(error)throw error;state.profiles=data||[];renderProfiles()}
function renderProfiles(){if(!supervisor())return;$("profilesTable").innerHTML=`<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead><tbody>${state.profiles.map(p=>`<tr><td><strong>${esc(p.full_name)}</strong></td><td>${esc(p.email||"-")}</td><td>${p.role==="supervisora"?"Supervisora":"Colaborador"}</td><td>${p.active?"Ativo":"Inativo"}</td></tr>`).join("")}</tbody></table>`}
function renderAdminPlans(){if(!supervisor())return;$("adminPlansTable").innerHTML=`<table><thead><tr><th>Plano</th><th>Valor</th><th>Status</th></tr></thead><tbody>${state.mobilePlans.map(p=>`<tr><td>${Number(p.gb)} GB</td><td>${money(p.price_cents)}</td><td>${p.active?"Ativo":"Inativo"}</td></tr>`).join("")}</tbody></table>`}
function renderAll(){renderDashboard();renderProposals();renderNotifications();renderProfiles();renderAdminPlans();updateCalc()}

function bind(){
  $("loginForm").onsubmit=login;$("logoutBtn").onclick=logout;
  $$(".nav-item").forEach(b=>b.onclick=()=>showView(b.dataset.view));$$("[data-open-calculator]").forEach(b=>b.onclick=()=>showView("calculatorView"));$$("[data-view-button]").forEach(b=>b.onclick=()=>showView(b.dataset.viewButton));
  $("cnpj").oninput=e=>{e.target.value=formatCNPJ(e.target.value);const d=e.target.value.replace(/\D/g,"");$("cnpjHelp").textContent=d.length===14?(validCNPJ(e.target.value)?"CNPJ válido ✓":"CNPJ inválido"):"";$("cnpjHelp").style.color=validCNPJ(e.target.value)?"var(--success)":"var(--danger)"};
  ["currentBilling","billingLimit","adjustmentPercent","currentFranchise"].forEach(id=>{$(id).oninput=updateCalc;$(id).onchange=updateCalc});
  $("mobileType").onchange=()=>$("mobileMWrapper").classList.toggle("hidden",$("mobileType").value!=="migration");
  $("productCategory").onchange=renderProductOptions;$("productType").onchange=()=>{const m=$("productType").value==="migration";$("currentProductValueWrapper").classList.toggle("hidden",!m);$("productMWrapper").classList.toggle("hidden",!m)};
  $("addMobileBtn").onclick=addMobile;$("addSmeBtn").onclick=addSme;$("addProductBtn").onclick=addProduct;$("previewProposalBtn").onclick=preview;$("saveProposalBtn").onclick=save;$("clearProposalBtn").onclick=reset;
  $("dashboardPeriod").onchange=renderDashboard;$("proposalSearch").oninput=renderProposals;$("proposalStatusFilter").onchange=renderProposals;$("refreshNotificationsBtn").onclick=loadNotifications;
  $$("[data-close-modal]").forEach(x=>x.onclick=()=>$("proposalModal").classList.add("hidden"));$$("[data-close-saved-modal]").forEach(x=>x.onclick=()=>$("savedProposalModal").classList.add("hidden"));
}
async function init(){
  bind();defaultDates();$("currentDateLabel").textContent=new Intl.DateTimeFormat("pt-BR",{dateStyle:"full"}).format(new Date());
  const {data:{session}}=await db.auth.getSession();if(session){state.session=session;await bootstrap()}
  db.auth.onAuthStateChange((_e,s)=>state.session=s);
}
init().catch(e=>{console.error(e);toast("Erro ao iniciar o Fênix One.","error")});

// ============================================================
// FÊNIX ONE V2
// ============================================================

function v2ServicesForProposal(){
  const c=calc();
  return (c.svc?.selected||[]).filter(s=>s.keepNew);
}

function v2ServicesHTML(snapshot){
  const services=snapshot.services||[];
  if(!services.length)return "";
  return `<div class="proposal-description">
    <h4>Serviços adicionais</h4>
    ${services.map(s=>`<div class="proposal-description-item">
      <strong>${esc(s.name)}</strong>
      <span>${s.quantity} un. • ${money(s.unitValueCents)} cada • Total ${money(s.totalCents)}</span>
    </div>`).join("")}
  </div>`;
}

const payloadV1 = payload;
payload = function(){
  const data=payloadV1();
  data.client_snapshot={...data.client_snapshot,services:v2ServicesForProposal()};
  return data;
};

const proposalHTMLV1 = proposalHTML;
proposalHTML = function(s,num=""){
  return proposalHTMLV1(s,num)+v2ServicesHTML(s);
};

function printProposalElement(id){
  const el=$(id);if(!el)return;
  el.classList.add("print-area");
  window.print();
  setTimeout(()=>el.classList.remove("print-area"),400);
}
function saveAsPDF(id){
  toast('Na janela de impressão, escolha "Salvar como PDF".',"success");
  setTimeout(()=>printProposalElement(id),250);
}

async function createCollaboratorV2(e){
  e.preventDefault();
  if(!supervisor())return toast("Somente a Supervisora pode cadastrar colaboradores.","error");
  const firstName=$("collabFirstName").value.trim();
  const lastName=$("collabLastName").value.trim();
  const email=$("collabEmail").value.trim().toLowerCase();
  const password=$("collabPassword").value;
  const msg=$("collaboratorFormMessage");

  if(!firstName||!lastName||!email||!password){msg.textContent="Preencha todos os campos.";return}
  if(password.length<8){msg.textContent="A senha deve possuir pelo menos 8 caracteres.";return}

  $("createCollaboratorBtn").disabled=true;
  $("createCollaboratorBtn").textContent="Cadastrando...";
  msg.textContent="";

  try{
    const {data:{session}}=await db.auth.getSession();
    if(!session)throw new Error("Sua sessão expirou. Entre novamente.");

    const response=await fetch(`${SUPABASE_URL}/functions/v1/manage-collaborator`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${session.access_token}`,
        "apikey":SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify({firstName,lastName,email,password})
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result?.error||"Não foi possível cadastrar o colaborador.");

    $("collaboratorForm").reset();
    msg.style.color="var(--success)";
    msg.textContent=`${result.collaborator.fullName} cadastrado com sucesso.`;
    toast(`${result.collaborator.fullName} cadastrado com sucesso!`,"success");
    await loadProfiles();renderProfiles();
  }catch(err){
    console.error(err);
    msg.style.color="var(--danger)";
    msg.textContent=err.message||"Erro ao cadastrar colaborador.";
    toast(err.message||"Erro ao cadastrar colaborador.","error");
  }finally{
    $("createCollaboratorBtn").disabled=false;
    $("createCollaboratorBtn").textContent="Cadastrar colaborador";
  }
}

renderProfiles = function(){
  if(!supervisor())return;
  $("profilesTable").innerHTML=`<table>
    <thead><tr><th>Nome e sobrenome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead>
    <tbody>${state.profiles.map(p=>`<tr>
      <td><strong>${esc(p.full_name||"-")}</strong></td>
      <td>${esc(p.email||"-")}</td>
      <td>${p.role==="supervisora"?"Supervisora":"Colaborador"}</td>
      <td>${p.active?"Ativo":"Inativo"}</td>
    </tr>`).join("")}</tbody>
  </table>`;
};

document.addEventListener("DOMContentLoaded",()=>{
  $("collaboratorForm")?.addEventListener("submit",createCollaboratorV2);
  $("printPreviewBtn")?.addEventListener("click",()=>printProposalElement("proposalDocument"));
  $("pdfPreviewBtn")?.addEventListener("click",()=>saveAsPDF("proposalDocument"));
  $("printSavedBtn")?.addEventListener("click",()=>printProposalElement("savedProposalDocument"));
  $("pdfSavedBtn")?.addEventListener("click",()=>saveAsPDF("savedProposalDocument"));
});


// ============================================================
// FÊNIX ONE V3 — RECUPERAÇÃO DE SENHA
// ============================================================

function showRecoveryScreen(){
  $("loginScreen")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("recoveryScreen")?.classList.remove("hidden");
}

function showLoginScreen(){
  $("recoveryScreen")?.classList.add("hidden");
  $("app")?.classList.add("hidden");
  $("loginScreen")?.classList.remove("hidden");
}

async function sendPasswordRecovery(){
  const email = $("loginEmail").value.trim();

  if(!email){
    $("loginMessage").textContent = "Digite seu e-mail para receber o link de recuperação.";
    return;
  }

  $("loginMessage").textContent = "Enviando link de recuperação...";

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}`
  });

  if(error){
    console.error(error);
    $("loginMessage").textContent = "Não foi possível enviar o link de recuperação.";
    return;
  }

  $("loginMessage").style.color = "var(--success)";
  $("loginMessage").textContent = "Enviamos um link para redefinir sua senha. Confira seu e-mail.";
}

async function saveNewPassword(event){
  event.preventDefault();

  const password = $("newPassword").value;
  const confirm = $("confirmNewPassword").value;
  const msg = $("recoveryMessage");

  msg.style.color = "var(--danger)";

  if(password.length < 8){
    msg.textContent = "A nova senha deve possuir pelo menos 8 caracteres.";
    return;
  }

  if(password !== confirm){
    msg.textContent = "As senhas não são iguais.";
    return;
  }

  $("saveNewPasswordBtn").disabled = true;
  $("saveNewPasswordBtn").textContent = "Salvando...";

  const { error } = await db.auth.updateUser({ password });

  $("saveNewPasswordBtn").disabled = false;
  $("saveNewPasswordBtn").textContent = "Salvar nova senha";

  if(error){
    console.error(error);
    msg.textContent = "Não foi possível alterar sua senha. Solicite um novo link de recuperação.";
    return;
  }

  msg.style.color = "var(--success)";
  msg.textContent = "Senha atualizada com sucesso! Você já pode entrar no Fênix.";
  toast("Senha atualizada com sucesso!", "success");

  await db.auth.signOut();

  setTimeout(() => {
    history.replaceState({}, document.title, window.location.pathname);
    $("newPassword").value = "";
    $("confirmNewPassword").value = "";
    $("loginPassword").value = "";
    showLoginScreen();
  }, 1200);
}

// Liga os eventos adicionais da V3
document.addEventListener("DOMContentLoaded", () => {
  $("forgotPasswordBtn")?.addEventListener("click", sendPasswordRecovery);
  $("recoveryForm")?.addEventListener("submit", saveNewPassword);
});

// Detecta o retorno do link de recuperação.
// Supabase dispara PASSWORD_RECOVERY quando o link é válido.
db.auth.onAuthStateChange((event, session) => {
  if(event === "PASSWORD_RECOVERY"){
    state.session = session;
    showRecoveryScreen();
  }
});

// Caso a URL volte do e-mail com sessão já criada antes do listener,
// verificamos os parâmetros do hash/query e exibimos a tela.
(async function detectRecoveryOnLoad(){
  const hash = window.location.hash || "";
  const query = window.location.search || "";
  const looksLikeRecovery =
    hash.includes("type=recovery") ||
    query.includes("type=recovery");

  if(looksLikeRecovery){
    const { data: { session } } = await db.auth.getSession();
    if(session){
      state.session = session;
      showRecoveryScreen();
    }
  }
})();


// ============================================================
// FÊNIX ONE V4 — PRODUTOS NA PROPOSTA + PRINT A4
// ============================================================

function v4ProductsForProposal(){
  return state.productItems.map(item => ({
    category: item.category,
    name: item.name,
    variant: item.variant,
    quantity: item.quantity,
    priceCents: item.priceCents,
    totalCents: item.priceCents * item.quantity,
    type: item.type
  }));
}

function v4CategoryLabel(category){
  const labels = {
    banda_larga: "Banda Larga",
    link_dedicado: "Link Dedicado",
    vvn: "VVN",
    fixo: "Fixo"
  };
  return labels[category] || "Produto";
}

function v4ProductsHTML(snapshot){
  const products = snapshot.products || [];
  if(!products.length) return "";

  return `
    <div class="proposal-products">
      <h4>Produtos contratados</h4>
      <div class="proposal-products-list">
        ${products.map(p => `
          <div class="proposal-product-item">
            <div>
              <strong>${esc(v4CategoryLabel(p.category))} — ${esc(p.variant || p.name || "")}</strong>
              <span>${p.quantity} ${p.quantity === 1 ? "unidade" : "unidades"}</span>
            </div>
            <span>${p.type === "migration" ? "Produto migrado" : "Produto novo"}</span>
            <span class="proposal-product-value">${money(p.totalCents || 0)}/mês</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// Preserva o payload atual e adiciona os produtos na versão cliente.
const payloadV3 = payload;
payload = function(){
  const data = payloadV3();
  data.client_snapshot = {
    ...data.client_snapshot,
    products: v4ProductsForProposal()
  };
  return data;
};

// Preserva serviços e demais blocos e acrescenta produtos.
const proposalHTMLV3 = proposalHTML;
proposalHTML = function(snapshot, fenixNumber = ""){
  return proposalHTMLV3(snapshot, fenixNumber) + v4ProductsHTML(snapshot);
};

// Impressão/PDF em A4 retrato.
printProposalElement = function(id){
  const el = $(id);
  if(!el) return;

  el.classList.add("print-area");

  // Garante que o navegador termine de aplicar o CSS de impressão.
  setTimeout(() => {
    window.print();
    setTimeout(() => el.classList.remove("print-area"), 700);
  }, 120);
};

saveAsPDF = function(id){
  toast('Na janela de impressão, mantenha "Retrato" e escolha "Salvar como PDF".', "success");
  setTimeout(() => printProposalElement(id), 300);
};


// ============================================================
// FÊNIX ONE V5 — BOTÃO ATUALIZAR NOTIFICAÇÕES
// ============================================================

async function refreshNotificationsV5(){
  const btn = $("refreshNotificationsBtn");

  if(!supervisor()){
    toast("Somente a Supervisora possui notificações administrativas.", "error");
    return;
  }

  if(btn){
    btn.disabled = true;
    btn.textContent = "Atualizando...";
  }

  try{
    const { data, error } = await db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if(error) throw error;

    state.notifications = data || [];
    renderNotifications();

    const unread = state.notifications.filter(n => !n.read).length;

    toast(
      unread
        ? `Notificações atualizadas. ${unread} não ${unread === 1 ? "lida" : "lidas"}.`
        : "Notificações atualizadas.",
      "success"
    );
  }catch(error){
    console.error("Erro ao atualizar notificações:", error);
    toast("Não foi possível atualizar as notificações.", "error");
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = "Atualizar";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = $("refreshNotificationsBtn");
  if(btn){
    btn.onclick = refreshNotificationsV5;
  }
});


// ============================================================
// FÊNIX ONE V6 — IMPRESSÃO/PDF SEM HERDAR O MODAL
// ============================================================
function ensurePrintRootV6(){
  let root = document.getElementById("printRoot");
  if(!root){
    root = document.createElement("div");
    root.id = "printRoot";
    document.body.appendChild(root);
  }
  return root;
}

printProposalElement = function(id){
  const source = $(id);
  if(!source) return;

  const root = ensurePrintRootV6();
  root.innerHTML = "";

  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.remove("print-area");
  clone.classList.add("proposal-document");

  root.appendChild(clone);
  document.body.classList.add("printing-proposal");

  const cleanup = () => {
    document.body.classList.remove("printing-proposal");
    root.innerHTML = "";
  };

  window.addEventListener("afterprint", cleanup, { once:true });

  setTimeout(() => {
    window.print();
    setTimeout(cleanup, 1200);
  }, 180);
};

saveAsPDF = function(id){
  toast('Na impressão, use "Retrato", papel A4, escala "Padrão" e desmarque "Cabeçalhos e rodapés".', "success");
  setTimeout(() => printProposalElement(id), 300);
};


// ============================================================
// FÊNIX ONE V7 — QUADROS COMPLETOS DA PROPOSTA
// ============================================================

function v7CurrentServices(){
  const c = calc();
  return (c.svc?.selected || []).map(s => ({
    ...s,
    destination: s.keepNew ? "both" : "current"
  }));
}

function v7NewServices(){
  const c = calc();
  return (c.svc?.selected || []).filter(s => s.keepNew);
}

function v7CurrentProducts(){
  return state.productItems
    .filter(item => item.type === "migration")
    .map(item => ({
      category: item.category,
      name: item.name,
      variant: item.variant,
      quantity: item.quantity,
      unitValueCents: item.currentValueCents,
      totalCents: item.currentValueCents * item.quantity,
      type: item.type
    }));
}

function v7NewProducts(){
  return state.productItems.map(item => ({
    category: item.category,
    name: item.name,
    variant: item.variant,
    quantity: item.quantity,
    unitValueCents: item.priceCents,
    totalCents: item.priceCents * item.quantity,
    type: item.type
  }));
}

function v7EsimDetails(){
  return state.mobileItems
    .filter(item => item.type === "esim")
    .map(item => ({
      quantity: item.quantity,
      gb: item.gb,
      totalGb: item.gb * item.quantity,
      totalCents: item.priceCents * item.quantity
    }));
}

function v7MobileSummary(){
  const migrationItems = state.mobileItems.filter(i => i.type === "migration");
  const esimItems = state.mobileItems.filter(i => i.type === "esim");

  return {
    migrationLines: migrationItems.reduce((s,i)=>s+i.quantity,0),
    migrationGb: migrationItems.reduce((s,i)=>s+i.gb*i.quantity,0),
    esimCount: esimItems.reduce((s,i)=>s+i.quantity,0),
    esimGb: esimItems.reduce((s,i)=>s+i.gb*i.quantity,0)
  };
}

const payloadV6 = payload;
payload = function(){
  const data = payloadV6();
  const mobile = v7MobileSummary();

  data.client_snapshot = {
    ...data.client_snapshot,
    currentServices: v7CurrentServices(),
    newServices: v7NewServices(),
    currentProducts: v7CurrentProducts(),
    newProducts: v7NewProducts(),
    esimDetails: v7EsimDetails(),
    mobileSummary: mobile
  };

  // Garante que o valor destacado do Plano Novo seja o valor total mensal:
  // móvel + eSIM + serviços mantidos + produtos novos/migrados.
  data.client_snapshot.next.valueCents = data.new_plan_total_cents;

  // Garante que o Plano Atual use o total atual completo:
  // faturamento reajustado + serviços atuais + produtos migrados atuais.
  data.client_snapshot.current.valueCents = data.current_plan_total_cents;

  return data;
};

function v7ServiceRows(services){
  if(!services?.length) return "";
  return `
    <span class="plan-detail-title">Serviços adicionais</span>
    ${services.map(s => `
      <div class="plan-detail-row">
        <strong>${esc(s.name)}</strong>
        <span>${s.quantity} un. • ${money(s.totalCents)}</span>
      </div>
    `).join("")}
  `;
}

function v7ProductRows(products){
  if(!products?.length) return "";
  return `
    <span class="plan-detail-title">Produtos</span>
    ${products.map(p => `
      <div class="plan-detail-row">
        <strong>${esc(v4CategoryLabel(p.category))} — ${esc(p.variant || p.name || "")}</strong>
        <span>${p.quantity} un. • ${money(p.totalCents)}/mês</span>
      </div>
    `).join("")}
  `;
}

function v7EsimRows(details){
  if(!details?.length) return "";
  return details.map(e => `
    <div class="plan-detail-row">
      <strong>E-SIM</strong>
      <span class="esim-detail">${e.quantity} un. • ${e.totalGb} GB</span>
    </div>
  `).join("");
}

proposalHTML = function(s, num = ""){
  const current = s.current || {};
  const next = s.next || {};
  const benefits = s.benefits || [];

  const currentServices = s.currentServices || [];
  const newServices = s.newServices || s.services || [];
  const currentProducts = s.currentProducts || [];
  const newProducts = s.newProducts || s.products || [];
  const esimDetails = s.esimDetails || [];

  return `
    <div class="proposal-top">
      <h2>Vivo Empresas</h2>
      <p>PROPOSTA COMERCIAL</p>
      <small>Benefícios renovados por 24 meses</small>
    </div>

    <div class="client-box">
      <div><span>Razão Social</span><strong>${esc(s.clientName || "")}</strong></div>
      <div><span>CNPJ</span><strong>${esc(s.cnpj || "")}</strong></div>
      <div><span>Data</span><strong>${brDate(s.proposalDate)}</strong></div>
      <div><span>Validade</span><strong>${brDate(s.validityDate)}</strong></div>
      <div><span>Consultor</span><strong>${esc(s.consultant || "")}</strong></div>
      ${num ? `<div><span>Proposta</span><strong>${esc(num)}</strong></div>` : ""}
    </div>

    <div class="plan-grid">
      <div class="proposal-plan">
        <span>PLANO ATUAL</span>
        <div class="plan-row"><b>Linhas</b><b>${current.lines ?? 0}</b></div>
        <div class="plan-row"><b>Franquia</b><b>${current.franchiseGb ?? 0} GB</b></div>

        ${(currentServices.length || currentProducts.length) ? `
          <div class="plan-details">
            ${v7ServiceRows(currentServices)}
            ${v7ProductRows(currentProducts)}
          </div>
        ` : ""}

        <div class="plan-price">${money(current.valueCents || 0)} <small>/mês</small></div>
      </div>

      <div class="proposal-plan new">
        <span>PLANO NOVO</span>
        <div class="plan-row"><b>Linhas</b><b>${next.lines ?? 0}</b></div>
        <div class="plan-row"><b>Franquia total</b><b>${next.franchiseGb ?? 0} GB</b></div>

        ${esimDetails.length ? `
          <div class="plan-details">
            <span class="plan-detail-title">Chip virtual</span>
            ${v7EsimRows(esimDetails)}
          </div>
        ` : ""}

        ${(newServices.length || newProducts.length) ? `
          <div class="plan-details">
            ${v7ServiceRows(newServices)}
            ${v7ProductRows(newProducts)}
          </div>
        ` : ""}

        <div class="plan-price">${money(next.valueCents || 0)} <small>/mês</small></div>
      </div>
    </div>

    <div class="proposal-benefits">
      ${benefits.map(b => `<span>● ${esc(b)}</span>`).join("")}
    </div>
  `;
};


// ============================================================
// FÊNIX ONE V9 — MELHORIAS DE GESTÃO
// ============================================================

state.settings = state.settings || {};
state.settingsRows = state.settingsRows || [];
state.dashboardVisibleCache = [];
state.currentBookSignedUrl = null;
state.currentDeviceListSignedUrl = null;

function v9ProductCategoryLabel(category){
  const labels = {
    banda_larga:"Banda Larga",
    link_dedicado:"Link Dedicado",
    vvn:"VVN",
    fixo:"Fixo",
    internet_movel:"Internet Móvel",
    vivo_travel:"Vivo Travel",
    mdm:"MDM",
    aparelho:"Aparelho"
  };
  return labels[category] || category || "Produto";
}

function v9ExtractGb(product){
  if(product?.category !== "internet_movel") return 0;
  const text = `${product.variant||""} ${product.name||""}`;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
  return match ? Number(match[1].replace(",",".")) : 0;
}

function v9ApplyTheme(theme){
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("fenix-theme", dark ? "dark" : "light");
  if($("themeToggleBtn")) $("themeToggleBtn").textContent = dark ? "☀️ Modo claro" : "🌙 Modo escuro";
}

function v9ToggleTheme(){
  v9ApplyTheme(document.body.classList.contains("dark") ? "light" : "dark");
}

async function v9LoadSettings(){
  const {data,error} = await db.from("app_settings").select("*");
  if(error){
    console.error("Erro ao carregar configurações:", error);
    return;
  }
  state.settingsRows = data || [];
  state.settings = {};
  state.settingsRows.forEach(r => state.settings[r.key] = r.value || {});
  v9RenderNews();
  await v9RenderMaterials();
  v9FillAdminSettings();
}

function v9Setting(key){
  return state.settings?.[key] || {};
}

async function v9SaveSetting(key, value){
  const {error} = await db.from("app_settings").upsert({
    key,
    value,
    updated_at:new Date().toISOString()
  }, {onConflict:"key"});
  if(error) throw error;
  state.settings[key] = value;
}

function v9RenderNews(){
  const n = v9Setting("team_news");
  const card = $("teamNewsCard");
  if(!card) return;
  const active = n.active && (n.title || n.message);
  card.classList.toggle("hidden", !active);
  if(active){
    $("teamNewsTitle").textContent = n.title || "Novidades da Equipe";
    $("teamNewsMessage").textContent = n.message || "";
  }
}

async function v9SignedUrl(path){
  if(!path) return null;
  const {data,error} = await db.storage.from("books").createSignedUrl(path, 60*60);
  if(error){
    console.error("Erro ao gerar link:", error);
    return null;
  }
  return data?.signedUrl || null;
}

async function v9RenderMaterials(){
  const book = v9Setting("monthly_book");
  const list = v9Setting("device_list");

  if($("bookCard")){
    const visible = !!(book.active && book.storage_path);
    $("bookCard").classList.toggle("hidden", !visible);
    if(visible){
      $("bookTitle").textContent = book.title || "Book do Mês";
      $("bookMeta").textContent = book.month || book.file_name || "";
      state.currentBookSignedUrl = await v9SignedUrl(book.storage_path);
    }
  }

  if($("deviceListCard")){
    const visible = !!(list.active && list.storage_path);
    $("deviceListCard").classList.toggle("hidden", !visible);
    if(visible){
      $("deviceListTitle").textContent = list.title || "Lista de Aparelhos";
      $("deviceListMeta").textContent = list.file_name || "";
      state.currentDeviceListSignedUrl = await v9SignedUrl(list.storage_path);
    }
  }
}

function v9FillAdminSettings(){
  if(!supervisor()) return;
  const n=v9Setting("team_news"), b=v9Setting("monthly_book"), d=v9Setting("device_list");
  if($("teamNewsAdminTitle")) $("teamNewsAdminTitle").value=n.title||"";
  if($("teamNewsAdminMessage")) $("teamNewsAdminMessage").value=n.message||"";
  if($("teamNewsAdminActive")) $("teamNewsAdminActive").value=n.active?"yes":"no";
  if($("bookAdminTitle")) $("bookAdminTitle").value=b.title||"";
  if($("bookAdminMonth")) $("bookAdminMonth").value=b.month||"";
  if($("deviceListAdminTitle")) $("deviceListAdminTitle").value=d.title||"";
}

function v9ProposalParts(p){
  const comp = p.composition || {};
  const mobile = comp.mobileItems || [];
  const products = comp.products || [];

  const migrationCents = mobile
    .filter(i => i.type === "migration")
    .reduce((s,i)=>s + (Number(i.priceCents)||0)*(Number(i.quantity)||0), 0);

  const esimRevenue = mobile
    .filter(i => i.type === "esim")
    .reduce((s,i)=>s + (Number(i.priceCents)||0)*(Number(i.quantity)||0), 0);

  const productsRevenue = products.reduce((sum,item)=>{
    if(item.type !== "new") return sum;
    let counts = item.countsAsRevenue;
    if(counts === undefined || counts === null){
      const catalog = state.products.find(p2 => String(p2.id) === String(item.productId));
      counts = !!catalog?.counts_as_revenue;
    }
    return counts ? sum + (Number(item.priceCents)||0)*(Number(item.quantity)||0) : sum;
  },0);

  return {
    totalCents:Number(p.new_plan_total_cents)||0,
    migrationCents,
    revenueCents:esimRevenue + productsRevenue
  };
}

function v9StatusSummary(list,status){
  const rows=list.filter(p=>p.status===status);
  return rows.reduce((acc,p)=>{
    const x=v9ProposalParts(p);
    acc.count++;
    acc.total+=x.totalCents;
    acc.migration+=x.migrationCents;
    acc.revenue+=x.revenueCents;
    return acc;
  },{count:0,total:0,migration:0,revenue:0});
}

function v9SetStatusMetrics(prefix, summary){
  const ids = {
    sent:["metricSent","sentTotal","sentMigration","sentRevenue"],
    approved:["metricApproved","approvedTotal","approvedMigration","approvedRevenue"],
    cancelled:["metricCancelled","cancelledTotal","cancelledMigration","cancelledRevenue"]
  }[prefix];
  if(!ids) return;
  $(ids[0]).textContent=summary.count;
  $(ids[1]).textContent=money(summary.total);
  $(ids[2]).textContent=money(summary.migration);
  $(ids[3]).textContent=money(summary.revenue);
}

function v9DashboardPeriodList(){
  const cut=cutoff($("dashboardPeriod")?.value || "month");
  return state.proposals.filter(p => !p.dashboard_hidden && (!cut || new Date(p.created_at)>=cut));
}

renderDashboard = function(){
  const list=v9DashboardPeriodList();
  state.dashboardVisibleCache=list;

  v9SetStatusMetrics("sent",v9StatusSummary(list,"Enviada"));
  v9SetStatusMetrics("approved",v9StatusSummary(list,"Aprovada"));
  v9SetStatusMetrics("cancelled",v9StatusSummary(list,"Cancelada"));

  if($("metricValue")) $("metricValue").textContent=money(list.reduce((s,p)=>s+(p.new_plan_total_cents||0),0));
  if($("metricMigrations")) $("metricMigrations").textContent=list.reduce((s,p)=>s+(p.migration_lines||0),0);
  if($("metricEsims")) $("metricEsims").textContent=list.reduce((s,p)=>s+(p.esim_count||0),0);
  if($("recentProposals")) $("recentProposals").innerHTML=list.length?table(list.slice(0,5),false):'<div class="empty-state">Nenhuma proposta neste período.</div>';

  v9RenderRanking();
};

function v9RankingCut(period){
  const now=new Date(), d=new Date(now);
  if(period==="hour"){d.setMinutes(0,0,0);return d}
  if(period==="day"){d.setHours(0,0,0,0);return d}
  if(period==="month"){d.setDate(1);d.setHours(0,0,0,0);return d}
  return null;
}

function v9ConsultantName(id){
  return state.profiles.find(p=>String(p.id)===String(id))?.full_name || "Consultor";
}

function v9RenderRanking(){
  const el=$("rankingList"); if(!el) return;
  const period=$("rankingPeriod")?.value||"month";
  const cut=v9RankingCut(period);
  const list=state.proposals.filter(p=>(!cut || new Date(p.created_at)>=cut));
  const map={};

  list.forEach(p=>{
    const id=p.consultant_id||"unknown";
    if(!map[id]) map[id]={id,name:v9ConsultantName(id),count:0,total:0,revenue:0};
    const parts=v9ProposalParts(p);
    map[id].count++;
    map[id].total+=parts.totalCents;
    map[id].revenue+=parts.revenueCents;
  });

  const ranking=Object.values(map).sort((a,b)=>b.count-a.count || b.total-a.total || b.revenue-a.revenue);
  el.innerHTML=ranking.length?ranking.map((r,i)=>`
    <div class="ranking-row">
      <div class="ranking-position">${i+1}º</div>
      <div><strong>${esc(r.name)}</strong><small>${money(r.total)} em propostas • Receita ${money(r.revenue)}</small></div>
      <div class="ranking-score"><strong>${r.count}</strong><small>propostas</small></div>
    </div>`).join(""):'<div class="empty-state">Nenhuma proposta enviada neste período.</div>';
}

async function v9ClearDashboard(){
  if(!supervisor()) return;
  const ids=state.dashboardVisibleCache.map(p=>p.id);
  if(!ids.length) return toast("Não há propostas visíveis para limpar.");
  if(!confirm(`Ocultar ${ids.length} proposta(s) deste Dashboard? Elas continuarão salvas no histórico.`)) return;
  const {error}=await db.from("proposals").update({dashboard_hidden:true,dashboard_hidden_at:new Date().toISOString()}).in("id",ids);
  if(error) return toast("Não foi possível limpar o Dashboard.","error");
  await loadProposals(); renderDashboard(); toast("Dashboard limpo sem apagar propostas.","success");
}

async function v9RestoreDashboard(){
  if(!supervisor()) return;
  const {error}=await db.from("proposals").update({dashboard_hidden:false,dashboard_hidden_at:null}).eq("dashboard_hidden",true);
  if(error) return toast("Não foi possível restaurar o Dashboard.","error");
  await loadProposals();renderDashboard();toast("Propostas restauradas no Dashboard.","success");
}

function v9FilteredNotifications(){
  const date=$("notificationDateFilter")?.value||"";
  const month=$("notificationMonthFilter")?.value||"";
  return state.notifications.filter(n=>{
    if(n.archived) return false;
    const d=new Date(n.created_at);
    const localDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const localMonth=localDate.slice(0,7);
    return (!date||localDate===date)&&(!month||localMonth===month);
  });
}

renderNotifications = function(){
  if(!supervisor())return;
  const unread=state.notifications.filter(n=>!n.read&&!n.archived).length;
  $("notificationBadge").textContent=unread;
  $("notificationBadge").classList.toggle("hidden",!unread);

  const list=v9FilteredNotifications();
  $("notificationsList").innerHTML=list.length?list.map(n=>`<div class="notification ${n.read?"":"unread"}">
    <div><h4>${esc(n.title)}</h4><p>${esc(n.message)}</p><p>${brDateTime(n.created_at)}</p></div>
    ${!n.read?`<button class="mini-btn" data-read="${n.id}">Marcar como lida</button>`:""}
  </div>`).join(""):'<div class="empty-state">Nenhuma notificação para esse filtro.</div>';

  $$("[data-read]").forEach(b=>b.onclick=async()=>{
    const {error}=await db.from("notifications").update({read:true,read_at:new Date().toISOString()}).eq("id",b.dataset.read);
    if(!error) await loadNotifications();
  });
}

async function v9ClearNotifications(){
  if(!supervisor())return;
  const ids=v9FilteredNotifications().map(n=>n.id);
  if(!ids.length)return toast("Não há notificações para limpar.");
  if(!confirm(`Limpar ${ids.length} notificação(ões) da tela? As propostas não serão apagadas.`))return;
  const {error}=await db.from("notifications").update({archived:true,archived_at:new Date().toISOString()}).in("id",ids);
  if(error)return toast("Não foi possível limpar as notificações.","error");
  await loadNotifications();toast("Notificações limpas.","success");
}

function v9ClearNotificationFilters(){
  if($("notificationDateFilter")) $("notificationDateFilter").value="";
  if($("notificationMonthFilter")) $("notificationMonthFilter").value="";
  renderNotifications();
}

function v9UpdateDeviceCalc(){
  const total=cents($("deviceTotalValue")?.value||"");
  const installments=Number($("deviceInstallments")?.value||10);
  if($("deviceInstallmentValue")) $("deviceInstallmentValue").value=total?money(Math.round(total/installments)):"";
}

function v9ToggleProductMode(){
  const device=$("productCategory")?.value==="aparelho";
  $("catalogProductWrapper")?.classList.toggle("hidden",device);
  $("deviceModelWrapper")?.classList.toggle("hidden",!device);
  $("deviceTotalWrapper")?.classList.toggle("hidden",!device);
  $("deviceInstallmentsWrapper")?.classList.toggle("hidden",!device);
  $("deviceInstallmentValueWrapper")?.classList.toggle("hidden",!device);
  $("deviceRevenueWrapper")?.classList.toggle("hidden",!device);

  if(device){
    $("productType").value="new";
    $("productType").disabled=true;
    $("currentProductValueWrapper").classList.add("hidden");
    $("productMWrapper").classList.add("hidden");
    $("productSelect").innerHTML='<option value="">Preenchimento manual</option>';
  }else{
    $("productType").disabled=false;
    renderProductOptions();
    const migration=$("productType").value==="migration";
    $("currentProductValueWrapper").classList.toggle("hidden",!migration);
    $("productMWrapper").classList.toggle("hidden",!migration);
  }
}

renderProductOptions = function(){
  const category=$("productCategory")?.value;
  if(category==="aparelho"){
    v9ToggleProductMode();
    return;
  }
  const list=state.products.filter(p=>p.category===category && p.active!==false);
  $("productSelect").innerHTML=list.map(p=>`<option value="${p.id}">${esc(p.variant||p.name)} — ${money(p.price_cents)}</option>`).join("");
}

addProduct = function(){
  const category=$("productCategory").value;
  const q=Math.max(1,+$("productQuantity").value||1);

  if(category==="aparelho"){
    const model=$("deviceModel").value.trim();
    const total=cents($("deviceTotalValue").value);
    const installments=Number($("deviceInstallments").value||10);
    const installmentCents=Math.round(total/installments);
    if(!model)return toast("Informe o modelo do aparelho.","error");
    if(total<=0)return toast("Informe o valor total do aparelho.","error");

    state.productItems.push({
      uid:crypto.randomUUID(),
      productId:null,
      category:"aparelho",
      name:"Aparelho",
      variant:model,
      priceCents:installmentCents,
      benefits:[],
      type:"new",
      quantity:q,
      currentValueCents:0,
      m:null,
      countsAsRevenue:$("deviceCountsRevenue").value==="yes",
      deviceTotalCents:total,
      deviceInstallments:installments,
      deviceInstallmentCents:installmentCents
    });
    $("deviceModel").value="";
    $("deviceTotalValue").value="";
    $("deviceInstallmentValue").value="";
    $("productQuantity").value=1;
    renderProducts();updateCalc();return;
  }

  const p=state.products.find(x=>String(x.id)===$("productSelect").value);if(!p)return;
  const type=$("productType").value;
  const m=$("productM").value.trim();
  const old=cents($("currentProductValue").value);
  if(type==="migration"&&!m)return toast("Informe o M do produto migrado.","error");
  if(type==="migration"&&old<=0)return toast("Informe o valor atual do produto migrado.","error");

  state.productItems.push({
    uid:crypto.randomUUID(),
    productId:p.id,
    category:p.category,
    name:p.name,
    variant:p.variant,
    priceCents:p.price_cents,
    benefits:p.benefits||[],
    type,
    quantity:q,
    currentValueCents:type==="migration"?old:0,
    m:type==="migration"?m:null,
    countsAsRevenue:!!p.counts_as_revenue,
    franchiseGb:v9ExtractGb(p)
  });
  $("productQuantity").value=1;$("productM").value="";$("currentProductValue").value="";
  renderProducts();updateCalc();
}

renderProducts = function(){
  const el=$("productItems");
  if(!state.productItems.length){el.className="items-list empty-state";el.textContent="Nenhum produto adicionado.";return}
  el.className="items-list";
  el.innerHTML=state.productItems.map(i=>{
    const extra=i.category==="aparelho"
      ? `${money(i.deviceTotalCents)} total • ${i.deviceInstallments}x de ${money(i.deviceInstallmentCents)}`
      : i.category==="internet_movel" && i.franchiseGb ? `${i.franchiseGb*i.quantity} GB adicionados à franquia` : "";
    return `<div class="item-row"><div><strong>${esc(v9ProductCategoryLabel(i.category))} • ${esc(i.variant||i.name||"")}</strong><span>${i.type==="migration"?`Migração • M: ${esc(i.m)}`:"Produto novo"}${extra?` • ${esc(extra)}`:""}</span></div><span>${i.quantity} un.</span><span>${i.type==="migration"?`Atual ${money(i.currentValueCents*i.quantity)}`:"Novo"}</span><span>${money(i.priceCents*i.quantity)}</span><button type="button" class="item-remove" data-rp="${i.uid}">Remover</button></div>`;
  }).join("");
  $$("[data-rp]").forEach(b=>b.onclick=()=>{state.productItems=state.productItems.filter(i=>i.uid!==b.dataset.rp);renderProducts();updateCalc()});
}

const v9CalcBase = calc;
calc = function(){
  const c=v9CalcBase();
  const internetGb=state.productItems
    .filter(i=>i.category==="internet_movel")
    .reduce((s,i)=>s+(Number(i.franchiseGb)||0)*(Number(i.quantity)||0),0);
  c.newGb += internetGb;
  return c;
}

function v9ProductSnapshot(item,current=false){
  return {
    category:item.category,
    name:item.name,
    variant:item.variant,
    quantity:item.quantity,
    unitValueCents:current?item.currentValueCents:item.priceCents,
    totalCents:(current?item.currentValueCents:item.priceCents)*item.quantity,
    type:item.type,
    franchiseGb:item.franchiseGb||0,
    countsAsRevenue:!!item.countsAsRevenue,
    deviceTotalCents:item.deviceTotalCents||null,
    deviceInstallments:item.deviceInstallments||null,
    deviceInstallmentCents:item.deviceInstallmentCents||null
  };
}

v7CurrentProducts = function(){
  return state.productItems.filter(i=>i.type==="migration").map(i=>v9ProductSnapshot(i,true));
}
v7NewProducts = function(){
  return state.productItems.map(i=>v9ProductSnapshot(i,false));
}

v7ProductRows = function(products){
  if(!products?.length)return "";
  return `
    <span class="plan-detail-title">Produtos</span>
    ${products.map(p=>`
      <div class="plan-detail-row">
        <strong>${esc(v9ProductCategoryLabel(p.category))} — ${esc(p.variant||p.name||"")}</strong>
        <span>
          ${p.quantity} un. • ${money(p.totalCents)}/mês
          ${p.category==="aparelho"&&p.deviceTotalCents?`<small class="proposal-device-extra">Valor total ${money(p.deviceTotalCents)} • ${p.deviceInstallments}x de ${money(p.deviceInstallmentCents)}</small>`:""}
          ${p.category==="internet_movel"&&p.franchiseGb?`<small class="proposal-device-extra">${p.franchiseGb*p.quantity} GB de franquia</small>`:""}
        </span>
      </div>
    `).join("")}
  `;
}

async function v9SaveTeamNews(e){
  e.preventDefault();
  try{
    const value={
      active:$("teamNewsAdminActive").value==="yes",
      title:$("teamNewsAdminTitle").value.trim(),
      message:$("teamNewsAdminMessage").value.trim(),
      published_at:new Date().toISOString()
    };
    await v9SaveSetting("team_news",value);v9RenderNews();toast("Novidade publicada.","success");
  }catch(err){console.error(err);toast("Não foi possível publicar a novidade.","error")}
}

async function v9RemoveTeamNews(){
  try{
    await v9SaveSetting("team_news",{active:false,title:"",message:"",published_at:null});
    v9FillAdminSettings();v9RenderNews();toast("Novidade removida.","success");
  }catch(err){toast("Não foi possível remover.","error")}
}

async function v9UploadMedia(kind){
  if(!supervisor())return;
  const isBook=kind==="monthly_book";
  const file=$(isBook?"bookAdminFile":"deviceListAdminFile")?.files?.[0];
  const title=$(isBook?"bookAdminTitle":"deviceListAdminTitle")?.value.trim() || (isBook?"Book do Mês":"Lista de Aparelhos");
  const month=isBook?$("bookAdminMonth").value:"";
  const status=$(isBook?"bookAdminStatus":"deviceListAdminStatus");
  if(!file)return toast("Selecione um arquivo.","error");

  const safe=file.name.replace(/[^\w.\-]+/g,"_");
  const prefix=isBook?"book":"devices";
  const path=`${prefix}/${Date.now()}_${safe}`;

  status.textContent="Enviando...";
  try{
    const current=v9Setting(kind);
    const {error:upErr}=await db.storage.from("books").upload(path,file,{upsert:false});
    if(upErr)throw upErr;

    const value={active:true,title,month,file_name:file.name,storage_path:path,uploaded_at:new Date().toISOString()};
    await v9SaveSetting(kind,value);

    if(current.storage_path){
      await db.storage.from("books").remove([current.storage_path]);
    }

    if(isBook)$("bookAdminFile").value="";else $("deviceListAdminFile").value="";
    status.style.color="var(--success)";status.textContent="Arquivo anexado com sucesso.";
    await v9RenderMaterials();toast("Arquivo anexado com sucesso.","success");
  }catch(err){
    console.error(err);status.style.color="var(--danger)";status.textContent=err.message||"Erro ao anexar arquivo.";
  }
}

async function v9RemoveMedia(kind){
  if(!supervisor())return;
  const current=v9Setting(kind);
  if(!current.storage_path)return toast("Nenhum arquivo anexado.");
  if(!confirm("Remover este arquivo da equipe?"))return;
  try{
    const {error}=await db.storage.from("books").remove([current.storage_path]);
    if(error)throw error;
    await v9SaveSetting(kind,{active:false,title:"",month:"",file_name:"",storage_path:"",uploaded_at:null});
    v9FillAdminSettings();await v9RenderMaterials();toast("Arquivo removido.","success");
  }catch(err){console.error(err);toast("Não foi possível remover o arquivo.","error")}
}

async function v9OpenMaterial(kind){
  const setting=v9Setting(kind);
  if(!setting.storage_path)return toast("Arquivo não disponível.");
  const url=await v9SignedUrl(setting.storage_path);
  if(!url)return toast("Não foi possível abrir o arquivo.","error");
  window.open(url,"_blank","noopener");
}

function v9RenderAdminProducts(){
  if(!supervisor()||!$("adminProductsTable"))return;
  const rows=state.products.slice().sort((a,b)=>`${a.category} ${a.variant||a.name}`.localeCompare(`${b.category} ${b.variant||b.name}`));
  $("adminProductsTable").innerHTML=`<table><thead><tr><th>Categoria</th><th>Produto</th><th>Valor</th><th>Receita</th><th>Ativo</th><th>Ação</th></tr></thead><tbody>
    ${rows.map(p=>`<tr data-admin-product="${p.id}">
      <td>${esc(v9ProductCategoryLabel(p.category))}</td>
      <td><strong>${esc(p.variant||p.name)}</strong><br><small>${esc(p.name||"")}</small></td>
      <td><input class="admin-product-input money-input product-admin-price" value="${money(p.price_cents)}"></td>
      <td><input class="admin-product-check product-admin-revenue" type="checkbox" ${p.counts_as_revenue?"checked":""}></td>
      <td><input class="admin-product-check product-admin-active" type="checkbox" ${p.active?"checked":""}></td>
      <td><button class="mini-btn product-admin-save" type="button">Salvar</button></td>
    </tr>`).join("")}
  </tbody></table>`;

  $$("[data-admin-product]").forEach(row=>{
    row.querySelector(".product-admin-price").onblur=e=>formatMoneyInput(e.target);
    row.querySelector(".product-admin-save").onclick=()=>v9SaveAdminProduct(row);
  });
}

async function v9SaveAdminProduct(row){
  const id=row.dataset.adminProduct;
  const price=cents(row.querySelector(".product-admin-price").value);
  const counts=row.querySelector(".product-admin-revenue").checked;
  const active=row.querySelector(".product-admin-active").checked;
  if(price<=0)return toast("Informe um valor válido.","error");
  const {error}=await db.from("products").update({price_cents:price,counts_as_revenue:counts,active,updated_at:new Date().toISOString()}).eq("id",id);
  if(error)return toast("Não foi possível atualizar o produto. Verifique a permissão administrativa.","error");
  await loadCatalogs();v9RenderAdminProducts();toast("Produto atualizado.","success");
}

renderProfiles = function(){
  if(!supervisor())return;
  $("profilesTable").innerHTML=`<table><thead><tr><th>Nome e sobrenome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${state.profiles.map(p=>`<tr>
    <td><strong>${esc(p.full_name||"-")}</strong></td>
    <td>${esc(p.email||"-")}</td>
    <td>${p.role==="supervisora"?"Supervisora":"Colaborador"}</td>
    <td>${p.active?"Ativo":"Inativo"}</td>
    <td><div class="row-actions">
      <button class="mini-btn" data-edit-profile="${p.id}" type="button">Alterar</button>
      ${p.id!==state.session.user.id?`<button class="mini-btn" data-toggle-profile="${p.id}" data-active="${p.active}" type="button">${p.active?"Desativar":"Ativar"}</button>`:""}
    </div></td>
  </tr>`).join("")}</tbody></table>`;

  $$("[data-edit-profile]").forEach(b=>b.onclick=()=>v9EditProfile(b.dataset.editProfile));
  $$("[data-toggle-profile]").forEach(b=>b.onclick=()=>v9ToggleProfile(b.dataset.toggleProfile,b.dataset.active==="true"));
}

async function v9EditProfile(id){
  const p=state.profiles.find(x=>String(x.id)===String(id));if(!p)return;
  const name=prompt("Nome e sobrenome:",p.full_name||"");
  if(name===null)return;
  const clean=name.trim();if(!clean)return toast("Informe o nome.","error");
  const {error}=await db.from("profiles").update({full_name:clean,updated_at:new Date().toISOString()}).eq("id",id);
  if(error)return toast("Não foi possível alterar o colaborador.","error");
  await loadProfiles();renderProfiles();toast("Colaborador atualizado.","success");
}

async function v9ToggleProfile(id,isActive){
  if(!confirm(`${isActive?"Desativar":"Ativar"} este colaborador?`))return;
  const {error}=await db.from("profiles").update({active:!isActive,updated_at:new Date().toISOString()}).eq("id",id);
  if(error)return toast("Não foi possível alterar o status do colaborador.","error");
  await loadProfiles();renderProfiles();toast(`Colaborador ${isActive?"desativado":"ativado"}.`,"success");
}

function v9Rebind(){
  $("themeToggleBtn") && ($("themeToggleBtn").onclick=v9ToggleTheme);
  $("dashboardPeriod") && ($("dashboardPeriod").onchange=renderDashboard);
  $("rankingPeriod") && ($("rankingPeriod").onchange=v9RenderRanking);
  $("clearDashboardBtn") && ($("clearDashboardBtn").onclick=v9ClearDashboard);
  $("restoreDashboardBtn") && ($("restoreDashboardBtn").onclick=v9RestoreDashboard);

  $("notificationDateFilter") && ($("notificationDateFilter").onchange=renderNotifications);
  $("notificationMonthFilter") && ($("notificationMonthFilter").onchange=renderNotifications);
  $("clearNotificationFiltersBtn") && ($("clearNotificationFiltersBtn").onclick=v9ClearNotificationFilters);
  $("clearNotificationsBtn") && ($("clearNotificationsBtn").onclick=v9ClearNotifications);
  $("refreshNotificationsBtn") && ($("refreshNotificationsBtn").onclick=refreshNotificationsV5);

  $("productCategory") && ($("productCategory").onchange=()=>{renderProductOptions();v9ToggleProductMode()});
  $("productType") && ($("productType").onchange=()=>{
    const m=$("productType").value==="migration";
    $("currentProductValueWrapper").classList.toggle("hidden",!m);
    $("productMWrapper").classList.toggle("hidden",!m);
  });
  $("addProductBtn") && ($("addProductBtn").onclick=addProduct);
  $("deviceTotalValue") && ($("deviceTotalValue").onblur=e=>{formatMoneyInput(e.target);v9UpdateDeviceCalc()});
  $("deviceTotalValue") && ($("deviceTotalValue").oninput=v9UpdateDeviceCalc);
  $("deviceInstallments") && ($("deviceInstallments").onchange=v9UpdateDeviceCalc);

  $("teamNewsForm") && ($("teamNewsForm").onsubmit=v9SaveTeamNews);
  $("removeTeamNewsBtn") && ($("removeTeamNewsBtn").onclick=v9RemoveTeamNews);
  $("uploadBookBtn") && ($("uploadBookBtn").onclick=()=>v9UploadMedia("monthly_book"));
  $("removeBookBtn") && ($("removeBookBtn").onclick=()=>v9RemoveMedia("monthly_book"));
  $("uploadDeviceListBtn") && ($("uploadDeviceListBtn").onclick=()=>v9UploadMedia("device_list"));
  $("removeDeviceListBtn") && ($("removeDeviceListBtn").onclick=()=>v9RemoveMedia("device_list"));
  $("openBookBtn") && ($("openBookBtn").onclick=()=>v9OpenMaterial("monthly_book"));
  $("openDeviceListBtn") && ($("openDeviceListBtn").onclick=()=>v9OpenMaterial("device_list"));
}

async function v9Start(){
  v9ApplyTheme(localStorage.getItem("fenix-theme")||"light");
  v9Rebind();
  v9ToggleProductMode();

  if(state.session){
    try{
      await v9LoadSettings();
      if(supervisor()){
        await loadProfiles();
        v9RenderAdminProducts();
      }
      renderDashboard();
      renderNotifications();
    }catch(err){console.error("V9 start:",err)}
  }
}

// Reinicia melhorias depois de login/bootstrap e também em recargas.
const bootstrapV9Base = bootstrap;
bootstrap = async function(){
  await bootstrapV9Base();
  await v9LoadSettings();
  if(supervisor()) v9RenderAdminProducts();
  v9Rebind();
  v9ToggleProductMode();
  renderDashboard();
  renderNotifications();
};

window.addEventListener("load",()=>setTimeout(v9Start,300));


// ============================================================
// FÊNIX ONE V10 — PROPOSTA CLEAN, FILTROS E COMUNICADOS
// ============================================================

state.proposalUiHideCancelled = state.proposalUiHideCancelled || false;

// ---------- PROPOSTA: esconder Internet Móvel da descrição ----------

function v10VisibleProducts(products){
  return (products || []).filter(p => p.category !== "internet_movel");
}

function v10ProductRows(products){
  const visible = v10VisibleProducts(products);
  if(!visible.length) return "";

  return `
    <span class="plan-detail-title">Produtos</span>
    ${visible.map(p => {
      const label = p.category === "vivo_travel"
        ? `Vivo Travel — ${esc(p.variant || "")}`
        : p.category === "aparelho"
          ? `${esc(p.variant || p.name || "Aparelho")}`
          : `${esc(v9ProductCategoryLabel(p.category))} — ${esc(p.variant || p.name || "")}`;

      let detail = `${p.quantity || 1} un.`;

      if(p.category === "aparelho" && p.deviceTotalCents){
        detail += ` • ${p.deviceInstallments}x de ${money(p.deviceInstallmentCents)}`;
        detail += `<small class="proposal-device-extra">Valor total ${money(p.deviceTotalCents)}</small>`;
      }

      // Vivo Travel aparece de forma resumida, sem valor individual.
      if(p.category !== "vivo_travel" && p.category !== "aparelho"){
        detail += ` • ${money(p.totalCents || 0)}/mês`;
      }

      return `
        <div class="plan-detail-row">
          <strong>${label}</strong>
          <span>${detail}</span>
        </div>
      `;
    }).join("")}
  `;
}

// Substitui a função usada pela proposta V7/V9.
v7ProductRows = v10ProductRows;

// Garante que a franquia total inclua Internet Móvel também em propostas salvas antigas.
const proposalHTMLV10Base = proposalHTML;
proposalHTML = function(s, num=""){
  const clone = JSON.parse(JSON.stringify(s || {}));
  const allProducts = clone.newProducts || clone.products || [];
  const internetGb = allProducts
    .filter(p => p.category === "internet_movel")
    .reduce((sum,p)=>{
      let gb = Number(p.franchiseGb)||0;
      if(!gb){
        const text=`${p.variant||""} ${p.name||""}`;
        const m=text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
        gb=m?Number(m[1].replace(",",".")):0;
      }
      return sum + gb*(Number(p.quantity)||1);
    },0);

  if(clone.next && internetGb){
    const originalNewGb = Number(clone.next.franchiseGb)||0;
    // snapshots V9 já podem conter o GB do Internet Móvel.
    // Só acrescenta quando o snapshot antigo não tinha franchiseGb nos produtos.
    const snapshotHasProductGb = allProducts.some(p=>p.category==="internet_movel" && Number(p.franchiseGb));
    if(!snapshotHasProductGb) clone.next.franchiseGb = originalNewGb + internetGb;
  }

  return proposalHTMLV10Base(clone,num);
};

// ---------- CAPTURA DA PROPOSTA EM PNG ----------

async function v10SaveProposalImage(elementId, filename="proposta-fenix.png"){
  const el=$(elementId);
  if(!el)return toast("Proposta não encontrada.","error");
  if(typeof html2canvas!=="function")return toast("Não foi possível carregar o recurso de imagem.","error");

  try{
    toast("Gerando imagem em alta qualidade...","success");
    document.body.classList.add("capture-proposal");

    const canvas=await html2canvas(el,{
      scale:3,
      backgroundColor:"#ffffff",
      useCORS:true,
      logging:false,
      windowWidth:el.scrollWidth,
      windowHeight:el.scrollHeight
    });

    const link=document.createElement("a");
    link.download=filename;
    link.href=canvas.toDataURL("image/png",1.0);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Imagem da proposta gerada.","success");
  }catch(err){
    console.error(err);
    toast("Não foi possível gerar a imagem.","error");
  }finally{
    document.body.classList.remove("capture-proposal");
  }
}

// ---------- FILTROS AVANÇADOS DE PROPOSTAS ----------

function v10FillProposalFilters(){
  const consultant=$("proposalConsultantFilter");
  if(consultant && supervisor()){
    const current=consultant.value;
    consultant.innerHTML='<option value="">Todos os consultores</option>'+
      state.profiles
        .filter(p=>p.active!==false || state.proposals.some(x=>String(x.consultant_id)===String(p.id)))
        .sort((a,b)=>(a.full_name||"").localeCompare(b.full_name||""))
        .map(p=>`<option value="${p.id}">${esc(p.full_name||p.email||"Consultor")}</option>`).join("");
    consultant.value=current;
  }

  const hour=$("proposalHourFilter");
  if(hour && !hour.options.length){
    hour.innerHTML=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,"0")}:00 às ${String(h).padStart(2,"0")}:59</option>`).join("");
  }
}

function v10ProposalFilterVisibility(){
  const period=$("proposalPeriodFilter")?.value||"";
  $("proposalDateFilterWrapper")?.classList.toggle("hidden",!(period==="day"||period==="hour"));
  $("proposalHourFilterWrapper")?.classList.toggle("hidden",period!=="hour");
  $("proposalMonthFilterWrapper")?.classList.toggle("hidden",period!=="selected_month");
}

function v10LocalParts(value){
  const d=new Date(value);
  return {
    date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,
    month:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
    hour:d.getHours()
  };
}

function v10ProposalMatchesPeriod(p){
  const period=$("proposalPeriodFilter")?.value||"";
  if(!period)return true;

  const parts=v10LocalParts(p.created_at);
  const now=v10LocalParts(new Date());

  if(period==="today")return parts.date===now.date;
  if(period==="month")return parts.month===now.month;
  if(period==="day"){
    const date=$("proposalDateFilter")?.value||"";
    return !date || parts.date===date;
  }
  if(period==="hour"){
    const date=$("proposalDateFilter")?.value||now.date;
    const hour=Number($("proposalHourFilter")?.value||0);
    return parts.date===date && parts.hour===hour;
  }
  if(period==="selected_month"){
    const month=$("proposalMonthFilter")?.value||"";
    return !month || parts.month===month;
  }
  return true;
}

filtered = function(){
  const q=$("proposalSearch")?.value.trim().toLowerCase()||"";
  const st=$("proposalStatusFilter")?.value||"";
  const consultant=supervisor()?($("proposalConsultantFilter")?.value||""):"";

  return state.proposals.filter(p=>{
    if(state.proposalUiHideCancelled && p.status==="Cancelada")return false;
    if(st && p.status!==st)return false;
    if(consultant && String(p.consultant_id)!==String(consultant))return false;
    if(!v10ProposalMatchesPeriod(p))return false;
    if(q && !`${p.fenix_number||""} ${p.client_name||""} ${p.cnpj||""}`.toLowerCase().includes(q))return false;
    return true;
  });
}

renderProposals = function(){
  v10FillProposalFilters();
  const l=filtered();
  $("proposalsTable").innerHTML=l.length?table(l,true):'<div class="empty-state">Nenhuma proposta encontrada.</div>';
  bindRows();
}

function v10ClearProposalFilters(){
  if($("proposalSearch"))$("proposalSearch").value="";
  if($("proposalStatusFilter"))$("proposalStatusFilter").value="";
  if($("proposalConsultantFilter"))$("proposalConsultantFilter").value="";
  if($("proposalPeriodFilter"))$("proposalPeriodFilter").value="";
  if($("proposalDateFilter"))$("proposalDateFilter").value="";
  if($("proposalMonthFilter"))$("proposalMonthFilter").value="";
  if($("proposalHourFilter"))$("proposalHourFilter").value="0";
  state.proposalUiHideCancelled=false;
  v10ProposalFilterVisibility();
  renderProposals();
}

function v10HideCancelledProposals(){
  state.proposalUiHideCancelled=true;
  if($("proposalStatusFilter")?.value==="Cancelada")$("proposalStatusFilter").value="";
  renderProposals();
  toast("Propostas canceladas removidas da tela. Elas continuam salvas no histórico.","success");
}

// ---------- COMUNICADOS VIVO ----------

function v10Communications(){
  const value=v9Setting("vivo_communications");
  return Array.isArray(value?.items)?value.items:[];
}

function v10RenderCommunications(){
  const items=v10Communications().slice().sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at));

  if($("communicationsCard")){
    $("communicationsCard").classList.toggle("hidden",!items.length);
    $("communicationsMeta").textContent=items.length
      ? `${items.length} comunicado${items.length===1?"":"s"} • Último: ${brDate(items[0].date||items[0].created_at)}`
      : "";
  }

  if($("communicationsAdminList")){
    $("communicationsAdminList").innerHTML=items.length?items.map(c=>`
      <div class="communication-admin-item">
        <div><strong>${esc(c.title)}</strong><small>${brDate(c.date||c.created_at)} • ${esc(c.file_name||"Arquivo")}</small></div>
        <div class="row-actions">
          <button class="mini-btn" data-open-comm="${esc(c.id)}" type="button">Abrir</button>
          <button class="mini-btn" data-remove-comm="${esc(c.id)}" type="button">Remover</button>
        </div>
      </div>`).join(""):'<div class="empty-state">Nenhum comunicado cadastrado.</div>';
  }

  if($("communicationsModalList")){
    $("communicationsModalList").innerHTML=items.length?items.map(c=>`
      <div class="communication-modal-item">
        <div><strong>${esc(c.title)}</strong><small>${brDate(c.date||c.created_at)}</small></div>
        <button class="btn btn-secondary" data-open-comm="${esc(c.id)}" type="button">Abrir arquivo</button>
      </div>`).join(""):'<div class="empty-state">Nenhum comunicado disponível.</div>';
  }

  $$("[data-open-comm]").forEach(b=>b.onclick=()=>v10OpenCommunication(b.dataset.openComm));
  $$("[data-remove-comm]").forEach(b=>b.onclick=()=>v10RemoveCommunication(b.dataset.removeComm));
}

async function v10AddCommunication(){
  if(!supervisor())return;
  const title=$("communicationTitle")?.value.trim()||"";
  const date=$("communicationDate")?.value||isoToday();
  const file=$("communicationFile")?.files?.[0];
  const status=$("communicationAdminStatus");

  if(!title)return toast("Informe o título do comunicado.","error");
  if(!file)return toast("Selecione o arquivo do comunicado.","error");

  status.textContent="Enviando...";
  try{
    const safe=file.name.replace(/[^\w.\-]+/g,"_");
    const path=`comunicados/${Date.now()}_${safe}`;
    const {error:upErr}=await db.storage.from("books").upload(path,file,{upsert:false});
    if(upErr)throw upErr;

    const items=v10Communications();
    items.push({
      id:crypto.randomUUID(),
      title,
      date,
      file_name:file.name,
      storage_path:path,
      created_at:new Date().toISOString()
    });

    await v9SaveSetting("vivo_communications",{items});
    $("communicationTitle").value="";
    $("communicationDate").value=isoToday();
    $("communicationFile").value="";
    status.style.color="var(--success)";
    status.textContent="Comunicado adicionado com sucesso.";
    v10RenderCommunications();
    toast("Comunicado publicado para a equipe.","success");
  }catch(err){
    console.error(err);
    status.style.color="var(--danger)";
    status.textContent=err.message||"Erro ao adicionar comunicado.";
  }
}

async function v10OpenCommunication(id){
  const c=v10Communications().find(x=>String(x.id)===String(id));
  if(!c?.storage_path)return toast("Arquivo não encontrado.","error");
  const url=await v9SignedUrl(c.storage_path);
  if(!url)return toast("Não foi possível abrir o comunicado.","error");
  window.open(url,"_blank","noopener");
}

async function v10RemoveCommunication(id){
  if(!supervisor())return;
  const items=v10Communications();
  const item=items.find(x=>String(x.id)===String(id));
  if(!item)return;
  if(!confirm(`Remover o comunicado "${item.title}"?`))return;

  try{
    if(item.storage_path)await db.storage.from("books").remove([item.storage_path]);
    const remaining=items.filter(x=>String(x.id)!==String(id));
    await v9SaveSetting("vivo_communications",{items:remaining});
    v10RenderCommunications();
    toast("Comunicado removido.","success");
  }catch(err){
    console.error(err);
    toast("Não foi possível remover o comunicado.","error");
  }
}

function v10OpenCommunicationsModal(){
  v10RenderCommunications();
  $("communicationsModal")?.classList.remove("hidden");
}

// ---------- REBIND V10 ----------

function v10Rebind(){
  v10FillProposalFilters();
  v10ProposalFilterVisibility();

  $("proposalSearch") && ($("proposalSearch").oninput=renderProposals);
  $("proposalStatusFilter") && ($("proposalStatusFilter").onchange=renderProposals);
  $("proposalConsultantFilter") && ($("proposalConsultantFilter").onchange=renderProposals);
  $("proposalPeriodFilter") && ($("proposalPeriodFilter").onchange=()=>{
    v10ProposalFilterVisibility();
    renderProposals();
  });
  $("proposalDateFilter") && ($("proposalDateFilter").onchange=renderProposals);
  $("proposalHourFilter") && ($("proposalHourFilter").onchange=renderProposals);
  $("proposalMonthFilter") && ($("proposalMonthFilter").onchange=renderProposals);
  $("clearProposalFiltersBtn") && ($("clearProposalFiltersBtn").onclick=v10ClearProposalFilters);
  $("hideCancelledProposalsBtn") && ($("hideCancelledProposalsBtn").onclick=v10HideCancelledProposals);

  $("imagePreviewBtn") && ($("imagePreviewBtn").onclick=()=>v10SaveProposalImage("proposalDocument","proposta-fenix.png"));
  $("imageSavedBtn") && ($("imageSavedBtn").onclick=()=>{
    const name=($("savedProposalTitle")?.textContent||"proposta-fenix").replace(/[^\w\-]+/g,"_");
    v10SaveProposalImage("savedProposalDocument",`${name}.png`);
  });

  $("addCommunicationBtn") && ($("addCommunicationBtn").onclick=v10AddCommunication);
  $("openCommunicationsBtn") && ($("openCommunicationsBtn").onclick=v10OpenCommunicationsModal);
  $$("[data-close-communications]").forEach(x=>x.onclick=()=>$("communicationsModal")?.classList.add("hidden"));
}

const v10LoadSettingsBase=v9LoadSettings;
v9LoadSettings=async function(){
  await v10LoadSettingsBase();
  v10RenderCommunications();
};

const bootstrapV10Base=bootstrap;
bootstrap=async function(){
  await bootstrapV10Base();
  v10Rebind();
  v10RenderCommunications();
  renderProposals();
};

window.addEventListener("load",()=>{
  setTimeout(()=>{
    if($("communicationDate")&&!$("communicationDate").value)$("communicationDate").value=isoToday();
    v10Rebind();
    v10RenderCommunications();
  },700);
});


// ============================================================
// FÊNIX ONE V11 — CHIP DE DADOS + FATURAMENTO LIMITE + ARQUIVO
// ============================================================

// Internet Móvel / Chip de Dados completa também o Faturamento Limite.
const calcV11Base = calc;
calc = function(){
  const c = calcV11Base();
  const chipDataEligible = state.productItems
    .filter(i => i.category === "internet_movel")
    .reduce((sum,i)=>sum + (Number(i.priceCents)||0)*(Number(i.quantity)||0),0);

  c.eligible += chipDataEligible;
  c.diff = Math.max(0,c.limit-c.eligible);
  c.chipDataEligible = chipDataEligible;
  return c;
};

// Atualiza o texto de validação para refletir a nova composição elegível.
const validateV11Base = validate;
validate = function(){
  const errors = validateV11Base();
  const c = calc();
  return errors.map(msg=>{
    if(msg.includes("Faturamento Limite com Migrações e/ou E-SIMs")){
      return `Faltam ${money(c.diff)} para atingir o Faturamento Limite com Migrações, E-SIMs e/ou Chip de Dados.`;
    }
    return msg;
  });
};

// Evita duplicação do erro antigo em propostas com apenas Chip de Dados.
const validateV11CleanBase = validate;
validate = function(){
  let errors = validateV11CleanBase();
  const c=calc();
  errors = errors.filter(msg=>!msg.includes("Faturamento Limite com Migrações e/ou E-SIMs"));
  if(c.limit>0 && c.eligible<c.limit && (state.mobileItems.length || state.productItems.some(i=>i.category==="internet_movel"))){
    const exists=errors.some(x=>x.includes("Faturamento Limite"));
    if(!exists) errors.push(`Faltam ${money(c.diff)} para atingir o Faturamento Limite com Migrações, E-SIMs e/ou Chip de Dados.`);
  }
  return errors;
};

// Produto Internet Móvel aparece ao cliente como "Chip de Dados",
// sem valor individual. O valor permanece apenas no total mensal.
function v11ProductRows(products){
  const rows=(products||[]);
  if(!rows.length)return "";

  const visible=rows.filter(p=>{
    // Todos continuam elegíveis, inclusive internet móvel.
    return true;
  });

  if(!visible.length)return "";

  return `
    <span class="plan-detail-title">Produtos</span>
    ${visible.map(p=>{
      if(p.category==="internet_movel"){
        let gb=Number(p.franchiseGb)||0;
        if(!gb){
          const text=`${p.variant||""} ${p.name||""}`;
          const match=text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
          gb=match?Number(match[1].replace(",",".")):0;
        }
        const qty=Number(p.quantity)||1;
        const totalGb=gb*qty;
        return `
          <div class="plan-detail-row chip-data-row">
            <strong>Chip de Dados</strong>
            <span>${qty} un.${totalGb?` • ${totalGb} GB`:""}</span>
          </div>
        `;
      }

      const label = p.category==="vivo_travel"
        ? `Vivo Travel — ${esc(p.variant||"")}`
        : p.category==="aparelho"
          ? `${esc(p.variant||p.name||"Aparelho")}`
          : `${esc(v9ProductCategoryLabel(p.category))} — ${esc(p.variant||p.name||"")}`;

      let detail=`${p.quantity||1} un.`;

      if(p.category==="aparelho" && p.deviceTotalCents){
        detail+=` • ${p.deviceInstallments}x de ${money(p.deviceInstallmentCents)}`;
        detail+=`<small class="proposal-device-extra">Valor total ${money(p.deviceTotalCents)}</small>`;
      }

      // Serviços/produtos recorrentes ficam sem valor individual na proposta.
      return `
        <div class="plan-detail-row">
          <strong>${label}</strong>
          <span>${detail}</span>
        </div>
      `;
    }).join("")}
  `;
}
v7ProductRows = v11ProductRows;

// "Remover canceladas" é ação exclusiva da Supervisora e persiste no banco.
// Ficam armazenadas no Supabase, mas somem da aba Propostas e do Dashboard.
async function v11ArchiveCancelled(){
  if(!supervisor()) return toast("Apenas a Supervisora pode remover propostas canceladas.","error");

  const visibleCancelled=state.proposals.filter(p=>p.status==="Cancelada" && !p.dashboard_hidden);
  if(!visibleCancelled.length)return toast("Não há propostas canceladas para remover.");

  if(!confirm(`Remover ${visibleCancelled.length} proposta(s) cancelada(s) do histórico visível? Elas continuarão salvas no banco de dados.`))return;

  const ids=visibleCancelled.map(p=>p.id);
  const {error}=await db.from("proposals")
    .update({dashboard_hidden:true,dashboard_hidden_at:new Date().toISOString()})
    .in("id",ids);

  if(error){
    console.error(error);
    return toast("Não foi possível remover as propostas canceladas.","error");
  }

  await loadProposals();
  renderDashboard();
  renderProposals();
  toast("Propostas canceladas removidas da visualização e mantidas no banco.","success");
}

// Propostas canceladas arquivadas não aparecem mais na aba Propostas.
const filteredV11Base = filtered;
filtered = function(){
  return filteredV11Base().filter(p=>!(p.status==="Cancelada" && p.dashboard_hidden));
};

// Restaurar Dashboard não reativa as canceladas que foram arquivadas.
v9RestoreDashboard = async function(){
  if(!supervisor())return;
  const hiddenNonCancelled=state.proposals.filter(p=>p.dashboard_hidden && p.status!=="Cancelada");
  if(!hiddenNonCancelled.length)return toast("Não há propostas do Dashboard para restaurar.");

  const ids=hiddenNonCancelled.map(p=>p.id);
  const {error}=await db.from("proposals")
    .update({dashboard_hidden:false,dashboard_hidden_at:null})
    .in("id",ids);

  if(error)return toast("Não foi possível restaurar o Dashboard.","error");

  await loadProposals();
  renderDashboard();
  renderProposals();
  toast("Dashboard restaurado. As canceladas removidas continuam arquivadas.","success");
};

// Rebind final para garantir a ação persistente.
window.addEventListener("load",()=>{
  setTimeout(()=>{
    if($("hideCancelledProposalsBtn")){
      $("hideCancelledProposalsBtn").onclick=v11ArchiveCancelled;
    }
  },900);
});

// Também após bootstrap/login.
const bootstrapV11Base=bootstrap;
bootstrap=async function(){
  await bootstrapV11Base();
  if($("hideCancelledProposalsBtn")){
    $("hideCancelledProposalsBtn").onclick=v11ArchiveCancelled;
  }
  renderDashboard();
  renderProposals();
};


// ============================================================
// FÊNIX ONE — PWA / INSTALAÇÃO COMO APLICATIVO
// ============================================================

let fenixInstallPrompt = null;

function fenixIsStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function fenixIsIOS(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function fenixShowInstallButtons(show=true){
  ["installAppBtn","installAppLoginBtn"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle("hidden", !show);
  });
}

async function fenixInstallApp(){
  if(fenixIsStandalone()){
    fenixShowInstallButtons(false);
    return;
  }

  if(fenixInstallPrompt){
    fenixInstallPrompt.prompt();
    try{
      await fenixInstallPrompt.userChoice;
    }catch(e){
      console.warn("Install prompt:", e);
    }
    fenixInstallPrompt=null;
    fenixShowInstallButtons(false);
    return;
  }

  if(fenixIsIOS()){
    alert('Para instalar o Fênix One no iPhone/iPad: abra no Safari, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".');
    return;
  }

  alert('Abra o menu do navegador e procure por "Instalar aplicativo" ou "Adicionar à tela inicial".');
}

window.addEventListener("beforeinstallprompt",(event)=>{
  event.preventDefault();
  fenixInstallPrompt=event;
  if(!fenixIsStandalone()) fenixShowInstallButtons(true);
});

window.addEventListener("appinstalled",()=>{
  fenixInstallPrompt=null;
  fenixShowInstallButtons(false);
  if(typeof toast==="function") toast("Fênix One instalado com sucesso!","success");
});

window.addEventListener("load",()=>{
  const btn=document.getElementById("installAppBtn");
  const loginBtn=document.getElementById("installAppLoginBtn");
  if(btn) btn.addEventListener("click",fenixInstallApp);
  if(loginBtn) loginBtn.addEventListener("click",fenixInstallApp);

  if(fenixIsStandalone()){
    fenixShowInstallButtons(false);
  }else if(fenixIsIOS()){
    // No iOS não existe o mesmo prompt programático; mostramos o botão de orientação.
    fenixShowInstallButtons(true);
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/service-worker.js").catch(err=>{
      console.warn("Service Worker não registrado:",err);
    });
  }
});

// ============================================================
// PATCH ISOLADO — SERVIÇOS JÁ ATIVOS
// Produtos Novos e demais módulos permanecem intactos.
// ============================================================

state.fenixBaseServices = state.fenixBaseServices || [];

function fenixNorm(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").trim();
}
function fenixIsInternetService(name){
  const n=fenixNorm(name);
  return n.includes("internet movel") || n.includes("base internet pj");
}
function fenixProductGb(p){
  if(Number(p?.gb))return Number(p.gb);
  const m=`${p?.variant||""} ${p?.name||""}`.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
  return m?Number(m[1].replace(",",".")):0;
}
function fenixInternetServiceName(p){
  const gb=fenixProductGb(p);
  return gb?`Internet Móvel ${gb} GB EMP`:(p.variant||p.name||"Internet Móvel");
}
function fenixBuildServicesCatalog(){
  const regular=(state.fenixBaseServices||[])
    .filter(s=>!fenixIsInternetService(s.name))
    .map(s=>({...s,fenixActiveInternet:false}));

  const internet=(state.products||[])
    .filter(p=>p.category==="internet_movel" && p.active!==false)
    .map((p,index)=>({
      id:-900001-index,
      name:fenixInternetServiceName(p),
      active:true,
      fenixActiveInternet:true,
      fenixProductId:p.id,
      fenixGb:fenixProductGb(p)
    }));

  return [...regular,...internet];
}

const fenixRenderCatalogsOriginal=renderCatalogs;
renderCatalogs=function(){
  const raw=(state.services||[]).filter(s=>!s.fenixActiveInternet);
  if(raw.length)state.fenixBaseServices=raw.map(s=>({...s}));
  state.services=fenixBuildServicesCatalog();
  return fenixRenderCatalogsOriginal();
};

renderServices=function(){
  $("servicesGrid").innerHTML=state.services.map(s=>{
    const x=state.serviceSelections[s.id];
    return `<div class="service-card ${s.fenixActiveInternet?"fenix-active-internet":""}" data-service="${s.id}">
      <label class="service-head"><input type="checkbox" class="service-toggle" ${x?.enabled?"checked":""}><span>${esc(s.name)}</span></label>
      <div class="service-fields ${x?.enabled?"":"hidden"}">
        <label>Quantidade<input class="service-qty" type="number" min="1" value="${x?.quantity||1}"></label>
        <label>Valor atual unitário<input class="service-value money-input" inputmode="decimal" value="${x?.unitValueCents?money(x.unitValueCents):""}" placeholder="R$ 0,00"></label>
        <label>Manter no Plano Novo?<select class="service-keep"><option value="yes" ${x?.keepNew!==false?"selected":""}>Sim</option><option value="no" ${x?.keepNew===false?"selected":""}>Não</option></select></label>
      </div>
    </div>`;
  }).join("");

  $$("[data-service]").forEach(card=>{
    const id=Number(card.dataset.service);
    const toggle=card.querySelector(".service-toggle");
    const fields=card.querySelector(".service-fields");
    const qty=card.querySelector(".service-qty");
    const val=card.querySelector(".service-value");
    const keep=card.querySelector(".service-keep");

    const sync=()=>{
      if(!toggle.checked){
        delete state.serviceSelections[id];
      }else{
        state.serviceSelections[id]={
          enabled:true,
          quantity:Math.max(1,Number(qty.value)||1),
          unitValueCents:cents(val.value),
          keepNew:keep.value==="yes"
        };
      }
      fields.classList.toggle("hidden",!toggle.checked);
      updateCalc();
    };

    toggle.onchange=sync;
    qty.oninput=sync;
    keep.onchange=sync;
    val.oninput=sync;
    val.onblur=()=>{if(val.value)formatMoneyInput(val);sync()};
  });
};

serviceTotals=function(){
  let current=0,newTotal=0;
  const selected=[];

  for(const s of state.services){
    const x=state.serviceSelections[s.id];
    if(!x?.enabled)continue;

    const quantity=Math.max(1,Number(x.quantity)||1);
    const unitValueCents=Number(x.unitValueCents)||0;
    const totalCents=quantity*unitValueCents;

    current+=totalCents;
    if(x.keepNew)newTotal+=totalCents;

    selected.push({
      serviceId:s.id,
      name:s.name,
      quantity,
      unitValueCents,
      totalCents,
      keepNew:x.keepNew,
      fenixActiveInternet:!!s.fenixActiveInternet,
      fenixGb:Number(s.fenixGb)||0,
      fenixProductId:s.fenixProductId||null
    });
  }
  return {current,newTotal,selected};
};

const fenixCalcOriginal=calc;
calc=function(){
  const c=fenixCalcOriginal();
  const internetKeptGb=(c.svc?.selected||[])
    .filter(s=>s.keepNew && s.fenixActiveInternet)
    .reduce((sum,s)=>sum+(Number(s.fenixGb)||0)*(Number(s.quantity)||1),0);
  c.newGb+=internetKeptGb;
  return c;
};

const fenixPayloadOriginal=payload;
payload=function(){
  const p=fenixPayloadOriginal();
  const c=calc();
  if(p.client_snapshot?.current)p.client_snapshot.current.valueCents=c.currentTotal;
  if(p.client_snapshot?.next){
    p.client_snapshot.next.valueCents=c.newTotal;
    p.client_snapshot.next.franchiseGb=c.newGb;
  }
  p.current_plan_total_cents=c.currentTotal;
  p.new_plan_total_cents=c.newTotal;
  p.new_franchise_gb=c.newGb;
  return p;
};

v7ServiceRows=function(services){
  if(!services?.length)return "";
  return `<span class="plan-detail-title">Serviços já ativos</span>${
    services.map(s=>`<div class="plan-detail-row proposal-service-name-only"><strong>${esc(s.name)}</strong></div>`).join("")
  }`;
};

v7EsimRows=function(details){
  if(!details?.length)return "";
  const quantity=details.reduce((sum,d)=>sum+(Number(d.quantity)||0),0);
  const totalGb=details.reduce((sum,d)=>sum+(Number(d.totalGb)||0),0);
  return `<span class="plan-detail-title">Chips virtuais</span>
    <div class="proposal-esim-total">
      <div><strong>${quantity}</strong><small>Chips virtuais</small></div>
      <div><strong>${totalGb} GB</strong><small>Franquia total</small></div>
    </div>`;
};

window.addEventListener("load",()=>{
  setTimeout(()=>{
    if(state.fenixBaseServices.length){
      state.services=fenixBuildServicesCatalog();
      renderServices();
      updateCalc();
    }
  },700);
});

// ===== AJUSTES FINAIS =====
state.previewSavedProposal=state.previewSavedProposal||null;

v7EsimRows=function(details){
  if(!details?.length)return "";
  const q=details.reduce((s,i)=>s+(Number(i.quantity)||0),0);
  const gb=details.reduce((s,i)=>s+(Number(i.totalGb)||0),0);
  return `<div class="fenix-esim-inline"><strong>CHIP VIRTUAL</strong><b>${q} — ${gb} GB</b></div>`;
};
const proposalHTMLFinalBase=proposalHTML;
proposalHTML=function(s,num=""){
  return proposalHTMLFinalBase(s,num)
    .replace(/<span class="plan-detail-title">Chip virtual<\/span>\s*(<div class="fenix-esim-inline">)/i,"$1")
    .replace(/<span class="plan-detail-title">Chips virtuais<\/span>\s*(<div class="fenix-esim-inline">)/i,"$1");
};

async function fenixEnsurePreviewSaved(){
  if(!state.previewPayload)return null;
  if(state.previewSavedProposal?.id)return state.previewSavedProposal;
  const {data,error}=await db.from("proposals").insert(state.previewPayload).select("*").single();
  if(error){toast(error.message||"Não foi possível salvar a proposta.","error");throw error}
  state.previewSavedProposal=data;
  $("proposalDocument").innerHTML=proposalHTML(state.previewPayload.client_snapshot,data.fenix_number||"");
  await loadProposals();if(supervisor())await loadNotifications();
  return data;
}
async function fenixSaveAndFinish(){try{const s=await fenixEnsurePreviewSaved();if(!s)return;$("proposalModal").classList.add("hidden");toast(`Proposta ${s.fenix_number||""} salva com sucesso!`,"success");state.previewSavedProposal=null;reset();showView("proposalsView")}catch(e){}}
async function fenixPdfFromPreview(){try{await fenixEnsurePreviewSaved();saveAsPDF("proposalDocument")}catch(e){}}
async function fenixImageFromPreview(){try{const s=await fenixEnsurePreviewSaved();const n=(s?.fenix_number||"proposta-fenix").replace(/[^\w\-]+/g,"_");await v10SaveProposalImage("proposalDocument",`${n}.png`)}catch(e){}}

function fenixValidHttpUrl(v){if(!v)return true;try{const u=new URL(v);return ["http:","https:"].includes(u.protocol)}catch(e){return false}}
function fenixShowMaterialContent(title,text,link){
  $("materialContentTitle").textContent=title||"Conteúdo";
  $("materialContentBody").textContent=text||"Nenhum texto informado.";
  $("materialContentActions").innerHTML=link?'<button id="materialOpenLinkBtn" class="btn btn-primary" type="button">Abrir link</button>':"";
  $("materialContentModal").classList.remove("hidden");
  if(link)$("materialOpenLinkBtn").onclick=()=>window.open(link,"_blank","noopener");
}

const v9FillAdminSettingsFinalBase=v9FillAdminSettings;
v9FillAdminSettings=function(){
  v9FillAdminSettingsFinalBase();
  const b=v9Setting("monthly_book"),d=v9Setting("device_list");
  if($("bookAdminLink"))$("bookAdminLink").value=b.link_url||"";
  if($("bookAdminText"))$("bookAdminText").value=b.text||"";
  if($("deviceListAdminLink"))$("deviceListAdminLink").value=d.link_url||"";
  if($("deviceListAdminText"))$("deviceListAdminText").value=d.text||"";
};

v9UploadMedia=async function(kind){
  if(!supervisor())return;
  const isBook=kind==="monthly_book", file=$(isBook?"bookAdminFile":"deviceListAdminFile")?.files?.[0];
  const title=$(isBook?"bookAdminTitle":"deviceListAdminTitle")?.value.trim()||(isBook?"Book do Mês":"Book de Aparelhos");
  const month=isBook?($("bookAdminMonth")?.value||""):"";
  const link=$(isBook?"bookAdminLink":"deviceListAdminLink")?.value.trim()||"";
  const text=$(isBook?"bookAdminText":"deviceListAdminText")?.value.trim()||"";
  const status=$(isBook?"bookAdminStatus":"deviceListAdminStatus");
  if(!file&&!link&&!text)return toast("Adicione um arquivo, link ou texto.","error");
  if(link&&!fenixValidHttpUrl(link))return toast("Informe um link válido.","error");
  status.textContent="Salvando...";
  try{
    const cur=v9Setting(kind);let storage=cur.storage_path||"",fileName=cur.file_name||"";
    if(file){
      const safe=file.name.replace(/[^\w.\-]+/g,"_"),prefix=isBook?"book":"devices",path=`${prefix}/${Date.now()}_${safe}`;
      const {error}=await db.storage.from("books").upload(path,file,{upsert:false});if(error)throw error;
      if(cur.storage_path)await db.storage.from("books").remove([cur.storage_path]);
      storage=path;fileName=file.name;
    }
    await v9SaveSetting(kind,{active:true,title,month,file_name:fileName,storage_path:storage,link_url:link,text,uploaded_at:new Date().toISOString()});
    if(isBook)$("bookAdminFile").value="";else $("deviceListAdminFile").value="";
    status.style.color="var(--success)";status.textContent="Conteúdo salvo com sucesso.";await v9RenderMaterials();toast("Conteúdo salvo para a equipe.","success");
  }catch(err){console.error(err);status.style.color="var(--danger)";status.textContent=err.message||"Erro ao salvar."}
};
v9OpenMaterial=async function(kind){
  const s=v9Setting(kind);
  if(s.storage_path){const url=await v9SignedUrl(s.storage_path);if(url){window.open(url,"_blank","noopener");return}}
  if(s.link_url){window.open(s.link_url,"_blank","noopener");return}
  if(s.text){fenixShowMaterialContent(s.title,s.text,"");return}
  toast("Conteúdo não disponível.","error");
};

v10AddCommunication=async function(){
  if(!supervisor())return;
  const title=$("communicationTitle")?.value.trim()||"",date=$("communicationDate")?.value||isoToday(),file=$("communicationFile")?.files?.[0],link=$("communicationLink")?.value.trim()||"",text=$("communicationText")?.value.trim()||"",status=$("communicationAdminStatus");
  if(!title)return toast("Informe o título do comunicado.","error");
  if(!file&&!link&&!text)return toast("Adicione arquivo, link ou texto.","error");
  if(link&&!fenixValidHttpUrl(link))return toast("Informe um link válido.","error");
  try{
    let path="",fileName="";
    if(file){const safe=file.name.replace(/[^\w.\-]+/g,"_");path=`comunicados/${Date.now()}_${safe}`;const {error}=await db.storage.from("books").upload(path,file,{upsert:false});if(error)throw error;fileName=file.name}
    const items=v10Communications();items.push({id:crypto.randomUUID(),title,date,file_name:fileName,storage_path:path,link_url:link,text,created_at:new Date().toISOString()});
    await v9SaveSetting("vivo_communications",{items});
    $("communicationTitle").value="";$("communicationDate").value=isoToday();$("communicationFile").value="";$("communicationLink").value="";$("communicationText").value="";
    status.style.color="var(--success)";status.textContent="Comunicado adicionado com sucesso.";v10RenderCommunications();toast("Comunicado publicado para a equipe.","success");
  }catch(err){console.error(err);status.style.color="var(--danger)";status.textContent=err.message||"Erro ao adicionar comunicado."}
};
v10OpenCommunication=async function(id){
  const c=v10Communications().find(x=>String(x.id)===String(id));if(!c)return;
  if(c.storage_path){const url=await v9SignedUrl(c.storage_path);if(url){window.open(url,"_blank","noopener");return}}
  if(c.link_url){window.open(c.link_url,"_blank","noopener");return}
  if(c.text){fenixShowMaterialContent(c.title,c.text,"");return}
  toast("Conteúdo não disponível.","error");
};

function fenixFinalRebind(){
  [["pdfPreviewBtn",fenixPdfFromPreview],["imagePreviewBtn",fenixImageFromPreview],["saveProposalBtn",fenixSaveAndFinish]].forEach(([id,fn])=>{
    const old=$(id);if(!old)return;const c=old.cloneNode(true);old.replaceWith(c);c.onclick=fn;
  });
  $$("[data-close-material-content]").forEach(el=>el.onclick=()=>$("materialContentModal")?.classList.add("hidden"));
  if($("uploadBookBtn"))$("uploadBookBtn").onclick=()=>v9UploadMedia("monthly_book");
  if($("uploadDeviceListBtn"))$("uploadDeviceListBtn").onclick=()=>v9UploadMedia("device_list");
  if($("openBookBtn"))$("openBookBtn").onclick=()=>v9OpenMaterial("monthly_book");
  if($("openDeviceListBtn"))$("openDeviceListBtn").onclick=()=>v9OpenMaterial("device_list");
  if($("addCommunicationBtn"))$("addCommunicationBtn").onclick=v10AddCommunication;
}
const previewFinalBase=preview;preview=function(){state.previewSavedProposal=null;return previewFinalBase()};
const resetFinalBase=reset;reset=function(){state.previewSavedProposal=null;return resetFinalBase()};
window.addEventListener("load",()=>setTimeout(fenixFinalRebind,1200));
const bootstrapFinalBase=bootstrap;bootstrap=async function(){await bootstrapFinalBase();fenixFinalRebind()};


// ============================================================
// AJUSTE PONTUAL — CHIP VIRTUAL NA PROPOSTA
// Exibe somente: CHIP VIRTUAL: 2 — 110 GB
// Sem cabeçalho duplicado e sem caixa/destaque.
// ============================================================

v7EsimRows = function(details){
  if(!details?.length) return "";

  const quantity = details.reduce(
    (sum,item)=>sum+(Number(item.quantity)||0), 0
  );

  const totalGb = details.reduce(
    (sum,item)=>sum+(Number(item.totalGb)||0), 0
  );

  return `
    <div class="fenix-esim-clean-row">
      <strong>CHIP VIRTUAL:</strong>
      <span>${quantity} — ${totalGb} GB</span>
    </div>
  `;
};

const fenixProposalChipCleanBase = proposalHTML;

proposalHTML = function(snapshot, fenixNumber=""){
  let markup = fenixProposalChipCleanBase(snapshot, fenixNumber);

  // Remove títulos antigos que ficavam acima do bloco.
  markup = markup
    .replace(/<span class="plan-detail-title">Chip virtual<\/span>\s*/gi,"")
    .replace(/<span class="plan-detail-title">Chips virtuais<\/span>\s*/gi,"");

  return markup;
};


// ============================================================
// CORREÇÃO — PDF / IMAGEM DEVEM SALVAR A PROPOSTA NO BANCO
// Usa o mesmo fluxo do botão Salvar/Enviar proposta.
// ============================================================

async function fenixPersistPreviewProposal(){
  if(!state.previewPayload){
    toast("Gere a proposta antes de salvar.", "error");
    return null;
  }

  // Se esta prévia já foi persistida, não duplica.
  if(state.previewSavedProposal?.id){
    return state.previewSavedProposal;
  }

  const payloadToSave = {
    ...state.previewPayload,
    client_snapshot: JSON.parse(JSON.stringify(state.previewPayload.client_snapshot || {}))
  };

  const {data,error} = await db
    .from("proposals")
    .insert(payloadToSave)
    .select("*")
    .single();

  if(error){
    console.error("Erro ao salvar proposta:", error);
    toast(error.message || "Não foi possível salvar a proposta no histórico.", "error");
    throw error;
  }

  state.previewSavedProposal = data;

  // Atualiza a prévia com o número Fênix gerado pelo banco.
  if($("proposalDocument")){
    $("proposalDocument").innerHTML = proposalHTML(
      payloadToSave.client_snapshot,
      data.fenix_number || ""
    );
  }

  // Recarrega os dados para aparecer imediatamente no histórico
  // do consultor e da supervisora.
  await loadProposals();

  if(supervisor()){
    await loadNotifications();
  }

  // Atualiza dashboard sem impedir o salvamento caso haja algum erro visual.
  try{
    if(typeof renderDashboard === "function") renderDashboard();
  }catch(e){
    console.warn("Dashboard não atualizado imediatamente:", e);
  }

  return data;
}

async function fenixSavePdfAndPersist(){
  try{
    const saved = await fenixPersistPreviewProposal();
    if(!saved) return;

    // Só gera o PDF DEPOIS que o banco confirmou o salvamento.
    saveAsPDF("proposalDocument");

    toast(
      `Proposta ${saved.fenix_number || ""} salva no histórico e PDF gerado.`,
      "success"
    );
  }catch(e){}
}

async function fenixSaveImageAndPersist(){
  try{
    const saved = await fenixPersistPreviewProposal();
    if(!saved) return;

    // Só gera a imagem DEPOIS que o banco confirmou o salvamento.
    const fileName = (saved.fenix_number || "proposta-fenix")
      .replace(/[^\w\-]+/g, "_");

    await v10SaveProposalImage(
      "proposalDocument",
      `${fileName}.png`
    );

    toast(
      `Proposta ${saved.fenix_number || ""} salva no histórico e imagem gerada.`,
      "success"
    );
  }catch(e){}
}

// Faz o botão Salvar/Enviar reutilizar a proposta caso PDF/Imagem
// já tenham feito o INSERT, evitando proposta duplicada.
async function fenixSaveProposalAndFinish(){
  try{
    const saved = await fenixPersistPreviewProposal();
    if(!saved) return;

    $("proposalModal")?.classList.add("hidden");

    toast(
      `Proposta ${saved.fenix_number || ""} salva com sucesso!`,
      "success"
    );

    state.previewSavedProposal = null;
    reset();
    showView("proposalsView");
  }catch(e){}
}

function fenixBindProposalSaveButtons(){
  const bindings = [
    ["pdfPreviewBtn", fenixSavePdfAndPersist],
    ["imagePreviewBtn", fenixSaveImageAndPersist],
    ["saveProposalBtn", fenixSaveProposalAndFinish]
  ];

  bindings.forEach(([id,handler])=>{
    const old = $(id);
    if(!old) return;

    // Clona para remover qualquer listener antigo que apenas exportava.
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.addEventListener("click", handler);
  });
}

// Toda nova prévia começa como "ainda não salva".
const fenixPreviewPersistenceBase = preview;
preview = function(){
  state.previewSavedProposal = null;
  return fenixPreviewPersistenceBase();
};

window.addEventListener("load", ()=>{
  setTimeout(fenixBindProposalSaveButtons, 1600);
});

// Reaplica os handlers sempre que a prévia for aberta.
document.addEventListener("click", (event)=>{
  if(event.target?.id === "previewBtn"){
    setTimeout(fenixBindProposalSaveButtons, 150);
  }
});


// ============================================================
// FÊNIX ONE — CONSOLIDADO 2026
// Uma única camada final para as regras revisadas.
// ============================================================

const FENIX_MASTER_FAQS = [{"id": "faq-1", "title": "Termo de transferência", "question": "“O que é esse termo de transferência?” / “Por que existem dois aceites?”", "answer": "Sr.(a) [Nome], esse termo faz parte da atualização do seu contrato. Como o contrato anterior está desatualizado, é necessário gerar um novo documento com as condições apresentadas e os benefícios liberados para a sua empresa.\n\nNesse novo documento ficam registradas as atualizações realizadas, como valores, condições e benefícios, garantindo mais transparência e segurança no processo.\n\nPor isso são realizados os dois aceites. O termo de transferência corresponde à atualização das informações do contrato anterior para o novo, incluindo dados cadastrais da empresa, como responsável, razão social, endereço e demais informações.\n\nPode ficar tranquilo(a): o objetivo é formalizar corretamente a atualização que estamos realizando.", "keywords": ["termo de transferência", "transferência", "dois aceites", "contrato", "titularidade", "atualização cadastral"], "active": true}, {"id": "faq-2", "title": "Chip eSIM / Chip Virtual", "question": "“O que é esse chip eSIM?” / “O que é esse chip virtual?”", "answer": "Sr.(a) [Nome], o eSIM é um chip virtual utilizado como recurso de dados para reforçar a internet disponibilizada para a sua empresa.\n\nEssa melhoria ou aumento de internet que foi liberado no seu plano é disponibilizado através desse chip virtual.\n\nEle não funciona como uma linha convencional de voz. A finalidade dele é fornecer dados, complementando a internet do seu plano e proporcionando mais disponibilidade de conexão para o seu uso.", "keywords": ["esim", "chip virtual", "chip de dados", "internet", "mais gigas", "franquia", "dados"], "active": true}, {"id": "faq-3", "title": "Número com DDD 91", "question": "“Por que aparece um número com DDD 91?”", "answer": "Sr.(a) [Nome], para esclarecer: essa melhoria que foi liberada para a sua empresa utiliza um chip responsável por disponibilizar o recurso adicional de internet.\n\nComo o nosso escritório opera no DDD 91, esse chip também pode aparecer vinculado a uma numeração com esse DDD.\n\nAs informações relacionadas à atualização ficam registradas na documentação apresentada durante o processo e no aceite.\n\nSe desejar, posso acompanhar o seu aceite em tempo real e conferir cada informação com você antes da conclusão.", "keywords": ["ddd 91", "91", "número diferente", "outra linha", "chip", "esim"], "active": true}, {"id": "faq-4", "title": "Cliente não usa mais as linhas", "question": "“Não uso mais essas linhas.” / “Essas linhas estão paradas.”", "answer": "Entendi, Sr.(a) [Nome]. Posso lhe perguntar o motivo? As linhas deixaram de ser utilizadas por alguma mudança na empresa ou realmente não existe mais necessidade delas?\n\nHoje alguma delas ainda é utilizada por colaboradores ou estão todas sem utilização?\n\nPergunto porque, antes de seguirmos com o cancelamento, posso verificar se existe alguma alternativa mais adequada ao uso atual da sua empresa, principalmente se houver possibilidade de voltar a utilizá-las futuramente.", "keywords": ["não uso", "linha parada", "sem utilização", "cancelamento"], "active": true}, {"id": "faq-5", "title": "Cliente está utilizando outra operadora", "question": "“Já estou usando outra operadora.” / “Troquei de operadora.”", "answer": "Entendi, Sr.(a) [Nome]. Posso saber o que levou a empresa a optar pela outra operadora?\n\nFoi principalmente por valor, cobertura, qualidade do sinal ou internet?\n\nDependendo do motivo, eu consigo verificar se existe alguma condição ou adequação disponível que atenda melhor à necessidade da sua empresa antes de seguirmos com qualquer alteração.", "keywords": ["outra operadora", "concorrente", "portabilidade", "cobertura", "sinal", "valor"], "active": true}, {"id": "faq-6", "title": "Cliente quer mudar para pré-pago", "question": "“Quero colocar no pré-pago.” / “Quero transformar minha linha em pré.”", "answer": "Entendi, Sr.(a) [Nome]. O principal motivo para a mudança seria a redução de custos?\n\nAtualmente o uso da linha ainda é frequente ou passou a ser mais esporádico?\n\nPergunto porque posso verificar se existe uma alternativa mais adequada ao seu perfil atual, mantendo os benefícios da linha empresarial, antes de o senhor optar pela mudança para o pré-pago.", "keywords": ["pré-pago", "mudar para pré", "reduzir custo", "plano caro"], "active": true}, {"id": "faq-7", "title": "Está funcionando bem como está", "question": "“Está funcionando bem como está.” / “Prefiro deixar do jeito que está.”", "answer": "E justamente por estar funcionando bem que vale a pena avaliarmos essa condição, Sr.(a) [Nome]. Não estamos tentando corrigir um problema no seu serviço, e sim reduzir um custo que a sua empresa já possui hoje.\n\nSe o senhor puder continuar com um serviço que já atende bem à sua empresa, mas pagando menos e aproveitando uma condição mais vantajosa, faz sentido analisarmos essa possibilidade, não acha?", "keywords": ["funcionando bem", "está bom assim", "não quero mudar", "pagar menos"], "active": true}, {"id": "faq-8", "title": "Argumento da Perda Financeira", "question": "Cliente entende a proposta, mas prefere continuar como está ou deixar para depois.", "answer": "Sr.(a) [Nome], sendo bem transparente, a sua empresa pode continuar exatamente como está hoje. A diferença é que continuará pagando um valor maior por um serviço que temos a possibilidade de otimizar agora.\n\nSe conseguimos manter uma solução adequada à necessidade da sua empresa e, ao mesmo tempo, reduzir esse custo, acaba não sendo vantajoso continuar pagando mais pelo cenário atual.", "keywords": ["perda financeira", "pagando mais", "deixar como está", "depois", "economia"], "active": true}, {"id": "faq-9", "title": "Cliente diz “não tenho interesse”", "question": "“Não tenho interesse.” / “Não quero.” / “Prefiro não fazer.”", "answer": "Entendi, Sr.(a) [Nome]. Pelo que estou entendendo, a questão não parece ser financeira, já que a proposta reduz o custo atual da sua empresa. Também não seria uma questão operacional, porque os seus números permanecem os mesmos.\n\nEntão, para eu entender melhor: o que está faltando para que essa condição faça sentido para o senhor e possamos avançar?", "keywords": ["não tenho interesse", "não quero", "sem interesse", "não deu motivo"], "active": true}, {"id": "faq-10", "title": "Fidelidade", "question": "“Não quero fidelidade.” / “Por que tem fidelidade?”", "answer": "Sr.(a) [Nome], a fidelidade não é exatamente o que a sua empresa está adquirindo. O principal benefício dessa atualização é a redução de custo.\n\nA fidelidade é uma condição contratual exigida pela operadora para disponibilizar essa condição comercial e manter a economia oferecida durante o período acordado.\n\nOu seja, o objetivo da atualização é proporcionar uma condição mais vantajosa para a sua empresa, e a fidelidade faz parte das condições para a concessão desse benefício.", "keywords": ["fidelidade", "contrato", "multa", "permanência", "redução de custo", "desconto"], "active": true}];
state.previewSavedProposal = state.previewSavedProposal || null;
state.newsRotationIndex = 0;
state.newsRotationTimer = null;

// ---------- HELPERS ----------
function fenixStatusDate(p){
  const i=p.internal_data||{};
  if(p.status==="Aprovada") return new Date(i.approved_at||p.approved_at||p.updated_at||p.created_at);
  if(p.status==="Cancelada") return new Date(i.cancelled_at||p.cancelled_at||p.updated_at||p.created_at);
  return new Date(i.sent_at||p.created_at);
}
function fenixDateKey(d){
  d=d instanceof Date?d:new Date(d);
  return {
    date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,
    month:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
  };
}
function fenixWithinPeriod(date,period,selectedMonth=""){
  const d=date instanceof Date?date:new Date(date),now=new Date();
  if(!period||period==="all")return true;
  if(period==="today")return fenixDateKey(d).date===fenixDateKey(now).date;
  if(period==="week"){const c=new Date(now);c.setDate(c.getDate()-7);return d>=c}
  if(period==="month")return fenixDateKey(d).month===fenixDateKey(now).month;
  if(period==="3months"){const c=new Date(now);c.setMonth(c.getMonth()-3);return d>=c}
  if(period==="6months"){const c=new Date(now);c.setMonth(c.getMonth()-6);return d>=c}
  if(period==="selected_month")return !selectedMonth||fenixDateKey(d).month===selectedMonth;
  return true;
}
function fenixNormalize(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function fenixUniqueBy(arr,keyFn){
  const m=new Map();
  arr.forEach(x=>{const k=keyFn(x);if(!m.has(k))m.set(k,x)});
  return [...m.values()];
}

// ---------- NAVEGAÇÃO ----------
const fenixMasterShowViewBase=showView;
showView=function(id){
  fenixMasterShowViewBase(id);
  const titles={
    dashboardView:"Dashboard",calculatorView:"Nova proposta",proposalsView:"Propostas",
    faqView:"Dúvidas Frequentes",devicesProposalView:"Proposta de Aparelhos",
    notificationsView:"Notificações",adminView:"Administração"
  };
  if($("pageTitle"))$("pageTitle").textContent=titles[id]||"Fênix One";

  // botão global "+ Nova proposta" não aparece dentro da aba Propostas.
  $$("[data-open-calculator]").forEach(btn=>{
    if(btn.closest("#proposalsView"))return;
    btn.classList.toggle("hidden",id==="proposalsView");
  });

  if(id==="faqView")fenixRenderFaq();
  if(id==="devicesProposalView")fenixDevicesRender();
};

// ============================================================
// MIGRAÇÃO MÓVEL — UMA LINHA = UM M + UMA DECISÃO
// ============================================================

addMobile=function(){
  const p=state.mobilePlans.find(x=>String(x.id)===$("mobilePlanSelect").value);
  if(!p)return;
  const type=$("mobileType").value;
  const q=Math.max(1,+$("mobileQuantity").value||1);

  if(type==="migration"){
    // Cada unidade vira uma linha independente.
    for(let n=0;n<q;n++){
      state.mobileItems.push({
        uid:crypto.randomUUID(),planId:p.id,gb:Number(p.gb),
        priceCents:Number(p.price_cents)||0,type:"migration",
        quantity:1,m:"",keepInNew:true
      });
    }
  }else{
    state.mobileItems.push({
      uid:crypto.randomUUID(),planId:p.id,gb:Number(p.gb),
      priceCents:Number(p.price_cents)||0,type,quantity:q,
      m:null,keepInNew:true
    });
  }

  $("mobileQuantity").value=1;
  renderMobile();updateCalc();
};

renderMobile=function(){
  const el=$("mobileItems");
  if(!el)return;
  if(!state.mobileItems.length){
    el.className="items-list empty-state";
    el.textContent="Nenhuma linha adicionada.";
    return;
  }

  const label=i=>i.type==="migration"?"Migração":i.type==="esim"?"E-SIM":"Linha Nova";
  el.className="items-list";
  el.innerHTML=state.mobileItems.map(i=>{
    const controls=i.type==="migration"?`
      <div class="fenix-line-controls">
        <label>M da linha
          <input data-mobile-m="${i.uid}" value="${esc(i.m||"")}" placeholder="Ex.: 20">
        </label>
        <label>Esta linha ficará:
          <select data-mobile-keep="${i.uid}">
            <option value="yes" ${i.keepInNew!==false?"selected":""}>Plano Atual e Plano Novo</option>
            <option value="no" ${i.keepInNew===false?"selected":""}>Somente Plano Atual</option>
          </select>
        </label>
      </div>`:"";

    return `<div class="item-row ${i.type==="migration"?"fenix-migration-row":""}">
      <div>
        <strong>${label(i)} • ${i.gb} GB</strong>
        <span class="fenix-item-note">${i.type==="migration"?"Linha existente":i.type==="esim"?"Chip virtual":"Nova linha"}</span>
        ${controls}
      </div>
      <span>${i.quantity} un.</span>
      <span>${i.gb*i.quantity} GB</span>
      <span>${money(i.priceCents*i.quantity)}</span>
      <button type="button" class="item-remove" data-rm="${i.uid}">Remover</button>
    </div>`;
  }).join("");

  $$("[data-rm]").forEach(b=>b.onclick=()=>{
    state.mobileItems=state.mobileItems.filter(i=>i.uid!==b.dataset.rm);
    renderMobile();updateCalc();
  });
  $$("[data-mobile-m]").forEach(inp=>inp.oninput=()=>{
    const item=state.mobileItems.find(i=>i.uid===inp.dataset.mobileM);
    if(item)item.m=inp.value.trim();
  });
  $$("[data-mobile-keep]").forEach(sel=>sel.onchange=()=>{
    const item=state.mobileItems.find(i=>i.uid===sel.dataset.mobileKeep);
    if(item){item.keepInNew=sel.value==="yes";updateCalc()}
  });
};

// ============================================================
// PRODUTOS EM MIGRAÇÃO — DADOS NA PRÓPRIA LINHA
// ============================================================

addProduct=function(){
  const p=state.products.find(x=>String(x.id)===$("productSelect").value);
  if(!p)return;
  const type=$("productType").value;
  const q=Math.max(1,+$("productQuantity").value||1);

  state.productItems.push({
    uid:crypto.randomUUID(),productId:p.id,category:p.category,
    name:p.name,variant:p.variant,priceCents:Number(p.price_cents)||0,
    benefits:p.benefits||[],type,quantity:q,
    currentDescription:"",currentProductName:"",
    currentValueCents:0,m:type==="migration"?"":null,keepInNew:true
  });

  $("productQuantity").value=1;
  renderProducts();updateCalc();
};

renderProducts=function(){
  const el=$("productItems");
  if(!el)return;
  if(!state.productItems.length){
    el.className="items-list empty-state";
    el.textContent="Nenhum produto adicionado.";
    return;
  }

  el.className="items-list";
  el.innerHTML=state.productItems.map(i=>{
    const controls=i.type==="migration"?`
      <div class="fenix-product-controls">
        <label>Produto / benefício atual
          <input data-product-current="${i.uid}" value="${esc(i.currentDescription||"")}" placeholder="Ex.: 500 Mega, 20 GB">
        </label>
        <label>Valor atual
          <input data-product-current-value="${i.uid}" value="${i.currentValueCents?money(i.currentValueCents):""}" placeholder="R$ 0,00">
        </label>
        <label>M do produto
          <input data-product-m="${i.uid}" value="${esc(i.m||"")}" placeholder="Ex.: 20">
        </label>
        <label>Este produto ficará:
          <select data-product-keep="${i.uid}">
            <option value="yes" ${i.keepInNew!==false?"selected":""}>Plano Atual e Plano Novo</option>
            <option value="no" ${i.keepInNew===false?"selected":""}>Somente Plano Atual</option>
          </select>
        </label>
      </div>`:"";

    return `<div class="item-row ${i.type==="migration"?"fenix-migration-row":""}">
      <div>
        <strong>${esc(i.name)} • ${esc(i.variant||"")}</strong>
        <span class="fenix-item-note">${i.type==="migration"?"Migração":"Produto novo"}</span>
        ${controls}
      </div>
      <span>${i.quantity} un.</span>
      <span>${i.type==="migration"&&i.currentValueCents?`Atual ${money(i.currentValueCents*i.quantity)}`:""}</span>
      <span>${money(i.priceCents*i.quantity)}</span>
      <button type="button" class="item-remove" data-rp="${i.uid}">Remover</button>
    </div>`;
  }).join("");

  $$("[data-rp]").forEach(b=>b.onclick=()=>{
    state.productItems=state.productItems.filter(i=>i.uid!==b.dataset.rp);
    renderProducts();updateCalc();
  });
  $$("[data-product-current]").forEach(inp=>inp.oninput=()=>{
    const i=state.productItems.find(x=>x.uid===inp.dataset.productCurrent);
    if(i){i.currentDescription=inp.value.trim();i.currentProductName=i.currentDescription}
  });
  $$("[data-product-current-value]").forEach(inp=>{
    inp.oninput=()=>{
      const i=state.productItems.find(x=>x.uid===inp.dataset.productCurrentValue);
      if(i){i.currentValueCents=cents(inp.value);updateCalc()}
    };
    inp.onblur=()=>{
      if(inp.value)formatMoneyInput(inp);
      const i=state.productItems.find(x=>x.uid===inp.dataset.productCurrentValue);
      if(i){i.currentValueCents=cents(inp.value);updateCalc()}
    };
  });
  $$("[data-product-m]").forEach(inp=>inp.oninput=()=>{
    const i=state.productItems.find(x=>x.uid===inp.dataset.productM);
    if(i)i.m=inp.value.trim();
  });
  $$("[data-product-keep]").forEach(sel=>sel.onchange=()=>{
    const i=state.productItems.find(x=>x.uid===sel.dataset.productKeep);
    if(i){i.keepInNew=sel.value==="yes";updateCalc()}
  });
};

// ============================================================
// CÁLCULO
// ============================================================

const fenixMasterCalcBase=calc;
calc=function(){
  const c=fenixMasterCalcBase();

  const migrations=state.mobileItems.filter(i=>i.type==="migration");
  const keptMigrations=migrations.filter(i=>i.keepInNew!==false);
  const newLines=state.mobileItems.filter(i=>i.type==="new_line");

  c.migrationLines=migrations.reduce((s,i)=>s+(Number(i.quantity)||0),0);
  c.keptMigrationLines=keptMigrations.reduce((s,i)=>s+(Number(i.quantity)||0),0);
  c.newLineCount=newLines.reduce((s,i)=>s+(Number(i.quantity)||0),0);
  c.currentLines=c.migrationLines;
  c.nextLines=c.keptMigrationLines+c.newLineCount;

  // O cálculo-base considera todas as migrações no cenário novo.
  const excludedMobile=migrations
    .filter(i=>i.keepInNew===false)
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||0),0);
  const excludedMobileGb=migrations
    .filter(i=>i.keepInNew===false)
    .reduce((s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||0),0);

  const excludedProducts=state.productItems
    .filter(i=>i.type==="migration"&&i.keepInNew===false)
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||0),0);

  const excludedInternetProduct=state.productItems
    .filter(i=>i.type==="migration"&&i.keepInNew===false&&i.category==="internet_movel")
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||0),0);

  c.newTotal=Math.max(0,(Number(c.newTotal)||0)-excludedMobile-excludedProducts);
  c.newGb=Math.max(0,(Number(c.newGb)||0)-excludedMobileGb);
  c.eligible=Math.max(0,(Number(c.eligible)||0)-excludedMobile-excludedInternetProduct);
  c.diff=Math.max(0,(Number(c.limit)||0)-c.eligible);

  return c;
};

const fenixMasterUpdateCalcBase=updateCalc;
updateCalc=function(){
  fenixMasterUpdateCalcBase();
  const c=calc();
  if($("currentPlanMeta"))$("currentPlanMeta").textContent=`${c.currentLines} linhas • ${c.currentGb} GB`;
  if($("newPlanMeta"))$("newPlanMeta").textContent=`${c.nextLines} linhas • ${c.newGb} GB${c.esimCount?` • ${c.esimCount} E-SIM`:""}`;
  if($("currentPlanTotal"))$("currentPlanTotal").textContent=money(c.currentTotal);
  if($("newPlanTotal"))$("newPlanTotal").textContent=money(c.newTotal);
};

// ============================================================
// VALIDAÇÃO E PAYLOAD
// ============================================================

const fenixMasterValidateBase=validate;
validate=function(){
  const errors=fenixMasterValidateBase().filter(msg=>!msg.includes("M das linhas"));
  for(const i of state.mobileItems){
    if(i.type==="migration"&&!String(i.m||"").trim()){
      errors.push("Informe o M de todas as linhas de migração.");break;
    }
  }
  for(const i of state.productItems){
    if(i.type!=="migration")continue;
    if(!String(i.currentDescription||"").trim()){errors.push("Informe o produto/benefício atual de toda migração de produto.");break}
    if((Number(i.currentValueCents)||0)<=0){errors.push("Informe o valor atual de toda migração de produto.");break}
    if(!String(i.m||"").trim()){errors.push("Informe o M de toda migração de produto.");break}
  }
  return [...new Set(errors)];
};

const fenixMasterPayloadBase=payload;
payload=function(){
  const p=fenixMasterPayloadBase();
  const c=calc();

  const currentProducts=state.productItems
    .filter(i=>i.type==="migration")
    .map(i=>({
      category:i.category,
      name:i.currentDescription||i.currentProductName||"Produto atual",
      variant:"",
      quantity:Number(i.quantity)||1,
      unitValueCents:Number(i.currentValueCents)||0,
      totalCents:(Number(i.currentValueCents)||0)*(Number(i.quantity)||1),
      type:"migration"
    }));

  const newProducts=state.productItems
    .filter(i=>i.type!=="migration"||i.keepInNew!==false)
    .map(i=>({
      category:i.category,name:i.name,variant:i.variant,
      quantity:Number(i.quantity)||1,
      unitValueCents:Number(i.priceCents)||0,
      totalCents:(Number(i.priceCents)||0)*(Number(i.quantity)||1),
      type:i.type
    }));

  const esimDetails=state.mobileItems
    .filter(i=>i.type==="esim")
    .map(i=>({
      quantity:Number(i.quantity)||1,gb:Number(i.gb)||0,
      totalGb:(Number(i.gb)||0)*(Number(i.quantity)||1),
      totalCents:(Number(i.priceCents)||0)*(Number(i.quantity)||1)
    }));

  p.current_plan_total_cents=c.currentTotal;
  p.new_plan_total_cents=c.newTotal;
  p.new_franchise_gb=c.newGb;
  p.migration_lines=c.migrationLines;
  p.esim_count=c.esimCount;

  p.composition={
    ...(p.composition||{}),
    mobileItems:JSON.parse(JSON.stringify(state.mobileItems)),
    products:JSON.parse(JSON.stringify(state.productItems))
  };

  p.internal_data={
    ...(p.internal_data||{}),
    sent_at:p.internal_data?.sent_at||new Date().toISOString(),
    mobileMigrations:state.mobileItems.filter(i=>i.type==="migration").map(i=>({
      m:i.m,gb:i.gb,keepInNew:i.keepInNew!==false,quantity:i.quantity
    })),
    productMigrations:state.productItems.filter(i=>i.type==="migration").map(i=>({
      currentName:i.currentDescription||i.currentProductName||"Produto atual",
      currentValueCents:Number(i.currentValueCents)||0,
      newName:[i.name,i.variant].filter(Boolean).join(" • "),
      newValueCents:(Number(i.priceCents)||0)*(Number(i.quantity)||1),
      keepInNew:i.keepInNew!==false,m:i.m,quantity:Number(i.quantity)||1
    }))
  };

  p.migration_m=state.mobileItems.filter(i=>i.type==="migration").map(i=>i.m).filter(Boolean).join(" | ")||null;

  p.client_snapshot={
    ...(p.client_snapshot||{}),
    current:{
      ...(p.client_snapshot?.current||{}),
      lines:c.currentLines,franchiseGb:c.currentGb,valueCents:c.currentTotal
    },
    next:{
      ...(p.client_snapshot?.next||{}),
      lines:c.nextLines,franchiseGb:c.newGb,esimCount:c.esimCount,valueCents:c.newTotal
    },
    currentServices:p.client_snapshot?.currentServices||[],
    newServices:p.client_snapshot?.newServices||p.client_snapshot?.services||[],
    currentProducts,
    newProducts,
    esimDetails,
    internal_data:p.internal_data
  };

  return p;
};

// ============================================================
// PROPOSTA — SEM DUPLICAÇÃO NO PLANO ATUAL
// PLANO NOVO preserva os blocos/estrutura esperados.
// ============================================================

function fenixCurrentProductsClean(products){
  const map=new Map();
  (products||[]).forEach(p=>{
    const key=`${String(p.name||"").trim().toLowerCase()}|${Number(p.unitValueCents)||0}`;
    if(!map.has(key))map.set(key,{...p,quantity:0,totalCents:0});
    const x=map.get(key);
    x.quantity+=(Number(p.quantity)||1);
    x.totalCents+=(Number(p.totalCents)||0);
  });
  return [...map.values()];
}
function fenixServiceNames(services){
  const names=fenixUniqueBy((services||[]).filter(Boolean),s=>String(s.name||"").trim().toLowerCase());
  if(!names.length)return "";
  return `<span class="plan-detail-title">SERVIÇOS JÁ ATIVOS</span>`+
    names.map(s=>`<div class="plan-detail-row"><strong>${esc(s.name)}</strong></div>`).join("");
}
function fenixCurrentProductRows(products){
  const list=fenixCurrentProductsClean(products);
  if(!list.length)return "";
  return `<span class="plan-detail-title">PRODUTOS JÁ ATIVOS</span>`+
    list.map(p=>`<div class="current-product-line"><strong>${esc(p.name||p.variant||"Produto")}</strong><span>${money(p.unitValueCents||0)}</span></div>`).join("");
}
function fenixNewProductRows(products){
  if(!products?.length)return "";
  return `<span class="plan-detail-title">PRODUTOS</span>`+
    products.map(p=>`<div class="plan-detail-row"><strong>${esc(v4CategoryLabel(p.category))} — ${esc(p.variant||p.name||"")}</strong><span>${p.quantity>1?`${p.quantity} un. • `:""}${money(p.totalCents||0)}</span></div>`).join("");
}

proposalHTML=function(s,num=""){
  const current=s.current||{},next=s.next||{};
  const currentServices=s.currentServices||[];
  const newServices=s.newServices||s.services||[];
  const currentProducts=s.currentProducts||[];
  const newProducts=s.newProducts||s.products||[];
  const esimDetails=s.esimDetails||[];
  const esimQty=esimDetails.reduce((a,e)=>a+(Number(e.quantity)||0),0);
  const esimGb=esimDetails.reduce((a,e)=>a+(Number(e.totalGb)||0),0);

  return `
    <div class="proposal-top">
      <h2>Vivo Empresas</h2>
      <p>PROPOSTA COMERCIAL</p>
      <small>Benefícios renovados por 24 meses</small>
    </div>

    <div class="client-box">
      <div><span>Razão Social</span><strong>${esc(s.clientName||"")}</strong></div>
      <div><span>CNPJ</span><strong>${esc(s.cnpj||"")}</strong></div>
      <div><span>Data</span><strong>${brDate(s.proposalDate)}</strong></div>
      <div><span>Validade</span><strong>${brDate(s.validityDate)}</strong></div>
      <div><span>Consultor</span><strong>${esc(s.consultant||"")}</strong></div>
      ${num?`<div><span>Proposta</span><strong>${esc(num)}</strong></div>`:""}
    </div>

    <div class="plan-grid">
      <div class="proposal-plan">
        <span>PLANO ATUAL</span>
        <div class="plan-row"><b>Linhas</b><b>${current.lines??0}</b></div>
        <div class="plan-row"><b>Franquia</b><b>${current.franchiseGb??0} GB</b></div>

        ${(currentServices.length||currentProducts.length)?`
          <div class="plan-details">
            ${fenixServiceNames(currentServices)}
            ${fenixCurrentProductRows(currentProducts)}
          </div>`:""}

        <div class="plan-price">${money(current.valueCents||0)} <small>/mês</small></div>
      </div>

      <div class="proposal-plan new">
        <span>PLANO NOVO</span>
        <div class="plan-row"><b>Linhas</b><b>${next.lines??0}</b></div>
        <div class="plan-row"><b>Franquia total</b><b>${next.franchiseGb??0} GB</b></div>

        ${esimQty?`<div class="proposal-esim-clean"><strong>CHIP VIRTUAL:</strong><span>${esimQty} — ${esimGb} GB</span></div>`:""}

        ${(newServices.length||newProducts.length)?`
          <div class="plan-details">
            ${fenixServiceNames(newServices)}
            ${fenixNewProductRows(newProducts)}
          </div>`:""}

        <div class="plan-price">${money(next.valueCents||0)} <small>/mês</small></div>
      </div>
    </div>

    <div class="proposal-benefits">
      ${(s.benefits||[]).map(b=>`<span>● ${esc(b)}</span>`).join("")}
    </div>`;
};

// ============================================================
// SALVAR PDF / IMAGEM = ENVIAR + NÚMERO FÊNIX + EXPORTAR
// ============================================================

async function fenixPersistProposal(){
  if(!state.previewPayload)return null;
  if(state.previewSavedProposal?.id)return state.previewSavedProposal;

  const payloadToSave={
    ...state.previewPayload,
    client_snapshot:JSON.parse(JSON.stringify(state.previewPayload.client_snapshot||{}))
  };

  const {data,error}=await db.from("proposals").insert(payloadToSave).select("*").single();
  if(error){toast(error.message||"Não foi possível enviar a proposta.","error");throw error}

  state.previewSavedProposal=data;
  if($("proposalDocument")){
    $("proposalDocument").innerHTML=proposalHTML(payloadToSave.client_snapshot,data.fenix_number||"");
  }
  await loadProposals();
  if(supervisor())await loadNotifications();
  renderDashboard();renderProposals();
  toast(`Proposta ${data.fenix_number||""} enviada e salva no histórico.`,"success");
  return data;
}
async function fenixSavePdf(){
  const b=$("pdfPreviewBtn");
  try{
    if(b){b.disabled=true;b.textContent="Salvando..."}
    const p=await fenixPersistProposal();if(!p)return;
    if(b)b.textContent="Gerando PDF...";
    saveAsPDF("proposalDocument");
  }finally{
    if(b){b.disabled=false;b.textContent="📄 Salvar em PDF"}
  }
}
async function fenixSaveImage(){
  const b=$("imagePreviewBtn");
  try{
    if(b){b.disabled=true;b.textContent="Salvando..."}
    const p=await fenixPersistProposal();if(!p)return;
    if(b)b.textContent="Gerando imagem...";
    const name=(p.fenix_number||"proposta-fenix").replace(/[^\w\-]+/g,"_");
    await v10SaveProposalImage("proposalDocument",`${name}.png`);
  }finally{
    if(b){b.disabled=false;b.textContent="📸 Salvar imagem"}
  }
}
function fenixBindProposalExport(){
  $("printPreviewBtn")?.remove();
  $("saveProposalBtn")?.remove();
  [["pdfPreviewBtn",fenixSavePdf],["imagePreviewBtn",fenixSaveImage]].forEach(([id,fn])=>{
    const old=$(id);if(!old)return;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.onclick=fn;
  });
}

const fenixMasterPreviewBase=preview;
preview=function(){
  state.previewSavedProposal=null;
  const r=fenixMasterPreviewBase();
  setTimeout(fenixBindProposalExport,40);
  return r;
};

// ============================================================
// PROPOSTAS — CANCELAMENTO REAL + REMOÇÃO VISUAL
// ============================================================

async function statusChange(id,status){
  const p=state.proposals.find(x=>String(x.id)===String(id));
  if(!p)return;
  const now=new Date().toISOString();
  const internal={...(p.internal_data||{})};
  if(status==="Aprovada")internal.approved_at=now;
  if(status==="Cancelada")internal.cancelled_at=now;

  const {error}=await db.from("proposals").update({status,internal_data:internal}).eq("id",id);
  if(error)return toast("Não foi possível alterar o status.","error");

  try{
    await db.from("proposal_events").insert({
      proposal_id:id,actor_id:state.session.user.id,event_type:"status_alterado",
      details:{status,changed_at:now}
    });
  }catch(e){}

  await loadProposals();
  renderProposals();renderDashboard();
  toast(`Status alterado para ${status}.`,"success");
}

function fenixProposalPeriodMatch(p){
  const period=$("proposalPeriodFilter")?.value||"";
  const d=fenixStatusDate(p),parts=fenixDateKey(d),now=fenixDateKey(new Date());
  if(!period)return true;
  if(period==="today")return parts.date===now.date;
  if(period==="month")return parts.month===now.month;
  if(period==="3months"||period==="6months")return fenixWithinPeriod(d,period);
  if(period==="selected_month"){
    const m=$("proposalMonthFilter")?.value||"";
    return !m||parts.month===m;
  }
  if(period==="day"){
    const day=$("proposalDateFilter")?.value||"";
    return !day||parts.date===day;
  }
  return true;
}

filtered=function(){
  const q=$("proposalSearch")?.value.trim().toLowerCase()||"";
  const st=$("proposalStatusFilter")?.value||"";
  const consultant=supervisor()?($("proposalConsultantFilter")?.value||""):"";

  return state.proposals.filter(p=>{
    if(p.dashboard_hidden)return false;
    if(st&&p.status!==st)return false;
    if(consultant&&String(p.consultant_id)!==String(consultant))return false;
    if(!fenixProposalPeriodMatch(p))return false;
    if(q&&!`${p.fenix_number||""} ${p.client_name||""} ${p.cnpj||""}`.toLowerCase().includes(q))return false;
    return true;
  });
};

table=function(list,actions=true){
  const select=actions&&supervisor();
  return `<table>
    <thead><tr>
      ${select?'<th><input id="proposalSelectAll" type="checkbox"></th>':""}
      <th>Proposta</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Data</th>${actions?"<th>Ações</th>":""}
    </tr></thead>
    <tbody>${list.map(p=>`
      <tr>
        ${select?`<td><input class="proposal-row-check" type="checkbox" value="${p.id}"></td>`:""}
        <td><strong>${esc(p.fenix_number||"-")}</strong></td>
        <td>${esc(p.client_name||"")}</td>
        <td>${money(p.new_plan_total_cents||0)}</td>
        <td><span class="status-pill status-${p.status}">${p.status}</span></td>
        <td>${brDateTime(fenixStatusDate(p).toISOString())}</td>
        ${actions?`<td><div class="row-actions">
          <button class="mini-btn" data-viewp="${p.id}">Ver</button>
          <button class="mini-btn" data-resend="${p.id}">Reenviar</button>
          <button class="mini-btn" data-dup="${p.id}">Duplicar</button>
          ${p.status==="Enviada"?`<button class="mini-btn" data-status="${p.id}" data-value="Aprovada">Aprovar</button>`:""}
          ${p.status!=="Cancelada"&&supervisor()?`<button class="mini-btn" data-status="${p.id}" data-value="Cancelada">Cancelar</button>`:""}
        </div></td>`:""}
      </tr>`).join("")}
    </tbody>
  </table>`;
};

const fenixMasterBindRowsBase=bindRows;
bindRows=function(){
  fenixMasterBindRowsBase();
  const all=$("proposalSelectAll");
  if(all)all.onchange=()=>$$(".proposal-row-check").forEach(c=>c.checked=all.checked);
};

async function fenixBulkCancel(){
  if(!supervisor())return;
  const ids=$$(".proposal-row-check:checked").map(c=>c.value);
  if(!ids.length)return toast("Selecione pelo menos uma proposta.","error");
  if(!confirm(`Cancelar ${ids.length} proposta(s)?`))return;

  const now=new Date().toISOString();
  for(const id of ids){
    const p=state.proposals.find(x=>String(x.id)===String(id));
    if(!p||p.status==="Cancelada")continue;
    const internal={...(p.internal_data||{}),cancelled_at:now};
    const {error}=await db.from("proposals").update({status:"Cancelada",internal_data:internal}).eq("id",id);
    if(error)return toast("Não foi possível cancelar todas as propostas.","error");
    try{
      await db.from("proposal_events").insert({
        proposal_id:id,actor_id:state.session.user.id,event_type:"status_alterado",
        details:{status:"Cancelada",changed_at:now,bulk:true}
      });
    }catch(e){}
  }

  await loadProposals();
  renderProposals();renderDashboard();
  toast("Propostas selecionadas canceladas.","success");
}

async function fenixHideCancelled(){
  if(!supervisor())return;
  const rows=filtered().filter(p=>p.status==="Cancelada");
  if(!rows.length)return toast("Não há propostas canceladas neste filtro.","error");
  if(!confirm(`Remover ${rows.length} proposta(s) cancelada(s) da visualização?`))return;

  const {error}=await db.from("proposals")
    .update({dashboard_hidden:true,dashboard_hidden_at:new Date().toISOString()})
    .in("id",rows.map(p=>p.id));
  if(error)return toast("Não foi possível remover as canceladas.","error");

  await loadProposals();renderProposals();renderDashboard();
  toast("Canceladas removidas da visualização. Os registros continuam no banco.","success");
}

// ============================================================
// DASHBOARD — SOMENTE APROVADAS
// ============================================================

function fenixApprovedList(){
  const period=$("dashboardPeriod")?.value||"month";
  const month=$("dashboardMonthFilter")?.value||"";
  const consultant=supervisor()?($("dashboardConsultantFilter")?.value||""):"";
  return state.proposals.filter(p=>{
    if(p.dashboard_hidden||p.status!=="Aprovada")return false;
    if(consultant&&String(p.consultant_id)!==String(consultant))return false;
    return fenixWithinPeriod(fenixStatusDate(p),period,month);
  });
}
function fenixProposalRevenue(p){
  const comp=p.composition||{};
  const esim=(comp.mobileItems||[]).filter(i=>i.type==="esim")
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||0),0);
  const prod=(comp.products||[]).reduce((s,i)=>{
    let counts=i.countsAsRevenue;
    if(counts==null){
      const cat=state.products.find(x=>String(x.id)===String(i.productId));
      counts=!!cat?.counts_as_revenue;
    }
    return counts?s+(Number(i.priceCents)||0)*(Number(i.quantity)||0):s;
  },0);
  return esim+prod;
}
renderDashboard=function(){
  const list=fenixApprovedList();
  const count=list.length;
  const total=list.reduce((s,p)=>s+(Number(p.new_plan_total_cents)||0),0);
  const migrations=list.reduce((s,p)=>s+(Number(p.migration_lines)||0),0);
  const revenue=list.reduce((s,p)=>s+fenixProposalRevenue(p),0);
  const esims=list.reduce((s,p)=>s+(Number(p.esim_count)||0),0);

  if($("metricApproved"))$("metricApproved").textContent=count;
  if($("approvedTotal"))$("approvedTotal").textContent=money(total);
  if($("approvedMigration"))$("approvedMigration").textContent=migrations;
  if($("approvedRevenue"))$("approvedRevenue").textContent=money(revenue);

  if($("metricValue"))$("metricValue").textContent=money(total);
  if($("metricMigrations"))$("metricMigrations").textContent=migrations;
  if($("metricEsims"))$("metricEsims").textContent=esims;

  const recent=[...list].sort((a,b)=>fenixStatusDate(b)-fenixStatusDate(a));
  if($("recentProposals"))$("recentProposals").innerHTML=recent.length?table(recent.slice(0,5),false):'<div class="empty-state">Nenhuma proposta aprovada neste período.</div>';

  if(typeof v9RenderRanking==="function")v9RenderRanking();
};

// ============================================================
// NOVIDADES — EMOJIS + PÚBLICO + ROTAÇÃO
// ============================================================

function fenixNewsItems(){
  const n=v9Setting("team_news");
  if(Array.isArray(n.items))return n.items;
  if(n.active&&(n.title||n.message))return [{
    id:"legacy",title:n.title||"",message:n.message||"",active:true,
    audience:"all",published_at:n.published_at||new Date().toISOString()
  }];
  return [];
}
function fenixVisibleNews(){
  return fenixNewsItems().filter(n=>n.active!==false&&(n.audience==="all"||String(n.audience)===String(state.profile?.id)));
}
function v9RenderNews(){
  const card=$("teamNewsCard");if(!card)return;
  const items=fenixVisibleNews();
  if(!items.length){card.classList.add("hidden");clearInterval(state.newsRotationTimer);return}
  card.classList.remove("hidden");
  state.newsRotationIndex=Math.min(state.newsRotationIndex,items.length-1);
  const n=items[state.newsRotationIndex];
  $("teamNewsTitle").textContent=n.title||"Novidades da Equipe";
  $("teamNewsMessage").textContent=n.message||"";
  if($("teamNewsRotation")){
    $("teamNewsRotation").classList.toggle("hidden",items.length<=1);
    $("teamNewsCounter").textContent=`${state.newsRotationIndex+1} de ${items.length}`;
  }
  clearInterval(state.newsRotationTimer);
  if(items.length>1)state.newsRotationTimer=setInterval(()=>{
    state.newsRotationIndex=(state.newsRotationIndex+1)%items.length;v9RenderNews();
  },8000);
}
function fenixFillNewsAudience(){
  const el=$("teamNewsAudience");if(!el||!supervisor())return;
  const cur=el.value||"all";
  el.innerHTML='<option value="all">Todos os consultores</option>'+
    state.profiles.filter(p=>p.active!==false&&p.role!=="supervisora")
      .map(p=>`<option value="${p.id}">${esc(p.full_name||p.email||"Consultor")}</option>`).join("");
  el.value=[...el.options].some(o=>o.value===cur)?cur:"all";
}
function fenixRenderNewsAdmin(){
  const el=$("teamNewsAdminList");if(!el||!supervisor())return;
  const items=fenixNewsItems();
  el.innerHTML=items.length?items.map(n=>{
    const audience=n.audience==="all"?"Todos":(state.profiles.find(p=>String(p.id)===String(n.audience))?.full_name||"Consultor");
    return `<div class="news-admin-item"><div><strong>${esc(n.title||"Sem título")}</strong><p>${esc(n.message||"")}</p><small>${n.active!==false?"Ativa":"Inativa"} • ${esc(audience)}</small></div><div class="row-actions"><button class="mini-btn" data-news-edit="${n.id}">Editar</button><button class="mini-btn" data-news-remove="${n.id}">Remover</button></div></div>`;
  }).join(""):'<div class="empty-state">Nenhuma novidade cadastrada.</div>';
  $$("[data-news-edit]").forEach(b=>b.onclick=()=>fenixEditNews(b.dataset.newsEdit));
  $$("[data-news-remove]").forEach(b=>b.onclick=()=>fenixRemoveNews(b.dataset.newsRemove));
}
function fenixClearNews(){
  if($("teamNewsEditId"))$("teamNewsEditId").value="";
  if($("teamNewsAdminTitle"))$("teamNewsAdminTitle").value="";
  if($("teamNewsAdminMessage"))$("teamNewsAdminMessage").value="";
  if($("teamNewsAudience"))$("teamNewsAudience").value="all";
  if($("teamNewsAdminActive"))$("teamNewsAdminActive").value="yes";
}
async function fenixSaveNews(e){
  e.preventDefault();
  const items=[...fenixNewsItems()];
  const id=$("teamNewsEditId")?.value||crypto.randomUUID();
  const item={
    id,title:$("teamNewsAdminTitle").value.trim(),
    message:$("teamNewsAdminMessage").value.trim(),
    audience:$("teamNewsAudience")?.value||"all",
    active:$("teamNewsAdminActive").value==="yes",
    published_at:new Date().toISOString()
  };
  if(!item.title&&!item.message)return toast("Informe um título ou mensagem.","error");
  const idx=items.findIndex(x=>String(x.id)===String(id));
  if(idx>=0)items[idx]=item;else items.push(item);
  await v9SaveSetting("team_news",{items});
  fenixClearNews();v9RenderNews();fenixRenderNewsAdmin();toast("Novidade salva.","success");
}
function fenixEditNews(id){
  const n=fenixNewsItems().find(x=>String(x.id)===String(id));if(!n)return;
  $("teamNewsEditId").value=n.id;$("teamNewsAdminTitle").value=n.title||"";
  $("teamNewsAdminMessage").value=n.message||"";$("teamNewsAudience").value=n.audience||"all";
  $("teamNewsAdminActive").value=n.active!==false?"yes":"no";
}
async function fenixRemoveNews(id){
  if(!confirm("Remover esta novidade?"))return;
  await v9SaveSetting("team_news",{items:fenixNewsItems().filter(x=>String(x.id)!==String(id))});
  fenixClearNews();v9RenderNews();fenixRenderNewsAdmin();
}

// ============================================================
// DÚVIDAS FREQUENTES
// ============================================================

function fenixFaqItems(){
  const s=v9Setting("faq_center");
  return Array.isArray(s.items)&&s.items.length?s.items:FENIX_MASTER_FAQS;
}
function fenixRenderFaq(){
  const el=$("faqResults");if(!el)return;
  const q=fenixNormalize($("faqSearch")?.value||"");
  const list=fenixFaqItems().filter(i=>i.active!==false).filter(i=>{
    if(!q)return true;
    const hay=fenixNormalize([i.title,i.question,i.answer,...(i.keywords||[])].join(" "));
    return q.split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
  });
  el.innerHTML=list.length?list.map(i=>`
    <article class="faq-card">
      <h4>${esc(i.title)}</h4><p class="faq-question">${esc(i.question)}</p>
      <div class="faq-answer">${esc(i.answer)}</div>
      <div class="faq-keywords">${(i.keywords||[]).map(k=>`<span class="faq-keyword">${esc(k)}</span>`).join("")}</div>
    </article>`).join(""):'<div class="empty-state">Nenhuma orientação encontrada.</div>';
}
function fenixRenderFaqAdmin(){
  const el=$("faqAdminList");if(!el||!supervisor())return;
  el.innerHTML=fenixFaqItems().map(i=>`
    <div class="faq-admin-item"><div><strong>${esc(i.title)}</strong><small>${i.active!==false?"Ativa":"Inativa"}</small></div>
    <div class="row-actions"><button class="mini-btn" data-faq-edit="${i.id}">Editar</button><button class="mini-btn" data-faq-remove="${i.id}">Excluir</button></div></div>`).join("");
  $$("[data-faq-edit]").forEach(b=>b.onclick=()=>fenixEditFaq(b.dataset.faqEdit));
  $$("[data-faq-remove]").forEach(b=>b.onclick=()=>fenixRemoveFaq(b.dataset.faqRemove));
}
function fenixClearFaq(){
  ["faqEditId","faqAdminTitle","faqAdminQuestion","faqAdminAnswer","faqAdminKeywords"].forEach(id=>{if($(id))$(id).value=""});
  if($("faqAdminActive"))$("faqAdminActive").value="yes";
}
function fenixEditFaq(id){
  const i=fenixFaqItems().find(x=>String(x.id)===String(id));if(!i)return;
  $("faqEditId").value=i.id;$("faqAdminTitle").value=i.title||"";
  $("faqAdminQuestion").value=i.question||"";$("faqAdminAnswer").value=i.answer||"";
  $("faqAdminKeywords").value=(i.keywords||[]).join(", ");
  $("faqAdminActive").value=i.active!==false?"yes":"no";
}
async function fenixSaveFaq(e){
  e.preventDefault();
  const items=[...fenixFaqItems()],id=$("faqEditId").value||crypto.randomUUID();
  const item={
    id,title:$("faqAdminTitle").value.trim(),question:$("faqAdminQuestion").value.trim(),
    answer:$("faqAdminAnswer").value.trim(),
    keywords:$("faqAdminKeywords").value.split(",").map(x=>x.trim()).filter(Boolean),
    active:$("faqAdminActive").value==="yes"
  };
  const idx=items.findIndex(x=>String(x.id)===String(id));
  if(idx>=0)items[idx]=item;else items.push(item);
  await v9SaveSetting("faq_center",{items});fenixClearFaq();fenixRenderFaq();fenixRenderFaqAdmin();
  toast("Dúvida salva.","success");
}
async function fenixRemoveFaq(id){
  if(!confirm("Excluir esta dúvida?"))return;
  await v9SaveSetting("faq_center",{items:fenixFaqItems().filter(x=>String(x.id)!==String(id))});
  fenixRenderFaq();fenixRenderFaqAdmin();
}

// ============================================================
// BOTÃO ATUALIZAR EM TODAS AS ABAS
// ============================================================

async function fenixRefreshView(viewId,button){
  const original=button?.textContent||"↻ Atualizar";
  try{
    if(button){button.disabled=true;button.textContent="Atualizando..."}
    if(viewId==="dashboardView"){
      await loadProposals();renderDashboard();v9RenderNews();await v9RenderMaterials?.();
    }else if(viewId==="calculatorView"){
      await loadCatalogs();renderAll();
    }else if(viewId==="proposalsView"){
      await loadProposals();renderProposals();
    }else if(viewId==="faqView"){
      await v9LoadSettings();fenixRenderFaq();
    }else if(viewId==="devicesProposalView"){
      fenixDevicesRender();
    }else if(viewId==="notificationsView"){
      if(supervisor())await loadNotifications();renderNotifications();
    }else if(viewId==="adminView"){
      await v9LoadSettings();if(supervisor()){await loadProfiles();renderProfiles();fenixFillNewsAudience();fenixRenderNewsAdmin();fenixRenderFaqAdmin()}
      if(typeof v9RenderAdminProducts==="function")v9RenderAdminProducts();
    }
    if(button)button.textContent="Atualizado ✓";
    setTimeout(()=>{if(button){button.disabled=false;button.textContent=original}},900);
  }catch(e){
    console.error(e);if(button){button.disabled=false;button.textContent=original}
    toast("Não foi possível atualizar esta aba.","error");
  }
}

// ============================================================
// PROPOSTA DE APARELHOS — INTEGRADA
// ============================================================

const fenixDevices={
  workbook:null,original:[],working:[],filtered:[],columns:[]
};
function fenixDevicesStatus(msg){if($("devicesStatus"))$("devicesStatus").textContent=msg}
function fenixDeviceVal(v){return v==null?"":String(v).trim()}
function fenixDeviceUnique(col,data){
  return [...new Set(data.map(r=>fenixDeviceVal(r[col])).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true,sensitivity:"base"}));
}
function fenixDeviceNumeric(col,data){
  const vals=data.map(r=>fenixDeviceVal(r[col])).filter(Boolean).slice(0,50);
  return vals.length&&vals.every(v=>!isNaN(v.replace(",",".")));
}
async function fenixDevicesFileChanged(e){
  const file=e.target.files?.[0];if(!file)return;
  if(typeof XLSX==="undefined")return toast("Biblioteca de Excel não carregou.","error");
  fenixDevicesStatus("Lendo arquivo...");
  const data=await file.arrayBuffer();
  fenixDevices.workbook=XLSX.read(data,{type:"array",cellDates:true});
  $("devicesSheetSelect").innerHTML=fenixDevices.workbook.SheetNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  $("devicesSheetSelect").disabled=false;
  fenixDevicesStatus("Arquivo pronto para carregar");
}
function fenixDevicesLoad(){
  if(!fenixDevices.workbook)return toast("Selecione uma planilha primeiro.","error");
  const name=$("devicesSheetSelect").value||fenixDevices.workbook.SheetNames[0];
  const ws=fenixDevices.workbook.Sheets[name];
  const data=XLSX.utils.sheet_to_json(ws,{defval:""});
  if(!data.length)return toast("A aba selecionada está vazia.","error");
  fenixDevices.original=data.map(row=>{
    const o={};Object.keys(row).forEach(k=>o[String(k).trim()]=row[k]);return o;
  });
  fenixDevices.working=[...fenixDevices.original];
  fenixDevices.columns=Object.keys(fenixDevices.working[0]||{});
  $("devicesTotalRows").textContent=fenixDevices.original.length;
  $("devicesDedupRows").textContent=fenixDevices.working.length;
  $("devicesRemoveDupBtn").disabled=false;$("devicesClearFiltersBtn").disabled=false;$("devicesGenerateProposalBtn").disabled=false;
  fenixDevicesBuildFilters();fenixDevicesApplyFilters();fenixDevicesStatus("Planilha carregada com sucesso");
}
function fenixDevicesBuildFilters(){
  const c=$("devicesFiltersContainer");if(!c)return;c.innerHTML="";
  fenixDevices.columns.forEach(col=>{
    const wrap=document.createElement("label");wrap.textContent=col;
    const upper=col.toUpperCase(),unique=fenixDeviceUnique(col,fenixDevices.working);
    let input;
    if(upper==="SALDO"){
      input=document.createElement("input");input.type="number";input.min="0";input.placeholder="Mínimo";
      input.dataset.filterType="min";
    }else if(unique.length&&unique.length<=20){
      input=document.createElement("select");
      input.innerHTML='<option value="">Todos</option>'+unique.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
      input.dataset.filterType="exact";
    }else{
      input=document.createElement("input");
      input.type=fenixDeviceNumeric(col,fenixDevices.working)?"number":"text";
      input.placeholder=input.type==="number"?"Valor exato":"Digite para filtrar";
      input.dataset.filterType=input.type==="number"?"exact":"contains";
    }
    input.dataset.column=col;input.oninput=fenixDevicesApplyFilters;input.onchange=fenixDevicesApplyFilters;
    wrap.appendChild(input);c.appendChild(wrap);
  });
}
function fenixDevicesApplyFilters(){
  const inputs=[...$("devicesFiltersContainer").querySelectorAll("input,select")];
  fenixDevices.filtered=fenixDevices.working.filter(row=>inputs.every(input=>{
    const fv=fenixDeviceVal(input.value);if(!fv)return true;
    const cv=fenixDeviceVal(row[input.dataset.column]),type=input.dataset.filterType;
    if(type==="min"){
      const a=parseFloat(cv.replace(",",".")),b=parseFloat(fv);return !isNaN(a)&&!isNaN(b)&&a>=b;
    }
    if(type==="exact")return cv.toLowerCase()===fv.toLowerCase();
    return cv.toLowerCase().includes(fv.toLowerCase());
  }));
  $("devicesFilteredRows").textContent=fenixDevices.filtered.length;
  fenixDevicesRender();
}
function fenixDevicesRender(){
  const head=$("devicesThead"),body=$("devicesTbody");if(!head||!body)return;
  if(!fenixDevices.columns.length){head.innerHTML="";body.innerHTML="";return}
  head.innerHTML="<tr>"+fenixDevices.columns.map(c=>`<th>${esc(c)}</th>`).join("")+"</tr>";
  body.innerHTML=fenixDevices.filtered.slice(0,1000).map(row=>"<tr>"+fenixDevices.columns.map(c=>`<td>${esc(fenixDeviceVal(row[c]))}</td>`).join("")+"</tr>").join("");
}
function fenixDevicesRemoveDup(){
  const col=fenixDevices.columns.find(c=>c.toUpperCase()==="NOME_COMERCIAL");
  if(!col)return toast("A coluna NOME_COMERCIAL não foi encontrada.","error");
  const seen=new Set();
  fenixDevices.working=fenixDevices.working.filter(row=>{
    const k=fenixDeviceVal(row[col]).toLowerCase();if(!k)return true;if(seen.has(k))return false;seen.add(k);return true;
  });
  $("devicesDedupRows").textContent=fenixDevices.working.length;
  fenixDevicesBuildFilters();fenixDevicesApplyFilters();fenixDevicesStatus("Duplicados removidos");
}
function fenixDevicesClearFilters(){
  [...$("devicesFiltersContainer").querySelectorAll("input,select")].forEach(x=>x.value="");
  fenixDevicesApplyFilters();fenixDevicesStatus("Filtros limpos");
}
function fenixDevicesMoneyInstallment(v,div,add){
  const n=parseFloat(String(v??"").replace(",","."));if(isNaN(n))return "-";
  return "R$ "+((n/div)+add).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fenixDevicesGenerate(){
  if(!fenixDevices.filtered.length)return toast("Nenhum aparelho filtrado.","error");
  const cols=fenixDevices.columns;
  const col10=cols.find(c=>c.toUpperCase()==="VALORATE10X")||cols.find(c=>c.toUpperCase().includes("10"));
  const col24=cols.find(c=>c.toUpperCase()==="VALORATE24X")||cols.find(c=>c.toUpperCase().includes("24"));
  const colName=cols.find(c=>c.toUpperCase()==="NOME_COMERCIAL")||cols[0];
  const add10=parseFloat($("devicesAdd10")?.value||"0")||0,add24=parseFloat($("devicesAdd24")?.value||"0")||0;

  $("devicesProposalDocument").innerHTML=`
    <div class="proposal-top"><h2>Vivo Empresas</h2><p>PROPOSTA DE APARELHOS</p><small>Condições conforme estoque carregado</small></div>
    <table class="devices-proposal-table">
      <thead><tr><th>Aparelho</th><th>10X</th><th>24X</th></tr></thead>
      <tbody>${fenixDevices.filtered.map(r=>`<tr><td>${esc(fenixDeviceVal(r[colName]))}</td><td>${col10?fenixDevicesMoneyInstallment(r[col10],10,add10):"-"}</td><td>${col24?fenixDevicesMoneyInstallment(r[col24],24,add24):"-"}</td></tr>`).join("")}</tbody>
    </table>
    <div class="devices-proposal-count">${fenixDevices.filtered.length} aparelho(s) listado(s)</div>`;
  $("devicesProposalModal").classList.remove("hidden");
}
async function fenixDevicesSaveImage(){
  await v10SaveProposalImage("devicesProposalDocument","proposta-aparelhos-fenix.png");
}

// ============================================================
// BINDINGS / BOOTSTRAP
// ============================================================

function fenixFillDashboardConsultants(){
  const el=$("dashboardConsultantFilter");if(!el||!supervisor())return;
  const cur=el.value;
  el.innerHTML='<option value="">Todos os consultores</option>'+
    state.profiles.filter(p=>p.active!==false).map(p=>`<option value="${p.id}">${esc(p.full_name||p.email||"Consultor")}</option>`).join("");
  el.value=cur;
}
async function fenixMasterDefaults(){
  if(supervisor()){
    const f=v9Setting("faq_center");
    if(!Array.isArray(f.items)||!f.items.length){
      try{await v9SaveSetting("faq_center",{items:FENIX_MASTER_FAQS})}catch(e){}
    }
  }
}
function fenixMasterBindings(){
  fenixBindProposalExport();

  if($("bulkCancelProposalsBtn"))$("bulkCancelProposalsBtn").onclick=fenixBulkCancel;
  if($("hideCancelledProposalsBtn"))$("hideCancelledProposalsBtn").onclick=fenixHideCancelled;

  if($("dashboardPeriod"))$("dashboardPeriod").onchange=renderDashboard;
  if($("dashboardMonthFilter"))$("dashboardMonthFilter").onchange=renderDashboard;
  if($("dashboardConsultantFilter"))$("dashboardConsultantFilter").onchange=renderDashboard;

  $$("[data-refresh-view]").forEach(b=>b.onclick=()=>fenixRefreshView(b.dataset.refreshView,b));

  if($("teamNewsForm"))$("teamNewsForm").onsubmit=fenixSaveNews;
  if($("clearTeamNewsFormBtn"))$("clearTeamNewsFormBtn").onclick=fenixClearNews;
  if($("teamNewsPrevBtn"))$("teamNewsPrevBtn").onclick=()=>{
    const a=fenixVisibleNews();if(!a.length)return;state.newsRotationIndex=(state.newsRotationIndex-1+a.length)%a.length;v9RenderNews();
  };
  if($("teamNewsNextBtn"))$("teamNewsNextBtn").onclick=()=>{
    const a=fenixVisibleNews();if(!a.length)return;state.newsRotationIndex=(state.newsRotationIndex+1)%a.length;v9RenderNews();
  };

  if($("faqSearch"))$("faqSearch").oninput=fenixRenderFaq;
  if($("faqAdminForm"))$("faqAdminForm").onsubmit=fenixSaveFaq;
  if($("faqAdminClearBtn"))$("faqAdminClearBtn").onclick=fenixClearFaq;

  if($("devicesFileInput"))$("devicesFileInput").onchange=fenixDevicesFileChanged;
  if($("devicesLoadBtn"))$("devicesLoadBtn").onclick=fenixDevicesLoad;
  if($("devicesRemoveDupBtn"))$("devicesRemoveDupBtn").onclick=fenixDevicesRemoveDup;
  if($("devicesClearFiltersBtn"))$("devicesClearFiltersBtn").onclick=fenixDevicesClearFilters;
  if($("devicesGenerateProposalBtn"))$("devicesGenerateProposalBtn").onclick=fenixDevicesGenerate;
  $$("[data-close-devices-proposal]").forEach(x=>x.onclick=()=>$("devicesProposalModal").classList.add("hidden"));
  if($("devicesPdfBtn"))$("devicesPdfBtn").onclick=()=>saveAsPDF("devicesProposalDocument");
  if($("devicesImageBtn"))$("devicesImageBtn").onclick=fenixDevicesSaveImage;

  // Campos antigos globais de migração não devem interferir.
  ["mobileMWrapper","fenixMobileMigrationExtra","mobileKeepNewWrapper",
   "productCurrentDescriptionWrapper","fenixProductMigrationExtra","productKeepNewWrapper",
   "currentProductValueWrapper","productMWrapper"].forEach(id=>$(id)?.classList.add("hidden"));

  fenixFillDashboardConsultants();fenixFillNewsAudience();
  fenixRenderNewsAdmin();fenixRenderFaqAdmin();fenixRenderFaq();v9RenderNews();
}

const fenixMasterBootstrapBase=bootstrap;
bootstrap=async function(){
  await fenixMasterBootstrapBase();
  await fenixMasterDefaults();
  if(supervisor())await loadProfiles();
  fenixMasterBindings();
  renderMobile();renderProducts();updateCalc();renderDashboard();renderProposals();
};

window.addEventListener("load",()=>setTimeout(()=>{
  fenixMasterBindings();
  renderMobile();renderProducts();updateCalc();
},2200));


// ============================================================
// FIX — REBIND DOS BOTÕES PARA USAR AS FUNÇÕES CONSOLIDADAS
// O bind antigo guardava referências das funções antigas.
// ============================================================

function fenixRebindConsolidatedActions(){
  const addMobileBtn = $("addMobileBtn");
  if(addMobileBtn) addMobileBtn.onclick = addMobile;

  const addProductBtn = $("addProductBtn");
  if(addProductBtn) addProductBtn.onclick = addProduct;

  const previewBtn = $("previewProposalBtn");
  if(previewBtn) previewBtn.onclick = preview;

  [
    "mobileMWrapper",
    "fenixMobileMigrationExtra",
    "mobileKeepNewWrapper",
    "productCurrentDescriptionWrapper",
    "fenixProductMigrationExtra",
    "productKeepNewWrapper",
    "currentProductValueWrapper",
    "productMWrapper"
  ].forEach(id => {
    const el = $(id);
    if(el) el.classList.add("hidden");
  });

  if($("mobileType")){
    $("mobileType").onchange = () => {
      ["mobileMWrapper","fenixMobileMigrationExtra","mobileKeepNewWrapper"]
        .forEach(id => $(id)?.classList.add("hidden"));
    };
  }

  if($("productType")){
    $("productType").onchange = () => {
      [
        "productCurrentDescriptionWrapper",
        "fenixProductMigrationExtra",
        "productKeepNewWrapper",
        "currentProductValueWrapper",
        "productMWrapper"
      ].forEach(id => $(id)?.classList.add("hidden"));
    };
  }
}

window.addEventListener("load", () => {
  setTimeout(fenixRebindConsolidatedActions, 2600);
});

const fenixRebindBootstrapBase = bootstrap;
bootstrap = async function(){
  await fenixRebindBootstrapBase();
  fenixRebindConsolidatedActions();
  renderMobile();
  renderProducts();
  updateCalc();
};


// ============================================================
// FIX ETAPA 5 — MIGRAÇÃO DE PRODUTO SEM CAMPOS DUPLICADOS
// ============================================================

function fenixBindProductMigrationClean(){
  const oldBtn=$("addProductBtn");
  if(oldBtn){
    // Clona o botão para eliminar listeners antigos acumulados.
    const cleanBtn=oldBtn.cloneNode(true);
    oldBtn.replaceWith(cleanBtn);
    cleanBtn.onclick=addProduct;
  }

  // O seletor de tipo não abre mais Valor Atual/M no topo.
  // Esses dados são preenchidos somente na linha adicionada.
  if($("productType")){
    $("productType").onchange=()=>{
      [
        "currentProductValueWrapper",
        "productMWrapper",
        "productCurrentDescriptionWrapper",
        "fenixProductMigrationExtra",
        "productKeepNewWrapper"
      ].forEach(id=>$(id)?.classList.add("hidden"));

      // Mantém apenas regras visuais específicas de Aparelho,
      // se existirem na versão base.
      try{
        if(typeof renderProductOptions==="function") renderProductOptions();
      }catch(e){}
    };
  }
}

window.addEventListener("load",()=>{
  setTimeout(fenixBindProductMigrationClean,2900);
});


// ============================================================
// AJUSTES FINAIS — BOTÕES DA PROPOSTA + NOMENCLATURA DE PRODUTOS
// ============================================================

// ---------- FECHAR PROPOSTA ----------
function fenixCloseProposalModal(){
  $("proposalModal")?.classList.add("hidden");
}

// ---------- SALVAR/ENVIAR ANTES DE EXPORTAR ----------
async function fenixPersistAndReturnProposal(){
  if(!state.previewPayload){
    toast("Gere a proposta antes de salvar.", "error");
    return null;
  }
  if(state.previewSavedProposal?.id){
    return state.previewSavedProposal;
  }

  const payloadToSave = {
    ...state.previewPayload,
    client_snapshot: JSON.parse(JSON.stringify(state.previewPayload.client_snapshot || {}))
  };

  const {data,error} = await db
    .from("proposals")
    .insert(payloadToSave)
    .select("*")
    .single();

  if(error){
    console.error(error);
    toast(error.message || "Não foi possível enviar a proposta.", "error");
    throw error;
  }

  state.previewSavedProposal = data;

  if($("proposalDocument")){
    $("proposalDocument").innerHTML = proposalHTML(
      payloadToSave.client_snapshot,
      data.fenix_number || ""
    );
  }

  await loadProposals();
  if(supervisor()) await loadNotifications();

  try{ renderProposals(); }catch(e){}
  try{ renderDashboard(); }catch(e){}

  return data;
}

async function fenixPdfSend(){
  const btn=$("pdfPreviewBtn");
  try{
    if(btn){btn.disabled=true;btn.textContent="Salvando...";}
    const saved=await fenixPersistAndReturnProposal();
    if(!saved)return;

    if(btn)btn.textContent="Gerando PDF...";
    saveAsPDF("proposalDocument");

    toast(`Proposta ${saved.fenix_number||""} enviada e PDF gerado.`,"success");
  }catch(e){
    console.error(e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="📄 Salvar em PDF";}
  }
}

async function fenixImageSend(){
  const btn=$("imagePreviewBtn");
  try{
    if(btn){btn.disabled=true;btn.textContent="Salvando...";}
    const saved=await fenixPersistAndReturnProposal();
    if(!saved)return;

    if(btn)btn.textContent="Gerando imagem...";
    const filename=(saved.fenix_number||"proposta-fenix").replace(/[^\w\-]+/g,"_");
    await v10SaveProposalImage("proposalDocument", `${filename}.png`);

    toast(`Proposta ${saved.fenix_number||""} enviada e imagem gerada.`,"success");
  }catch(e){
    console.error(e);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="📸 Salvar imagem";}
  }
}

function fenixBindProposalButtonsFinal(){
  // Clona para remover qualquer listener antigo acumulado.
  [["closeProposalBtn",fenixCloseProposalModal],
   ["pdfPreviewBtn",fenixPdfSend],
   ["imagePreviewBtn",fenixImageSend]].forEach(([id,handler])=>{
    const old=$(id);
    if(!old)return;
    const fresh=old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.onclick=handler;
  });

  // Garante também que backdrop/X fechem normalmente.
  $$("[data-close-modal]").forEach(el=>el.onclick=fenixCloseProposalModal);
}

// ---------- PRODUTOS NO PLANO NOVO ----------
// Migração => "PRODUTOS JÁ ATIVOS"
// Produto novo => "PRODUTO INCLUSO"
function fenixMigratedNewProducts(snapshot){
  const migrations=snapshot?.internal_data?.productMigrations||[];
  return migrations.filter(x=>x.keepInNew!==false);
}

function fenixRegularNewProducts(snapshot){
  const all=snapshot?.newProducts||snapshot?.products||[];
  const migrations=fenixMigratedNewProducts(snapshot);

  // Evita duplicar migrados na lista de produto novo.
  return all.filter(p=>{
    const name=[p.name,p.variant].filter(Boolean).join(" • ").trim().toLowerCase();
    return !migrations.some(m=>String(m.newName||"").trim().toLowerCase()===name);
  });
}

function fenixProductRowsCustom(snapshot){
  const migrated=fenixMigratedNewProducts(snapshot);
  const regular=fenixRegularNewProducts(snapshot);

  let html="";

  if(migrated.length){
    html += `<span class="plan-detail-title">PRODUTOS JÁ ATIVOS</span>`;
    html += migrated.map(x=>`
      <div class="plan-detail-row">
        <strong>${esc(x.newName||"Produto")}</strong>
        <span>${money(x.newValueCents||0)}</span>
      </div>
    `).join("");
  }

  if(regular.length){
    html += `<span class="plan-detail-title">PRODUTO INCLUSO</span>`;
    html += regular.map(p=>`
      <div class="plan-detail-row">
        <strong>${esc(v4CategoryLabel(p.category))} — ${esc(p.variant||p.name||"")}</strong>
        <span>${p.quantity>1?`${p.quantity} un. • `:""}${money(p.totalCents||0)}</span>
      </div>
    `).join("");
  }

  return html;
}

// Substitui somente o miolo de produtos do PLANO NOVO, preservando resto do layout.
const fenixProposalProductLabelsBase = proposalHTML;
proposalHTML = function(snapshot, fenixNumber=""){
  let markup = fenixProposalProductLabelsBase(snapshot, fenixNumber);

  const newStart = markup.indexOf('<div class="proposal-plan new">');
  if(newStart < 0) return markup;

  const pricePos = markup.indexOf('<div class="plan-price">', newStart);
  if(pricePos < 0) return markup;

  // Localiza bloco plan-details do plano novo imediatamente antes do preço.
  const detailsStart = markup.lastIndexOf('<div class="plan-details">', pricePos);
  if(detailsStart < newStart) return markup;

  const detailsEnd = markup.indexOf('</div>', detailsStart);
  if(detailsEnd < 0 || detailsEnd > pricePos) return markup;

  const customProducts = fenixProductRowsCustom(snapshot);

  // Mantém os serviços já ativos que já existiam no bloco e troca apenas títulos/linhas de produtos.
  let block = markup.slice(detailsStart, detailsEnd + 6);

  // Remove qualquer seção de produtos existente dentro do bloco.
  block = block.replace(
    /<span class="plan-detail-title">PRODUTOS<\/span>[\s\S]*?(?=<span class="plan-detail-title">|<\/div>)/gi,
    ""
  );
  block = block.replace(
    /<span class="plan-detail-title">PRODUTOS JÁ ATIVOS<\/span>[\s\S]*?(?=<span class="plan-detail-title">|<\/div>)/gi,
    ""
  );
  block = block.replace(
    /<span class="plan-detail-title">PRODUTO INCLUSO<\/span>[\s\S]*?(?=<span class="plan-detail-title">|<\/div>)/gi,
    ""
  );

  block = block.replace('</div>', customProducts + '</div>');

  markup = markup.slice(0, detailsStart) + block + markup.slice(detailsEnd + 6);
  return markup;
};

// Rebind em toda abertura da prévia
const fenixPreviewButtonsBase = preview;
preview = function(){
  const result = fenixPreviewButtonsBase();
  setTimeout(fenixBindProposalButtonsFinal, 80);
  return result;
};

window.addEventListener("load",()=>{
  setTimeout(fenixBindProposalButtonsFinal,3200);
});

// ============================================================
// FÊNIX ONE — ESTABILIZAÇÃO FINAL: LOGIN + MODAL + ENVIO
// ============================================================
function fenixClosePreviewFinal(){
  $("proposalModal")?.classList.add("hidden");
}
function fenixBackEditFinal(){
  fenixClosePreviewFinal();
  try{showView("calculatorView")}catch(e){}
}
async function fenixSendPreviewFinal(){
  if(!state.previewPayload){toast("Gere a proposta antes de salvar.","error");return null}
  if(state.previewSavedProposal?.id)return state.previewSavedProposal;

  const toInsert={
    ...state.previewPayload,
    status:"Enviada",
    internal_data:{...(state.previewPayload.internal_data||{}),sent_at:new Date().toISOString()},
    client_snapshot:JSON.parse(JSON.stringify(state.previewPayload.client_snapshot||{}))
  };
  const {data,error}=await db.from("proposals").insert(toInsert).select("*").single();
  if(error){console.error("Erro ao enviar proposta:",error);toast(error.message||"Não foi possível enviar a proposta.","error");throw error}
  state.previewSavedProposal=data;
  if($("proposalDocument"))$("proposalDocument").innerHTML=proposalHTML(toInsert.client_snapshot,data.fenix_number||"");
  try{await loadProposals()}catch(e){console.error(e)}
  try{if(supervisor())await loadNotifications()}catch(e){console.error(e)}
  try{renderProposals()}catch(e){}
  try{renderDashboard()}catch(e){}
  toast(`Proposta ${data.fenix_number||""} enviada com sucesso!`,"success");
  return data;
}
async function fenixPdfFinal(){
  const b=$("pdfPreviewBtn"),t=b?.textContent||"📄 Salvar em PDF";
  try{
    if(b){b.disabled=true;b.textContent="Enviando proposta..."}
    const s=await fenixSendPreviewFinal();if(!s)return;
    if(b)b.textContent="Gerando PDF...";
    await Promise.resolve(saveAsPDF("proposalDocument"));
  }catch(e){console.error(e)}
  finally{if(b){b.disabled=false;b.textContent=t}}
}
async function fenixImageFinal(){
  const b=$("imagePreviewBtn"),t=b?.textContent||"📸 Salvar imagem";
  try{
    if(b){b.disabled=true;b.textContent="Enviando proposta..."}
    const s=await fenixSendPreviewFinal();if(!s)return;
    if(b)b.textContent="Gerando imagem...";
    const n=(s.fenix_number||"proposta-fenix").replace(/[^\w\-]+/g,"_");
    await v10SaveProposalImage("proposalDocument",`${n}.png`);
  }catch(e){console.error(e)}
  finally{if(b){b.disabled=false;b.textContent=t}}
}
function fenixReplaceButton(id,fn){
  const old=$(id);if(!old)return;
  const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.onclick=fn;
}
function fenixBindPreviewFinal(){
  fenixReplaceButton("closeProposalXBtn",fenixClosePreviewFinal);
  fenixReplaceButton("backEditProposalBtn",fenixBackEditFinal);
  fenixReplaceButton("pdfPreviewBtn",fenixPdfFinal);
  fenixReplaceButton("imagePreviewBtn",fenixImageFinal);
  const bd=$("proposalModal")?.querySelector(".modal-backdrop");
  if(bd)bd.onclick=fenixClosePreviewFinal;
}
const fenixPreviewStableBase=preview;
preview=function(){
  state.previewSavedProposal=null;
  const r=fenixPreviewStableBase();
  setTimeout(fenixBindPreviewFinal,30);
  return r;
};

// O login não deve cair inteiro porque um módulo secundário falhou.
async function fenixSafeStep(label,fn){
  try{return await fn()}catch(e){console.error(`[Fênix] ${label}:`,e);return null}
}
const fenixStableBootstrapBase=bootstrap;
bootstrap=async function(){
  try{
    await fenixStableBootstrapBase();
  }catch(e){
    console.error("[Fênix] bootstrap legado falhou:",e);
    await fenixSafeStep("perfil",async()=>{
      if(!state.session?.user)return;
      const {data}=await db.from("profiles").select("*").eq("id",state.session.user.id).maybeSingle();
      if(data)state.profile=data;
    });
    await fenixSafeStep("catálogos",()=>loadCatalogs());
    await fenixSafeStep("propostas",()=>loadProposals());
    if(supervisor())await fenixSafeStep("perfis",()=>loadProfiles());
    if(supervisor())await fenixSafeStep("notificações",()=>loadNotifications());
    $("loginScreen")?.classList.add("hidden");
    $("recoveryScreen")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
    await fenixSafeStep("identidade",async()=>identity());
    await fenixSafeStep("render",async()=>renderAll());
    await fenixSafeStep("dashboard",async()=>renderDashboard());
    await fenixSafeStep("propostas",async()=>renderProposals());
  }
  await fenixSafeStep("bindings",async()=>fenixBindPreviewFinal());
};
window.addEventListener("load",()=>setTimeout(fenixBindPreviewFinal,3400));


// ============================================================
// FIX — GERAR / VISUALIZAR PROPOSTA
// Não redefine preview(). Apenas liga o botão à função já existente,
// evitando a cadeia de wrappers acumulados nas versões anteriores.
// ============================================================

async function fenixOpenProposalPreviewStable(){
  const btn = document.getElementById("previewProposalBtn");
  const oldText = btn?.textContent || "Gerar / Visualizar proposta";

  try {
    if(btn) {
      btn.disabled = true;
      btn.textContent = "Gerando proposta...";
    }

    // Limpa somente o controle de envio da prévia anterior.
    state.previewSavedProposal = null;

    // Usa a função-base de preview capturada antes dos wrappers finais,
    // quando disponível. Assim evitamos recursão/conflito de handlers.
    const generator =
      (typeof fenixPreviewStableBase === "function" && fenixPreviewStableBase) ||
      (typeof fenixPreviewButtonsBase === "function" && fenixPreviewButtonsBase) ||
      (typeof preview === "function" && preview);

    if(typeof generator !== "function") {
      throw new Error("Função de geração da proposta não encontrada.");
    }

    const result = await Promise.resolve(generator());

    // Se a função-base montou o documento, força a abertura do modal.
    const modal = document.getElementById("proposalModal");
    const doc = document.getElementById("proposalDocument");

    if(modal && doc && doc.innerHTML.trim()) {
      modal.classList.remove("hidden");
      modal.removeAttribute("aria-hidden");
      document.body.classList.add("modal-open");
    }

    // Reaplica apenas os botões internos, sem alterar a geração.
    if(typeof fenixBindPreviewFinal === "function") {
      setTimeout(fenixBindPreviewFinal, 20);
    }

    return result;
  } catch(err) {
    console.error("[Fênix] Erro ao gerar/visualizar proposta:", err);
    toast(err?.message || "Não foi possível gerar a proposta.", "error");
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

function fenixBindPreviewTriggerStable(){
  const old = document.getElementById("previewProposalBtn");
  if(!old) return;

  // Remove listeners antigos do botão sem mexer no restante da tela.
  const fresh = old.cloneNode(true);
  old.replaceWith(fresh);
  fresh.type = "button";
  fresh.onclick = fenixOpenProposalPreviewStable;
}

window.addEventListener("load", () => {
  setTimeout(fenixBindPreviewTriggerStable, 3600);
});

// Reaplica depois do bootstrap/login, pois o app pode reconstruir a interface.
const fenixBootstrapPreviewTriggerBase = bootstrap;
bootstrap = async function(){
  const result = await fenixBootstrapPreviewTriggerBase();
  fenixBindPreviewTriggerStable();
  return result;
};

// ============================================================
// FIX — ENVIO DA PROPOSTA + CÁLCULO DAS MIGRAÇÕES MÓVEIS
// ============================================================

// Retorna somente as migrações que permanecem no plano novo.
function fenixKeptMobileMigrations(){
  const items = state.mobileItems || state.mobiles || state.mobile || [];
  return Array.isArray(items) ? items.filter(item => {
    const type=String(item.type||item.tipo||"").toLowerCase();
    const isMigration=type.includes("migra");
    const keep = item.keepInNew !== false && item.keepNew !== false &&
                 item.manterNovo !== false && item.destination !== "current_only";
    return isMigration && keep;
  }) : [];
}

// Valor das migrações mantidas no novo plano.
function fenixMobileMigrationValueCents(){
  return fenixKeptMobileMigrations().reduce((sum,item)=>{
    const qty=Number(item.quantity||item.qty||1)||1;
    const unit=Number(
      item.unitCents ?? item.priceCents ?? item.valueCents ??
      item.precoCentavos ?? item.valorCentavos ?? 0
    )||0;
    const total=Number(item.totalCents||0)||0;
    return sum + (total>0 ? total : unit*qty);
  },0);
}

// Quantidade de linhas migradas mantidas.
function fenixMobileMigrationQty(){
  return fenixKeptMobileMigrations().reduce(
    (sum,item)=>sum+(Number(item.quantity||item.qty||1)||1),0
  );
}

// Complementa o cálculo legado sem alterar E-SIM, SME, produtos ou serviços.
const fenixUpdateCalcMigrationBase=updateCalc;
updateCalc=function(){
  const result=fenixUpdateCalcMigrationBase();

  try{
    const migrationCents=fenixMobileMigrationValueCents();

    // A composição elegível precisa considerar as migrações móveis.
    // Procura os campos/elementos usados pelas versões existentes.
    const eligible =
      $("eligibleComposition") || $("eligibleValue") ||
      $("compositionEligible") || $("eligibleCompositionValue");

    if(eligible){
      // Preserva outras parcelas já calculadas e acrescenta migração apenas
      // quando a versão antiga não a incluiu.
      const base=Number(eligible.dataset.baseWithoutMigration||0);
      if(!eligible.dataset.baseWithoutMigration){
        const txt=String(eligible.textContent||"").replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".");
        eligible.dataset.baseWithoutMigration=String(Math.max(0,Math.round((Number(txt)||0)*100)));
      }
      const baseNow=Number(eligible.dataset.baseWithoutMigration||0);
      eligible.textContent=money(baseNow+migrationCents);
    }
  }catch(e){ console.error("[Fênix] cálculo migrações:",e); }

  return result;
};

// Antes de gerar a prévia, garante que o snapshot/payload leve
// o valor e a quantidade das migrações mantidas.
function fenixApplyMigrationTotalsToPreview(){
  const cents=fenixMobileMigrationValueCents();
  const qty=fenixMobileMigrationQty();

  if(state.previewPayload){
    state.previewPayload.internal_data={
      ...(state.previewPayload.internal_data||{}),
      mobile_migration_value_cents:cents,
      mobile_migration_qty:qty
    };
  }
}

// Envio robusto: aceita número Fênix gerado pelo banco e força refresh.
const fenixSendPreviewMigrationBase=fenixSendPreviewFinal;
fenixSendPreviewFinal=async function(){
  fenixApplyMigrationTotalsToPreview();
  const saved=await fenixSendPreviewMigrationBase();

  if(saved){
    try{ await loadProposals(); }catch(e){console.error(e)}
    try{ renderProposals(); }catch(e){}
    try{ renderDashboard(); }catch(e){}
    try{ if(supervisor()) await loadNotifications(); }catch(e){}
  }
  return saved;
};

// Rebind dos botões de exportação para garantir que usem a função
// de envio mais recente, e não referências antigas.
function fenixRebindSendButtonsMigrationFix(){
  const pdf=$("pdfPreviewBtn");
  if(pdf){
    const n=pdf.cloneNode(true); pdf.replaceWith(n); n.onclick=fenixPdfFinal;
  }
  const img=$("imagePreviewBtn");
  if(img){
    const n=img.cloneNode(true); img.replaceWith(n); n.onclick=fenixImageFinal;
  }
}

window.addEventListener("load",()=>{
  setTimeout(()=>{
    try{ updateCalc(); }catch(e){}
    fenixRebindSendButtonsMigrationFix();
  },3900);
});

// ============================================================
// FIX — NÃO EXIBIR ERRO GENÉRICO DE INICIALIZAÇÃO
// ============================================================
function fenixIsGenericStartupError(message){
  const m=String(message||"").toLowerCase();
  return m.includes("erro ao iniciar o fênix one") ||
         m.includes("erro ao iniciar o fenix one") ||
         m.includes("erro ao iniciar");
}

// Intercepta somente o aviso genérico de bootstrap.
// Erros reais de autenticação/salvamento continuam aparecendo.
if(typeof toast==="function"){
  const fenixToastOriginal=toast;
  toast=function(message,type="info"){
    if(fenixIsGenericStartupError(message)){
      console.warn("[Fênix] aviso genérico de inicialização suprimido:",message);
      return;
    }
    return fenixToastOriginal(message,type);
  };
}

// Se um módulo secundário falhar depois do login, mantém o app aberto.
window.addEventListener("unhandledrejection",(event)=>{
  const msg=event?.reason?.message||event?.reason||"";
  if(fenixIsGenericStartupError(msg)){
    event.preventDefault();
    console.error("[Fênix] módulo secundário falhou:",event.reason);
    try{
      $("loginScreen")?.classList.add("hidden");
      $("app")?.classList.remove("hidden");
    }catch(e){}
  }
});


// ============================================================
// FIX v10 — CÁLCULO CORRETO DA MIGRAÇÃO DE PRODUTO
// ============================================================
//
// Exemplo isolado:
// 500 Mega atual = R$ 109,98
// 700 Mega novo  = R$ 99,99
//
// Resultado:
// Plano Atual = R$ 109,98
// Plano Novo  = R$ 99,99
//
// O valor atual do produto migrado entra UMA vez no Plano Atual.
// O valor do produto novo entra UMA vez no Plano Novo.
// ============================================================

function fenixProductMigrationTotals(){
  const items = Array.isArray(state.productItems) ? state.productItems : [];

  return items
    .filter(item => String(item.type || "").toLowerCase() === "migration")
    .reduce((acc, item) => {
      const qty = Number(item.quantity) || 1;
      const currentUnit = Number(item.currentValueCents) || 0;
      const newUnit = Number(
        item.unitCents ?? item.priceCents ?? item.valueCents ?? 0
      ) || 0;
      const explicitNewTotal = Number(item.totalCents) || 0;

      acc.current += currentUnit * qty;
      acc.next += explicitNewTotal > 0 ? explicitNewTotal : newUnit * qty;
      return acc;
    }, {current: 0, next: 0});
}

// Corrige apenas a parcela de produtos migrados.
// Mantém as demais parcelas calculadas pela versão consolidada.
const fenixCalcProductMigrationV10Base = calc;

calc = function(){
  const c = fenixCalcProductMigrationV10Base();
  const mig = fenixProductMigrationTotals();

  // Detecta quanto a lógica-base já colocou de migração em cada lado.
  // Os campos auxiliares evitam somar duas vezes.
  const legacyCurrentMig = Number(c.migratedCurrentProductsCents || 0);
  const legacyNewMig = Number(c.migratedNewProductsCents || 0);

  // PLANO ATUAL:
  // garante exatamente o valor atual informado na migração.
  c.currentTotal =
    (Number(c.currentTotal) || 0)
    - legacyCurrentMig
    + mig.current;

  // PLANO NOVO:
  // garante exatamente o valor do novo produto.
  c.newTotal =
    (Number(c.newTotal) || 0)
    - legacyNewMig
    + mig.next;

  c.migratedCurrentProductsCents = mig.current;
  c.migratedNewProductsCents = mig.next;

  return c;
};

// Atualiza os cards do resumo usando os totais corrigidos.
const fenixUpdateCalcProductMigrationV10Base = updateCalc;

updateCalc = function(){
  const result = fenixUpdateCalcProductMigrationV10Base();
  try{
    const c = calc();

    const currentEl =
      $("currentPlanTotal") ||
      $("currentTotal") ||
      $("summaryCurrentTotal");

    const newEl =
      $("newPlanTotal") ||
      $("newTotal") ||
      $("summaryNewTotal");

    if(currentEl) currentEl.textContent = money(c.currentTotal);
    if(newEl) newEl.textContent = money(c.newTotal);
  }catch(e){
    console.error("[Fênix] atualização dos totais de migração:", e);
  }
  return result;
};

// Garante os mesmos valores na proposta e no registro enviado.
if(typeof payload === "function"){
  const fenixPayloadProductMigrationV10Base = payload;

  payload = function(){
    const p = fenixPayloadProductMigrationV10Base();
    const c = calc();

    p.current_plan_total_cents = c.currentTotal;
    p.new_plan_total_cents = c.newTotal;

    if(p.client_snapshot){
      p.client_snapshot.current = {
        ...(p.client_snapshot.current || {}),
        valueCents: c.currentTotal
      };
      p.client_snapshot.next = {
        ...(p.client_snapshot.next || {}),
        valueCents: c.newTotal
      };
    }

    return p;
  };
}

window.addEventListener("load", () => {
  setTimeout(() => {
    try{ updateCalc(); }catch(e){ console.error(e); }
  }, 4300);
});


// FÊNIX ONE v11 — RESULTADOS + ALERTAS
const FENIX_ALERTS=[
{id:"0800",h:8,m:0,t:"Bom dia, lindo(a)! 💜 Fez suas correções? Fez suas defesas? Respondeu seus SMS?"},
{id:"0900",h:9,m:0,t:"Vamos vencer mais um diaaaa!! 🚀 Chegou seu momento de brilhar! Vamos começar as ligações!"},
{id:"1130",h:11,m:30,t:"Chegou a hora de responder às tarefas administrativas ou fazer cancelamentos! 📋"},
{id:"1200",h:12,m:0,t:"Ei! É seu horário administrativo. Vai corrigir suas coisinhas e responder suas tarefas. 💜"},
{id:"1300",h:13,m:0,t:"Ei! É seu horário administrativo. Vai corrigir suas coisinhas e responder suas tarefas. 💜"},
{id:"1730",h:17,m:30,t:"O dia está quase acabando! Vamos deixar tudo organizado para amanhã? ✨"}];

function fenixV11Style(){
 if(document.getElementById("fv11css"))return;
 const s=document.createElement("style");s.id="fv11css";s.textContent=`
 #resultsView{padding:24px}.frbox{background:var(--card,#fff);border:1px solid #ddd;border-radius:16px;padding:18px;margin-bottom:16px}
 .frform{display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:10px;align-items:end}.frform input,.frform select{width:100%;padding:10px}
 .frkpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.frkpis div{padding:16px;border-radius:14px;background:rgba(120,50,180,.09)}.frkpis b{display:block;font-size:24px}
 .frtable{width:100%;border-collapse:collapse}.frtable th,.frtable td{padding:10px;border-bottom:1px solid #ddd;text-align:left}
 .fra{position:fixed;inset:0;z-index:99999;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px}.frac{max-width:520px;background:#fff;color:#25142f;padding:28px;border-radius:22px;text-align:center}.frac p{font-size:18px;line-height:1.5}.fractions{display:flex;gap:10px}.fractions button{flex:1;padding:13px;border:0;border-radius:12px;font-weight:800}.fry{background:#6d2db5;color:#fff}.frn{background:#eee}
 @media(max-width:800px){.frform{grid-template-columns:1fr 1fr}.frkpis{grid-template-columns:1fr}}`;document.head.appendChild(s);
}
function fenixEnsureResults(){
 fenixV11Style();if(document.getElementById("resultsView"))return;
 const app=$("app");if(!app)return;
 const nav=app.querySelector("nav,.tabs,.nav");

 const v=document.createElement("section");v.id="resultsView";v.className="view hidden";v.innerHTML=`
 <div style="max-width:1200px;margin:auto"><h2>📊 Resultados</h2><p>Acompanhamento mensal de migrações e receita.</p>
 <div class="frbox"><input id="frMonth" type="month"> <button class="btn btn-secondary" id="frRefresh">↻ Atualizar</button></div>
 <div id="frForm"></div><div class="frkpis frbox"><div>Migrações<b id="frMig">0</b></div><div>Receita<b id="frRev">R$ 0,00</b></div><div>Consultores<b id="frCount">0</b></div></div>
 <div class="frbox" id="frTable"></div></div>`;app.appendChild(v);
 const d=new Date();$("frMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;$("frMonth").onchange=fenixLoadResults;$("frRefresh").onclick=fenixLoadResults;fenixResultForm();
}
function fenixShowResults(){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));$("resultsView")?.classList.remove("hidden");fenixLoadResults()}
function fenixResultForm(){
 const h=$("frForm");if(!h||!supervisor())return;
 const ps=(state.profiles||[]).filter(p=>String(p.role||"").toLowerCase().includes("consult"));
 h.innerHTML=`<div class="frbox frform"><label>Consultor<select id="frConsult">${ps.map(p=>`<option value="${p.id}">${esc(p.name||p.full_name||p.email||"Consultor")}</option>`).join("")}</select></label><label>Migrações<input id="frMigrations" type="number" min="0" value="0"></label><label>Receita R$<input id="frRevenue" type="number" min="0" step=".01" value="0"></label><label>Período<input id="frPeriod" type="month" value="${$("frMonth")?.value||""}"></label><button class="btn btn-primary" id="frSave">Salvar</button></div>`;$("frSave").onclick=fenixSaveResult;
}
async function fenixSaveResult(){
 const pid=$("frConsult")?.value,period=$("frPeriod")?.value;if(!pid||!period)return toast("Selecione consultor e período.","error");
 const row={profile_id:pid,period_month:period+"-01",migrations:Number($("frMigrations")?.value||0),revenue_cents:Math.round(Number($("frRevenue")?.value||0)*100),updated_by:state.session?.user?.id};
 const {error}=await db.from("consultant_results").upsert(row,{onConflict:"profile_id,period_month"});if(error)return toast("Ative as tabelas de Resultados no Supabase.","error");
 $("frMonth").value=period;toast("Resultado salvo!","success");fenixLoadResults();
}
async function fenixLoadResults(){
 const month=$("frMonth")?.value;if(!month)return;const {data,error}=await db.from("consultant_results").select("*").eq("period_month",month+"-01");if(error){$("frTable").innerHTML="Execute o arquivo SUPABASE_RESULTADOS_ALERTAS.sql no Supabase.";return}
 const rows=data||[],ps=[...(state.profiles||[]),state.profile].filter(Boolean),nm=id=>ps.find(p=>p.id===id)?.name||ps.find(p=>p.id===id)?.full_name||"Consultor";
 $("frMig").textContent=rows.reduce((s,r)=>s+Number(r.migrations||0),0);$("frRev").textContent=money(rows.reduce((s,r)=>s+Number(r.revenue_cents||0),0));$("frCount").textContent=rows.length;
 $("frTable").innerHTML=`<table class="frtable"><thead><tr><th>Consultor</th><th>Migrações</th><th>Receita</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(nm(r.profile_id))}</td><td>${r.migrations||0}</td><td>${money(r.revenue_cents||0)}</td></tr>`).join("")||'<tr><td colspan="3">Sem resultados neste mês.</td></tr>'}</tbody></table>`;
}
function frKey(id){const d=new Date(),ds=d.toISOString().slice(0,10);return`fra_${state.session?.user?.id}_${ds}_${id}`}
function fenixAlertShow(a){if($("frAlert"))return;const e=document.createElement("div");e.id="frAlert";e.className="fra";e.innerHTML=`<div class="frac"><h3>💜 Atenção, Fênix!</h3><p>${esc(a.t)}</p><div class="fractions"><button class="fry">✅ FIZ</button><button class="frn">❌ NÃO CONSEGUI</button></div></div>`;e.querySelector(".fry").onclick=()=>fenixAlertAnswer(a,"FIZ");e.querySelector(".frn").onclick=()=>fenixAlertAnswer(a,"NAO_CONSEGUI");document.body.appendChild(e)}
async function fenixAlertAnswer(a,r){localStorage.setItem(frKey(a.id),r);$("frAlert")?.remove();try{await db.from("routine_alert_responses").upsert({profile_id:state.session.user.id,response_date:new Date().toISOString().slice(0,10),alert_id:a.id,alert_text:a.t,response:r},{onConflict:"profile_id,response_date,alert_id"})}catch(e){console.error(e)}}
function fenixAlertCheck(){if(!state.session?.user||supervisor())return;const d=new Date(),n=d.getHours()*60+d.getMinutes();for(const a of FENIX_ALERTS){const t=a.h*60+a.m;if(n>=t&&n<t+60&&!localStorage.getItem(frKey(a.id))){fenixAlertShow(a);break}}}
function fenixV11Init(){fenixEnsureResults();fenixResultForm();fenixAlertCheck();if(!window.__fraTimer)window.__fraTimer=setInterval(fenixAlertCheck,60000)}
window.addEventListener("load",()=>setTimeout(fenixV11Init,4700));


// ============================================================
// FÊNIX ONE v12 — RESULTADOS VISÍVEL + CÁLCULO DEFINITIVO
// + "SOLUÇÕES CONTRATADAS"
// ============================================================

// ---------- RESULTADOS DIRETO NO MENU ----------
const fenixV12ShowViewBase = showView;
showView = function(id){
  if(id === "resultsView"){
    fenixEnsureResultsV12();
  }
  fenixV12ShowViewBase(id);
  if(id === "resultsView"){
    document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
    $("resultsView")?.classList.remove("hidden");
    if($("pageTitle")) $("pageTitle").textContent = "Resultados";
    fenixResultForm();
    fenixLoadResults();
  }
};

function fenixEnsureResultsV12(){
  fenixV11Style();

  // O botão já existe diretamente no HTML.
  const navBtn = $("navResults");
  if(navBtn) navBtn.onclick = ()=>showView("resultsView");

  if($("resultsView")) return;

  const main = document.querySelector(".main");
  if(!main) return;

  const v = document.createElement("section");
  v.id = "resultsView";
  v.className = "view hidden";
  v.innerHTML = `
    <div style="max-width:1200px;margin:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div><p class="eyebrow">RESULTADOS</p><h2>📊 Resultados</h2><p>Acompanhamento mensal de migrações e receita da equipe.</p></div>
        <button id="frRefresh" class="btn btn-secondary" type="button">↻ Atualizar</button>
      </div>
      <div class="frbox"><label>Período <input id="frMonth" type="month"></label></div>
      <div id="frForm"></div>
      <div class="frkpis frbox">
        <div>Migrações da equipe<b id="frMig">0</b></div>
        <div>Receita da equipe<b id="frRev">R$ 0,00</b></div>
        <div>Consultores com resultado<b id="frCount">0</b></div>
      </div>
      <div class="frbox" id="frTable"></div>
    </div>`;
  main.appendChild(v);

  const d = new Date();
  $("frMonth").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  $("frMonth").onchange = fenixLoadResults;
  $("frRefresh").onclick = fenixLoadResults;
  fenixResultForm();
}

// Substitui o inicializador v11, evitando botão duplicado/invisível.
fenixEnsureResults = fenixEnsureResultsV12;


// ---------- HELPERS DE CÁLCULO ----------
function fenixV12KeepMobile(item){
  if(item.type !== "migration") return true;
  return item.keepInNew !== false &&
         item.keepNew !== false &&
         item.manterNovo !== false &&
         item.destination !== "current_only";
}
function fenixV12KeepProduct(item){
  if(item.type !== "migration") return true;
  return item.keepInNew !== false &&
         item.keepNew !== false &&
         item.manterNovo !== false &&
         item.destination !== "current_only";
}
function fenixV12ProductGb(item){
  const catalog = (state.products||[]).find(p=>String(p.id)===String(item.productId)) || item;
  if(typeof fenixProductGb === "function"){
    const gb = Number(fenixProductGb(catalog));
    if(gb) return gb;
  }
  const text = `${catalog?.name||""} ${catalog?.variant||""} ${item?.name||""} ${item?.variant||""}`;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
  return m ? Number(m[1].replace(",",".")) : 0;
}
function fenixV12IsInternetMobile(item){
  const cat = String(item.category||"").toLowerCase();
  const text = `${item.name||""} ${item.variant||""}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return cat === "internet_movel" || text.includes("internet movel") || text.includes("base internet pj");
}

// ---------- CÁLCULO AUTORITATIVO ----------
const fenixV12CalcBase = calc;
calc = function(){
  const base = fenixV12CalcBase();

  const currentBillingCents = cents($("currentBilling")?.value || "0");
  const adj = +($("adjustmentPercent")?.value || 0);
  const adjusted = Math.round(currentBillingCents * (1 + adj/100));
  const limit = cents($("billingLimit")?.value || "0");

  const mobileItems = Array.isArray(state.mobileItems) ? state.mobileItems : [];
  const productItems = Array.isArray(state.productItems) ? state.productItems : [];
  const smeItems = Array.isArray(state.smeItems) ? state.smeItems : [];

  const migrations = mobileItems.filter(i=>i.type==="migration");
  const keptMobile = mobileItems.filter(fenixV12KeepMobile);

  const migrationLines = migrations.reduce((s,i)=>s+(Number(i.quantity)||1),0);
  const nextLines = keptMobile
    .filter(i=>i.type==="migration" || i.type==="new_line")
    .reduce((s,i)=>s+(Number(i.quantity)||1),0);

  const esimCount = mobileItems
    .filter(i=>i.type==="esim")
    .reduce((s,i)=>s+(Number(i.quantity)||1),0);

  const mobileNewValue = keptMobile.reduce(
    (s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0
  );

  const mobileNewGb = keptMobile.reduce(
    (s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1),0
  );

  const smeGb = smeItems.reduce(
    (s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1),0
  );

  // Produto em migração: origem no Plano Atual.
  const migratedCurrentProducts = productItems
    .filter(i=>i.type==="migration")
    .reduce((s,i)=>s+(Number(i.currentValueCents)||0)*(Number(i.quantity)||1),0);

  // Novo produto / destino de migração: somente se ficar no Plano Novo.
  const keptProducts = productItems.filter(fenixV12KeepProduct);
  const newProductsValue = keptProducts.reduce(
    (s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0
  );

  // Internet Móvel como Solução Contratada soma GB no Plano Novo.
  const internetMobileProductGb = keptProducts
    .filter(fenixV12IsInternetMobile)
    .reduce((s,i)=>s+fenixV12ProductGb(i)*(Number(i.quantity)||1),0);

  // Internet móvel já ativa e mantida (Etapa 4) também soma GB.
  const activeInternetGb = (base.svc?.selected||[])
    .filter(x=>x.keepNew)
    .reduce((sum,x)=>{
      const svc=(state.services||[]).find(s=>String(s.id)===String(x.serviceId));
      if(!svc?.fenixActiveInternet) return sum;
      return sum+(Number(svc.fenixGb)||0)*(Number(x.quantity)||1);
    },0);

  const svcCurrent = Number(base.svc?.current)||0;
  const svcNew = Number(base.svc?.newTotal)||0;

  const currentTotal = adjusted + svcCurrent + migratedCurrentProducts;
  const newTotal = mobileNewValue + svcNew + newProductsValue;
  const newGb = mobileNewGb + smeGb + internetMobileProductGb + activeInternetGb;

  // Composição elegível: móvel + Internet Móvel nova.
  const internetMobileValue = keptProducts
    .filter(fenixV12IsInternetMobile)
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0);
  const eligible = mobileNewValue + internetMobileValue;

  return {
    ...base,
    currentBillingCents, adj, adjusted, limit,
    migrationLines, nextLines, esimCount,
    currentGb:+($("currentFranchise")?.value||0),
    newGb,
    currentTotal,
    newTotal,
    eligible,
    diff:Math.max(0,limit-eligible),
    migratedCurrentProductsCents:migratedCurrentProducts,
    migratedNewProductsCents:keptProducts.filter(i=>i.type==="migration")
      .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0)
  };
};


// ---------- RESUMO ----------
const fenixV12UpdateCalcBase = updateCalc;
updateCalc = function(){
  const result = fenixV12UpdateCalcBase();
  const c = calc();

  if($("currentPlanTotal")) $("currentPlanTotal").textContent = money(c.currentTotal);
  if($("newPlanTotal")) $("newPlanTotal").textContent = money(c.newTotal);
  if($("currentPlanMeta")) $("currentPlanMeta").textContent = `${c.migrationLines} linhas • ${c.currentGb} GB`;
  if($("newPlanMeta")) $("newPlanMeta").textContent = `${c.nextLines} linhas • ${c.newGb} GB${c.esimCount?` • ${c.esimCount} E-SIM`:""}`;
  if($("eligibleTotalDisplay")) $("eligibleTotalDisplay").textContent = money(c.eligible);
  if($("billingLimitDisplay")) $("billingLimitDisplay").textContent = money(c.limit);

  return result;
};


// ---------- PAYLOAD / PROPOSTA ----------
const fenixV12PayloadBase = payload;
payload = function(){
  const p = fenixV12PayloadBase();
  const c = calc();

  p.current_plan_total_cents = c.currentTotal;
  p.new_plan_total_cents = c.newTotal;
  p.new_franchise_gb = c.newGb;
  p.migration_lines = c.migrationLines;
  p.esim_count = c.esimCount;
  p.limit_eligible_total_cents = c.eligible;

  if(p.client_snapshot){
    p.client_snapshot.current = {
      ...(p.client_snapshot.current||{}),
      lines:c.migrationLines,
      franchiseGb:c.currentGb,
      valueCents:c.currentTotal
    };
    p.client_snapshot.next = {
      ...(p.client_snapshot.next||{}),
      lines:c.nextLines,
      franchiseGb:c.newGb,
      esimCount:c.esimCount,
      valueCents:c.newTotal
    };
  }
  return p;
};


// ---------- NOMENCLATURA ----------
fenixProductRowsCustom = function(snapshot){
  const migrated = fenixMigratedNewProducts(snapshot);
  const regular = fenixRegularNewProducts(snapshot);
  let html = "";

  if(migrated.length){
    html += `<span class="plan-detail-title">PRODUTOS JÁ ATIVOS</span>`;
    html += migrated.map(x=>`
      <div class="plan-detail-row">
        <strong>${esc(x.newName||"Produto")}</strong>
        <span>${money(x.newValueCents||0)}</span>
      </div>`).join("");
  }

  if(regular.length){
    html += `<span class="plan-detail-title">SOLUÇÕES CONTRATADAS</span>`;
    html += regular.map(p=>`
      <div class="plan-detail-row">
        <strong>${esc(v4CategoryLabel(p.category))} — ${esc(p.variant||p.name||"")}</strong>
        <span>${p.quantity>1?`${p.quantity} un. • `:""}${money(p.totalCents||0)}</span>
      </div>`).join("");
  }
  return html;
};

const fenixV12ProposalBase = proposalHTML;
proposalHTML = function(snapshot, fenixNumber=""){
  return fenixV12ProposalBase(snapshot, fenixNumber)
    .replace(/PRODUTO INCLUSO/gi,"SOLUÇÕES CONTRATADAS")
    .replace(/PRODUTOS INCLUSOS/gi,"SOLUÇÕES CONTRATADAS");
};


// ---------- INICIALIZAÇÃO ----------
window.addEventListener("load",()=>{
  setTimeout(()=>{
    fenixEnsureResultsV12();
    try{ updateCalc(); }catch(e){ console.error(e); }
  },5200);
});


// ============================================================
// FÊNIX ONE — CORREÇÃO FINAL DE NAVEGAÇÃO / RESULTADOS
// Base: arquivos enviados em 20/08/2026
// ============================================================

// A seção Resultados agora existe diretamente no index.html.
// Esta função não cria mais botão nem página duplicada.
fenixEnsureResultsV12 = function(){
  fenixV11Style();

  const month = $("frMonth");
  if(month && !month.value){
    const d = new Date();
    month.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }

  if(month) month.onchange = fenixLoadResults;
  if($("frRefresh")) $("frRefresh").onclick = fenixLoadResults;

  const navBtn = document.querySelector('[data-view="resultsView"]');
  if(navBtn) navBtn.id = "navResults";

  fenixResultForm();
};

// A v11 também passa a apontar para a mesma implementação.
// Isso impede que ela crie o botão "📊 RESULTADOS" feio embaixo.
fenixEnsureResults = fenixEnsureResultsV12;

// Carrega TODOS os colaboradores ativos no seletor da Supervisora,
// sem depender da palavra exata "consultor" no campo role.
fenixResultForm = function(){
  const host = $("frForm");
  if(!host) return;

  if(!supervisor()){
    host.innerHTML = "";
    return;
  }

  const profiles = (state.profiles || []).filter(p =>
    p &&
    p.active !== false &&
    String(p.id) !== String(state.profile?.id) &&
    String(p.role || "").toLowerCase() !== "supervisora"
  );

  host.innerHTML = `
    <div class="frbox frform">
      <label>Consultor
        <select id="frConsult">
          ${profiles.length
            ? profiles.map(p=>`<option value="${p.id}">${esc(p.full_name || p.name || p.email || "Consultor")}</option>`).join("")
            : '<option value="">Nenhum consultor carregado</option>'}
        </select>
      </label>
      <label>Migrações executadas
        <input id="frMigrations" type="number" min="0" step="1" value="0">
      </label>
      <label>Receita executada (R$)
        <input id="frRevenue" type="number" min="0" step="0.01" value="0">
      </label>
      <label>Período
        <input id="frPeriod" type="month" value="${$("frMonth")?.value || ""}">
      </label>
      <button class="btn btn-primary" id="frSave" type="button">Salvar resultado</button>
    </div>`;

  if($("frSave")) $("frSave").onclick = fenixSaveResult;
};

// Navegação única e segura.
// Importante: usa somente a classe "active". Não deixa "hidden"
// preso nas páginas, que era o motivo de as outras abas ficarem vazias.
showView = function(id){
  if(id === "resultsView"){
    fenixEnsureResultsV12();
  }

  const target = $(id);
  if(!target){
    console.error("[Fênix] Aba não encontrada:", id);
    return;
  }

  $$(".view").forEach(view=>{
    view.classList.remove("active");
    // Remove "hidden" legado de navegações anteriores.
    if(view.id !== "loginScreen" && view.id !== "recoveryScreen"){
      view.classList.remove("hidden");
    }
  });

  target.classList.add("active");

  $$(".nav-item").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.view === id);
  });

  const titles = {
    dashboardView:"Dashboard",
    calculatorView:"Nova proposta",
    proposalsView:"Propostas",
    faqView:"Dúvidas Frequentes",
    devicesProposalView:"Proposta de Aparelhos",
    resultsView:"Resultados",
    notificationsView:"Notificações",
    adminView:"Administração"
  };

  if($("pageTitle")) $("pageTitle").textContent = titles[id] || "Fênix One";

  try{
    if(id === "dashboardView") renderDashboard?.();
    if(id === "calculatorView"){
      renderMobile?.();
      renderProducts?.();
      updateCalc?.();
    }
    if(id === "proposalsView") renderProposals?.();
    if(id === "faqView") fenixRenderFaq?.();
    if(id === "devicesProposalView") fenixDevicesRender?.();
    if(id === "resultsView"){
      fenixResultForm();
      fenixLoadResults();
    }
    if(id === "notificationsView") renderNotifications?.();
    if(id === "adminView"){
      renderProfiles?.();
      v9RenderAdminProducts?.();
      fenixRenderNewsAdmin?.();
      fenixRenderFaqAdmin?.();
    }
  }catch(err){
    console.error("[Fênix] Falha ao renderizar a aba", id, err);
  }

  window.scrollTo({top:0,behavior:"smooth"});
};

// Rebind final dos botões do menu para garantir que todos usem
// a navegação acima, independentemente de listeners antigos.
function fenixBindMainNavigationFinal(){
  document.getElementById("resultsTabBtn")?.remove();

  $$(".nav-item").forEach(btn=>{
    btn.onclick = () => showView(btn.dataset.view);
  });

  $$("[data-view-button]").forEach(btn=>{
    btn.onclick = () => showView(btn.dataset.viewButton);
  });

  $$("[data-open-calculator]").forEach(btn=>{
    btn.onclick = () => showView("calculatorView");
  });

  fenixEnsureResultsV12();
}

// Remove qualquer botão RESULTADOS legado que seja recriado por código antigo.
function fenixRemoveLegacyResultsButtons(){
  const official = document.querySelector('.nav-item[data-view="resultsView"]');

  document.querySelectorAll("button").forEach(btn=>{
    if(btn === official) return;

    const text = String(btn.textContent || "").trim().toUpperCase();
    if(
      btn.id === "resultsTabBtn" ||
      (text === "📊 RESULTADOS" && !btn.dataset.view)
    ){
      btn.remove();
    }
  });
}

window.addEventListener("load", ()=>{
  setTimeout(()=>{
    fenixBindMainNavigationFinal();
    fenixRemoveLegacyResultsButtons();

    // Mantém a aba que já estiver ativa; se nenhuma estiver, abre Dashboard.
    const active = document.querySelector(".view.active");
    if(!active) showView("dashboardView");
  }, 5600);

  // Alguns módulos antigos rodam com timeout. Confere novamente depois deles.
  setTimeout(fenixRemoveLegacyResultsButtons, 7000);
});


// ============================================================
// FÊNIX ONE v13 — CORREÇÕES CONSOLIDADAS 24/08/2026
// 1) Internet Móvel ativa soma GB no Plano Atual e, se mantida, no Plano Novo.
// 2) Internet Móvel em Soluções Contratadas é somente VENDA NOVA.
// 3) Faturamento Limite: Internet Móvel só entra quando for venda nova.
// 4) Resultados: editar e excluir funcionais.
// 5) Cancelamento de propostas com atualização simplificada e fallback.
// ============================================================

function fenixV13ActiveInternetInfo(){
  const base = typeof serviceTotals === "function" ? serviceTotals() : {selected:[]};
  const selected = base?.selected || [];
  let currentGb = 0;
  let newGb = 0;
  for(const x of selected){
    const svc=(state.services||[]).find(s=>String(s.id)===String(x.serviceId));
    if(!svc?.fenixActiveInternet) continue;
    const gb=(Number(svc.fenixGb)||0)*(Number(x.quantity)||1);
    currentGb += gb;
    if(x.keepNew) newGb += gb;
  }
  return {currentGb,newGb};
}

// Internet Móvel dentro de Soluções Contratadas: remove Migração e força Produto Novo.
function fenixV13SyncInternetProductMode(){
  const category=$("productCategory")?.value;
  const type=$("productType");
  const internet=category==="internet_movel";
  if(!type)return;

  const migrationOption=[...type.options].find(o=>o.value==="migration");
  if(migrationOption) migrationOption.hidden=internet;
  if(internet){
    type.value="new";
    type.disabled=true;
    $("currentProductValueWrapper")?.classList.add("hidden");
    $("productMWrapper")?.classList.add("hidden");
  }else if(category!=="aparelho"){
    type.disabled=false;
  }
}

const fenixV13RenderProductOptionsBase=renderProductOptions;
renderProductOptions=function(){
  const r=fenixV13RenderProductOptionsBase();
  fenixV13SyncInternetProductMode();
  return r;
};

const fenixV13AddProductBase=addProduct;
addProduct=function(){
  if($("productCategory")?.value==="internet_movel" && $("productType")){
    $("productType").value="new";
  }
  return fenixV13AddProductBase();
};

// Cálculo final autoritativo para GB e faturamento limite.
const fenixV13CalcBase=calc;
calc=function(){
  const c=fenixV13CalcBase();
  const active=fenixV13ActiveInternetInfo();

  // O cálculo v12 já somava Internet Móvel ativa mantida ao Plano Novo.
  // Aqui garantimos que ela também entre no Plano Atual sem duplicar o Plano Novo.
  c.currentGb=(+($("currentFranchise")?.value||0))+active.currentGb;

  // Recalcula o novo GB a partir das partes para evitar duplicidade de patches antigos.
  const mobileItems=Array.isArray(state.mobileItems)?state.mobileItems:[];
  const productItems=Array.isArray(state.productItems)?state.productItems:[];
  const smeItems=Array.isArray(state.smeItems)?state.smeItems:[];
  const keptMobile=mobileItems.filter(fenixV12KeepMobile);
  const keptProducts=productItems.filter(fenixV12KeepProduct);
  const mobileNewGb=keptMobile.reduce((s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1),0);
  const smeGb=smeItems.reduce((s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1),0);
  const contractedInternetGb=keptProducts
    .filter(i=>fenixV12IsInternetMobile(i) && i.type!=="migration")
    .reduce((s,i)=>s+fenixV12ProductGb(i)*(Number(i.quantity)||1),0);
  c.newGb=mobileNewGb+smeGb+contractedInternetGb+active.newGb;

  // Faturamento Limite = linhas móveis elegíveis + Internet Móvel SOMENTE venda nova.
  const eligibleMobile=keptMobile.reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0);
  const eligibleInternetNew=keptProducts
    .filter(i=>fenixV12IsInternetMobile(i) && i.type!=="migration")
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1),0);
  c.eligible=eligibleMobile+eligibleInternetNew;
  c.diff=Math.max(0,(Number(c.limit)||0)-c.eligible);
  return c;
};

const fenixV13UpdateCalcBase=updateCalc;
updateCalc=function(){
  const r=fenixV13UpdateCalcBase();
  const c=calc();
  if($("currentPlanMeta")) $("currentPlanMeta").textContent=`${c.migrationLines} linhas • ${c.currentGb} GB`;
  if($("newPlanMeta")) $("newPlanMeta").textContent=`${c.nextLines} linhas • ${c.newGb} GB${c.esimCount?` • ${c.esimCount} E-SIM`:""}`;
  if($("eligibleTotalDisplay")) $("eligibleTotalDisplay").textContent=money(c.eligible);
  if($("billingLimitDisplay")) $("billingLimitDisplay").textContent=money(c.limit);
  return r;
};

const fenixV13PayloadBase=payload;
payload=function(){
  const p=fenixV13PayloadBase();
  const c=calc();
  p.current_franchise_gb=c.currentGb;
  p.new_franchise_gb=c.newGb;
  p.limit_eligible_total_cents=c.eligible;
  if(p.client_snapshot?.current) p.client_snapshot.current.franchiseGb=c.currentGb;
  if(p.client_snapshot?.next) p.client_snapshot.next.franchiseGb=c.newGb;
  return p;
};

// ---------- RESULTADOS: EDITAR / EXCLUIR ----------
let fenixV13EditingResultId=null;

function fenixV13ResetResultForm(){
  fenixV13EditingResultId=null;
  if($("frMigrations")) $("frMigrations").value=0;
  if($("frRevenue")) $("frRevenue").value=0;
  const b=$("frSave"); if(b)b.textContent="Salvar resultado";
  $("frCancelEdit")?.remove();
}

async function fenixEditResult(id){
  if(!supervisor())return;
  const {data,error}=await db.from("consultant_results").select("*").eq("id",id).single();
  if(error||!data)return toast("Não foi possível abrir o resultado para edição.","error");
  fenixV13EditingResultId=id;
  if($("frConsult")) $("frConsult").value=data.profile_id;
  if($("frMigrations")) $("frMigrations").value=Number(data.migrations||0);
  if($("frRevenue")) $("frRevenue").value=((Number(data.revenue_cents)||0)/100).toFixed(2);
  if($("frPeriod")) $("frPeriod").value=String(data.period_month||"").slice(0,7);
  const b=$("frSave"); if(b)b.textContent="Atualizar resultado";
  if(b && !$("frCancelEdit")){
    const cancel=document.createElement("button");
    cancel.id="frCancelEdit";cancel.type="button";cancel.className="btn btn-secondary";cancel.textContent="Cancelar edição";
    cancel.onclick=fenixV13ResetResultForm;b.insertAdjacentElement("afterend",cancel);
  }
  $("frForm")?.scrollIntoView({behavior:"smooth",block:"center"});
}

async function fenixDeleteResult(id){
  if(!supervisor())return;
  if(!confirm("Excluir este resultado? Esta ação removerá o registro do mês selecionado."))return;
  const {error}=await db.from("consultant_results").delete().eq("id",id);
  if(error){console.error("Excluir resultado:",error);return toast("Não foi possível excluir o resultado.","error");}
  if(String(fenixV13EditingResultId)===String(id))fenixV13ResetResultForm();
  toast("Resultado excluído.","success");
  await fenixLoadResults();
}

fenixSaveResult=async function(){
  const pid=$("frConsult")?.value,period=$("frPeriod")?.value;
  if(!pid||!period)return toast("Selecione consultor e período.","error");
  const row={
    profile_id:pid,
    period_month:period+"-01",
    migrations:Number($("frMigrations")?.value||0),
    revenue_cents:Math.round(Number($("frRevenue")?.value||0)*100),
    updated_by:state.session?.user?.id,
    updated_at:new Date().toISOString()
  };
  let result;
  if(fenixV13EditingResultId){
    result=await db.from("consultant_results").update(row).eq("id",fenixV13EditingResultId);
  }else{
    result=await db.from("consultant_results").upsert(row,{onConflict:"profile_id,period_month"});
  }
  if(result.error){console.error("Salvar resultado:",result.error);return toast("Não foi possível salvar o resultado.","error");}
  $("frMonth").value=period;
  toast(fenixV13EditingResultId?"Resultado atualizado!":"Resultado salvo!","success");
  fenixV13ResetResultForm();
  await fenixLoadResults();
};

fenixLoadResults=async function(){
  const month=$("frMonth")?.value;if(!month)return;
  const {data,error}=await db.from("consultant_results").select("*").eq("period_month",month+"-01").order("created_at",{ascending:true});
  if(error){console.error("Carregar resultados:",error);if($("frTable"))$("frTable").innerHTML="Não foi possível carregar os resultados.";return;}
  const rows=data||[],ps=[...(state.profiles||[]),state.profile].filter(Boolean);
  const nm=id=>ps.find(p=>String(p.id)===String(id))?.name||ps.find(p=>String(p.id)===String(id))?.full_name||"Consultor";
  if($("frMig")) $("frMig").textContent=rows.reduce((s,r)=>s+Number(r.migrations||0),0);
  if($("frRev")) $("frRev").textContent=money(rows.reduce((s,r)=>s+Number(r.revenue_cents||0),0));
  if($("frCount")) $("frCount").textContent=rows.length;
  if($("frTable")) $("frTable").innerHTML=`<table class="frtable"><thead><tr><th>Consultor</th><th>Migrações</th><th>Receita</th>${supervisor()?"<th>Ações</th>":""}</tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(nm(r.profile_id))}</td><td>${r.migrations||0}</td><td>${money(r.revenue_cents||0)}</td>${supervisor()?`<td><div class="row-actions"><button class="mini-btn" type="button" data-fr-edit="${r.id}">Editar</button><button class="mini-btn danger" type="button" data-fr-delete="${r.id}">Excluir</button></div></td>`:""}</tr>`).join("")||`<tr><td colspan="${supervisor()?4:3}">Sem resultados neste mês.</td></tr>`}</tbody></table>`;
  $$('[data-fr-edit]').forEach(b=>b.onclick=()=>fenixEditResult(b.dataset.frEdit));
  $$('[data-fr-delete]').forEach(b=>b.onclick=()=>fenixDeleteResult(b.dataset.frDelete));
};

// ---------- CANCELAMENTO DE PROPOSTAS ----------
async function fenixV13SetProposalStatus(id,status){
  // Primeiro altera somente o status: evita falha por colunas auxiliares/legadas.
  let res=await db.from("proposals").update({status}).eq("id",id).select("id,status").maybeSingle();
  if(res.error){
    console.error("Status proposals:",res.error);
    return {ok:false,error:res.error};
  }
  // Metadados são complementares: se falharem, não desfaz o cancelamento.
  const p=state.proposals.find(x=>String(x.id)===String(id));
  const now=new Date().toISOString();
  const internal={...(p?.internal_data||{})};
  if(status==="Aprovada")internal.approved_at=now;
  if(status==="Cancelada")internal.cancelled_at=now;
  try{await db.from("proposals").update({internal_data:internal}).eq("id",id);}catch(e){console.warn(e)}
  try{await db.from("proposal_events").insert({proposal_id:id,actor_id:state.session.user.id,event_type:"status_alterado",details:{status,changed_at:now}});}catch(e){console.warn(e)}
  return {ok:true};
}

statusChange=async function(id,status){
  const r=await fenixV13SetProposalStatus(id,status);
  if(!r.ok)return toast(`Não foi possível ${status==="Cancelada"?"cancelar":"alterar"} a proposta. Verifique a permissão do Supabase.`,"error");
  await loadProposals();renderProposals();renderDashboard();
  toast(`Status alterado para ${status}.`,"success");
};

fenixBulkCancel=async function(){
  if(!supervisor())return;
  const ids=$$(".proposal-row-check:checked").map(c=>c.value);
  if(!ids.length)return toast("Selecione pelo menos uma proposta.","error");
  if(!confirm(`Cancelar ${ids.length} proposta(s)?`))return;
  let failed=0;
  for(const id of ids){
    const p=state.proposals.find(x=>String(x.id)===String(id));
    if(!p||p.status==="Cancelada")continue;
    const r=await fenixV13SetProposalStatus(id,"Cancelada");
    if(!r.ok)failed++;
  }
  await loadProposals();renderProposals();renderDashboard();
  if(failed)return toast(`${failed} proposta(s) não puderam ser canceladas. Execute o SQL de permissões enviado junto.`,"error");
  toast("Propostas selecionadas canceladas.","success");
};

// Reforça os bindings depois que todo o app carregar.
window.addEventListener("load",()=>setTimeout(()=>{
  if($("productCategory")){
    const old=$("productCategory").onchange;
    $("productCategory").onchange=()=>{if(typeof old==="function")old();else renderProductOptions();fenixV13SyncInternetProductMode();};
  }
  if($("productType")){
    const old=$("productType").onchange;
    $("productType").onchange=()=>{fenixV13SyncInternetProductMode();if(typeof old==="function")old();};
  }
  fenixV13SyncInternetProductMode();
},1200));



// ============================================================
// FÊNIX ONE v14 — CORREÇÃO AUTORITATIVA 25/08/2026
// Base: arquivos enviados em 25/08/2026 às 12:20.
// Este bloco fica por último de propósito para prevalecer sobre patches antigos.
// ============================================================


// ------------------------------------------------------------
// 1. VIVO SYNC EM SERVIÇOS JÁ ATIVOS
// ------------------------------------------------------------
const FENIX_VIVO_SYNC_ID = -990001;

function fenixV14EnsureVivoSync(){
  if(!(state.services||[]).some(s=>fenixNorm(s.name)==="vivo sync")){
    state.services.push({
      id:FENIX_VIVO_SYNC_ID,
      name:"Vivo Sync",
      active:true,
      fenixActiveInternet:false,
      fenixVivoSync:true
    });
  }
}

const fenixV14RenderCatalogsBase = renderCatalogs;
renderCatalogs = function(){
  const r = fenixV14RenderCatalogsBase();
  fenixV14EnsureVivoSync();
  renderServices();
  return r;
};


// ------------------------------------------------------------
// 2. SERVIÇOS JÁ ATIVOS — INTERNET MÓVEL
// GB sempre no Plano Atual; no Novo somente quando "Manter = Sim".
// Valor segue exatamente a mesma regra pelo serviceTotals.
// ------------------------------------------------------------
function fenixV14ActiveInternetTotals(){
  const svc = serviceTotals();
  let currentGb = 0;
  let newGb = 0;

  for(const item of (svc.selected||[])){
    if(!item.fenixActiveInternet) continue;
    const gb = (Number(item.fenixGb)||0) * (Number(item.quantity)||1);
    currentGb += gb;
    if(item.keepNew) newGb += gb;
  }
  return {currentGb,newGb,svc};
}


// ------------------------------------------------------------
// 3. SOLUÇÕES CONTRATADAS — INTERNET MÓVEL
// Somente Produto Novo. Migração não fica nem escondida no select.
// ------------------------------------------------------------
function fenixV14ProductMode(){
  const category = $("productCategory")?.value;
  const type = $("productType");
  if(!type) return;

  if(category === "internet_movel"){
    type.disabled = false;
    type.innerHTML = '<option value="new">Produto Novo</option>';
    type.value = "new";
    type.disabled = true;
    $("currentProductValueWrapper")?.classList.add("hidden");
    $("productMWrapper")?.classList.add("hidden");
    $("fenixProductMigrationExtra")?.classList.add("hidden");
    $("productKeepNewWrapper")?.classList.add("hidden");
    return;
  }

  if(category === "aparelho"){
    type.disabled = false;
    type.innerHTML = '<option value="new">Produto Novo</option>';
    type.value = "new";
    type.disabled = true;
    return;
  }

  const wanted = type.value === "migration" ? "migration" : "new";
  type.disabled = false;
  type.innerHTML =
    '<option value="new">Produto Novo</option>' +
    '<option value="migration">Migração</option>';
  type.value = wanted;
}

const fenixV14RenderProductOptionsBase = renderProductOptions;
renderProductOptions = function(){
  const r = fenixV14RenderProductOptionsBase();
  fenixV14ProductMode();
  return r;
};

const fenixV14AddProductBase = addProduct;
addProduct = function(){
  if($("productCategory")?.value === "internet_movel"){
    const t = $("productType");
    if(t){
      t.disabled = false;
      t.value = "new";
    }
  }
  const r = fenixV14AddProductBase();
  fenixV14ProductMode();
  return r;
};


// ------------------------------------------------------------
// 4. CÁLCULO FINAL
// Internet Móvel ativa: GB Atual/Novo corretos.
// Internet Móvel de migração: NÃO entra no faturamento limite.
// Internet Móvel Produto Novo: entra no faturamento limite.
// ------------------------------------------------------------
const fenixV14CalcBase = calc;
calc = function(){
  const c = fenixV14CalcBase();

  const active = fenixV14ActiveInternetTotals();
  const mobileItems = Array.isArray(state.mobileItems) ? state.mobileItems : [];
  const productItems = Array.isArray(state.productItems) ? state.productItems : [];
  const smeItems = Array.isArray(state.smeItems) ? state.smeItems : [];

  const keptMobile = mobileItems.filter(i =>
    typeof fenixV12KeepMobile === "function" ? fenixV12KeepMobile(i) : true
  );
  const keptProducts = productItems.filter(i =>
    typeof fenixV12KeepProduct === "function" ? fenixV12KeepProduct(i) : true
  );

  const isInternetMobile = i =>
    String(i?.category||"") === "internet_movel" ||
    (typeof fenixV12IsInternetMobile === "function" && fenixV12IsInternetMobile(i));

  const productGb = i => {
    if(typeof fenixV12ProductGb === "function") return Number(fenixV12ProductGb(i))||0;
    const m = `${i?.variant||""} ${i?.name||""}`.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
    return m ? Number(m[1].replace(",",".")) : 0;
  };

  const mobileNewGb = keptMobile.reduce(
    (s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1), 0
  );
  const smeGb = smeItems.reduce(
    (s,i)=>s+(Number(i.gb)||0)*(Number(i.quantity)||1), 0
  );
  const contractedInternetNewGb = keptProducts
    .filter(i=>isInternetMobile(i) && i.type !== "migration")
    .reduce((s,i)=>s+productGb(i)*(Number(i.quantity)||1), 0);

  c.currentGb = (Number($("currentFranchise")?.value)||0) + active.currentGb;
  c.newGb = mobileNewGb + smeGb + contractedInternetNewGb + active.newGb;

  // Elegível móvel permanece conforme a calculadora.
  // Produtos de Internet Móvel entram SOMENTE quando forem Produto Novo.
  const eligibleMobile = keptMobile.reduce(
    (s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1), 0
  );
  const eligibleInternetNew = keptProducts
    .filter(i=>isInternetMobile(i) && i.type !== "migration")
    .reduce((s,i)=>s+(Number(i.priceCents)||0)*(Number(i.quantity)||1), 0);

  c.eligible = eligibleMobile + eligibleInternetNew;
  c.diff = Math.max(0,(Number(c.limit)||0)-c.eligible);
  c.svc = active.svc;

  return c;
};

const fenixV14UpdateCalcBase = updateCalc;
updateCalc = function(){
  try{ fenixV14UpdateCalcBase(); }catch(e){ console.error(e); }
  const c = calc();

  if($("eligibleTotalDisplay")) $("eligibleTotalDisplay").textContent = money(c.eligible);
  if($("currentPlanTotal")) $("currentPlanTotal").textContent = money(c.currentTotal);
  if($("newPlanTotal")) $("newPlanTotal").textContent = money(c.newTotal);

  if($("currentPlanMeta"))
    $("currentPlanMeta").textContent = `${c.migrationLines||0} linhas • ${c.currentGb||0} GB`;

  if($("newPlanMeta"))
    $("newPlanMeta").textContent =
      `${c.nextLines ?? c.migrationLines ?? 0} linhas • ${c.newGb||0} GB${c.esimCount?` • ${c.esimCount} E-SIM`:""}`;

  const box = $("limitStatusBox");
  if(box && $("limitStatusText")){
    if(!c.limit){
      box.className="status-box warning";
      $("limitStatusText").textContent="Informe o limite";
    }else if(c.eligible>=c.limit){
      box.className="status-box success";
      $("limitStatusText").textContent =
        c.eligible>c.limit
          ? `Limite OK • Excedente ${money(c.eligible-c.limit)}`
          : "Faturamento limite OK";
    }else{
      box.className="status-box danger";
      $("limitStatusText").textContent=`Faltam ${money(c.diff)}`;
    }
  }
  return c;
};

const fenixV14PayloadBase = payload;
payload = function(){
  const p = fenixV14PayloadBase();
  const c = calc();

  p.current_franchise_gb = c.currentGb;
  p.new_franchise_gb = c.newGb;
  p.limit_eligible_total_cents = c.eligible;
  p.current_plan_total_cents = c.currentTotal;
  p.new_plan_total_cents = c.newTotal;

  if(p.client_snapshot?.current){
    p.client_snapshot.current.franchiseGb = c.currentGb;
    p.client_snapshot.current.valueCents = c.currentTotal;
  }
  if(p.client_snapshot?.next){
    p.client_snapshot.next.franchiseGb = c.newGb;
    p.client_snapshot.next.valueCents = c.newTotal;
  }
  return p;
};


// ------------------------------------------------------------
// 5. RESULTADOS — EDITAR / EXCLUIR
// ------------------------------------------------------------
let fenixV14EditingResultId = null;
let fenixV14ResultRows = [];

function fenixV14ResetResultForm(){
  fenixV14EditingResultId = null;
  if($("frMigrations")) $("frMigrations").value = 0;
  if($("frRevenue")) $("frRevenue").value = 0;
  if($("frSave")) $("frSave").textContent = "Salvar resultado";
  $("frCancelEditV14")?.remove();
}

function fenixV14EditResult(id){
  const row = fenixV14ResultRows.find(r=>String(r.id)===String(id));
  if(!row) return toast("Resultado não encontrado.","error");

  fenixV14EditingResultId = row.id;
  if($("frConsult")) $("frConsult").value = row.profile_id;
  if($("frMigrations")) $("frMigrations").value = Number(row.migrations||0);
  if($("frRevenue")) $("frRevenue").value = (Number(row.revenue_cents||0)/100).toFixed(2);
  if($("frPeriod")) $("frPeriod").value = String(row.period_month||"").slice(0,7);
  if($("frSave")) $("frSave").textContent = "Atualizar resultado";

  if($("frSave") && !$("frCancelEditV14")){
    const b = document.createElement("button");
    b.id = "frCancelEditV14";
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = "Cancelar edição";
    b.onclick = fenixV14ResetResultForm;
    $("frSave").insertAdjacentElement("afterend",b);
  }
  $("frForm")?.scrollIntoView({behavior:"smooth",block:"center"});
}

async function fenixV14DeleteResult(id){
  if(!supervisor()) return;
  if(!confirm("Excluir este resultado?")) return;

  const {error} = await db.from("consultant_results").delete().eq("id",id);
  if(error){
    console.error("Excluir resultado:",error);
    return toast(error.message || "Não foi possível excluir o resultado.","error");
  }

  if(String(fenixV14EditingResultId)===String(id)) fenixV14ResetResultForm();
  toast("Resultado excluído!","success");
  await fenixLoadResults();
}

fenixSaveResult = async function(){
  const pid = $("frConsult")?.value;
  const period = $("frPeriod")?.value;
  if(!pid || !period) return toast("Selecione consultor e período.","error");

  const row = {
    profile_id:pid,
    period_month:period+"-01",
    migrations:Number($("frMigrations")?.value||0),
    revenue_cents:Math.round(Number($("frRevenue")?.value||0)*100),
    updated_by:state.session?.user?.id,
    updated_at:new Date().toISOString()
  };

  const result = fenixV14EditingResultId
    ? await db.from("consultant_results").update(row).eq("id",fenixV14EditingResultId)
    : await db.from("consultant_results").upsert(row,{onConflict:"profile_id,period_month"});

  if(result.error){
    console.error("Salvar resultado:",result.error);
    return toast(result.error.message || "Não foi possível salvar o resultado.","error");
  }

  if($("frMonth")) $("frMonth").value = period;
  toast(fenixV14EditingResultId ? "Resultado atualizado!" : "Resultado salvo!","success");
  fenixV14ResetResultForm();
  await fenixLoadResults();
};


// ------------------------------------------------------------
// 6. RESPOSTAS FIZ / NÃO CONSEGUI — VISÃO DA SUPERVISORA
// ------------------------------------------------------------
function fenixV14EnsureRoutinePanel(){
  if(!supervisor() || $("fenixRoutinePanelV14")) return;
  const view = $("resultsView");
  if(!view) return;

  const panel = document.createElement("div");
  panel.id = "fenixRoutinePanelV14";
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">ROTINA</p>
        <h3>Respostas dos alertas</h3>
        <p>Veja quem marcou FIZ ou NÃO CONSEGUI.</p>
      </div>
      <label>Consultor
        <select id="fenixRoutineConsultV14">
          <option value="">Todos os consultores</option>
        </select>
      </label>
    </div>
    <div id="fenixRoutineTableV14" class="table-wrap"></div>
  `;
  view.appendChild(panel);

  const sel = $("fenixRoutineConsultV14");
  const people = (state.profiles||[])
    .filter(p=>p.active!==false && String(p.role||"").toLowerCase()!=="supervisora")
    .sort((a,b)=>String(a.full_name||a.name||"").localeCompare(String(b.full_name||b.name||""),"pt-BR"));

  sel.innerHTML = '<option value="">Todos os consultores</option>' +
    people.map(p=>`<option value="${p.id}">${esc(p.full_name||p.name||p.email||"Consultor")}</option>`).join("");
  sel.onchange = fenixV14LoadRoutineResponses;
}

async function fenixV14LoadRoutineResponses(){
  if(!supervisor()) return;
  fenixV14EnsureRoutinePanel();

  const target = $("fenixRoutineTableV14");
  const month = $("frMonth")?.value;
  if(!target || !month) return;

  const [y,m] = month.split("-").map(Number);
  const next = new Date(y,m,1);
  const end = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-01`;
  const start = `${month}-01`;
  const consultant = $("fenixRoutineConsultV14")?.value || "";

  let q = db.from("routine_alert_responses")
    .select("*")
    .gte("response_date",start)
    .lt("response_date",end)
    .order("response_date",{ascending:false})
    .order("created_at",{ascending:false});

  if(consultant) q = q.eq("profile_id",consultant);

  const {data,error} = await q;
  if(error){
    console.error("Respostas rotina:",error);
    target.innerHTML = `<div class="info-callout"><strong>Não foi possível carregar as respostas.</strong><p>${esc(error.message||"Execute o SQL v14 no Supabase.")}</p></div>`;
    return;
  }

  const profiles = [...(state.profiles||[]),state.profile].filter(Boolean);
  const nm = id => {
    const p = profiles.find(x=>String(x.id)===String(id));
    return p?.full_name||p?.name||p?.email||"Consultor";
  };

  const rows = data||[];
  target.innerHTML = `
    <table class="frtable">
      <thead><tr><th>Consultor</th><th>Data</th><th>Tarefa / alerta</th><th>Resposta</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r=>`
          <tr>
            <td>${esc(nm(r.profile_id))}</td>
            <td>${brDate(r.response_date)}</td>
            <td>${esc(r.alert_text||r.alert_id||"-")}</td>
            <td><span class="routine-pill ${r.response==="FIZ"?"routine-ok":"routine-no"}">${r.response==="FIZ"?"✅ FIZ":"❌ NÃO CONSEGUI"}</span></td>
          </tr>`).join("") : '<tr><td colspan="4">Nenhuma resposta registrada neste período.</td></tr>'}
      </tbody>
    </table>`;
}

fenixLoadResults = async function(){
  const month = $("frMonth")?.value;
  if(!month) return;

  const {data,error} = await db.from("consultant_results")
    .select("*")
    .eq("period_month",month+"-01")
    .order("created_at",{ascending:true});

  if(error){
    console.error("Carregar resultados:",error);
    if($("frTable")) $("frTable").innerHTML = "Não foi possível carregar os resultados.";
    return;
  }

  const rows = data||[];
  fenixV14ResultRows = rows;
  const profiles = [...(state.profiles||[]),state.profile].filter(Boolean);
  const nm = id => {
    const p = profiles.find(x=>String(x.id)===String(id));
    return p?.full_name||p?.name||p?.email||"Consultor";
  };

  if($("frMig")) $("frMig").textContent = rows.reduce((s,r)=>s+Number(r.migrations||0),0);
  if($("frRev")) $("frRev").textContent = money(rows.reduce((s,r)=>s+Number(r.revenue_cents||0),0));
  if($("frCount")) $("frCount").textContent = new Set(rows.map(r=>String(r.profile_id))).size;

  if($("frTable")){
    $("frTable").innerHTML = `
      <table class="frtable">
        <thead><tr><th>Consultor</th><th>Migrações</th><th>Receita</th>${supervisor()?"<th>Ações</th>":""}</tr></thead>
        <tbody>
          ${rows.length ? rows.map(r=>`
            <tr>
              <td>${esc(nm(r.profile_id))}</td>
              <td>${Number(r.migrations||0)}</td>
              <td>${money(Number(r.revenue_cents||0))}</td>
              ${supervisor()?`<td><div class="row-actions">
                <button type="button" class="mini-btn" data-v14-edit-result="${r.id}">Editar</button>
                <button type="button" class="mini-btn mini-btn-danger" data-v14-delete-result="${r.id}">Excluir</button>
              </div></td>`:""}
            </tr>`).join("") : `<tr><td colspan="${supervisor()?4:3}">Sem resultados neste mês.</td></tr>`}
        </tbody>
      </table>`;

    $$("[data-v14-edit-result]").forEach(b=>b.onclick=()=>fenixV14EditResult(b.dataset.v14EditResult));
    $$("[data-v14-delete-result]").forEach(b=>b.onclick=()=>fenixV14DeleteResult(b.dataset.v14DeleteResult));
  }

  if(supervisor()){
    fenixV14EnsureRoutinePanel();
    await fenixV14LoadRoutineResponses();
  }
};


// ------------------------------------------------------------
// 7. SOM DOS ALERTAS E NOTIFICAÇÕES
// ------------------------------------------------------------
let fenixV14AudioCtx = null;
let fenixV14AudioReady = false;

function fenixV14UnlockAudio(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    fenixV14AudioCtx ||= new Ctx();
    if(fenixV14AudioCtx.state==="suspended") fenixV14AudioCtx.resume();
    fenixV14AudioReady = true;
  }catch(e){ console.warn("Áudio:",e); }
}

["click","keydown","touchstart"].forEach(evt =>
  window.addEventListener(evt,fenixV14UnlockAudio,{passive:true})
);

function fenixV14Sound(){
  try{
    fenixV14UnlockAudio();
    if(!fenixV14AudioCtx || fenixV14AudioCtx.state!=="running") return;
    const t = fenixV14AudioCtx.currentTime;
    const gain = fenixV14AudioCtx.createGain();
    const osc = fenixV14AudioCtx.createOscillator();
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(.16,t+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.45);
    osc.frequency.setValueAtTime(740,t);
    osc.frequency.setValueAtTime(940,t+.16);
    osc.connect(gain); gain.connect(fenixV14AudioCtx.destination);
    osc.start(t); osc.stop(t+.46);
  }catch(e){ console.warn("Som:",e); }
}

const fenixV14AlertShowBase = fenixAlertShow;
fenixAlertShow = function(a){
  const existed = !!$("frAlert");
  const r = fenixV14AlertShowBase(a);
  if(!existed && $("frAlert")) fenixV14Sound();
  return r;
};

let fenixV14NotifInitialized = false;
let fenixV14KnownNotifIds = new Set();
const fenixV14LoadNotificationsBase = loadNotifications;
loadNotifications = async function(){
  const before = new Set(fenixV14KnownNotifIds);
  const r = await fenixV14LoadNotificationsBase();
  const now = new Set((state.notifications||[]).map(n=>String(n.id)));
  if(fenixV14NotifInitialized && [...now].some(id=>!before.has(id))) fenixV14Sound();
  fenixV14KnownNotifIds = now;
  fenixV14NotifInitialized = true;
  return r;
};


// ------------------------------------------------------------
// 8. CANCELAMENTO INDIVIDUAL E EM MASSA
// ------------------------------------------------------------
async function fenixV14SetProposalStatus(id,status){
  const {data,error} = await db.from("proposals")
    .update({status})
    .eq("id",id)
    .select("id,status");

  if(error){
    console.error("Alterar proposta:",error);
    return {ok:false,error};
  }
  if(!data?.length){
    return {ok:false,error:{message:"A proposta não foi atualizada. Verifique a permissão do Supabase."}};
  }

  const p = state.proposals.find(x=>String(x.id)===String(id));
  const now = new Date().toISOString();
  const internal = {...(p?.internal_data||{})};
  if(status==="Cancelada") internal.cancelled_at = now;
  if(status==="Aprovada") internal.approved_at = now;

  // Complementares: não impedem o status principal.
  db.from("proposals").update({internal_data:internal}).eq("id",id).then(()=>{}).catch(()=>{});
  db.from("proposal_events").insert({
    proposal_id:id,
    actor_id:state.session.user.id,
    event_type:"status_alterado",
    details:{status,changed_at:now}
  }).then(()=>{}).catch(()=>{});

  return {ok:true};
}

statusChange = async function(id,status){
  const r = await fenixV14SetProposalStatus(id,status);
  if(!r.ok) return toast(r.error?.message || "Não foi possível alterar a proposta.","error");
  await loadProposals();
  renderProposals();
  renderDashboard();
  toast(`Status alterado para ${status}.`,"success");
};

fenixBulkCancel = async function(){
  if(!supervisor()) return toast("Apenas a Supervisora pode cancelar em massa.","error");
  const ids = $$(".proposal-row-check:checked").map(c=>c.value);
  if(!ids.length) return toast("Selecione pelo menos uma proposta.","error");
  if(!confirm(`Cancelar ${ids.length} proposta(s) selecionada(s)?`)) return;

  let ok = 0, failed = 0;
  for(const id of ids){
    const p = state.proposals.find(x=>String(x.id)===String(id));
    if(!p || p.status==="Cancelada") continue;
    const r = await fenixV14SetProposalStatus(id,"Cancelada");
    r.ok ? ok++ : failed++;
  }

  await loadProposals();
  renderProposals();
  renderDashboard();

  if(failed) return toast(`${ok} cancelada(s). ${failed} falharam. Execute o SQL v14 no Supabase.`,"error");
  toast(`${ok} proposta(s) cancelada(s)!`,"success");
};


// ------------------------------------------------------------
// 9. BINDINGS FINAIS — executados depois de todos os códigos antigos
// ------------------------------------------------------------
function fenixV14Bind(){
  fenixV14EnsureVivoSync();
  renderServices();
  fenixV14ProductMode();

  if($("productCategory")){
    $("productCategory").onchange = ()=>{
      renderProductOptions();
      fenixV14ProductMode();
    };
  }

  if($("productType")){
    $("productType").onchange = ()=>{
      const migration = $("productType").value==="migration";
      $("currentProductValueWrapper")?.classList.toggle("hidden",!migration);
      $("productMWrapper")?.classList.toggle("hidden",!migration);
      fenixV14ProductMode();
    };
  }

  if($("frSave")) $("frSave").onclick = fenixSaveResult;
  if($("frMonth")) $("frMonth").onchange = fenixLoadResults;
  if($("frRefresh")) $("frRefresh").onclick = fenixLoadResults;
  if($("bulkCancelProposalsBtn")) $("bulkCancelProposalsBtn").onclick = fenixBulkCancel;

  try{ updateCalc(); }catch(e){ console.error(e); }
}

window.addEventListener("load",()=>{
  setTimeout(fenixV14Bind,700);
  setTimeout(fenixV14Bind,3000);
  setTimeout(fenixV14Bind,7000);
});

document.addEventListener("click",e=>{
  if(e.target?.closest?.('[data-view="resultsView"]')){
    setTimeout(()=>{
      fenixV14Bind();
      fenixLoadResults();
    },100);
  }
});
