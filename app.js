/* NOREMA — lógica de catálogo, carrito, tasa BCV y pedidos por WhatsApp */
const WHATSAPP_NUMBER = "584148804424";
const FALLBACK_RATE = 450; // Referencia de emergencia. Ajusta este valor en netlify/functions/bcv.js también.
const ALLOWED_HOME_STATES = ["Aragua","Carabobo","Distrito Capital","La Guaira","Lara","Miranda","Yaracuy","Zulia"];
const VENEZUELA_STATES = ["Amazonas","Anzoátegui","Apure","Aragua","Barinas","Bolívar","Carabobo","Cojedes","Delta Amacuro","Distrito Capital","Falcón","Guárico","La Guaira","Lara","Mérida","Miranda","Monagas","Nueva Esparta","Portuguesa","Sucre","Táchira","Trujillo","Yaracuy","Zulia"];

let products = [];
let bcvRate = FALLBACK_RATE;
let rateIsFallback = true;
let cart = JSON.parse(localStorage.getItem("norema-cart") || "[]");
let activeCategory = "Todos";
let searchTerm = "";
let pendingOrder = [];
let pendingFromCart = false;

const $ = (selector) => document.querySelector(selector);
const moneyUSD = (value) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value)||0);
const moneyBs = (value) => "Bs. " + new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(value)||0)*bcvRate);
const byId = (id) => products.find(p => p.id === id);
const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const persistCart = () => localStorage.setItem("norema-cart", JSON.stringify(cart));
const cartCount = () => cart.reduce((sum,item)=>sum+item.qty,0);
const cartTotal = () => cart.reduce((sum,item)=>sum+(byId(item.id)?.priceUSD||0)*item.qty,0);

async function loadRate(){
  try{
    const response = await fetch("/.netlify/functions/bcv",{headers:{"Accept":"application/json"},cache:"no-store"});
    if(!response.ok) throw new Error("No fue posible consultar la tasa");
    const data = await response.json();
    if(!Number.isFinite(Number(data.rate)) || Number(data.rate)<=0) throw new Error("Tasa inválida");
    bcvRate = Number(data.rate); rateIsFallback = Boolean(data.fallback);
    const date = data.updatedAt ? new Date(data.updatedAt) : new Date();
    const formattedDate = new Intl.DateTimeFormat("es-VE",{day:"2-digit",month:"short",year:"numeric"}).format(date);
    $("#rate-label").textContent = `${rateIsFallback ? "Tasa de referencia" : "Tasa BCV"}: ${new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(bcvRate)} Bs/USD`;
    $("#header-rate").textContent = `${new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(bcvRate)} Bs/USD`;
    $("#rate-date").textContent = `Actualizada: ${formattedDate}`;
  }catch(error){
    bcvRate = FALLBACK_RATE; rateIsFallback = true;
    $("#rate-label").textContent = `Tasa de referencia: ${new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(bcvRate)} Bs/USD`;
    $("#header-rate").textContent = `${bcvRate.toFixed(2)} Bs/USD`;
    $("#rate-date").textContent = "Valor de respaldo";
  }
  renderProducts(); renderCart(); renderOrderSummary();
}

async function loadProducts(){
  try{
    const response = await fetch("/products.json",{cache:"no-cache"});
    if(!response.ok) throw new Error("No se pudo cargar products.json");
    products = await response.json();
    if(!Array.isArray(products)) throw new Error("El catálogo debe ser una lista");
    renderCategories(); renderProducts(); renderCart();
  }catch(error){ $("#product-grid").innerHTML = '<p class="loading">No pudimos cargar el catálogo. Revisa products.json.</p>'; console.error(error); }
}

