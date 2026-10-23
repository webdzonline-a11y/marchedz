// Seeds an empty database: categories, 58 wilayas + 1541 communes, carriers, demo catalog, staff account, pages & FAQ.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const L = require('./lib');
const { categories, products, variantKinds, descFor } = require('./seed-data');

function seed() {
  const has = db.prepare('SELECT COUNT(*) n FROM categories').get().n;
  if (has) return false;
  console.log('[seed] seeding database…');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/raw/products.json'))).products;
  const cities = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/raw/cities.json')));

  db.transaction(() => {
    // categories
    const insCat = db.prepare('INSERT INTO categories(parent_id,slug,name_ar,name_en,icon,sort) VALUES (?,?,?,?,?,?)');
    const walk = (list, parent) => list.forEach((c, i) => { const id = insCat.run(parent, c.slug, c.ar, c.en, c.icon, i).lastInsertRowid; walk(c.children || [], id); });
    walk(categories, null);

    // wilayas / communes (official 58 wilayas — editable from admin)
    const insW = db.prepare('INSERT INTO wilayas(id,code,name_ar,name_en) VALUES (?,?,?,?)');
    const insC = db.prepare('INSERT INTO communes(id,wilaya_id,name_ar,name_en,daira_ar,daira_en) VALUES (?,?,?,?,?,?)');
    const seenW = new Set();
    for (const c of cities.sort((a, b) => a.wilaya_code.localeCompare(b.wilaya_code) || a.id - b.id)) {
      const wid = parseInt(c.wilaya_code, 10);
      if (!seenW.has(wid)) { insW.run(wid, c.wilaya_code, c.wilaya_name.trim(), c.wilaya_name_ascii.trim()); seenW.add(wid); }
      insC.run(c.id, wid, c.commune_name.trim(), c.commune_name_ascii.trim(), (c.daira_name || '').trim(), (c.daira_name_ascii || '').trim());
    }

    // carriers — manual by default; API only after admin enters keys AND a live test succeeds
    db.prepare(`INSERT INTO carriers(code,name,enabled,mode,api_base,tracking_url) VALUES ('yalidine','Yalidine',1,'manual','https://api.yalidine.app/v1','https://yalidine.com/suivre-un-colis/?tracking={tracking}')`).run();
    db.prepare(`INSERT INTO carriers(code,name,enabled,mode,api_base,tracking_url) VALUES ('zrexpress','ZR Express',1,'manual','https://procolis.com/api_v1','')`).run();

    // products
    const catId = slug => db.prepare('SELECT id FROM categories WHERE slug=?').get(slug).id;
    const insP = db.prepare(`INSERT INTO products(slug,category_id,brand,name_ar,name_en,desc_ar,desc_en,specs,price,sale_price,sale_start,sale_end,featured,is_deal,weight_g,warranty_ar,warranty_en,returnable,sold_count,rating_avg,rating_count,search_text,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insI = db.prepare('INSERT INTO product_images(product_id,path,thumb,sort,is_main) VALUES (?,?,?,?,?)');
    const insV = db.prepare('INSERT INTO variants(product_id,color,size,sku,stock) VALUES (?,?,?,?,?)');
    const insR = db.prepare('INSERT INTO reviews(product_id,name,rating,comment,verified,created_at) VALUES (?,?,?,?,0,?)');
    const imgDir = path.join(__dirname, '../public/uploads/products');
    let n = 0;
    for (const [id, cat, nameAr, kind] of products) {
      const p = raw.find(x => x.id === id); if (!p) continue;
      n++;
      const price = Math.max(100, Math.round(p.price * 150 / 100) * 100) * 100; // centimes, rounded to 100 DZD
      const pct = p.discountPercentage;
      const onSale = pct >= 9;
      const sale = onSale ? Math.round(price * (1 - pct / 100) / 10000) * 10000 : null;
      const daysAgo = (n * 7) % 90; // spread creation dates for "new" badges
      const created = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('T', ' ').slice(0, 19);
      const slug = p.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + id;
      const brand = p.brand || null;
      const specs = [
        brand && { k_ar: 'العلامة التجارية', k_en: 'Brand', v_ar: brand, v_en: brand },
        { k_ar: 'الوزن', k_en: 'Weight', v_ar: `${p.weight * 100} غ`, v_en: `${p.weight * 100} g` },
        { k_ar: 'الأبعاد', k_en: 'Dimensions', v_ar: `${p.dimensions.width} × ${p.dimensions.height} × ${p.dimensions.depth} سم`, v_en: `${p.dimensions.width} × ${p.dimensions.height} × ${p.dimensions.depth} cm` },
        { k_ar: 'رمز المنتج', k_en: 'SKU', v_ar: p.sku, v_en: p.sku },
      ].filter(Boolean);
      const warrantyAr = /year/i.test(p.warrantyInformation) ? `ضمان ${p.warrantyInformation.match(/\d+/)?.[0] || 1} سنة` : /month/i.test(p.warrantyInformation) ? `ضمان ${p.warrantyInformation.match(/\d+/)?.[0]} أشهر` : null;
      const reviews = p.reviews || [];
      const ratingAvg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      const descAr = descFor(cat)(nameAr) + (brand ? ` العلامة التجارية: ${brand}.` : '');
      const pid = insP.run(slug, catId(cat), brand, nameAr, p.title, descAr, p.description, JSON.stringify(specs), price, sale,
        null, null, p.rating >= 4.5 ? 1 : 0, onSale && pct >= 14 ? 1 : 0, p.weight * 100, warrantyAr, warrantyAr ? p.warrantyInformation : null,
        /no return/i.test(p.returnPolicy) ? 0 : 1, Math.round((p.rating * 37 + (id % 13) * 11) % 240), Math.round(ratingAvg * 10) / 10, reviews.length,
        '', created, created).lastInsertRowid;
      db.prepare('UPDATE products SET search_text=? WHERE id=?').run(L.productSearchText({ name_ar: nameAr, name_en: p.title, brand }, catId(cat)), pid);
      p.images.slice(0, 4).forEach((_, i) => {
        if (fs.existsSync(path.join(imgDir, `demo-${id}-${i}.webp`))) insI.run(pid, `/uploads/products/demo-${id}-${i}.webp`, `/uploads/products/demo-${id}-${i}-t.webp`, i, i === 0 ? 1 : 0);
      });
      const kinds = variantKinds[kind] || variantKinds.none;
      const per = Math.max(1, Math.floor(Math.min(p.stock, 120) / kinds.length));
      kinds.forEach(([color, size], i) => {
        const vid = insV.run(pid, color, size, `${p.sku}${color ? '-' + color.toUpperCase() : ''}${size ? '-' + size : ''}`, (id % 17 === 0 && i === 0) ? 0 : per + (i % 3)).lastInsertRowid;
        const st = db.prepare('SELECT stock FROM variants WHERE id=?').get(vid).stock;
        db.prepare('INSERT INTO inventory_movements(variant_id,delta,stock_after,reason,note) VALUES (?,?,?,?,?)').run(vid, st, st, 'initial', 'seed');
      });
      const AR = { 'Would not recommend!': 'لا أنصح به', 'Very satisfied!': 'راضٍ جدًا!', 'Highly impressed!': 'أعجبني كثيرًا!', 'Great product!': 'منتج رائع!', 'Excellent quality!': 'جودة ممتازة!', 'Very happy with my purchase!': 'سعيد جدًا بالشراء!', 'Would buy again!': 'سأشتريه مرة أخرى!', 'Disappointing product!': 'منتج مخيب للآمال', 'Not as described!': 'ليس كما في الوصف', 'Very pleased!': 'مسرور جدًا!', 'Poor quality!': 'جودة ضعيفة', 'Awesome product!': 'منتج مذهل!', 'Very disappointed!': 'خاب أملي', 'Fast shipping!': 'توصيل سريع!', 'Waste of money!': 'مضيعة للمال', 'Highly recommended!': 'أنصح به بشدة!', 'Very unhappy with my purchase!': 'غير راضٍ عن الشراء', 'Would not buy again!': 'لن أشتريه مرة أخرى', 'Not worth the price!': 'لا يستحق السعر', 'Very dissatisfied!': 'غير راضٍ إطلاقًا', 'Not satisfied!': 'لست راضيًا' };
      for (const r of reviews) insR.run(pid, r.reviewerName, r.rating, AR[r.comment] ? `${AR[r.comment]} — ${r.comment}` : r.comment, created);
    }
    // category images: first product image within each category subtree
    for (const c of db.prepare('SELECT id FROM categories').all()) {
      const ids = L.categoryDescendants(c.id);
      const img = db.prepare(`SELECT i.thumb FROM products p JOIN product_images i ON i.product_id=p.id AND i.is_main=1 WHERE p.category_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.rating_avg DESC LIMIT 1`).get(...ids);
      if (img) db.prepare('UPDATE categories SET image=? WHERE id=?').run(img.thumb, c.id);
    }

    // staff + demo customer (passwords must be changed in production)
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2026!';
    db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,email_verified_at) VALUES (?,?,?,?, 'admin', datetime('now'))`)
      .run('مدير المتجر', process.env.ADMIN_EMAIL || 'admin@marchedz.dz', '0550000000', bcrypt.hashSync(adminPass, 11));
    const demo = db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,email_verified_at) VALUES (?,?,?,?, 'customer', datetime('now'))`)
      .run('أمين بن علي', 'demo@marchedz.dz', '0661000000', bcrypt.hashSync('Demo@2026!', 11)).lastInsertRowid;
    L.ensureWallet(demo);

    // FX timestamp
    L.setSetting('fx_updated_at', L.now());

    // demo coupon (clearly a sample; editable/removable in admin)
    db.prepare(`INSERT INTO coupons(code,type,value,min_order,max_discount,per_user_limit,note) VALUES ('BIENVENUE10','percent',10,500000,200000,1,'كوبون ترحيبي تجريبي — 10% بحد أقصى 2000 دج للطلبات فوق 5000 دج')`).run();

    // pages
    const P = db.prepare('INSERT INTO pages(slug,title_ar,title_en,body_ar,body_en) VALUES (?,?,?,?,?)');
    P.run('about', 'من نحن', 'About us',
      'مارشي ديزاد متجر إلكتروني جزائري يجمع آلاف المنتجات في مكان واحد: الأزياء، الإلكترونيات، المنزل والمطبخ، الجمال والمزيد، مع توصيل إلى جميع ولايات الجزائر الـ58 ودفع عند الاستلام أو عبر المحفظة.',
      'Marché DZ is an Algerian online store bringing thousands of products together: fashion, electronics, home & kitchen, beauty and more — with delivery to all 58 wilayas and payment on delivery or via your wallet.');
    P.run('shipping', 'سياسة التوصيل', 'Shipping policy',
      'نوصل إلى جميع الولايات عبر شركات شحن معتمدة (مثل Yalidine وZR Express) إلى المنزل أو إلى مكتب شركة الشحن.\n\nتُحسب رسوم التوصيل حسب الولاية والبلدية وطريقة التوصيل ووزن الطلب، وتظهر بوضوح قبل تأكيد الطلب.\n\nمدة التوصيل التقديرية تظهر عند اختيار الولاية وقد تختلف حسب المنطقة وظروف شركة الشحن.\n\nيمكنك متابعة حالة شحنتك ورقم التتبع من صفحة طلباتك.',
      'We deliver to every wilaya through partner carriers (such as Yalidine and ZR Express), to your home or to a carrier office.\n\nShipping fees depend on the wilaya, commune, delivery method and order weight, and are shown clearly before you confirm.\n\nEstimated delivery time is displayed at checkout and may vary by region and carrier.\n\nYou can follow your shipment and tracking number from your orders page.');
    P.run('returns', 'سياسة الإرجاع والاسترداد', 'Returns & refunds policy',
      'يمكنك طلب إرجاع المنتج خلال 7 أيام من الاستلام إذا كان معيبًا أو غير مطابق للوصف، على أن يكون بحالته الأصلية وبتغليفه.\n\nبعض المنتجات غير قابلة للإرجاع لأسباب صحية (مثل مستحضرات التجميل المفتوحة)، ويُشار إلى ذلك في صفحة المنتج.\n\nتُعاد المبالغ المؤهلة إلى محفظتك في المتجر بعد موافقة فريقنا، ولا يتجاوز المبلغ المسترد المبلغ المدفوع فعليًا.\n\nالطلبات المدفوعة عند الاستلام لا تكون مؤهلة للاسترداد المالي إلا بعد تأكيد تحصيل مبلغها.\n\nتخضع هذه السياسة للقوانين الجزائرية المعمول بها في حماية المستهلك والتجارة الإلكترونية (القانون 18-05).',
      'You can request a return within 7 days of delivery if the item is defective or not as described, in its original condition and packaging.\n\nSome items cannot be returned for hygiene reasons (e.g. opened cosmetics); this is indicated on the product page.\n\nEligible amounts are refunded to your store wallet after approval, never exceeding the amount actually paid.\n\nCash-on-delivery orders are only eligible for a monetary refund once their payment has been confirmed as collected.\n\nThis policy is subject to applicable Algerian consumer-protection and e-commerce law (Law 18-05).');
    P.run('cancellation', 'سياسة الإلغاء', 'Cancellation policy',
      'يمكنك إلغاء طلبك مجانًا من صفحة الطلب طالما حالته «بانتظار التأكيد» أو «مؤكد».\n\nبعد بدء التحضير أو الشحن، يرجى التواصل مع الدعم.\n\nعند إلغاء طلب مدفوع من المحفظة، يُعاد المبلغ كاملًا إلى رصيدك المتاح تلقائيًا، وتُحرر الكميات المحجوزة.\n\nالطلبات غير المؤكدة خلال المهلة المحددة قد تُلغى تلقائيًا لتحرير المخزون.',
      'You can cancel your order for free from the order page while it is "Awaiting confirmation" or "Confirmed".\n\nOnce preparation or shipping has started, please contact support.\n\nWhen a wallet-paid order is cancelled, the full amount is automatically returned to your available balance and reserved stock is released.\n\nOrders not confirmed within the configured window may be cancelled automatically to release stock.');
    P.run('payment', 'طرق الدفع والمحفظة', 'Payment & wallet',
      'الدفع عند الاستلام: تدفع نقدًا عند استلام طلبك.\n\nالدفع من المحفظة: اشحن محفظتك عبر CCP (وطرق أخرى عند تفعيلها)، وتُضاف الأموال فقط بعد تحقق فريقنا من التحويل يدويًا.\n\nالأسعار مرجعيتها الدينار الجزائري. عرض الأسعار بالدولار للمعلومة فقط ويعتمد سعر صرف موحدًا يحدده المتجر، مع حفظ السعر المستخدم في كل طلب ومعاملة.\n\nلا نخزن أي بيانات بطاقات بنكية.',
      'Cash on delivery: pay in cash when you receive your order.\n\nWallet: top up via CCP (and other methods when enabled); funds are added only after our team manually verifies the transfer.\n\nPrices are based on the Algerian dinar. USD display is informational and uses a single store-defined exchange rate, which is recorded with every order and transaction.\n\nWe never store bank card data.');
    P.run('privacy', 'سياسة الخصوصية', 'Privacy policy',
      'نجمع البيانات الضرورية فقط لتنفيذ طلباتك (الاسم، الهاتف، البريد، العنوان) ونحميها وفق القانون 18-07 المتعلق بحماية الأشخاص الطبيعيين في معالجة المعطيات ذات الطابع الشخصي.\n\nلا نشارك بياناتك إلا مع شركة الشحن لتوصيل طلبك.\n\nكلمات المرور مخزنة بتجزئة آمنة، ووصولات الدفع لا يطلع عليها إلا أنت والفريق المالي المخوّل.',
      'We only collect data needed to fulfil your orders (name, phone, email, address) and protect it in line with Algerian Law 18-07 on personal data protection.\n\nWe only share your data with the carrier delivering your order.\n\nPasswords are stored with secure hashing, and payment receipts are visible only to you and authorised finance staff.');
    P.run('terms', 'الشروط والأحكام', 'Terms & conditions',
      'باستخدامك لمارشي ديزاد فإنك توافق على هذه الشروط. الأسعار والمخزون يُتحقق منها نهائيًا لحظة تأكيد الطلب. نحتفظ بحق إلغاء الطلبات المشبوهة مع إعادة أي مبالغ مدفوعة.',
      'By using Marché DZ you agree to these terms. Prices and stock are finally verified at the moment of order confirmation. We reserve the right to cancel suspicious orders and return any amounts paid.');

    const F = db.prepare('INSERT INTO faqs(grp,q_ar,q_en,a_ar,a_en,sort) VALUES (?,?,?,?,?,?)');
    [
      ['payment', 'ما طرق الدفع المتاحة؟', 'Which payment methods are available?', 'الدفع عند الاستلام، والدفع من رصيد المحفظة.', 'Cash on delivery and payment from your wallet balance.'],
      ['payment', 'هل الأسعار بالدولار نهائية؟', 'Are USD prices final?', 'الأسعار مرجعيتها الدينار. الدولار للعرض فقط وفق سعر صرف موحد يظهر وقت تحديثه.', 'Prices are in DZD. USD is for display only using a single rate whose update time is shown.'],
      ['delivery', 'كم تستغرق مدة التوصيل؟', 'How long does delivery take?', 'تظهر المدة التقديرية عند اختيار الولاية في صفحة الدفع، وعادة 1 إلى 5 أيام عمل.', 'The estimate appears when you select your wilaya at checkout, usually 1–5 business days.'],
      ['delivery', 'هل يمكن الاستلام من مكتب شركة الشحن؟', 'Can I pick up from a carrier office?', 'نعم، اختر «التوصيل إلى المكتب» عند إتمام الطلب، وغالبًا ما يكون أرخص.', 'Yes, choose "Office pickup" at checkout — it is often cheaper.'],
      ['orders', 'كيف أتابع طلبي؟', 'How do I track my order?', 'من «حسابي ← طلباتي» تجد الحالة وسجل التحديثات ورقم التتبع.', 'Under "My account → Orders" you will find the status, history and tracking number.'],
      ['orders', 'هل يمكنني إلغاء الطلب؟', 'Can I cancel my order?', 'نعم ما دام بانتظار التأكيد أو مؤكدًا، من صفحة الطلب مباشرة.', 'Yes, while it is awaiting confirmation or confirmed, directly from the order page.'],
      ['wallet', 'متى يُضاف رصيد الشحن عبر CCP؟', 'When is a CCP top-up credited?', 'بعد مراجعة الفريق المالي للوصل والتحقق من التحويل فقط، وستصلك إشعارات بالنتيجة.', 'Only after our finance team reviews the receipt and verifies the transfer; you will be notified.'],
      ['wallet', 'كيف أسحب رصيدي؟', 'How do I withdraw my balance?', 'من صفحة المحفظة ← سحب الأموال. يُحجز المبلغ أثناء المراجعة ويُعاد إليك إذا رُفض الطلب.', 'From Wallet → Withdraw. The amount is held during review and returned if the request is rejected.'],
      ['refunds', 'كيف أطلب استردادًا؟', 'How do I request a refund?', 'من صفحة الطلب المؤهل اضغط «طلب استرداد» واذكر السبب. يُعاد المبلغ الموافق عليه إلى محفظتك.', 'Open the eligible order and press "Request refund". Approved amounts go to your wallet.'],
    ].forEach((f, i) => F.run(...f, i));
  })();
  console.log('[seed] done');
  return true;
}
module.exports = { seed };
if (require.main === module) seed();
