// Bag + checkout. Product cards are rendered at build time (good for SEO);
// this script only adds interactivity. CONFIG and PRODUCTS arrive as window.VV.
(function () {
  const { config: CONFIG, products: PRODUCTS } = window.VV;
  const $ = s => document.querySelector(s);
  const money = n => "$" + n.toFixed(2);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("vv-cart") || "[]"); } catch (e) { cart = []; }
  const save = () => { try { localStorage.setItem("vv-cart", JSON.stringify(cart)); } catch (e) {} };

  function totals() {
    const sub = cart.reduce((a, l) => a + l.qty * l.price, 0);
    const pickup = !!(document.getElementById("pickup") || {}).checked;
    const ship = sub === 0 || pickup || (CONFIG.freeShipOver > 0 && sub >= CONFIG.freeShipOver) ? 0 : CONFIG.shipping;
    return { sub, ship };
  }

  function renderCart() {
    $("#count").textContent = cart.reduce((a, l) => a + l.qty, 0);
    const { sub, ship } = totals();
    $("#subtotal").textContent = money(sub) + (ship ? ` + ${money(ship)} ship` : sub ? " · free ship" : "");
    $("#lines").innerHTML = cart.length ? cart.map((l, i) => `<div class="line">
        <strong>${esc(l.name)}</strong><span class="mono">${money(l.price * l.qty)}</span>
        <span class="mono">${/^one size$/i.test(l.size) ? "" : esc(l.size)}</span>
        <span class="qty"><button type="button" data-i="${i}" data-d="-1" aria-label="Remove one">−</button><span>${l.qty}</span><button type="button" data-i="${i}" data-d="1" aria-label="Add one">+</button></span>
      </div>`).join("") : `<p class="empty">Your bag is empty. Pick a frame from the first roll.</p>`;
  }

  function openCart(open) {
    $("#drawer").hidden = !open; $("#scrim").hidden = !open;
    if (open) { renderCart(); $("#closeCart").focus(); }
  }

  document.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip) {
      document.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === chip));
      document.querySelectorAll(".item").forEach(it => { it.hidden = chip.dataset.f !== "all" && it.dataset.cat !== chip.dataset.f; });
    }
    const add = e.target.closest(".add");
    if (add) {
      const p = PRODUCTS.find(x => x.id === add.dataset.id);
      if (p.stripe) { window.location.href = p.stripe; return; }
      const sel = document.getElementById("sz-" + p.id);
      const size = sel ? sel.value : p.sizes[0];
      const hit = cart.find(l => l.id === p.id && l.size === size);
      hit ? hit.qty++ : cart.push({ id: p.id, name: p.name, price: p.price, size, qty: 1 });
      save(); renderCart();
      add.textContent = "Added"; setTimeout(() => { add.textContent = "Add to bag"; }, 1200);
    }
    const q = e.target.closest(".qty button");
    if (q) {
      const l = cart[+q.dataset.i]; l.qty += +q.dataset.d;
      if (l.qty <= 0) cart.splice(+q.dataset.i, 1);
      save(); renderCart();
    }
  });
  $("#openCart").addEventListener("click", () => openCart(true));
  $("#closeCart").addEventListener("click", () => openCart(false));
  $("#scrim").addEventListener("click", () => openCart(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") openCart(false); });

  function orderText(buyer) {
    const { sub, ship } = totals();
    return [
      `${CONFIG.brand} order request`,
      `Name: ${buyer.name}`, `Contact: ${buyer.contact}`, `Ship to: ${buyer.ship}`, ``,
      ...cart.map(l => `${l.qty} x ${l.name}${/^one size$/i.test(l.size) ? "" : ` (${l.size})`} ${money(l.qty * l.price)}`), ``,
      `Subtotal ${money(sub)}  Shipping ${money(ship)}  Total ${money(sub + ship)}`
    ].join("\n");
  }

  const pickupBox = document.getElementById("pickup");
  if (pickupBox) pickupBox.addEventListener("change", renderCart);

  function manualFallback(buyer) {
    const text = orderText(buyer), done = $("#done");
    done.hidden = false;
    done.innerHTML = `<strong>We couldn't send that automatically.</strong> Copy your order and send it to <span style="user-select:all">${esc(CONFIG.orderEmail)}</span>.
      <pre id="orderText">${esc(text)}</pre><button class="btn" type="button" id="copyOrder">Copy order</button>`;
    $("#copyOrder").addEventListener("click", ev => {
      const b = ev.currentTarget;
      navigator.clipboard.writeText(text).then(() => { b.textContent = "Copied"; }, () => {
        const r = document.createRange(); r.selectNodeContents($("#orderText"));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected";
      });
    });
    done.scrollIntoView({ block: "nearest" });
  }
  const showMsg = html => { const done = $("#done"); done.hidden = false; done.innerHTML = html; done.scrollIntoView({ block: "nearest" }); };

  $("#checkout").addEventListener("submit", async e => {
    e.preventDefault();
    if (!cart.length) return;
    const stripe = CONFIG.checkout === "stripe";
    const val = id => (document.getElementById(id) || { value: "" }).value.trim();
    const buyer = { name: val("buyerName"), contact: val("buyerContact"), ship: val("buyerShip") };
    const btn = $("#placeOrder"), label = btn.textContent;
    btn.disabled = true; btn.textContent = stripe ? "Opening secure checkout…" : "Sending…";
    let res, data = {};
    try {
      res = await fetch("/api/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer, pickup: !!(pickupBox && pickupBox.checked), items: cart.map(l => ({ id: l.id, size: l.size, qty: l.qty })), website: $("#website").value })
      });
      data = await res.json().catch(() => ({}));
    } catch (err) { res = null; }
    btn.disabled = false; btn.textContent = label;
    if (res && res.ok && data.checkoutUrl) { btn.disabled = true; btn.textContent = "Opening secure checkout…"; window.location.href = data.checkoutUrl; return; }
    if (res && res.ok) {
      showMsg(`<strong>Order ${esc(data.orderNumber)} received.</strong> RJ will reach out at ${esc(buyer.contact)} with a payment request (${esc(CONFIG.payWith)}). Total: ${money(data.total)}.`);
      cart = []; save(); renderCart(); return;
    }
    // A 4xx means something in the bag needs fixing (sold out, size gone): say exactly what.
    if (res && res.status < 500) { showMsg(`<strong>${esc(data.error || "Something in your bag needs a look.")}</strong>`); return; }
    // Network trouble or an outage: card checkout just asks them to retry; order requests can be sent by hand.
    if (stripe) showMsg(`<strong>Checkout didn't open.</strong> Give it a minute and try again. Your bag is saved.`);
    else manualFallback(buyer);
  });

  if (/[?&]checkout=cancelled/.test(location.search)) {
    openCart(true); showMsg("Checkout cancelled. Your bag is saved whenever you're ready.");
    history.replaceState(null, "", location.pathname + location.hash);
  }
  renderCart();
})();