function renderCategories(){
  const categories = ["Todos",...new Set(products.map(p=>p.category).filter(Boolean))];
  $("#category-links").innerHTML = categories.map(category=>`<button class="category-link ${category===activeCategory?"active":""}" data-category="${safeText(category)}">${safeText(category)}</button>`).join("");
}
function getVisibleProducts(){
  let list = products.filter(p=>(activeCategory==="Todos"||p.category===activeCategory) && `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const sort = $("#sort-select")?.value;
  if(sort==="low") list.sort((a,b)=>a.priceUSD-b.priceUSD);
  if(sort==="high") list.sort((a,b)=>b.priceUSD-a.priceUSD);
  return list;
}
function renderProducts(){
  if(!$("#product-grid")) return;
  const list = getVisibleProducts();
  $("#product-grid").innerHTML = list.map(p=>{
    const image = p.images?.[0] || "";
    return `<article class="product-card">
      <div class="product-image" data-detail="${safeText(p.id)}"><img src="${safeText(image)}" alt="${safeText(p.name)}" loading="lazy" onerror="this.src='https://placehold.co/700x700/f1f4fa/718096?text=NOREMA'">
      ${p.badge?`<span class="product-badge">${safeText(p.badge)}</span>`:""}${p.freeShipping?'<span class="product-badge" style="top:auto;bottom:12px;background:#e9f8ef;color:#16884b">Envío gratis</span>':""}</div>
      <div class="product-info"><span class="product-category">${safeText(p.category||"NOREMA")}</span><h3>${safeText(p.name)}</h3>
      <p class="product-desc">${safeText(p.description)}</p><div class="price-usd">${moneyUSD(p.priceUSD)}</div><div class="price-bs">${moneyBs(p.priceUSD)}</div>
      <div class="product-actions"><button class="btn btn-primary" data-buy="${safeText(p.id)}">Comprar ahora</button><button class="btn-outline" data-add="${safeText(p.id)}">＋ Agregar</button></div></div></article>`;
  }).join("");
  $("#empty-state").classList.toggle("hidden",list.length>0);
}
function addToCart(id,qty=1){
  const product=byId(id); if(!product||product.stock<=0)return;
  const existing=cart.find(i=>i.id===id);
  if(existing) existing.qty=Math.min(product.stock,existing.qty+qty); else cart.push({id,qty:Math.min(product.stock,qty)});
  persistCart();renderCart();openCart();
}
function changeQty(id,delta){
  const item=cart.find(i=>i.id===id), product=byId(id);if(!item||!product)return;
  item.qty=Math.min(product.stock,item.qty+delta);
  if(item.qty<=0)cart=cart.filter(i=>i.id!==id);
  persistCart();renderCart();renderOrderSummary();
}
function renderCart(){
  if(!$("#cart-items"))return;
  $("#cart-count").textContent=cartCount();
  $("#cart-items").innerHTML=cart.length?cart.map(item=>{
    const p=byId(item.id);if(!p)return "";
    return `<div class="cart-line"><img src="${safeText(p.images?.[0]||"")}" alt=""><div><h4>${safeText(p.name)}</h4><small>${moneyUSD(p.priceUSD)} · ${moneyBs(p.priceUSD)}</small><div class="qty-control"><button data-qty="${safeText(p.id)}" data-delta="-1" aria-label="Restar">−</button><span>${item.qty}</span><button data-qty="${safeText(p.id)}" data-delta="1" aria-label="Sumar">+</button></div></div><button class="remove-item" data-remove="${safeText(p.id)}" aria-label="Eliminar">×</button></div>`;
  }).join(""):'<p class="loading">Tu carrito está vacío.</p>';
  $("#cart-total-usd").textContent=moneyUSD(cartTotal());$("#cart-total-bs").textContent=moneyBs(cartTotal());
}
function openCart(){ $("#cart-panel").classList.add("open");$("#cart-overlay").classList.add("open");$("#cart-panel").setAttribute("aria-hidden","false"); }
function closeCart(){ $("#cart-panel").classList.remove("open");$("#cart-overlay").classList.remove("open");$("#cart-panel").setAttribute("aria-hidden","true"); }

function openDetail(id){
  const p=byId(id);if(!p)return;
  const images=(p.images||[]).map((src,i)=>`<img src="${safeText(src)}" alt="${safeText(p.name)} ${i+1}" loading="lazy">`).join("");
  $("#detail-content").innerHTML=`<div class="detail-layout"><div>${images||'<div class="loading">Sin imágenes</div>'}</div><div><span class="eyebrow">${safeText(p.category||"NOREMA")}</span><h2>${safeText(p.name)}</h2><p>${safeText(p.description)}</p><div class="detail-price">${moneyUSD(p.priceUSD)}</div><div class="detail-bs">${moneyBs(p.priceUSD)}</div><p>${p.stock>0?`Disponibles: ${p.stock} unidades`:"Agotado"}</p><button class="btn btn-primary btn-block" data-buy="${safeText(p.id)}" ${p.stock<=0?"disabled":""}>Comprar ahora</button></div></div>`;
  $("#detail-modal").classList.add("open");
}
function closeModal(id){$("#"+id).classList.remove("open");}
function beginOrder(items, fromCart=false){
  pendingFromCart = fromCart;
  if(!items.length){openCart();return;}
  pendingOrder=items.map(i=>({...i}));
  renderOrderSummary();closeCart();$("#form-error").classList.add("hidden");$("#order-form-view").classList.remove("hidden");$("#success-view").classList.add("hidden");
  $("#order-form").reset();$("#shipping-notice").classList.add("hidden");$("#order-modal").classList.add("open");
}
function renderOrderSummary(){
  if(!$("#order-summary"))return;
  const items=pendingOrder.map(item=>{const p=byId(item.id);return p?{p,qty:item.qty}:null}).filter(Boolean);
  const total=items.reduce((s,i)=>s+i.p.priceUSD*i.qty,0);
  $("#order-summary").innerHTML=items.map(({p,qty})=>`<div class="summary-row"><span>${safeText(p.name)} × ${qty}</span><strong>${moneyUSD(p.priceUSD*qty)}</strong></div>`).join("")+`<div class="summary-row summary-total"><span>Total</span><strong>${moneyUSD(total)}</strong></div><div class="summary-row summary-bs"><span>Equivalente referencial</span><strong>${moneyBs(total)}</strong></div>`;
}
function validateShipping(){
  const method=$('input[name="shipping"]:checked')?.value;
  const state=$("#state-select").value;
  const notice=$("#shipping-notice");notice.classList.add("hidden");
  if(method==="Delivery Express en 1 Hora" && state && state!=="Distrito Capital"){
    notice.textContent="El Delivery Express en 1 Hora solo está disponible en Distrito Capital (Caracas). Selecciona Distrito Capital o elige otro método de envío.";notice.classList.remove("hidden");return false;
  }
  if(method==="Envío a Domicilio + Pagas al Recibir" && state && !ALLOWED_HOME_STATES.includes(state)){
    notice.textContent="El envío a domicilio con pago al recibir no está disponible en ese estado. Selecciona uno de los estados permitidos o elige otro método.";notice.classList.remove("hidden");return false;
  }
  if(method==="Envío Gratis + Pago Anticipado"){
    notice.textContent="Importante: los datos para realizar el pago anticipado se coordinarán contigo por WhatsApp.";notice.classList.remove("hidden");
  }
  return true;
}
function submitOrder(event){
  event.preventDefault();
  const form=$("#order-form"), error=$("#form-error");
  if(!form.reportValidity())return;
  if(!cart.length && !pendingOrder.length){error.textContent="Tu pedido está vacío.";error.classList.remove("hidden");return;}
  if(!validateShipping()){error.textContent="Corrige el método de envío según el estado seleccionado.";error.classList.remove("hidden");return;}
  const data=new FormData(form);
  const phone=String(data.get("phone")).replace(/[\s-]/g,"");
  if(!/^0(412|414|416|424|426|422)\d{7}$/.test(phone)){error.textContent="Ingresa un número móvil venezolano válido, por ejemplo 0412-1234567.";error.classList.remove("hidden");return;}
  const cedula=String(data.get("cedula")).toUpperCase().replace(/[\s-]/g,"");
  if(!/^[VE]\d{5,9}$/.test(cedula)){error.textContent="La cédula debe tener prefijo V o E seguido de 5 a 9 números.";error.classList.remove("hidden");return;}
  const items=pendingOrder.map(i=>({p:byId(i.id),qty:i.qty})).filter(i=>i.p);
  const total=items.reduce((s,i)=>s+i.p.priceUSD*i.qty,0);
  const productText=items.map(i=>`${i.p.name} x${i.qty} (${moneyUSD(i.p.priceUSD*i.qty)})`).join("; ");
  const message=`🛒 *NUEVO PEDIDO*\n📦 Producto(s): ${productText}\n💵 Total: ${moneyUSD(total)} (${moneyBs(total)})\n🚚 Método de envío: ${data.get("shipping")}\n👤 Nombre: ${data.get("firstName")} ${data.get("lastName")}\n🪪 Cédula: ${cedula}\n📱 WhatsApp: ${data.get("phone")}\n📍 Estado: ${data.get("state")} | Ciudad: ${data.get("city")}\n🏠 Dirección exacta: ${data.get("address")}\n📌 Punto de referencia: ${data.get("reference")}`;
  const url=`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  // Abre WhatsApp en una pestaña nueva. No se envía información a un servidor de la tienda.
  window.open(url,"_blank","noopener,noreferrer");
  if(pendingFromCart){cart=[];persistCart();renderCart();}
  $("#order-form-view").classList.add("hidden");$("#success-view").classList.remove("hidden");
}
function init(){
  $("#year").textContent=new Date().getFullYear();
  VENEZUELA_STATES.forEach(state=>{const option=document.createElement("option");option.value=state;option.textContent=state;$("#state-select").append(option);});
  loadProducts();loadRate();
  $("#search-form").addEventListener("submit",e=>{e.preventDefault();searchTerm=$("#search-input").value;$("#mobile-search").value=searchTerm;renderProducts();});
  $("#search-input").addEventListener("input",e=>{searchTerm=e.target.value;renderProducts();});
  $("#mobile-search").addEventListener("input",e=>{searchTerm=e.target.value;$("#search-input").value=searchTerm;renderProducts();});
  $("#category-links").addEventListener("click",e=>{const btn=e.target.closest("[data-category]");if(!btn)return;activeCategory=btn.dataset.category;renderCategories();renderProducts();});
  $("#sort-select").addEventListener("change",renderProducts);
  $("#product-grid").addEventListener("click",e=>{
    const buy=e.target.closest("[data-buy]"),add=e.target.closest("[data-add]"),detail=e.target.closest("[data-detail]");
    if(buy){beginOrder([{id:buy.dataset.buy,qty:1}]);return;}
    if(add){addToCart(add.dataset.add);return;}
    if(detail)openDetail(detail.dataset.detail);
  });
  $("#detail-content").addEventListener("click",e=>{const buy=e.target.closest("[data-buy]");if(buy){closeModal("detail-modal");beginOrder([{id:buy.dataset.buy,qty:1}]);}});
  $("#open-cart").addEventListener("click",openCart);$("#close-cart").addEventListener("click",closeCart);$("#cart-overlay").addEventListener("click",closeCart);
  $("#cart-items").addEventListener("click",e=>{const qty=e.target.closest("[data-qty]"),remove=e.target.closest("[data-remove]");if(qty)changeQty(qty.dataset.qty,Number(qty.dataset.delta));if(remove){cart=cart.filter(i=>i.id!==remove.dataset.remove);persistCart();renderCart();}});
  $("#checkout-button").addEventListener("click",()=>beginOrder(cart,true));
  $("#order-form").addEventListener("change",e=>{if(e.target.name==="shipping"||e.target.name==="state")validateShipping();});
  $("#order-form").addEventListener("submit",submitOrder);
  document.querySelectorAll("[data-close]").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop=>backdrop.addEventListener("click",e=>{if(e.target===backdrop)backdrop.classList.remove("open");}));
  $("#finish-order").addEventListener("click",()=>{closeModal("order-modal");pendingOrder=[];pendingFromCart=false;});
  $("#menu-toggle").addEventListener("click",()=>$("#category-nav").classList.toggle("open"));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeCart();document.querySelectorAll(".modal-backdrop.open").forEach(m=>m.classList.remove("open"));}});
}
document.addEventListener("DOMContentLoaded",init);
