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
    const ship = sub === 0 || sub >= CONFIG.freeShipOver ? 0 : CONFIG.shipping;
    return { sub, ship };
  }

  function renderCart() {
    $("#count").textContent = cart.reduce((a, l) => a + l.qty, 0);
    const { sub, ship } = totals();
    $("#subtotal").textContent = money(sub) + (ship ? ` + ${money(ship)} ship` : sub ? " · free ship" : "");
    $("#lines").innerHTML = cart.length ? cart.map((l, i) => `<div class="line">
        <strong>${esc(l.name)}</strong><span class="mono">${money(l.price * l.qty)}</span>
        <span class="mono">${esc(l.size)}</span>
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
      ...cart.map(l => `${l.qty} x ${l.name} (${l.size}) ${money(l.qty * l.price)}`), ``,
      `Subtotal ${money(sub)}  Shipping ${money(ship)}  Total ${money(sub + ship)}`
    ].join("\n");
  }

  $("#checkout").addEventListener("submit", async e => {
    e.preventDefault();
    if (!cart.length) return;
    const buyer = { name: $("#buyerName").value.trim(), contact: $("#buyerContact").value.trim(), ship: $("#buyerShip").value.trim() };
    const btn = $("#placeOrder"), done = $("#done");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const res = await fetch("/api/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer, items: cart.map(l => ({ id: l.id, size: l.size, qty: l.qty })), website: $("#website").value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      done.hidden = false;
      done.innerHTML = `<strong>Order ${esc(data.orderNumber)} received.</strong> RJ will reach out at ${esc(buyer.contact)} with a payment request (${esc(CONFIG.payWith)}). Total: ${money(data.total)}.`;
      cart = []; save(); renderCart();
    } catch (err) {
      // The order API is unreachable (preview, outage): give the buyer a manual path.
      const text = orderText(buyer);
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
    } finally {
      btn.disabled = false; btn.textContent = "Place order request";
    }
  });

  renderCart();
})();
